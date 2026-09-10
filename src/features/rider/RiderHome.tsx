import { Link } from 'react-router-dom'
import { useCallback } from 'react'
import { ArrowRight, Bell, Compass, MapPin, ShieldCheck, Ticket, TrendingUp } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useRiderProfile, useOrganization, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Stagger, StaggerItem } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, lagosDate, lagosTime, naira } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'

export function RiderHome() {
  const { profile } = useAuth()
  const rider = useRiderProfile()
  const organization = useOrganization(rider?.organization_id)
  const today = useServiceDate()

  const upcoming = useDb(
    useCallback(
      (db) => {
        const nowMs = Date.now()
        return db.bookings
          .filter((b) => b.rider_id === profile?.id && ['confirmed', 'checked_in', 'boarded'].includes(b.status))
          .map((booking) => {
            const trip = db.trips.find((t) => t.id === booking.trip_id)
            if (!trip) return null
            const summary = tripSummaries(db, { serviceDate: trip.service_date }).find((s) => s.trip.id === trip.id)
            const ticket = db.tickets.find((t) => t.booking_id === booking.id)
            const originStop = db.route_stops.find((rs) => rs.id === booking.origin_route_stop_id)
            const destStop = db.route_stops.find((rs) => rs.id === booking.destination_route_stop_id)
            return {
              booking,
              trip,
              summary,
              ticket,
              origin: db.stops.find((s) => s.id === originStop?.stop_id)?.name ?? '—',
              destination: db.stops.find((s) => s.id === destStop?.stop_id)?.name ?? '—',
            }
          })
          .filter(Boolean)
          .filter((entry) => new Date(entry!.trip.scheduled_arrival_at).getTime() > nowMs - 60 * 60_000)
          .sort((a, b) => new Date(a!.trip.scheduled_departure_at).getTime() - new Date(b!.trip.scheduled_departure_at).getTime())
          .slice(0, 3)
      },
      [profile?.id],
    ),
  )

  const stats = useDb(
    useCallback(
      (db) => {
        const mine = db.bookings.filter((b) => b.rider_id === profile?.id)
        const month = today.slice(0, 7)
        const thisMonth = mine.filter((b) => b.created_at.slice(0, 7) === month && b.status !== 'cancelled')
        return {
          trips: thisMonth.length,
          saved: thisMonth.reduce((a, b) => a + b.sponsor_contribution, 0),
          spent: thisMonth.reduce((a, b) => a + b.passenger_contribution, 0),
          unread: db.notifications.filter((n) => n.recipient_id === profile?.id && n.status !== 'read').length,
        }
      },
      [profile?.id, today],
    ),
  )

  const firstName = profile?.full_name.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="forest-gradient relative overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="relative">
          <p className="text-sm text-white/70">{lagosDate(new Date().toISOString())}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Good day, {firstName}
            <span className="text-warning">.</span>
          </h1>
          {organization && rider?.eligibility_state === 'verified' ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <ShieldCheck className="size-4 text-primary" />
              {organization.short_name} covers part of every eligible commute
            </p>
          ) : organization ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <ShieldCheck className="size-4 text-warning" />
              {organization.short_name} eligibility is {rider?.eligibility_state.replace('_', ' ')}
            </p>
          ) : null}
          <Button asChild size="lg" className="mt-4">
            <Link to="/rider/book">
              Book a journey <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      {/* This month */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Trips this month', value: stats.trips.toString(), icon: Compass },
          { label: 'You paid', value: naira(stats.spent), icon: TrendingUp },
          { label: 'Sponsor covered', value: naira(stats.saved), icon: ShieldCheck },
          { label: 'Unread updates', value: stats.unread.toString(), icon: Bell },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <Card className="h-full p-4">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <item.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-1.5 text-xl font-bold tnum">{item.value}</p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Upcoming journeys */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Your next journeys</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rider/trips">See all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No upcoming journeys"
              description="Book a departure and your ticket will appear here with a boarding QR code."
              action={
                <Button asChild>
                  <Link to="/rider/book">Find a departure</Link>
                </Button>
              }
            />
          ) : (
            upcoming.map((entry) => (
              <Link
                key={entry!.booking.id}
                to="/rider/tickets"
                className="group flex flex-col gap-3 rounded-xl border border-border p-4 transition-all duration-200 ease-damov hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lifted sm:flex-row sm:items-center"
              >
                <div className="flex shrink-0 flex-col items-center rounded-lg bg-primary/10 px-3 py-2 text-primary-700 dark:text-primary-300">
                  <span className="text-lg font-bold tnum">{lagosTime(entry!.trip.scheduled_departure_at)}</span>
                  <span className="text-2xs uppercase tracking-wide">{lagosDate(entry!.trip.scheduled_departure_at).slice(0, 6)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    {entry!.origin} → {entry!.destination}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tnum">{entry!.booking.booking_reference}</span>
                    <span>·</span>
                    <span>{entry!.summary?.route_code}</span>
                    {entry!.trip.actual_departure_at && (
                      <>
                        <span>·</span>
                        <span>{delayLabel(entry!.trip.scheduled_departure_at, entry!.trip.actual_departure_at)}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry!.booking.sponsor_contribution > 0 && (
                    <Badge tone="primary">Sponsored</Badge>
                  )}
                  <TripStatusBadge status={entry!.trip.status} />
                  <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 ease-damov group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
