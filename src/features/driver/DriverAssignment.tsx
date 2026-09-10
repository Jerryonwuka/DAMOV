import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bus, CheckCircle2, ClipboardCheck, Clock, Gauge, MapPin, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { lagosDate, lagosTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDriverShift } from './driver-data'

export function DriverAssignment() {
  const { profile } = useAuth()
  const shift = useDriverShift()
  const firstName = profile?.full_name.split(' ')[0]

  const readiness = [
    { label: 'Vehicle assigned', done: Boolean(shift.vehicle), to: '/driver' },
    { label: 'Pre-trip inspection passed', done: Boolean(shift.inspection?.passed), to: '/driver/inspection' },
    { label: 'Licence valid', done: Boolean(shift.driver && shift.driver.licence_expiry >= new Date().toISOString().slice(0, 10)), to: '/driver' },
  ]
  const ready = readiness.every((r) => r.done)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="forest-gradient relative overflow-hidden rounded-2xl p-5 text-white">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="relative">
          <p className="text-sm text-white/70">{lagosDate(new Date().toISOString())}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Shift for {firstName}<span className="text-warning">.</span></h1>
          {shift.vehicle ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/10 p-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Bus className="size-5" />
              </span>
              <div>
                <p className="text-lg font-bold">{shift.vehicle.fleet_number}</p>
                <p className="text-xs text-white/70">
                  {shift.vehicle.registration_number} · {shift.vehicleType?.name} · {shift.vehicleType?.legal_capacity} legal / {shift.vehicleType?.default_bookable_capacity} bookable
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/70">No vehicle assigned yet. Dispatch will assign one before your first departure.</p>
          )}
        </div>
      </div>

      {/* Readiness */}
      <Card>
        <CardHeader><CardTitle>Ready to depart?</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {readiness.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className={cn('flex items-center gap-3 rounded-lg border p-3', item.done ? 'border-primary/30 bg-primary/[0.06]' : 'border-border')}
            >
              <span className={cn('grid size-7 place-items-center rounded-full', item.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {item.done ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
              </span>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              {!item.done && item.to !== '/driver' && (
                <Button asChild size="sm" variant="outline"><Link to={item.to}>Do it</Link></Button>
              )}
            </motion.div>
          ))}
          {ready && shift.current && (
            <Button asChild size="lg" className="mt-2 w-full">
              <Link to="/driver/trip"><Gauge className="size-4" /> Go to current trip <ArrowRight className="size-4" /></Link>
            </Button>
          )}
          {!shift.inspection?.passed && shift.vehicle && (
            <Button asChild size="lg" variant="forest" className="mt-2 w-full">
              <Link to="/driver/inspection"><ClipboardCheck className="size-4" /> Start pre-trip inspection</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Trips */}
      <Card>
        <CardHeader><CardTitle>Today's trips</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {shift.trips.length === 0 ? (
            <EmptyState icon={Clock} title="No trips assigned today" description="Assignments appear here as dispatch confirms them." />
          ) : (
            shift.trips.map((summary) => (
              <div
                key={summary.trip.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  summary.trip.id === shift.current?.trip.id ? 'border-primary/50 bg-primary/[0.06]' : 'border-border',
                )}
              >
                <div className="w-12 shrink-0 text-center">
                  <p className="text-base font-bold tnum">{lagosTime(summary.trip.scheduled_departure_at)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{summary.direction_name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{summary.trip.trip_code}</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3" />{summary.booked} booked</span>
                  </p>
                </div>
                <TripStatusBadge status={summary.trip.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {shift.driver && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5 text-sm">
            <div>
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Licence</p>
              <p className="font-medium tnum">{shift.driver.licence_number}</p>
            </div>
            <div className="text-right">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">Expires</p>
              <p className="font-medium">{lagosDate(`${shift.driver.licence_expiry}T00:00:00Z`)}</p>
            </div>
            <Badge tone={shift.driver.approval_state === 'approved' ? 'primary' : 'warning'}>{shift.driver.approval_state}</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
