import { useCallback, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { Banknote, CreditCard, Landmark, Wallet } from 'lucide-react'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { CashStatusBadge } from '@/components/ui/status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { lagosDateTime, lagosTime, naira, nairaCompact, pct } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import type { CashSession, Payment } from '@/lib/types'
import { calculateTripEconomics } from '@/server/economics'
import { cn, percent, sum, titleCase } from '@/lib/utils'

/** Revenue and reconciliation: every naira by trip, channel, method and cash session. */
export function RevenuePage() {
  const today = useServiceDate()
  const [date, setDate] = useState(today)
  const variancePctTarget = useConfig('targets.cash_variance_pct', 1)
  const paymentTarget = useConfig('targets.payment_success_pct', 98)

  const data = useDb(
    useCallback(
      (db) => {
        const trips = tripSummaries(db, { serviceDate: date })
        const tripIds = new Set(trips.map((t) => t.trip.id))
        const bookings = db.bookings.filter((b) => tripIds.has(b.trip_id))
        const bookingIds = new Set(bookings.map((b) => b.id))
        const payments = db.payments.filter((p) => bookingIds.has(p.booking_id))
        const sponsor = db.sponsor_authorizations.filter((s) => bookingIds.has(s.booking_id))
        const sessions = db.cash_sessions.filter((s) => s.opened_at.slice(0, 10) === date || s.status === 'open')
        const economics = trips.map((t) => ({ summary: t, economics: calculateTripEconomics(db, t.trip.id) }))
        return {
          trips: economics,
          payments: payments.map((p) => ({ payment: p, reference: db.bookings.find((b) => b.id === p.booking_id)?.booking_reference ?? '' })),
          byMethod: (['cash', 'card', 'transfer', 'complimentary'] as const).map((method) => ({
            method,
            amount: sum(payments.filter((p) => p.method === method && p.status === 'succeeded').map((p) => p.amount)),
            count: payments.filter((p) => p.method === method && p.status === 'succeeded').length,
          })),
          byChannel: (['rider_web', 'hub', 'whatsapp', 'agent', 'admin', 'qr'] as const).map((channel) => ({
            channel,
            bookings: bookings.filter((b) => b.booking_channel === channel && b.status !== 'cancelled').length,
            gross: sum(bookings.filter((b) => b.booking_channel === channel && b.status !== 'cancelled').map((b) => b.gross_fare)),
          })).filter((c) => c.bookings > 0),
          sponsorReserved: sum(sponsor.filter((s) => s.status === 'reserved').map((s) => s.amount_reserved)),
          sponsorRecognized: sum(sponsor.filter((s) => s.status === 'recognized').map((s) => s.amount_recognized)),
          digitalSuccess: percent(payments.filter((p) => p.method !== 'cash' && p.status === 'succeeded').length, payments.filter((p) => p.method !== 'cash' && p.status !== 'refunded').length || 1),
          sessions: sessions.map((s) => ({ session: s, agent: db.profiles.find((p) => p.id === s.agent_id)?.full_name ?? '—', hub: db.hubs.find((h) => h.id === s.hub_id)?.name ?? '—' })),
        }
      },
      [date],
    ),
  )

  const totals = useMemo(() => {
    const passenger = sum(data.trips.map((t) => t.economics.passenger_revenue))
    const expected = sum(data.trips.map((t) => t.economics.gross_fare_value))
    const recognized = passenger + data.sponsorRecognized
    const cash = data.byMethod.find((m) => m.method === 'cash')?.amount ?? 0
    const closedSessions = data.sessions.filter((s) => s.session.variance !== null)
    const varianceTotal = sum(closedSessions.map((s) => Math.abs(s.session.variance ?? 0)))
    const expectedCash = sum(closedSessions.map((s) => s.session.expected_cash))
    return { passenger, expected, recognized, cash, variancePct: expectedCash ? Math.round((varianceTotal / expectedCash) * 1000) / 10 : 0 }
  }, [data])

  const hourly = useMemo(() => {
    const buckets = new Map<string, { hour: string; passenger: number; sponsor: number }>()
    for (const { summary, economics } of data.trips) {
      const hour = lagosTime(summary.trip.scheduled_departure_at).slice(0, 2) + ':00'
      const bucket = buckets.get(hour) ?? { hour, passenger: 0, sponsor: 0 }
      bucket.passenger += economics.passenger_revenue
      bucket.sponsor += economics.sponsor_revenue_recognized
      buckets.set(hour, bucket)
    }
    return [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour))
  }, [data.trips])

  const tripColumns: Column<{ summary: TripSummary; economics: ReturnType<typeof calculateTripEconomics> }>[] = [
    { key: 'time', header: 'Departure', value: (r) => r.summary.trip.scheduled_departure_at, cell: (r) => <span className="font-semibold tnum">{lagosTime(r.summary.trip.scheduled_departure_at)}</span> },
    { key: 'trip', header: 'Trip', value: (r) => r.summary.trip.trip_code, cell: (r) => <span className="text-xs">{r.summary.trip.trip_code}<br /><span className="text-muted-foreground">{r.summary.direction_name}</span></span> },
    { key: 'pax', header: 'Pax / cap', align: 'right', value: (r) => r.economics.passenger_count, cell: (r) => `${r.economics.passenger_count} / ${r.economics.capacity}` },
    { key: 'occ', header: 'Occupancy', align: 'right', value: (r) => r.economics.occupancy_pct, cell: (r) => pct(r.economics.occupancy_pct) },
    { key: 'gross', header: 'Gross fare value', align: 'right', value: (r) => r.economics.gross_fare_value, cell: (r) => naira(r.economics.gross_fare_value), hideable: true },
    { key: 'passenger', header: 'Passenger rev.', align: 'right', value: (r) => r.economics.passenger_revenue, cell: (r) => naira(r.economics.passenger_revenue) },
    { key: 'sponsor', header: 'Sponsor recognised', align: 'right', value: (r) => r.economics.sponsor_revenue_recognized, cell: (r) => naira(r.economics.sponsor_revenue_recognized) },
    { key: 'reserved', header: 'Sponsor reserved', align: 'right', value: (r) => r.economics.sponsor_revenue_reserved, cell: (r) => naira(r.economics.sponsor_revenue_reserved), hideable: true, defaultHidden: true },
    { key: 'recognized', header: 'Recognised', align: 'right', value: (r) => r.economics.gross_trip_revenue, cell: (r) => <span className="font-semibold">{naira(r.economics.gross_trip_revenue)}</span> },
    { key: 'cost', header: 'Direct cost', align: 'right', value: (r) => r.economics.direct_trip_cost, cell: (r) => naira(r.economics.direct_trip_cost), hideable: true },
    { key: 'margin', header: 'Contribution', align: 'right', value: (r) => r.economics.contribution_margin, cell: (r) => <span className={cn('font-semibold', r.economics.contribution_margin >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical')}>{naira(r.economics.contribution_margin)}</span> },
  ]

  const paymentColumns: Column<{ payment: Payment; reference: string }>[] = [
    { key: 'time', header: 'Time', value: (r) => r.payment.created_at, cell: (r) => lagosTime(r.payment.created_at) },
    { key: 'ref', header: 'Booking', value: (r) => r.reference, cell: (r) => <span className="tnum">{r.reference}</span> },
    { key: 'method', header: 'Method', value: (r) => r.payment.method, cell: (r) => <Badge tone="neutral" size="sm">{titleCase(r.payment.method)}</Badge> },
    { key: 'provider', header: 'Provider', value: (r) => r.payment.provider, cell: (r) => <span className="text-xs">{titleCase(r.payment.provider)}<br /><span className="text-muted-foreground tnum">{r.payment.provider_reference ?? '—'}</span></span>, hideable: true },
    { key: 'status', header: 'Status', value: (r) => r.payment.status, cell: (r) => <Badge tone={r.payment.status === 'succeeded' ? 'primary' : r.payment.status === 'refunded' ? 'critical' : 'warning'}>{titleCase(r.payment.status)}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', value: (r) => r.payment.amount, cell: (r) => naira(r.payment.amount) },
  ]

  const sessionColumns: Column<{ session: CashSession; agent: string; hub: string }>[] = [
    { key: 'opened', header: 'Opened', value: (r) => r.session.opened_at, cell: (r) => lagosDateTime(r.session.opened_at) },
    { key: 'hub', header: 'Hub', value: (r) => r.hub },
    { key: 'agent', header: 'Agent', value: (r) => r.agent },
    { key: 'expected', header: 'Expected', align: 'right', value: (r) => r.session.opening_float + r.session.expected_cash, cell: (r) => naira(r.session.opening_float + r.session.expected_cash) },
    { key: 'declared', header: 'Declared', align: 'right', value: (r) => r.session.declared_cash ?? 0, cell: (r) => naira(r.session.declared_cash) },
    { key: 'variance', header: 'Variance', align: 'right', value: (r) => r.session.variance ?? 0, cell: (r) => <span className={cn('font-semibold', (r.session.variance ?? 0) !== 0 && 'text-critical')}>{naira(r.session.variance)}</span> },
    { key: 'status', header: 'Status', value: (r) => r.session.status, cell: (r) => <CashStatusBadge status={r.session.status} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue & Reconciliation"
        description="Expected against recognised revenue, by trip and by channel, with every cash session's variance."
        actions={<div className="space-y-1.5"><Label htmlFor="rev-date">Service date</Label><Input id="rev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatTile index={0} label="Expected (gross fares)" value={naira(totals.expected)} icon={Banknote} hint="All non-cancelled bookings" />
        <StatTile index={1} label="Passenger revenue" value={naira(totals.passenger)} icon={CreditCard} tone="primary" />
        <StatTile index={2} label="Sponsor recognised" value={naira(data.sponsorRecognized)} icon={Landmark} tone="info" hint={`${naira(data.sponsorReserved)} still reserved`} />
        <StatTile index={3} label="Recognised revenue" value={naira(totals.recognized)} tone="primary" hint="Passenger + recognised sponsor" />
        <StatTile index={4} label="Cash variance" value={pct(totals.variancePct, 1)} icon={Wallet} target={{ value: variancePctTarget, label: `Target ≤${variancePctTarget}%`, met: totals.variancePct <= variancePctTarget }} />
        <StatTile index={5} label="Digital payment success" value={pct(data.digitalSuccess)} target={{ value: paymentTarget, label: `Target ≥${paymentTarget}%`, met: data.digitalSuccess >= paymentTarget }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Recognised revenue by departure hour</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v: number) => nairaCompact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={56} />
                <ChartTooltip formatter={(v: number) => naira(v)} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} />
                <Bar dataKey="passenger" name="Passenger" stackId="a" fill="#6FBF48" radius={[0, 0, 0, 0]} />
                <Bar dataKey="sponsor" name="Sponsor" stackId="a" fill="#0E392C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader className="pb-2"><CardTitle>By payment method</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.byMethod.map((m) => (
                <div key={m.method} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{m.method} <span className="text-xs text-muted-foreground">· {m.count}</span></span>
                  <span className="font-semibold tnum">{naira(m.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle>By booking channel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.byChannel.map((c) => (
                <div key={c.channel} className="flex items-center justify-between text-sm">
                  <span>{titleCase(c.channel)} <span className="text-xs text-muted-foreground">· {c.bookings}</span></span>
                  <span className="font-semibold tnum">{naira(c.gross)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="trips">
        <TabsList>
          <TabsTrigger value="trips">By trip</TabsTrigger>
          <TabsTrigger value="payments">Payments ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="cash">Cash sessions ({data.sessions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="trips">
          <DataTable data={data.trips} columns={tripColumns} rowKey={(r) => r.summary.trip.id} searchPlaceholder="Trip code…" exportName="revenue-by-trip" exportContext={{ 'Service date': date, Definitions: 'Recognised = passenger payments succeeded + sponsor recognised at boarding; Contribution = recognised − approved direct costs (not net profit)' }} pageSize={15} dense />
        </TabsContent>
        <TabsContent value="payments">
          <DataTable data={data.payments} columns={paymentColumns} rowKey={(r) => r.payment.id} searchPlaceholder="Booking reference or provider ref…" exportName="payments" exportContext={{ 'Service date': date }} pageSize={15} dense />
        </TabsContent>
        <TabsContent value="cash">
          <DataTable data={data.sessions} columns={sessionColumns} rowKey={(r) => r.session.id} searchable={false} exportName="cash-sessions" pageSize={10} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
