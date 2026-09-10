import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Banknote, CheckCircle2, CreditCard, Gift, Printer, Search, UserPlus, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useAssignedHub, useOpenCashSession, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { FareBreakdown } from '@/features/shared/FareBreakdown'
import { lagosTime, maskPhone, naira } from '@/lib/format'
import { directionStops } from '@/lib/selectors'
import type { FareQuote, PaymentMethod, UUID } from '@/lib/types'
import { checkJourneyAvailability } from '@/server/capacity'
import { getConfigNumber } from '@/server/configuration'
import { quoteBooking } from '@/server/fares'
import { createBookingAndReserveCapacity, createWalkInPassenger } from '@/server/bookings'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'transfer', label: 'Transfer', icon: Wallet },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'sponsor_only', label: 'Sponsor only', icon: Gift },
  { key: 'complimentary', label: 'Complimentary', icon: Gift },
]

/**
 * Counter sale.
 *
 * Cash may be handled by hand; the passenger record never is. Every walk-in
 * gets a real profile, a real booking against segment inventory and a real
 * ticket, so a cash passenger is exactly as visible to the network as a
 * digitally booked one.
 */
export function HubSellTicket() {
  const { actor } = useAuth()
  const hub = useAssignedHub()
  const today = useServiceDate()
  const session = useOpenCashSession()

  const [search, setSearch] = useState('')
  const [riderId, setRiderId] = useState<UUID | ''>('')
  const [tripId, setTripId] = useState<UUID | ''>('')
  const [originId, setOriginId] = useState<UUID | ''>('')
  const [destinationId, setDestinationId] = useState<UUID | ''>('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reason, setReason] = useState('')
  const [quote, setQuote] = useState<FareQuote | null>(null)
  const [issued, setIssued] = useState<{ reference: string; ticket: string; paid: number } | null>(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', organization_id: '', staff_id: '' })

  const passengers = useDb(
    useCallback(
      (db) => {
        const needle = search.trim().toLowerCase()
        if (!needle) return []
        return db.profiles
          .filter((p) => db.user_roles.some((r) => r.user_id === p.id && r.role === 'rider'))
          .filter((p) => {
            const rider = db.rider_profiles.find((r) => r.profile_id === p.id)
            return (
              p.full_name.toLowerCase().includes(needle) ||
              p.phone.includes(needle) ||
              (rider?.staff_id ?? '').toLowerCase().includes(needle)
            )
          })
          .slice(0, 6)
          .map((p) => {
            const rider = db.rider_profiles.find((r) => r.profile_id === p.id)
            return {
              profile: p,
              rider,
              organization: db.organizations.find((o) => o.id === rider?.organization_id) ?? null,
            }
          })
      },
      [search],
    ),
  )

  const departures = useDb(
    useCallback(
      (db) => {
        const nowMs = Date.now()
        const closeAfter = getConfigNumber(db, 'boarding.window_close_minutes', 5)
        return db.trips
          .filter((t) => t.service_date === today && !['cancelled', 'completed'].includes(t.status))
          .filter((t) => t.origin_hub_id === hub?.id || t.destination_hub_id === hub?.id || !hub)
          .filter((t) => new Date(t.scheduled_departure_at).getTime() > nowMs - closeAfter * 60_000)
          .sort((a, b) => a.scheduled_departure_at.localeCompare(b.scheduled_departure_at))
          .slice(0, 20)
          .map((trip) => {
            const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
            const route = db.routes.find((r) => r.id === direction.route_id)!
            return { trip, direction, route }
          })
      },
      [today, hub],
    ),
  )

  const selectedTrip = departures.find((d) => d.trip.id === tripId)
  const stops = useDb(
    useCallback(
      (db) => (selectedTrip ? directionStops(db, selectedTrip.direction.id) : []),
      [selectedTrip],
    ),
  )
  const destinationOptions = useMemo(() => {
    const seq = stops.find((s) => s.routeStop.id === originId)?.routeStop.sequence ?? 0
    return stops.filter((s) => s.routeStop.alighting_allowed && s.routeStop.sequence > seq)
  }, [stops, originId])

  const availability = useMemo(() => {
    if (!tripId || !originId || !destinationId) return null
    const result = checkJourneyAvailability(tripId as UUID, originId as UUID, destinationId as UUID)
    return result.ok ? result.data : null
  }, [tripId, originId, destinationId])

  const selectedPassenger = useDb(
    useCallback((db) => db.profiles.find((p) => p.id === riderId) ?? null, [riderId]),
  )
  const organizations = useDb((db) => db.organizations.filter((o) => ['ministry', 'company', 'school', 'government'].includes(o.type)))

  function requestQuote() {
    if (!riderId || !tripId || !originId || !destinationId) return
    const result = quoteBooking({
      trip_id: tripId as UUID,
      origin_route_stop_id: originId as UUID,
      destination_route_stop_id: destinationId as UUID,
      rider_id: riderId as UUID,
    })
    if (!result.ok) {
      toast.error('Cannot price this journey', { description: result.error })
      setQuote(null)
      return
    }
    setQuote(result.data)
    if (result.data.passenger_contribution === 0) setMethod('sponsor_only')
  }

  function sell() {
    if (!riderId || !tripId || !originId || !destinationId) return
    const result = createBookingAndReserveCapacity({
      trip_id: tripId as UUID,
      rider_id: riderId as UUID,
      origin_route_stop_id: originId as UUID,
      destination_route_stop_id: destinationId as UUID,
      channel: 'hub',
      payment_method: method,
      cash_session_id: session?.id ?? null,
      actor,
      complimentary_reason: method === 'complimentary' ? reason : undefined,
    })
    if (!result.ok) {
      toast.error('Sale not completed', { description: result.error })
      return
    }
    setIssued({
      reference: result.data.booking.booking_reference,
      ticket: result.data.ticket.ticket_code,
      paid: result.data.booking.passenger_contribution,
    })
    toast.success('Ticket issued', { description: `${result.data.booking.booking_reference} added to the trip manifest.` })
  }

  function reset() {
    setIssued(null)
    setQuote(null)
    setRiderId('')
    setSearch('')
    setOriginId('')
    setDestinationId('')
    setReason('')
  }

  function registerWalkIn() {
    if (!walkIn.name.trim() || !walkIn.phone.trim()) return
    const result = createWalkInPassenger(
      {
        full_name: walkIn.name,
        phone: walkIn.phone,
        organization_id: walkIn.organization_id || null,
        staff_id: walkIn.staff_id || null,
      },
      actor,
    )
    if (!result.ok) {
      toast.error('Could not register passenger', { description: result.error })
      return
    }
    setRiderId(result.data.profile_id)
    setSearch(walkIn.name)
    setWalkInOpen(false)
    setWalkIn({ name: '', phone: '', organization_id: '', staff_id: '' })
    toast.success('Walk-in passenger registered')
  }

  if (issued) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Ticket issued" />
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="overflow-hidden text-center">
            <div className="bg-primary/10 px-6 py-8">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 className="size-7" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">Booking reference</p>
              <p className="text-2xl font-bold tracking-widest tnum">{issued.reference}</p>
              <p className="mt-2 text-sm text-muted-foreground">Ticket {issued.ticket}</p>
              <p className="mt-3 text-lg font-bold tnum">{naira(issued.paid)} collected</p>
            </div>
            <CardContent className="flex flex-col gap-2 pt-5 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                <Printer className="size-4" /> Print
              </Button>
              <Button className="flex-1" onClick={reset}>Sell another</Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Sell a ticket"
        description="Find or register the passenger, choose their journey, and take payment. Every cash sale is attached to your open session."
        actions={
          session ? (
            <Badge tone="primary" dot pulse>Cash session open</Badge>
          ) : (
            <Button asChild variant="warning" size="sm"><Link to="/hub/cash">Open cash session</Link></Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          {/* Passenger */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>1 · Passenger</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setWalkInOpen(true)}>
                <UserPlus className="size-4" /> Walk-in
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setRiderId(''); setQuote(null) }}
                  placeholder="Phone, name, staff ID or booking code"
                  className="pl-9"
                />
              </div>
              {selectedPassenger ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/[0.06] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedPassenger.full_name}</p>
                    <p className="text-xs text-muted-foreground tnum">{maskPhone(selectedPassenger.phone)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setRiderId(''); setQuote(null) }}>Change</Button>
                </div>
              ) : passengers.length > 0 ? (
                <div className="space-y-1">
                  {passengers.map((entry) => (
                    <button
                      key={entry.profile.id}
                      onClick={() => { setRiderId(entry.profile.id); setQuote(null) }}
                      className="press flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{entry.profile.full_name}</span>
                        <span className="block text-xs text-muted-foreground tnum">{maskPhone(entry.profile.phone)}</span>
                      </span>
                      {entry.organization && (
                        <Badge tone={entry.rider?.eligibility_state === 'verified' ? 'primary' : 'warning'} size="sm">
                          {entry.organization.short_name}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              ) : search.trim() ? (
                <EmptyState
                  title="No passenger found"
                  description="Register them as a walk-in so the trip manifest stays complete."
                  action={<Button size="sm" onClick={() => { setWalkIn((w) => ({ ...w, name: search })); setWalkInOpen(true) }}>Register walk-in</Button>}
                />
              ) : null}
            </CardContent>
          </Card>

          {/* Journey */}
          <Card>
            <CardHeader><CardTitle>2 · Journey</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Departure</Label>
                <Select value={tripId} onValueChange={(v) => { setTripId(v as UUID); setOriginId(''); setDestinationId(''); setQuote(null) }}>
                  <SelectTrigger><SelectValue placeholder="Select a departure" /></SelectTrigger>
                  <SelectContent>
                    {departures.map(({ trip, route, direction }) => (
                      <SelectItem key={trip.id} value={trip.id}>
                        {lagosTime(trip.scheduled_departure_at)} · {route.code} {direction.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Select value={originId} onValueChange={(v) => { setOriginId(v as UUID); setDestinationId(''); setQuote(null) }} disabled={!tripId}>
                    <SelectTrigger><SelectValue placeholder="Boarding stop" /></SelectTrigger>
                    <SelectContent>
                      {stops.filter((s) => s.routeStop.boarding_allowed).map(({ routeStop, stop }) => (
                        <SelectItem key={routeStop.id} value={routeStop.id}>{stop.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Select value={destinationId} onValueChange={(v) => { setDestinationId(v as UUID); setQuote(null) }} disabled={!originId}>
                    <SelectTrigger><SelectValue placeholder="Alighting stop" /></SelectTrigger>
                    <SelectContent>
                      {destinationOptions.map(({ routeStop, stop }) => (
                        <SelectItem key={routeStop.id} value={routeStop.id}>{stop.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {availability && (
                <div className={cn('rounded-lg p-3 text-xs', availability.available ? 'bg-primary/[0.07]' : 'bg-critical/10')}>
                  {availability.available ? (
                    <>
                      <span className="font-semibold">{availability.seats_available} seats</span> available across all{' '}
                      {availability.segments_checked} segments of this journey. Tightest leg:{' '}
                      {availability.limiting_segment_label}.
                    </>
                  ) : (
                    <>This journey is full on {availability.limiting_segment_label}. Offer the next departure.</>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                variant="outline"
                disabled={!riderId || !tripId || !originId || !destinationId || !availability?.available}
                onClick={requestQuote}
              >
                Calculate fare
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Payment */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader><CardTitle>3 · Fare and payment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!quote ? (
              <EmptyState title="No fare calculated yet" description="Select a passenger and journey, then calculate the fare." />
            ) : (
              <>
                <FareBreakdown quote={quote} />
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {METHODS.map((option) => {
                      const disabled = option.key === 'sponsor_only' && quote.passenger_contribution > 0
                      return (
                        <button
                          key={option.key}
                          disabled={disabled}
                          onClick={() => setMethod(option.key)}
                          className={cn(
                            'press flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all',
                            method === option.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40',
                            disabled && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          <option.icon className="size-3.5" />
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {method === 'cash' && !session && (
                  <p className="rounded-lg bg-critical/10 p-2.5 text-xs">
                    Open a cash session before taking cash — every cash ticket must belong to a session.
                  </p>
                )}
                {method === 'complimentary' && (
                  <div className="space-y-1.5">
                    <Label required>Authorisation reason</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Who authorised this and why" />
                  </div>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={sell}
                  disabled={(method === 'cash' && !session) || (method === 'complimentary' && !reason.trim())}
                >
                  Issue ticket · {naira(method === 'complimentary' ? 0 : quote.passenger_contribution)}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Register a walk-in passenger</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A lightweight record so this passenger appears on the manifest and in reconciliation.
              Only a name and phone number are required.
            </p>
            <div className="space-y-1.5">
              <Label required>Full name</Label>
              <Input value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label required>Phone number</Label>
              <Input value={walkIn.phone} inputMode="tel" onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label hint="optional">Organisation</Label>
              <Select value={walkIn.organization_id} onValueChange={(v) => setWalkIn({ ...walkIn, organization_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label hint="verified against the eligibility list">Staff ID</Label>
              <Input value={walkIn.staff_id} onChange={(e) => setWalkIn({ ...walkIn, staff_id: e.target.value })} placeholder="FMOT/2022/1408" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkInOpen(false)}>Cancel</Button>
            <Button onClick={registerWalkIn} disabled={!walkIn.name.trim() || !walkIn.phone.trim()}>Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
