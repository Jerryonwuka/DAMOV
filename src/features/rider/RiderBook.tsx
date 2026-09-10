import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeftRight, ArrowRight, Calendar, CheckCircle2, CreditCard, Loader2, MapPin, Users,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { FareBreakdown } from '@/features/shared/FareBreakdown'
import { directionStops } from '@/lib/selectors'
import { durationLabel, lagosTime, naira } from '@/lib/format'
import type { FareQuote, UUID } from '@/lib/types'
import { checkJourneyAvailability } from '@/server/capacity'
import { getConfigNumber } from '@/server/configuration'
import { quoteBooking } from '@/server/fares'
import { createBookingAndReserveCapacity } from '@/server/bookings'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Step = 'journey' | 'departure' | 'review' | 'done'

/**
 * Passenger booking.
 *
 * Availability shown against a departure is availability for *this passenger's
 * whole journey* — the minimum free seats across every segment they traverse —
 * not the bus's overall free-seat count.
 */
export function RiderBook() {
  const navigate = useNavigate()
  const { profile, actor } = useAuth()
  const today = useServiceDate()

  const [step, setStep] = useState<Step>('journey')
  const [directionId, setDirectionId] = useState<UUID | ''>('')
  const [originId, setOriginId] = useState<UUID | ''>('')
  const [destinationId, setDestinationId] = useState<UUID | ''>('')
  const [date, setDate] = useState(today)
  const [tripId, setTripId] = useState<UUID | ''>('')
  const [quote, setQuote] = useState<FareQuote | null>(null)
  const [method, setMethod] = useState<'card' | 'transfer'>('card')
  const [submitting, setSubmitting] = useState(false)
  const [reference, setReference] = useState<string | null>(null)

  const directions = useDb(
    useCallback((db) => {
      const published = new Set(db.routes.filter((r) => r.status === 'published').map((r) => r.id))
      return db.route_directions
        .filter((d) => published.has(d.route_id) && d.active)
        .map((d) => ({ direction: d, route: db.routes.find((r) => r.id === d.route_id)! }))
    }, []),
  )

  const stops = useDb(useCallback((db) => (directionId ? directionStops(db, directionId) : []), [directionId]))

  const departures = useDb(
    useCallback(
      (db) => {
        if (!directionId || !originId || !destinationId) return []
        const nowMs = Date.now()
        // Bookable for as long as the gate is open — the same window boarding enforces.
        const closeAfter = getConfigNumber(db, 'boarding.window_close_minutes', 5)
        return db.trips
          .filter((t) => t.route_direction_id === directionId && t.service_date === date)
          .filter((t) => !['cancelled', 'completed'].includes(t.status))
          .filter((t) => new Date(t.scheduled_departure_at).getTime() > nowMs - closeAfter * 60_000)
          .sort((a, b) => a.scheduled_departure_at.localeCompare(b.scheduled_departure_at))
          .map((trip) => {
            const availability = checkJourneyAvailability(trip.id, originId, destinationId)
            const originStop = db.route_stops.find((rs) => rs.id === originId)!
            const destinationStop = db.route_stops.find((rs) => rs.id === destinationId)!
            return {
              trip,
              availability: availability.ok ? availability.data : null,
              error: availability.ok ? null : availability.error,
              boardAt: new Date(
                new Date(trip.scheduled_departure_at).getTime() + originStop.scheduled_offset_minutes * 60_000,
              ).toISOString(),
              journeyMinutes: destinationStop.scheduled_offset_minutes - originStop.scheduled_offset_minutes,
            }
          })
      },
      [directionId, originId, destinationId, date],
    ),
  )

  const originOptions = stops.filter((s) => s.routeStop.boarding_allowed)
  const destinationOptions = useMemo(() => {
    const originSeq = stops.find((s) => s.routeStop.id === originId)?.routeStop.sequence ?? 0
    return stops.filter((s) => s.routeStop.alighting_allowed && s.routeStop.sequence > originSeq)
  }, [stops, originId])

  const canSearch = directionId && originId && destinationId

  function selectDeparture(id: UUID) {
    if (!profile) return
    setTripId(id)
    const result = quoteBooking({
      trip_id: id,
      origin_route_stop_id: originId as UUID,
      destination_route_stop_id: destinationId as UUID,
      rider_id: profile.id,
    })
    if (!result.ok) {
      toast.error('Could not price this journey', { description: result.error })
      return
    }
    setQuote(result.data)
    setStep('review')
  }

  function confirm() {
    if (!profile || !tripId) return
    setSubmitting(true)
    // Guaranteed capacity, payment and ticket issue happen in one server call.
    const result = createBookingAndReserveCapacity({
      trip_id: tripId as UUID,
      rider_id: profile.id,
      origin_route_stop_id: originId as UUID,
      destination_route_stop_id: destinationId as UUID,
      channel: 'rider_web',
      payment_method: method === 'card' ? 'card' : 'transfer',
      actor,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error('Booking not completed', { description: result.error })
      return
    }
    setReference(result.data.booking.booking_reference)
    setStep('done')
    toast.success('Seat reserved across your whole journey', {
      description: `Ticket ${result.data.ticket.ticket_code} issued.`,
    })
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'journey', label: 'Journey' },
    { key: 'departure', label: 'Departure' },
    { key: 'review', label: 'Fare' },
    { key: 'done', label: 'Ticket' },
  ]
  const stepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Book a journey" description="Choose where you are travelling from and to. Availability is checked for every segment of your journey." />

      {/* Progress */}
      <ol className="mb-5 flex items-center gap-2">
        {steps.map((entry, index) => (
          <li key={entry.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold transition-colors duration-300',
                index < stepIndex && 'bg-primary text-primary-foreground',
                index === stepIndex && 'bg-forest-700 text-white dark:bg-primary dark:text-primary-foreground',
                index > stepIndex && 'bg-muted text-muted-foreground',
              )}
            >
              {index < stepIndex ? <CheckCircle2 className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('hidden text-xs font-medium sm:block', index <= stepIndex ? 'text-foreground' : 'text-muted-foreground')}>
              {entry.label}
            </span>
            {index < steps.length - 1 && (
              <span className="h-px flex-1 bg-border">
                <motion.span
                  className="block h-px bg-primary"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: index < stepIndex ? 1 : 0 }}
                  style={{ transformOrigin: 'left' }}
                  transition={{ duration: 0.4 }}
                />
              </span>
            )}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {step === 'journey' && (
          <motion.div key="journey" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card>
              <CardHeader>
                <CardTitle>Where are you going?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Route</Label>
                  <Select
                    value={directionId}
                    onValueChange={(value) => {
                      setDirectionId(value as UUID)
                      setOriginId('')
                      setDestinationId('')
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                    <SelectContent>
                      {directions.map(({ direction, route }) => (
                        <SelectItem key={direction.id} value={direction.id}>
                          {route.code} · {direction.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <div className="space-y-1.5">
                    <Label>From</Label>
                    <Select value={originId} onValueChange={(v) => { setOriginId(v as UUID); setDestinationId('') }} disabled={!directionId}>
                      <SelectTrigger><SelectValue placeholder="Boarding stop" /></SelectTrigger>
                      <SelectContent>
                        {originOptions.map(({ routeStop, stop }) => (
                          <SelectItem key={routeStop.id} value={routeStop.id}>{stop.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="hidden pb-2.5 text-muted-foreground sm:block">
                    <ArrowLeftRight className="size-4" />
                  </span>
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Select value={destinationId} onValueChange={(v) => setDestinationId(v as UUID)} disabled={!originId}>
                      <SelectTrigger><SelectValue placeholder="Alighting stop" /></SelectTrigger>
                      <SelectContent>
                        {destinationOptions.map(({ routeStop, stop }) => (
                          <SelectItem key={routeStop.id} value={routeStop.id}>{stop.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="date">Travel date</Label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="pl-9" />
                  </div>
                </div>

                <Button className="w-full" size="lg" disabled={!canSearch} onClick={() => setStep('departure')}>
                  Show departures <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'departure' && (
          <motion.div key="departure" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setStep('journey')}>Change journey</Button>
            {departures.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No departures left on this date"
                description="Try the next service day, or pick a different direction."
              />
            ) : (
              departures.map((entry, index) => {
                const seats = entry.availability?.seats_available ?? 0
                const full = !entry.availability?.available
                return (
                  <motion.button
                    key={entry.trip.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.3) }}
                    disabled={full}
                    onClick={() => selectDeparture(entry.trip.id)}
                    className={cn(
                      'flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-damov',
                      full ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lifted',
                    )}
                  >
                    <div className="shrink-0 text-center">
                      <p className="text-xl font-bold tnum">{lagosTime(entry.boardAt)}</p>
                      <p className="text-2xs uppercase tracking-wide text-muted-foreground">Board</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{entry.trip.trip_code}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{durationLabel(entry.journeyMinutes)} journey</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          {full ? 'Full for your journey' : `${seats} seats for your whole journey`}
                        </span>
                      </p>
                      {entry.availability && !full && seats <= 6 && (
                        <p className="mt-1 text-2xs text-warning-foreground">
                          Limited by {entry.availability.limiting_segment_label}
                        </p>
                      )}
                    </div>
                    {full ? (
                      <Badge tone="critical">Full</Badge>
                    ) : (
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </motion.button>
                )
              })
            )}
          </motion.div>
        )}

        {step === 'review' && quote && (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('departure')}>Change departure</Button>
            <Card>
              <CardHeader><CardTitle>Confirm your journey</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      {stops.find((s) => s.routeStop.id === originId)?.stop.name} → {stops.find((s) => s.routeStop.id === destinationId)?.stop.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {departures.find((d) => d.trip.id === tripId)?.trip.trip_code} · departs{' '}
                      {lagosTime(departures.find((d) => d.trip.id === tripId)?.trip.scheduled_departure_at ?? null)}
                    </p>
                  </div>
                </div>

                <FareBreakdown quote={quote} />

                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'card' as const, label: 'Card / provider' },
                      { key: 'transfer' as const, label: 'Bank transfer' },
                    ]).map((option) => (
                      <button
                        key={option.key}
                        onClick={() => setMethod(option.key)}
                        className={cn(
                          'press flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all duration-200',
                          method === option.key ? 'border-primary bg-primary/10 text-primary-800 dark:text-primary-200' : 'border-border hover:border-primary/40',
                        )}
                      >
                        <CreditCard className="size-4" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    Payments run through a mock provider in this build. Status only moves to paid on a
                    verified provider response or an authorised cash record.
                  </p>
                </div>

                <Button className="w-full" size="lg" onClick={confirm} loading={submitting}>
                  {submitting ? 'Reserving your seat…' : `Pay ${naira(quote.passenger_contribution)} and confirm`}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="overflow-hidden">
              <div className="bg-primary/10 px-6 py-8 text-center">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                  className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <CheckCircle2 className="size-7" />
                </motion.span>
                <h2 className="mt-4 text-xl font-bold">Seat guaranteed</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Capacity is held on every segment from your boarding stop to your destination.
                </p>
                <p className="mt-3 inline-block rounded-lg bg-card px-3 py-1.5 text-sm font-bold tracking-widest tnum">
                  {reference}
                </p>
              </div>
              <CardContent className="flex flex-col gap-2 pt-5 sm:flex-row">
                <Button className="flex-1" onClick={() => navigate('/rider/tickets')}>
                  View my ticket
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep('journey')
                    setTripId('')
                    setQuote(null)
                    setReference(null)
                  }}
                >
                  Book another journey
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {submitting && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}
