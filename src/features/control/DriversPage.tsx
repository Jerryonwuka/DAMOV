import { useCallback, useState } from 'react'
import { AlertTriangle, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { DataTable, type Column } from '@/components/ui/data-table'
import { DefinitionRow, PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, lagosDate, lagosTime, pct } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import type { DriverProfile, Profile } from '@/lib/types'
import { setDriverState } from '@/server/fleet'
import { titleCase } from '@/lib/utils'
import { toast } from 'sonner'

interface DriverRow {
  driver: DriverProfile
  profile: Profile
  hub: string
  trips_today: number
  on_time_rate: number
  passengers: number
  licence_expired: boolean
  trips: TripSummary[]
}

export function DriversPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const [selected, setSelected] = useState<DriverRow | null>(null)

  const rows = useDb(
    useCallback(
      (db): DriverRow[] => {
        const summaries = tripSummaries(db, { serviceDate: today })
        return db.driver_profiles.map((driver) => {
          const trips = summaries.filter((s) => s.trip.driver_id === driver.profile_id)
          const departed = trips.filter((s) => s.trip.actual_departure_at)
          return {
            driver,
            profile: db.profiles.find((p) => p.id === driver.profile_id)!,
            hub: db.hubs.find((h) => h.id === driver.home_hub_id)?.name ?? '—',
            trips_today: trips.length,
            on_time_rate: departed.length ? Math.round((departed.filter((s) => (s.delay_minutes ?? 0) <= 5).length / departed.length) * 100) : 0,
            passengers: trips.reduce((a, s) => a + s.boarded, 0),
            licence_expired: driver.licence_expiry < today,
            trips,
          }
        })
      },
      [today],
    ),
  )

  function update(patch: { approval_state?: DriverProfile['approval_state']; active?: boolean }) {
    if (!selected) return
    const result = setDriverState({ driver_profile_id: selected.driver.id, ...patch }, actor)
    if (!result.ok) return toast.error('Not updated', { description: result.error })
    toast.success('Driver record updated')
    setSelected(null)
  }

  const columns: Column<DriverRow>[] = [
    { key: 'name', header: 'Driver', value: (r) => r.profile.full_name, cell: (r) => <span className="font-semibold">{r.profile.full_name}</span> },
    { key: 'id', header: 'Operator ID', value: (r) => r.profile.employment_id ?? '', cell: (r) => <span className="tnum">{r.profile.employment_id ?? '—'}</span>, hideable: true },
    { key: 'licence', header: 'Licence', value: (r) => r.driver.licence_expiry, cell: (r) => <span className="text-xs tnum">{r.driver.licence_number}<br /><span className={r.licence_expired ? 'font-semibold text-critical' : 'text-muted-foreground'}>{r.licence_expired ? 'Expired ' : 'Expires '}{lagosDate(`${r.driver.licence_expiry}T00:00:00Z`)}</span></span> },
    { key: 'state', header: 'Approval', value: (r) => r.driver.approval_state, cell: (r) => <Badge tone={r.driver.approval_state === 'approved' ? 'primary' : r.driver.approval_state === 'suspended' ? 'critical' : 'warning'}>{titleCase(r.driver.approval_state)}</Badge> },
    { key: 'active', header: 'Active', value: (r) => (r.driver.active ? 1 : 0), cell: (r) => (r.driver.active ? 'Yes' : <span className="text-muted-foreground">No</span>), hideable: true },
    { key: 'hub', header: 'Home hub', value: (r) => r.hub, hideable: true },
    { key: 'trips', header: 'Trips today', align: 'right', value: (r) => r.trips_today },
    { key: 'ontime', header: 'On-time', align: 'right', value: (r) => r.on_time_rate, cell: (r) => (r.trips_today ? pct(r.on_time_rate) : '—') },
    { key: 'pax', header: 'Passengers', align: 'right', value: (r) => r.passengers },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Drivers" description="Licence compliance, approval state and today's punctuality for every driver." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Drivers" value={rows.length} icon={Users} />
        <StatTile index={1} label="Approved & active" value={rows.filter((r) => r.driver.approval_state === 'approved' && r.driver.active).length} icon={ShieldCheck} tone="primary" />
        <StatTile index={2} label="Licence expired" value={rows.filter((r) => r.licence_expired).length} icon={AlertTriangle} tone={rows.some((r) => r.licence_expired) ? 'critical' : 'default'} />
        <StatTile index={3} label="On shift today" value={rows.filter((r) => r.trips_today > 0).length} />
      </div>
      <DataTable data={rows} columns={columns} rowKey={(r) => r.driver.id} onRowClick={setSelected} searchPlaceholder="Name, licence or operator ID…" exportName="driver-assignment-history" exportContext={{ 'Service date': today }} pageSize={12} />

      <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent width="sm:max-w-lg">
          {selected && (
            <>
              <DrawerHeader>
                <DrawerTitle className="text-lg font-bold">{selected.profile.full_name}</DrawerTitle>
                <p className="text-sm text-muted-foreground">{selected.profile.employment_id} · {selected.hub}</p>
              </DrawerHeader>
              <DrawerBody className="space-y-5">
                <dl className="divide-y divide-border rounded-lg border border-border px-3">
                  <DefinitionRow term="Licence">{selected.driver.licence_number}</DefinitionRow>
                  <DefinitionRow term="Expiry"><span className={selected.licence_expired ? 'text-critical' : ''}>{lagosDate(`${selected.driver.licence_expiry}T00:00:00Z`)}</span></DefinitionRow>
                  <DefinitionRow term="Approval">{titleCase(selected.driver.approval_state)}</DefinitionRow>
                  <DefinitionRow term="Phone">{selected.profile.phone}</DefinitionRow>
                  <DefinitionRow term="Emergency contact">{selected.driver.emergency_contact_name ?? '—'} · {selected.driver.emergency_contact_phone ?? ''}</DefinitionRow>
                </dl>
                <section>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Today's trips</p>
                  <div className="space-y-1.5">
                    {selected.trips.length === 0 && <p className="text-sm text-muted-foreground">No trips assigned today.</p>}
                    {selected.trips.map((s) => (
                      <div key={s.trip.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                        <span className="w-11 font-bold tnum">{lagosTime(s.trip.scheduled_departure_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs">{s.trip.trip_code} · {delayLabel(s.trip.scheduled_departure_at, s.trip.actual_departure_at)}</span>
                        <TripStatusBadge status={s.trip.status} />
                      </div>
                    ))}
                  </div>
                </section>
              </DrawerBody>
              {can('control.drivers') && (
                <DrawerFooter className="flex flex-wrap gap-2">
                  {selected.driver.approval_state !== 'approved' && <Button size="sm" onClick={() => update({ approval_state: 'approved', active: true })}>Approve</Button>}
                  {selected.driver.approval_state !== 'suspended' ? (
                    <Button size="sm" variant="destructive" onClick={() => update({ approval_state: 'suspended', active: false })}>Suspend</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => update({ approval_state: 'approved', active: true })}>Reinstate</Button>
                  )}
                </DrawerFooter>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
