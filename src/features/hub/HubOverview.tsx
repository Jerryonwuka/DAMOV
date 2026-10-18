import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BadgeCheck, Banknote, Bus, Clock, Receipt, Users, Wallet } from '@/components/icons'
import { useDb } from '@/db/store'
import { useAssignedHub, useOpenCashSession, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, lagosTime, naira, pct } from '@/lib/format'
import { VolumeBars } from '@/components/charts'
import { BookingStatusBadge } from '@/components/ui/status'
import { tripSummaries } from '@/lib/selectors'
import { useClock } from '@/hooks/use-clock'

export function HubOverview() {
  const hub = useAssignedHub()
  const today = useServiceDate()
  const session = useOpenCashSession()
  const now = useClock(20_000)

  const departures = useDb(
    useCallback(
      (db) =>
        tripSummaries(db, { serviceDate: today }).filter(
          (summary) => summary.trip.origin_hub_id === hub?.id || summary.trip.destination_hub_id === hub?.id,
        ),
      [today, hub?.id],
    ),
  )

  const upcoming = departures
    .filter((d) => new Date(d.trip.scheduled_departure_at).getTime() > now - 30 * 60_000)
    .slice(0, 6)

  const incidents = useDb(
    useCallback(
      (db) => db.incidents.filter((i) => !['resolved', 'closed'].includes(i.status) && (i.hub_id === hub?.id || i.hub_id === null)),
      [hub?.id],
    ),
  )

  const sold = useDb(
    useCallback(
      (db) => {
        const ids = new Set(departures.map((d) => d.trip.id))
        const bookings = db.bookings.filter((b) => ids.has(b.trip_id) && b.status !== 'cancelled')
        const cash = db.payments.filter(
          (p) => p.method === 'cash' && p.status === 'succeeded' && bookings.some((b) => b.id === p.booking_id),
        )
        return {
          tickets: bookings.length,
          cash: cash.reduce((a, p) => a + p.amount, 0),
          boarded: db.boarding_events.filter((e) => ids.has(e.trip_id) && e.result !== 'rejected' && !e.reversed_at).length,
        }
      },
      [departures],
    ),
  )

  const expected = session ? session.opening_float + session.expected_cash : 0

  // The shape of the day at this hub: passengers per departure hour.
  const hourly = useDb(
    useCallback(
      (db) => {
        const byHour = new Map<number, number>()
        for (const d of departures) {
          const hour = Number(new Date(d.trip.scheduled_departure_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }))
          byHour.set(hour, (byHour.get(hour) ?? 0) + d.booked)
        }
        void db
        return Array.from({ length: 17 }, (_, i) => i + 5).map((hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, passengers: byHour.get(hour) ?? 0 }))
      },
      [departures],
    ),
  )
  const nowHour = Number(new Date(now).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }))

  const recentSales = useDb(
    useCallback(
      (db) => {
        const ids = new Set(departures.map((d) => d.trip.id))
        return db.bookings
          .filter((b) => ids.has(b.trip_id) && b.booking_channel === 'hub')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 6)
          .map((booking) => {
            const trip = db.trips.find((t) => t.id === booking.trip_id)!
            const passenger = db.profiles.find((p) => p.id === booking.rider_id)
            const payment = db.payments.find((p) => p.booking_id === booking.id)
            return { booking, trip, passenger: passenger?.full_name ?? 'Passenger', method: payment?.method ?? 'sponsor' }
          })
      },
      [departures],
    ),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={hub?.name ?? 'Terminal'}
        description={`${hub?.code ?? ''} · ${hub?.operating_hours ?? ''} · every departure, sale and boarding at this hub today.`}
        actions={
          <>
            <Button asChild variant="outline"><Link to="/hub/boarding"><BadgeCheck className="size-4" /> Boarding</Link></Button>
            <Button asChild><Link to="/hub/sell">Sell a ticket</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Departures today" value={departures.length} icon={Bus} tone="primary" hint={`${departures.filter((d) => d.trip.status === 'completed').length} completed`} />
        <StatTile index={1} label="Tickets issued" value={sold.tickets} icon={Users} hint={`${sold.boarded} validated at the gate`} />
        <StatTile index={2} label="Cash collected" value={naira(sold.cash)} icon={Banknote} tone="info" hint={session ? `Session expecting ${naira(expected)}` : 'No open session'} />
        <StatTile index={3} label="Open incidents" value={incidents.length} icon={AlertTriangle} tone={incidents.length ? 'warning' : 'default'} />
      </div>

      {!session && (
        <Card className="border-warning/40 bg-warning/[0.07]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <p className="text-sm font-semibold">No cash session is open</p>
              <p className="text-xs text-muted-foreground">Cash tickets cannot be sold until you open a session with an opening float.</p>
            </div>
            <Button asChild variant="warning" size="sm"><Link to="/hub/cash">Open cash session</Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Today at this hub</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Passengers booked per departure hour · {sold.tickets} tickets so far</p>
            </div>
            <Badge tone="neutral" size="sm">{lagosTime(new Date(now).toISOString())} WAT</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <VolumeBars data={hourly} x="label" y="passengers" height={200} highlight={(row) => row.hour === nowHour} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Cash session</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{session ? `Open since ${lagosTime(session.opened_at)}` : 'No session open'}</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/hub/cash">Manage</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {session ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Opening float', value: naira(session.opening_float), icon: Wallet },
                    { label: 'Cash sales', value: naira(session.expected_cash), icon: Banknote },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-background/40 p-3">
                      <item.icon className="size-4 text-muted-foreground" />
                      <p className="mt-2 text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-display text-lg font-semibold tnum">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground">Expected in drawer</p>
                  <p className="font-display text-2xl font-semibold tnum">{naira(expected)}</p>
                </div>
              </>
            ) : (
              <Button asChild className="w-full"><Link to="/hub/cash">Open a cash session</Link></Button>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Recent counter sales</p>
              <div className="space-y-1">
                {recentSales.length === 0 && <p className="text-xs text-muted-foreground">No counter sales yet today.</p>}
                {recentSales.map(({ booking, trip, passenger, method }) => (
                  <div key={booking.id} className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-xs">
                    <Receipt className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{passenger} · {lagosTime(trip.scheduled_departure_at)}</span>
                    <span className="text-muted-foreground">{method}</span>
                    <span className="font-semibold tnum">{naira(booking.passenger_contribution)}</span>
                    <BookingStatusBadge status={booking.status} />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Next departures</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/hub/departures">All departures <ArrowRight className="size-3.5" /></Link></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <EmptyState icon={Clock} title="No further departures today" description={`${departures.filter((d) => d.trip.status === 'completed').length} departures completed from this hub today. Tomorrow's service day is generated from the schedule templates.`} />
          ) : (
            upcoming.map((summary) => (
              <div key={summary.trip.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-base font-bold tnum">{lagosTime(summary.trip.scheduled_departure_at)}</p>
                  {summary.delay_minutes !== null && summary.delay_minutes > 5 && (
                    <p className="text-2xs text-critical">+{summary.delay_minutes}m</p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{summary.trip.trip_code} · {summary.direction_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.vehicle ?? 'No vehicle'} · {summary.driver ?? 'No driver'} · {delayLabel(summary.trip.scheduled_departure_at, summary.trip.actual_departure_at)}
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <div className="mb-1 flex items-center justify-between text-2xs text-muted-foreground">
                    <span>{summary.boarded}/{summary.booked}</span>
                    <span className="tnum">{pct(summary.occupancy_pct)}</span>
                  </div>
                  <Progress value={Math.min(100, summary.occupancy_pct)} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={summary.seats_available > 5 ? 'neutral' : 'warning'} size="sm">
                    {summary.seats_available} free
                  </Badge>
                  <TripStatusBadge status={summary.trip.status} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
