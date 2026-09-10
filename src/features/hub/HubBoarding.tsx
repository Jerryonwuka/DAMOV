import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ScanLine, ShieldAlert, Undo2, XCircle } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { lagosTime, relative } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'
import type { UUID } from '@/lib/types'
import { reverseBoardingEvent, validateBoarding, type BoardingDecision } from '@/server/boarding'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

type Outcome =
  | { kind: 'valid'; decision: BoardingDecision; ms: number }
  | { kind: 'rejected'; reason: string }
  | null

/**
 * The gate.
 *
 * A scan is a server decision, never a client one. The large green state is
 * only ever shown after `validate_boarding` has confirmed ticket, trip, stop,
 * time window, payment, subsidy and prior-boarding state.
 */
export function HubBoarding() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [tripId, setTripId] = useState<UUID | ''>('')
  const [credential, setCredential] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [overrideFor, setOverrideFor] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [reversing, setReversing] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')

  const trips = useDb(
    useCallback(
      (db) =>
        tripSummaries(db, { serviceDate: today }).filter((s) =>
          ['assigned', 'boarding', 'departed', 'in_service'].includes(s.trip.status),
        ),
      [today],
    ),
  )

  useEffect(() => {
    if (!tripId && trips.length) setTripId(trips[0].trip.id)
  }, [trips, tripId])

  const selected = trips.find((t) => t.trip.id === tripId)

  const events = useDb(
    useCallback(
      (db) =>
        db.boarding_events
          .filter((e) => e.trip_id === tripId)
          .sort((a, b) => b.boarded_at.localeCompare(a.boarded_at))
          .slice(0, 25)
          .map((event) => {
            const booking = event.booking_id ? db.bookings.find((b) => b.id === event.booking_id) : null
            const passenger = booking ? db.profiles.find((p) => p.id === booking.rider_id) : null
            return { event, reference: booking?.booking_reference ?? null, passenger: passenger?.full_name ?? null }
          }),
      [tripId],
    ),
  )

  function scan(withOverride?: string) {
    if (!tripId || !credential.trim()) return
    const started = Date.now()
    const result = validateBoarding({
      trip_id: tripId as UUID,
      credential,
      method: /^dmv_t_/.test(credential.trim()) ? 'qr_scan' : credential.trim().startsWith('DMV-') ? 'booking_code' : 'phone_lookup',
      stop_id: null,
      device_id: 'HUB-SCANNER-01',
      validator: actor,
      started_at: started,
      override_reason: withOverride,
    })
    if (result.ok) {
      setOutcome({ kind: 'valid', decision: result.data, ms: Date.now() - started })
      setCredential('')
      setOverrideFor(null)
      setOverrideReason('')
    } else {
      setOutcome({ kind: 'rejected', reason: result.error })
      if (can('action.override_boarding')) setOverrideFor(credential)
    }
    inputRef.current?.focus()
  }

  function reverse() {
    if (!reversing) return
    const result = reverseBoardingEvent(reversing, reversalReason, actor)
    if (!result.ok) {
      toast.error('Could not reverse', { description: result.error })
      return
    }
    toast.success('Boarding reversed', { description: 'The passenger can be validated again.' })
    setReversing(null)
    setReversalReason('')
  }

  const validated = events.filter((e) => e.event.result !== 'rejected' && !e.event.reversed_at).length
  const averageMs = events.length
    ? Math.round(events.reduce((a, e) => a + (e.event.duration_ms ?? 0), 0) / events.length)
    : 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Boarding" description="Scan a ticket QR, type a booking code, or look the passenger up by phone or staff ID." />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Active departure</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={tripId} onValueChange={(v) => { setTripId(v as UUID); setOutcome(null) }}>
                <SelectTrigger><SelectValue placeholder="Select a trip" /></SelectTrigger>
                <SelectContent>
                  {trips.map((summary) => (
                    <SelectItem key={summary.trip.id} value={summary.trip.id}>
                      {lagosTime(summary.trip.scheduled_departure_at)} · {summary.trip.trip_code} · {summary.direction_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selected && (
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/60 p-3 text-center">
                  <div>
                    <p className="text-lg font-bold tnum">{selected.booked}</p>
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">Booked</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tnum text-primary">{selected.boarded}</p>
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">Boarded</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tnum">{selected.capacity}</p>
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">Capacity</p>
                  </div>
                  <div className="col-span-3">
                    <Progress value={Math.min(100, (selected.boarded / Math.max(1, selected.capacity)) * 100)} />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="credential">Ticket QR, booking code, phone or staff ID</Label>
                <div className="relative">
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="credential"
                    ref={inputRef}
                    autoFocus
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && scan()}
                    placeholder="Scan or type…"
                    className="h-12 pl-9 text-base"
                  />
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={() => scan()} disabled={!tripId || !credential.trim()}>
                Validate boarding
              </Button>
            </CardContent>
          </Card>

          {/* Decision */}
          <AnimatePresence mode="wait">
            {outcome?.kind === 'valid' && (
              <motion.div
                key={outcome.decision.event.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              >
                <Card className={cn('overflow-hidden border-2', outcome.decision.event.result === 'override' ? 'border-warning' : 'border-primary')}>
                  <div className={cn('px-6 py-7 text-center', outcome.decision.event.result === 'override' ? 'bg-warning/15' : 'bg-primary/15')}>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 16 }}
                      className={cn(
                        'mx-auto grid size-16 place-items-center rounded-full text-white',
                        outcome.decision.event.result === 'override' ? 'bg-warning' : 'bg-primary',
                      )}
                    >
                      {outcome.decision.event.result === 'override' ? <ShieldAlert className="size-8" /> : <CheckCircle2 className="size-8" />}
                    </motion.span>
                    <p className="mt-4 text-2xl font-bold">
                      {outcome.decision.event.result === 'override' ? 'Boarded on override' : 'Board the passenger'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{outcome.decision.passenger_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {outcome.decision.origin} → {outcome.decision.destination}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <Badge tone="neutral">{outcome.decision.booking_reference}</Badge>
                      {outcome.decision.sponsor_name && <Badge tone="primary">{outcome.decision.sponsor_name} sponsored</Badge>}
                      <Badge tone="neutral">{(outcome.ms / 1000).toFixed(1)}s</Badge>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
            {outcome?.kind === 'rejected' && (
              <motion.div key="rejected" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                <Card className="overflow-hidden border-2 border-critical">
                  <div className="bg-critical/12 px-6 py-7 text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-full bg-critical text-white">
                      <XCircle className="size-8" />
                    </span>
                    <p className="mt-4 text-2xl font-bold">Do not board</p>
                    <p className="mt-2 text-sm text-muted-foreground">{outcome.reason}</p>
                    {overrideFor && can('action.override_boarding') && (
                      <Button variant="warning" size="sm" className="mt-4" onClick={() => setOverrideReason(' ')}>
                        <ShieldAlert className="size-4" /> Supervisor override
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recent validations */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent validations</CardTitle>
            <p className="text-xs text-muted-foreground">
              {validated} boarded · average {(averageMs / 1000).toFixed(1)}s per validation
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {events.length === 0 ? (
              <EmptyState title="No scans yet" description="Validations for this departure will appear here." />
            ) : (
              events.map(({ event, reference, passenger }) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-2.5',
                    event.result === 'rejected' && 'border-critical/30 bg-critical/[0.05]',
                    event.reversed_at && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full',
                      event.result === 'valid' && 'bg-primary/15 text-primary',
                      event.result === 'override' && 'bg-warning/20 text-[hsl(45_96%_30%)]',
                      event.result === 'rejected' && 'bg-critical/15 text-critical',
                    )}
                  >
                    {event.result === 'rejected' ? <XCircle className="size-3.5" /> : event.result === 'override' ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {passenger ?? 'Unmatched credential'}
                      {event.reversed_at && ' · reversed'}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {reference ?? event.rejection_reason} · {titleCase(event.validation_method)} · {relative(event.boarded_at)}
                    </p>
                  </div>
                  {event.result !== 'rejected' && !event.reversed_at && can('action.override_boarding') && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setReversing(event.id)} aria-label="Reverse boarding">
                      <Undo2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Override */}
      <Dialog open={Boolean(overrideReason)} onOpenChange={(open) => !open && setOverrideReason('')}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Supervisor override</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              An override boards a passenger the server refused. It is written to the audit log
              against your name and appears on the boarding-validation report.
            </p>
            <div className="space-y-1.5">
              <Label required>Reason</Label>
              <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why this passenger may board" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideReason('')}>Cancel</Button>
            <Button
              variant="warning"
              disabled={!overrideReason.trim()}
              onClick={() => {
                setCredential(overrideFor ?? credential)
                scan(overrideReason)
              }}
            >
              Record override and board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal */}
      <Dialog open={Boolean(reversing)} onOpenChange={(open) => !open && setReversing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Reverse this boarding?</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The ticket returns to valid so the passenger can be validated again. Both the original
              scan and this reversal stay on the record.
            </p>
            <div className="space-y-1.5">
              <Label required>Reason</Label>
              <Textarea value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reverse} disabled={!reversalReason.trim()}>Reverse boarding</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
