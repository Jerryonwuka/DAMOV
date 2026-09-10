import { useCallback, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts'
import { Coins, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { lagosTime, naira, pct } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'
import type { CostCategory } from '@/lib/types'
import { calculateRoutePerformance, calculateTripEconomics, type RoutePerformance } from '@/server/economics'
import { createCostEntry, setCostApproval } from '@/server/costs'
import { cn, sum, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

const CATEGORIES: CostCategory[] = ['energy', 'driver', 'support_staff', 'maintenance_reserve', 'tyre_reserve', 'cleaning', 'payment_processing', 'terminal', 'toll', 'lease_allocation', 'other_direct']
const PALETTE = ['#6FBF48', '#0E392C', '#E9B10A', '#D9522A', '#38BDF8', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#94A3B8', '#64748B']

/**
 * Costs and economics.
 *
 *   contribution_margin = gross_trip_revenue − direct_trip_cost
 *
 * Shown per trip and per route. Never labelled net profit: overheads,
 * financing and depreciation live outside this calculation on purpose.
 */
export function CostsPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ trip_id: '', category: 'other_direct' as CostCategory, amount: '', quantity: '', unit: '', approve: true })

  const data = useDb(
    useCallback(
      (db) => {
        const trips = tripSummaries(db, { serviceDate: date })
        const economics = trips.map((t) => ({ summary: t, economics: calculateTripEconomics(db, t.trip.id) }))
        const entries = db.cost_entries
          .filter((c) => c.service_date === date)
          .map((entry) => ({ entry, trip: db.trips.find((t) => t.id === entry.trip_id)?.trip_code ?? null, vehicle: db.vehicles.find((v) => v.id === entry.vehicle_id)?.fleet_number ?? null, route: db.routes.find((r) => r.id === entry.route_id)?.code ?? null, by: db.profiles.find((p) => p.id === entry.created_by)?.full_name ?? '—' }))
          .sort((a, b) => b.entry.created_at.localeCompare(a.entry.created_at))
        const routes = calculateRoutePerformance(db, { from: date, to: date, onTimeToleranceMinutes: tolerance })
        return { trips: economics, entries, routes }
      },
      [date, tolerance],
    ),
  )

  const totals = useMemo(() => {
    const ran = data.trips.filter((t) => t.summary.trip.actual_departure_at)
    const revenue = sum(ran.map((t) => t.economics.gross_trip_revenue))
    const cost = sum(ran.map((t) => t.economics.direct_trip_cost))
    const passengers = sum(ran.map((t) => t.economics.passenger_count))
    const km = sum(ran.map((t) => t.economics.distance_km))
    const breakdown = CATEGORIES.map((category, i) => ({ category, amount: sum(ran.map((t) => t.economics.cost_breakdown[category])), color: PALETTE[i] })).filter((c) => c.amount > 0)
    return {
      revenue, cost, margin: revenue - cost, passengers, km, breakdown,
      costPerPax: passengers ? Math.round(cost / passengers) : 0,
      revPerPax: passengers ? Math.round(revenue / passengers) : 0,
      revPerKm: km ? Math.round(revenue / km) : 0,
      costPerKm: km ? Math.round(cost / km) : 0,
      subsidyPerPax: passengers ? Math.round(sum(ran.map((t) => t.economics.sponsor_revenue_recognized)) / passengers) : 0,
      pending: data.entries.filter((e) => e.entry.approval_status === 'submitted').length,
    }
  }, [data])

  function submit() {
    const trip = data.trips.find((t) => t.summary.trip.id === form.trip_id)
    const result = createCostEntry(
      {
        service_date: date, trip_id: trip?.summary.trip.id ?? null, vehicle_id: trip?.summary.trip.vehicle_id ?? null, route_id: trip?.summary.route_id ?? null,
        category: form.category, amount: Number(form.amount), quantity: form.quantity ? Number(form.quantity) : null, unit: form.unit || null, approve: form.approve,
      },
      actor,
    )
    if (!result.ok) return toast.error('Not recorded', { description: result.error })
    toast.success('Cost entry recorded', { description: `${naira(result.data.amount)} ${titleCase(result.data.category)}` })
    setAdding(false)
    setForm({ ...form, amount: '', quantity: '', unit: '' })
  }

  const entryColumns: Column<(typeof data.entries)[number]>[] = [
    { key: 'category', header: 'Category', value: (r) => r.entry.category, cell: (r) => <span className="font-medium">{titleCase(r.entry.category)}</span> },
    { key: 'trip', header: 'Trip', value: (r) => r.trip ?? '', cell: (r) => r.trip ?? <span className="text-muted-foreground">Unallocated</span> },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle ?? '', cell: (r) => r.vehicle ?? '—', hideable: true },
    { key: 'route', header: 'Route', value: (r) => r.route ?? '', cell: (r) => r.route ?? '—', hideable: true },
    { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.entry.quantity ?? 0, cell: (r) => (r.entry.quantity ? `${r.entry.quantity} ${r.entry.unit ?? ''}` : '—'), hideable: true },
    { key: 'source', header: 'Source', value: (r) => r.entry.source, cell: (r) => <Badge tone="neutral" size="sm">{titleCase(r.entry.source)}</Badge>, hideable: true },
    { key: 'status', header: 'Approval', value: (r) => r.entry.approval_status, cell: (r) => <Badge tone={r.entry.approval_status === 'approved' ? 'primary' : r.entry.approval_status === 'rejected' ? 'critical' : 'warning'}>{titleCase(r.entry.approval_status)}</Badge> },
    { key: 'by', header: 'Entered by', value: (r) => r.by, hideable: true, defaultHidden: true },
    { key: 'amount', header: 'Amount', align: 'right', value: (r) => r.entry.amount, cell: (r) => <span className="font-semibold">{naira(r.entry.amount)}</span> },
    {
      key: 'act', header: '', sortable: false,
      cell: (r) => can('action.enter_costs') && r.entry.approval_status === 'submitted' ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { const res = setCostApproval({ cost_entry_id: r.entry.id, status: 'approved' }, actor); if (res.ok) toast.success('Approved') }}>Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => { const res = setCostApproval({ cost_entry_id: r.entry.id, status: 'rejected' }, actor); if (res.ok) toast.success('Rejected') }}>Reject</Button>
        </div>
      ) : null,
    },
  ]

  const routeColumns: Column<RoutePerformance>[] = [
    { key: 'route', header: 'Route', value: (r) => r.route_code, cell: (r) => <span className="font-semibold">{r.route_code} <span className="font-normal text-muted-foreground">{r.route_name}</span></span> },
    { key: 'trips', header: 'Trips', align: 'right', value: (r) => r.trips },
    { key: 'pax', header: 'Passengers', align: 'right', value: (r) => r.passengers },
    { key: 'occ', header: 'Avg occupancy', align: 'right', value: (r) => r.average_occupancy, cell: (r) => pct(r.average_occupancy) },
    { key: 'ontime', header: 'On-time', align: 'right', value: (r) => r.on_time_rate, cell: (r) => pct(r.on_time_rate), hideable: true },
    { key: 'headway', header: 'Headway', align: 'right', value: (r) => r.headway_adherence, cell: (r) => pct(r.headway_adherence), hideable: true },
    { key: 'revenue', header: 'Revenue', align: 'right', value: (r) => r.gross_revenue, cell: (r) => naira(r.gross_revenue) },
    { key: 'cost', header: 'Direct cost', align: 'right', value: (r) => r.direct_cost, cell: (r) => naira(r.direct_cost) },
    { key: 'margin', header: 'Contribution', align: 'right', value: (r) => r.contribution_margin, cell: (r) => <span className={cn('font-semibold', r.contribution_margin >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical')}>{naira(r.contribution_margin)}</span> },
    { key: 'peak', header: 'Peak / weakest', value: (r) => r.peak_departure ?? '', cell: (r) => <span className="text-xs tnum">{r.peak_departure ?? '—'}<br /><span className="text-muted-foreground">{r.weakest_departure ?? '—'}</span></span>, hideable: true },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Costs & Economics"
        description="Direct costs against recognised revenue. Contribution margin is not net profit — overheads sit outside this calculation."
        actions={
          <>
            <div className="space-y-1.5"><Label htmlFor="cost-date">Service date</Label><Input id="cost-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
            {can('action.enter_costs') && <Button className="self-end" onClick={() => setAdding(true)}><Plus className="size-4" /> Enter cost</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Recognised revenue" value={naira(totals.revenue)} tone="primary" />
        <StatTile index={1} label="Direct cost" value={naira(totals.cost)} icon={Coins} />
        <StatTile index={2} label="Contribution margin" value={naira(totals.margin)} icon={totals.margin >= 0 ? TrendingUp : TrendingDown} tone={totals.margin >= 0 ? 'primary' : 'critical'} hint={totals.revenue ? `${pct((totals.margin / totals.revenue) * 100)} of revenue` : undefined} />
        <StatTile index={3} label="Cost / passenger" value={naira(totals.costPerPax)} />
        <StatTile index={4} label="Revenue / passenger" value={naira(totals.revPerPax)} />
        <StatTile index={5} label="Revenue / km" value={naira(totals.revPerKm)} />
        <StatTile index={6} label="Cost / km" value={naira(totals.costPerKm)} />
        <StatTile index={7} label="Subsidy / boarded pax" value={naira(totals.subsidyPerPax)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader><CardTitle>Direct cost breakdown</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={totals.breakdown} dataKey="amount" nameKey="category" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="none">
                    {totals.breakdown.map((slice) => <Cell key={slice.category} fill={slice.color} />)}
                  </Pie>
                  <ChartTooltip formatter={(v: number, n: string) => [naira(v), titleCase(n)]} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1 text-xs">
              {totals.breakdown.map((slice) => (
                <li key={slice.category} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: slice.color }} />{titleCase(slice.category)}</span>
                  <span className="tnum">{naira(slice.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Route economics · {date}</CardTitle></CardHeader>
          <CardContent>
            <DataTable data={data.routes} columns={routeColumns} rowKey={(r) => r.route_id} searchable={false} exportName="route-performance" exportContext={{ 'Service date': date, Definition: 'Contribution margin = recognised revenue − approved direct cost' }} pageSize={6} dense />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Cost entries ({data.entries.length}){totals.pending ? <Badge tone="warning" size="sm">{totals.pending} pending</Badge> : null}</TabsTrigger>
          <TabsTrigger value="trips">Per trip</TabsTrigger>
        </TabsList>
        <TabsContent value="entries">
          <DataTable data={data.entries} columns={entryColumns} rowKey={(r) => r.entry.id} searchPlaceholder="Category, trip or vehicle…" exportName="cost-entries" exportContext={{ 'Service date': date }} pageSize={15} dense />
        </TabsContent>
        <TabsContent value="trips">
          <DataTable
            data={data.trips}
            columns={[
              { key: 'time', header: 'Departure', value: (r) => r.summary.trip.scheduled_departure_at, cell: (r) => <span className="font-semibold tnum">{lagosTime(r.summary.trip.scheduled_departure_at)}</span> },
              { key: 'trip', header: 'Trip', value: (r) => r.summary.trip.trip_code },
              { key: 'pax', header: 'Pax', align: 'right', value: (r) => r.economics.passenger_count },
              { key: 'rev', header: 'Revenue', align: 'right', value: (r) => r.economics.gross_trip_revenue, cell: (r) => naira(r.economics.gross_trip_revenue) },
              { key: 'cost', header: 'Direct cost', align: 'right', value: (r) => r.economics.direct_trip_cost, cell: (r) => naira(r.economics.direct_trip_cost) },
              { key: 'margin', header: 'Contribution', align: 'right', value: (r) => r.economics.contribution_margin, cell: (r) => <span className={cn('font-semibold', r.economics.contribution_margin >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical')}>{naira(r.economics.contribution_margin)}</span> },
              { key: 'cpp', header: 'Cost / pax', align: 'right', value: (r) => r.economics.cost_per_passenger, cell: (r) => naira(r.economics.cost_per_passenger) },
              { key: 'rpk', header: 'Rev / km', align: 'right', value: (r) => r.economics.revenue_per_km, cell: (r) => naira(r.economics.revenue_per_km), hideable: true },
            ]}
            rowKey={(r) => r.summary.trip.id}
            searchPlaceholder="Trip code…"
            exportName="trip-economics"
            exportContext={{ 'Service date': date }}
            pageSize={15}
            dense
          />
        </TabsContent>
      </Tabs>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Enter a direct cost</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as CostCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label hint="optional">Allocate to trip</Label>
              <Select value={form.trip_id} onValueChange={(v) => setForm({ ...form, trip_id: v })}>
                <SelectTrigger><SelectValue placeholder="Unallocated" /></SelectTrigger>
                <SelectContent>{data.trips.map((t) => <SelectItem key={t.summary.trip.id} value={t.summary.trip.id}>{lagosTime(t.summary.trip.scheduled_departure_at)} · {t.summary.trip.trip_code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1.5"><Label required>Amount ₦</Label><Input value={form.amount} inputMode="numeric" onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} className="tnum" /></div>
              <div className="space-y-1.5"><Label>Quantity</Label><Input value={form.quantity} inputMode="decimal" onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="km, kWh…" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.approve} onCheckedChange={(v) => setForm({ ...form, approve: Boolean(v) })} /> Approve immediately</label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.amount}>Record cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
