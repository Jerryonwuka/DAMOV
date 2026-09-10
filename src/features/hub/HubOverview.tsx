import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BadgeCheck, Banknote, Bus, Clock, Users } from 'lucide-react'
import { useDb } from '@/db/store'
import { useAssignedHub, useOpenCashSession, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, lagosTime, naira, pct } from '@/lib/format'
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

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Next departures</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/hub/departures">All departures <ArrowRight className="size-3.5" /></Link></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <EmptyState icon={Clock} title="No further departures today" description="The next service day is generated from the schedule templates." />
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
