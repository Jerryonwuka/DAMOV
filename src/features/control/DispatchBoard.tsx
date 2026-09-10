import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Bus, CheckCircle2, ShieldAlert, User } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { useClock } from '@/hooks/use-clock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge, VehicleStatusBadge } from '@/components/ui/status'
import { TripDrawer } from '@/features/shared/TripDrawer'
import { delayLabel, lagosTime } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import type { UUID } from '@/lib/types'
import { assignTripVehicleDriver } from '@/server/trips'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Lane = 'needs_assignment' | 'ready' | 'live' | 'done'

/**
 * Dispatch board.
 *
 * Trips flow left to right: unassigned → assigned/boarding → in service →
 * completed or cancelled. Assignment is a server call that refuses a vehicle
 * in maintenance, a double-booked bus, or a driver with an expired licence
 * unless a written policy exception is recorded.
 */
export function DispatchBoard() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const now = useClock(20_000)
  const [lane, setLane] = useState<Lane | 'all'>('all')
  const [assigning, setAssigning] = useState<TripSummary | null>(null)
  const [detail, setDetail] = useState<TripSummary | null>(null)
  const [vehicleId, setVehicleId] = useState<UUID | ''>('')
  const [driverId, setDriverId] = useState<UUID | ''>('')
  const [override, setOverride] = useState('')
  const [needsOverride, setNeedsOverride] = useState(false)

  const trips = useDb(useCallback((db) => tripSummaries(db, { serviceDate: today }), [today]))
  const vehicles = useDb(useCallback((db) => db.vehicles.map((v) => ({ vehicle: v, type: db.vehicle_types.find((t) => t.id === v.vehicle_type_id)!, hub: db.hubs.find((h) => h.id === v.current_hub_id)?.name ?? '—' })), []))
  const drivers = useDb(useCallback((db) => db.driver_profiles.map((d) => ({ driver: d, profile: db.profiles.find((p) => p.id === d.profile_id)! })), []))

  const lanes = useMemo(() => {
    const by = (statuses: string[]) => trips.filter((t) => statuses.includes(t.trip.status))
    return {
      needs_assignment: by(['scheduled', 'held']),
      ready: by(['assigned', 'boarding']),
      live: by(['departed', 'in_service']),
      done: by(['completed', 'cancelled']),
    }
  }, [trips])

  const urgent = lanes.needs_assignment.filter((t) => new Date(t.trip.scheduled_departure_at).getTime() < now + 2 * 3_600_000).length

  function openAssign(summary: TripSummary) {
    setAssigning(summary)
    setVehicleId(summary.trip.vehicle_id ?? '')
    setDriverId(summary.trip.driver_id ?? '')
    setOverride('')
    setNeedsOverride(false)
  }

  function assign() {
    if (!assigning || !vehicleId || !driverId) return
    const result = assignTripVehicleDriver({ trip_id: assigning.trip.id, vehicle_id: vehicleId, driver_id: driverId, override_reason: override.trim() || undefined }, actor)
    if (!result.ok) {
      if (result.code === 'licence_expired') setNeedsOverride(true)
      toast.error('Assignment refused', { description: result.error })
      return
    }
    toast.success(`${assigning.trip.trip_code} assigned`, { description: `${vehicles.find((v) => v.vehicle.id === vehicleId)?.vehicle.fleet_number} · ${drivers.find((d) => d.driver.profile_id === driverId)?.profile.full_name}` })
    setAssigning(null)
  }

  const visibleLanes: { key: Lane; label: string; tone: string }[] = [
    { key: 'needs_assignment', label: 'Needs assignment', tone: 'border-warning/50' },
    { key: 'ready', label: 'Assigned · boarding', tone: 'border-info/50' },
    { key: 'live', label: 'In service', tone: 'border-primary/60' },
    { key: 'done', label: 'Completed · cancelled', tone: 'border-border' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Dispatch" description="Assign each trip a vehicle and a driver, then follow it through boarding, departure and completion." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Needs assignment" value={lanes.needs_assignment.length} icon={AlertTriangle} tone={urgent ? 'warning' : 'default'} hint={urgent ? `${urgent} within two hours` : undefined} />
        <StatTile index={1} label="Assigned / boarding" value={lanes.ready.length} icon={CheckCircle2} tone="info" />
        <StatTile index={2} label="In service" value={lanes.live.length} icon={Bus} tone="primary" />
        <StatTile index={3} label="Completed" value={lanes.done.filter((t) => t.trip.status === 'completed').length} hint={`${lanes.done.filter((t) => t.trip.status === 'cancelled').length} cancelled`} />
      </div>

      <Tabs value={lane} onValueChange={(v) => setLane(v as Lane | 'all')} className="lg:hidden">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {visibleLanes.map((l) => <TabsTrigger key={l.key} value={l.key}>{l.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="grid gap-3 lg:grid-cols-4">
        {visibleLanes.filter((l) => lane === 'all' || lane === l.key).map((column) => (
          <div key={column.key} className={cn('rounded-xl border-t-4 bg-muted/40 p-2', column.tone)}>
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</p>
              <Badge tone="neutral" size="sm">{lanes[column.key].length}</Badge>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-1">
              {lanes[column.key].length === 0 && <EmptyState title="Empty" className="py-6" />}
              {lanes[column.key].map((summary, index) => {
                const late = column.key === 'needs_assignment' && new Date(summary.trip.scheduled_departure_at).getTime() < now + 2 * 3_600_000
                return (
                  <motion.div key={summary.trip.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.03, 0.2) }}>
                    <Card interactive className={cn('p-3', late && 'border-warning/60')} onClick={() => setDetail(summary)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-base font-bold leading-tight tnum">{lagosTime(summary.trip.scheduled_departure_at)}</p>
                          <p className="truncate text-xs font-medium tnum">{summary.trip.trip_code}</p>
                          <p className="truncate text-xs text-muted-foreground">{summary.direction_name}</p>
                        </div>
                        <TripStatusBadge status={summary.trip.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="inline-flex items-center gap-1"><Bus className="size-3 text-muted-foreground" />{summary.vehicle ?? <span className="text-warning-foreground">Unassigned</span>}</span>
                        <span className="inline-flex items-center gap-1"><User className="size-3 text-muted-foreground" />{summary.driver ?? '—'}</span>
                        <span className="ml-auto tnum">{summary.boarded}/{summary.booked} · {summary.capacity}</span>
                      </div>
                      {summary.trip.actual_departure_at && (
                        <p className={cn('mt-1 text-2xs', (summary.delay_minutes ?? 0) > 5 ? 'text-critical' : 'text-muted-foreground')}>{delayLabel(summary.trip.scheduled_departure_at, summary.trip.actual_departure_at)}</p>
                      )}
                      {can('action.assign_vehicle') && ['scheduled', 'held', 'assigned'].includes(summary.trip.status) && (
                        <Button size="sm" variant={summary.vehicle ? 'outline' : 'default'} className="mt-2 w-full" onClick={(e) => { e.stopPropagation(); openAssign(summary) }}>
                          {summary.vehicle ? 'Reassign' : 'Assign vehicle & driver'}
                        </Button>
                      )}
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Assignment drawer */}
      <Drawer open={Boolean(assigning)} onOpenChange={(open) => !open && setAssigning(null)}>
        <DrawerContent width="sm:max-w-lg">
          {assigning && (
            <>
              <DrawerHeader>
                <DrawerTitle className="text-lg font-bold">Assign {assigning.trip.trip_code}</DrawerTitle>
                <p className="text-sm text-muted-foreground">{lagosTime(assigning.trip.scheduled_departure_at)} · {assigning.route_code} {assigning.direction_name} · {assigning.booked} booked</p>
              </DrawerHeader>
              <DrawerBody className="space-y-5">
                <section>
                  <Label className="mb-2">Vehicle</Label>
                  <div className="space-y-1.5">
                    {vehicles.map(({ vehicle, type, hub }) => {
                      const blocked = ['maintenance', 'out_of_service'].includes(vehicle.status)
                      return (
                        <button
                          key={vehicle.id}
                          disabled={blocked}
                          onClick={() => setVehicleId(vehicle.id)}
                          className={cn('press flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all', vehicleId === vehicle.id ? 'border-primary bg-primary/[0.08]' : 'border-border hover:border-primary/40', blocked && 'cursor-not-allowed opacity-50')}
                        >
                          <span className="grid size-8 place-items-center rounded-md bg-muted"><Bus className="size-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{vehicle.fleet_number} <span className="font-normal text-muted-foreground">· {type.name}</span></span>
                            <span className="block text-xs text-muted-foreground">{type.default_bookable_capacity} bookable · {hub}</span>
                          </span>
                          <VehicleStatusBadge status={vehicle.status} />
                        </button>
                      )
                    })}
                  </div>
                </section>
                <section>
                  <Label className="mb-2">Driver</Label>
                  <div className="space-y-1.5">
                    {drivers.map(({ driver, profile }) => {
                      const expired = driver.licence_expiry < today
                      const blocked = !driver.active || driver.approval_state === 'suspended'
                      return (
                        <button
                          key={driver.id}
                          disabled={blocked}
                          onClick={() => setDriverId(driver.profile_id)}
                          className={cn('press flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all', driverId === driver.profile_id ? 'border-primary bg-primary/[0.08]' : 'border-border hover:border-primary/40', blocked && 'cursor-not-allowed opacity-50')}
                        >
                          <span className="grid size-8 place-items-center rounded-md bg-muted"><User className="size-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{profile.full_name}</span>
                            <span className="block text-xs text-muted-foreground tnum">{driver.licence_number} · expires {driver.licence_expiry}</span>
                          </span>
                          {expired ? <Badge tone="critical">Licence expired</Badge> : <Badge tone={driver.approval_state === 'approved' ? 'primary' : 'warning'}>{driver.approval_state}</Badge>}
                        </button>
                      )
                    })}
                  </div>
                </section>
                {needsOverride && (
                  <section className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="size-4" /> Policy exception required</p>
                    <p className="text-xs text-muted-foreground">This driver's licence has expired. Assigning them is a visible, audited exception — record why.</p>
                    <Textarea value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Reason for exception" />
                  </section>
                )}
              </DrawerBody>
              <DrawerFooter className="flex gap-2">
                <Button className="flex-1" onClick={assign} disabled={!vehicleId || !driverId || (needsOverride && !override.trim())}>
                  {needsOverride ? 'Assign with exception' : 'Confirm assignment'}
                </Button>
                <Button variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <TripDrawer summary={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
