import { useCallback, useState } from 'react'
import { Search, Ticket, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { BookingStatusBadge } from '@/components/ui/status'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { lagosDateTime, maskPhone, naira } from '@/lib/format'
import { titleCase } from '@/lib/utils'

/**
 * Passenger lookup at the counter.
 *
 * Returns only what a ticketing officer needs: identity confirmation, today's
 * bookings and their state. Phone numbers are masked, and no travel history
 * beyond the current service window is exposed.
 */
export function HubLookup() {
  const { can } = useAuth()
  const [query, setQuery] = useState('')

  const results = useDb(
    useCallback(
      (db) => {
        const needle = query.trim().toLowerCase()
        if (needle.length < 3) return []
        const byBooking = db.bookings.filter((b) => b.booking_reference.toLowerCase().includes(needle)).map((b) => b.rider_id)
        return db.profiles
          .filter((p) => db.user_roles.some((r) => r.user_id === p.id && r.role === 'rider'))
          .filter((p) => {
            const rider = db.rider_profiles.find((r) => r.profile_id === p.id)
            return (
              byBooking.includes(p.id) ||
              p.full_name.toLowerCase().includes(needle) ||
              p.phone.includes(needle) ||
              (rider?.staff_id ?? '').toLowerCase().includes(needle)
            )
          })
          .slice(0, 5)
          .map((profile) => {
            const rider = db.rider_profiles.find((r) => r.profile_id === profile.id)
            const organization = db.organizations.find((o) => o.id === rider?.organization_id)
            const bookings = db.bookings
              .filter((b) => b.rider_id === profile.id)
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 4)
              .map((booking) => {
                const trip = db.trips.find((t) => t.id === booking.trip_id)!
                const ticket = db.tickets.find((t) => t.booking_id === booking.id)
                const stop = (id: string) => db.stops.find((s) => s.id === db.route_stops.find((rs) => rs.id === id)?.stop_id)?.name ?? '—'
                return { booking, trip, ticket, origin: stop(booking.origin_route_stop_id), destination: stop(booking.destination_route_stop_id) }
              })
            return { profile, rider, organization, bookings }
          })
      },
      [query],
    ),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Passenger lookup" description="Search by phone, staff ID, booking code or name." />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="At least three characters…" className="h-12 pl-9 text-base" />
      </div>

      {query.trim().length >= 3 && results.length === 0 && (
        <EmptyState icon={UserRound} title="No passenger matches" description="Check the spelling, or register them as a walk-in from the Sell Ticket screen." />
      )}

      {results.map(({ profile, rider, organization, bookings }) => (
        <Card key={profile.id}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{profile.full_name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground tnum">
                {can('action.view_passenger_identity') ? profile.phone : maskPhone(profile.phone)}
                {rider?.staff_id && ` · ${rider.staff_id}`}
              </p>
            </div>
            {organization && (
              <Badge tone={rider?.eligibility_state === 'verified' ? 'primary' : 'warning'}>
                {organization.short_name} · {titleCase(rider?.eligibility_state ?? '')}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings on record.</p>
            ) : (
              bookings.map(({ booking, trip, ticket, origin, destination }) => (
                <div key={booking.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <Ticket className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{origin} → {destination}</p>
                    <p className="text-xs text-muted-foreground">
                      {trip.trip_code} · {lagosDateTime(trip.scheduled_departure_at)} · {booking.booking_reference}
                      {ticket && ` · ${ticket.ticket_code}`}
                    </p>
                  </div>
                  <span className="text-xs tnum">{naira(booking.passenger_contribution)}</span>
                  <BookingStatusBadge status={booking.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
