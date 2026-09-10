import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, MapPin, Play, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/misc'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { useDb } from '@/db/store'
import { delayLabel, lagosTime } from '@/lib/format'
import { directionStops } from '@/lib/selectors'
import { advanceTripToStop, completeTrip, startTrip } from '@/server/trips'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useCallback } from 'react'
import { useDriverShift } from './driver-data'

/**
 * The driver's live trip.
 *
 * Large targets, one action at a time: start, advance to the next stop,
 * complete. Starting without a passed inspection is refused by the server and
 * can only be overridden by a supervisor with a recorded reason.
 */
export function DriverTrip() {
  const navigate = useNavigate()
  const { actor, can } = useAuth()
  const shift = useDriverShift()
  const current = shift.current
  const trip = current?.trip

  const stops = useDb(useCallback((db) => (trip ? directionStops(db, trip.route_direction_id) : []), [trip]))

  const [override, setOverride] = useState('')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [finalCount, setFinalCount] = useState('')
  const [odometer, setOdometer] = useState(String(shift.vehicle?.odometer_km ?? ''))
  const [notes, setNotes] = useState('')

  if (!trip || !current) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Current trip" />
        <EmptyState icon={Flag} title="No active trip" description="Your next assigned departure will appear here." action={<Button asChild variant="outline"><Link to="/driver">Back to assignment</Link></Button>} />
      </div>
    )
  }

  const currentIndex = stops.findIndex((s) => s.routeStop.id === trip.current_route_stop_id)
  const nextStop = stops[currentIndex + 1] ?? null
  const inService = ['departed', 'in_service'].includes(trip.status)
  const progress = stops.length > 1 ? (Math.max(0, currentIndex) / (stops.length - 1)) * 100 : 0

  function start(reason?: string) {
    const result = startTrip({ trip_id: trip!.id, override_reason: reason }, actor)
    if (!result.ok) {
      if (result.code === 'inspection_required' && can('action.override_boarding')) setOverrideOpen(true)
      toast.error('Cannot start trip', { description: result.error })
      return
    }
    setOverrideOpen(false)
    toast.success('Trip started', { description: delayLabel(trip!.scheduled_departure_at, result.data.actual_departure_at) })
  }

  function advance() {
    if (!nextStop) return
    const result = advanceTripToStop({ trip_id: trip!.id, route_stop_id: nextStop.routeStop.id }, actor)
    if (!result.ok) {
      toast.error('Could not advance', { description: result.error })
      return
    }
  }

  function finish() {
    const result = completeTrip(
      { trip_id: trip!.id, final_passenger_count: Number(finalCount) || 0, odometer_km: Number(odometer) || 0, notes },
      actor,
    )
    if (!result.ok) {
      toast.error('Could not complete', { description: result.error })
      return
    }
    setCompleting(false)
    toast.success('Trip completed', { description: 'Thank you. Your shift summary has been updated.' })
    navigate('/driver/shift')
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title={trip.trip_code}
        description={`${current.route_code} · ${current.direction_name}`}
        actions={<TripStatusBadge status={trip.status} />}
      />

      {/* Status card */}
      <Card className="overflow-hidden">
        <div className={cn('px-5 py-4 text-white', inService ? 'bg-forest-700' : 'bg-forest-800')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xs uppercase tracking-wide text-white/60">Scheduled</p>
              <p className="text-2xl font-bold tnum">{lagosTime(trip.scheduled_departure_at)}</p>
            </div>
            <div className="text-right">
              <p className="text-2xs uppercase tracking-wide text-white/60">Departure</p>
              <p className="text-lg font-semibold">{delayLabel(trip.scheduled_departure_at, trip.actual_departure_at)}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-white/70">
              <span>{stops[Math.max(0, currentIndex)]?.stop.name ?? stops[0]?.stop.name}</span>
              <span>{stops[stops.length - 1]?.stop.name}</span>
            </div>
            <Progress value={progress} className="bg-white/15" indicatorClassName="bg-primary" />
          </div>
        </div>
        <CardContent className="grid grid-cols-3 gap-2 pt-4 text-center">
          <div>
            <p className="text-lg font-bold tnum">{current.booked}</p>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Booked</p>
          </div>
          <div>
            <p className="text-lg font-bold tnum text-primary">{current.boarded}</p>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Boarded</p>
          </div>
          <div>
            <p className="text-lg font-bold tnum">{current.capacity}</p>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Capacity</p>
          </div>
        </CardContent>
      </Card>

      {/* Primary action */}
      <AnimatePresence mode="wait">
        {!inService && trip.status !== 'completed' && (
          <motion.div key="start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardContent className="space-y-3 pt-5">
                {!shift.inspection?.passed && (
                  <p className="flex items-start gap-2 rounded-lg bg-warning/12 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    A passed pre-trip inspection is required before departure.
                    <Link to="/driver/inspection" className="ml-auto font-semibold underline">Inspect now</Link>
                  </p>
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-4" /> Confirm the boarding count with the hub agent before departing.
                </p>
                <Button size="xl" className="w-full" onClick={() => start()}>
                  <Play className="size-5" /> Start trip
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {inService && (
          <motion.div key="advance" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card>
              <CardContent className="space-y-3 pt-5">
                {nextStop ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg bg-primary/12 text-primary"><MapPin className="size-5" /></span>
                      <div>
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Next stop</p>
                        <p className="text-lg font-bold">{nextStop.stop.name}</p>
                        <p className="text-xs text-muted-foreground">
                          +{nextStop.routeStop.scheduled_offset_minutes} min from origin · {stops.length - 1 - currentIndex} stops remaining
                        </p>
                      </div>
                    </div>
                    <Button size="xl" className="w-full" onClick={advance}>
                      Arrived at {nextStop.stop.name} <ArrowRight className="size-5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-primary" /> Final stop reached. Confirm counts to close the trip.
                    </p>
                    <Button size="xl" className="w-full" variant="forest" onClick={() => setCompleting(true)}>
                      <Flag className="size-5" /> Complete trip
                    </Button>
                  </>
                )}
                <Button asChild variant="outline" className="w-full">
                  <Link to="/driver/incidents"><AlertTriangle className="size-4" /> Report a problem</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stops */}
      <Card>
        <CardHeader><CardTitle>Route</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative ml-2 border-l-2 border-border pl-5">
            {stops.map(({ routeStop, stop }, index) => {
              const reached = inService ? index <= currentIndex : trip.status === 'completed'
              const isCurrent = inService && index === currentIndex
              return (
                <li key={routeStop.id} className="relative pb-4 last:pb-0">
                  <span className={cn('absolute -left-[27px] top-0.5 grid size-4 place-items-center rounded-full border-2 border-card', reached ? 'bg-primary' : 'bg-muted-foreground/30', isCurrent && 'ring-4 ring-primary/25')} />
                  <p className={cn('text-sm', reached ? 'font-semibold' : 'text-muted-foreground')}>{stop.name}</p>
                  <p className="text-2xs text-muted-foreground tnum">
                    {lagosTime(new Date(new Date(trip.scheduled_departure_at).getTime() + routeStop.scheduled_offset_minutes * 60_000).toISOString())}
                    {' · '}{routeStop.distance_from_start_km} km
                  </p>
                  {isCurrent && <Badge tone="primary" size="sm" className="mt-1" dot pulse>Here</Badge>}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Override */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Supervisor override</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              Starting without a passed inspection is a policy exception. It is logged against your name.
            </p>
            <div className="space-y-1.5">
              <Label required>Reason</Label>
              <Textarea value={override} onChange={(e) => setOverride(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button variant="warning" disabled={!override.trim()} onClick={() => start(override)}>Record override and start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete */}
      <Dialog open={completing} onOpenChange={setCompleting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Complete {trip.trip_code}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label required>Final passenger count</Label>
              <Input value={finalCount} inputMode="numeric" onChange={(e) => setFinalCount(e.target.value.replace(/\D/g, ''))} placeholder={String(current.boarded)} className="tnum" />
            </div>
            <div className="space-y-1.5">
              <Label required>Odometer (km)</Label>
              <Input value={odometer} inputMode="numeric" onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} className="tnum" />
            </div>
            <div className="space-y-1.5">
              <Label hint="optional">Post-trip notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(false)}>Back</Button>
            <Button onClick={finish} disabled={!finalCount || !odometer}>Complete trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
