import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, MapPin, Ticket as TicketIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { QrToken } from '@/features/shared/QrToken'
import { lagosDate, lagosTime, naira } from '@/lib/format'

/**
 * The passenger's boarding credential.
 *
 * The QR encodes an opaque token only. Everything printed around it — name,
 * stops, fare — is for the passenger's own reading; the gate resolves the token
 * against the server and decides on its own.
 */
export function RiderTickets() {
  const { profile } = useAuth()
  const [index, setIndex] = useState(0)

  const tickets = useDb(
    useCallback(
      (db) =>
        db.tickets
          .filter((ticket) => {
            const booking = db.bookings.find((b) => b.id === ticket.booking_id)
            return booking?.rider_id === profile?.id && ['issued', 'used'].includes(ticket.status)
          })
          .map((ticket) => {
            const booking = db.bookings.find((b) => b.id === ticket.booking_id)!
            const trip = db.trips.find((t) => t.id === booking.trip_id)!
            const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
            const route = db.routes.find((r) => r.id === direction.route_id)!
            const stopName = (routeStopId: string) => {
              const rs = db.route_stops.find((s) => s.id === routeStopId)
              return db.stops.find((s) => s.id === rs?.stop_id)?.name ?? '—'
            }
            return {
              ticket,
              booking,
              trip,
              route,
              origin: stopName(booking.origin_route_stop_id),
              destination: stopName(booking.destination_route_stop_id),
              sponsor: booking.sponsor_id ? db.organizations.find((o) => o.id === booking.sponsor_id)?.short_name : null,
            }
          })
          .sort((a, b) => b.trip.scheduled_departure_at.localeCompare(a.trip.scheduled_departure_at))
          .slice(0, 12),
      [profile?.id],
    ),
  )

  if (tickets.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Tickets" />
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Once you book a departure your boarding pass appears here."
          action={<Button asChild><Link to="/rider/book">Book a journey</Link></Button>}
        />
      </div>
    )
  }

  const current = tickets[Math.min(index, tickets.length - 1)]
  const used = current.ticket.status === 'used'

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Tickets" description="Show this code at the boarding gate." />

      <motion.div key={current.ticket.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          {/* Stub */}
          <div className="forest-gradient px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xs uppercase tracking-wide text-white/60">{current.route.code} · {current.route.public_name}</p>
                <p className="mt-0.5 text-lg font-bold">{lagosTime(current.trip.scheduled_departure_at)}</p>
                <p className="text-xs text-white/70">{lagosDate(current.trip.scheduled_departure_at)}</p>
              </div>
              <Badge tone={used ? 'neutral' : 'primary'}>{used ? 'Boarded' : 'Valid'}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <MapPin className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{current.origin} → {current.destination}</span>
            </div>
          </div>

          {/* Perforation */}
          <div className="relative flex items-center">
            <span className="absolute -left-2.5 size-5 rounded-full bg-background" />
            <span className="mx-4 h-px flex-1 border-t border-dashed border-border" />
            <span className="absolute -right-2.5 size-5 rounded-full bg-background" />
          </div>

          <div className="flex flex-col items-center px-5 py-6">
            <div className={used ? 'opacity-30 grayscale' : ''}>
              <QrToken token={current.ticket.qr_token} size={196} />
            </div>
            <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">Ticket code</p>
            <p className="text-base font-bold tracking-widest tnum">{current.ticket.ticket_code}</p>
            <p className="mt-1 text-xs text-muted-foreground tnum">{current.booking.booking_reference}</p>

            <dl className="mt-5 w-full space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Passenger</dt>
                <dd className="font-medium">{profile?.full_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Gross fare</dt>
                <dd className="tnum">{naira(current.booking.gross_fare)}</dd>
              </div>
              {current.booking.sponsor_contribution > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{current.sponsor} covered</dt>
                  <dd className="tnum text-primary-700 dark:text-primary-400">− {naira(current.booking.sponsor_contribution)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>You paid</dt>
                <dd className="tnum">{naira(current.booking.passenger_contribution)}</dd>
              </div>
            </dl>
          </div>
        </Card>
      </motion.div>

      {tickets.length > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" size="icon" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous ticket">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground tnum">
            {index + 1} of {tickets.length}
          </span>
          <Button variant="outline" size="icon" disabled={index >= tickets.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next ticket">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
