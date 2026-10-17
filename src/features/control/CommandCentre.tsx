import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowRight, Banknote, Bus, Clock, Coins, Gauge, ScanLine, Users, Zap,
} from '@/components/icons'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { useMapData } from '@/hooks/use-map-data'
import { useTheme } from '@/hooks/use-theme'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, IconTile } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber, PageHeader, StatTile } from '@/components/ui/patterns'
import { SeverityBadge, TripStatusBadge } from '@/components/ui/status'
import { AreaTrend, RingGauge, SERIES, STATUS, VolumeBars } from '@/components/charts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TripDrawer } from '@/features/shared/TripDrawer'
import { delayLabel, lagosDate, lagosTime, naira, nairaCompact, pct, relative } from '@/lib/format'
import { dailyHistory, hourlyProfile, windowDelta } from '@/lib/history'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import { calculateNetworkSnapshot } from '@/server/economics'
import { cn, titleCase } from '@/lib/utils'
import type { MapFilters } from '@/components/map/MapPanels'

const DamovMap = lazy(() => import('@/components/map/DamovMap').then((m) => ({ default: m.DamovMap })))

const MAP_FILTERS: MapFilters = { stops: true, hubs: false, vehicles: true, incidents: true, reference: false, route: null, severity: 'all' }

/**
 * Command Centre.
 *
 * Every number on this screen is a query over the same tables the hub, driver
 * and rider write to. The trends are the last ten service days recomputed
 * from bookings, boardings, payments and cost entries — nothing is a stored
 * headline figure.
 */
export function CommandCentre() {
  const { profile } = useAuth()
  const today = useServiceDate()
  const { theme } = useTheme()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)
  const targets = {
    onTime: useConfig('targets.on_time_departure_pct', 90),
    headway: useConfig('targets.headway_adherence_pct', 85),
    validation: useConfig('targets.digital_boarding_pct', 95),
    occupancy: useConfig('targets.peak_occupancy_pct', 82),
  }
  const [selected, setSelected] = useState<TripSummary | null>(null)
  const [range, setRange] = useState<'5' | '10'>('10')

  const snapshot = useDb(useCallback((db) => calculateNetworkSnapshot(db, today, tolerance), [today, tolerance]))
  const history = useDb(useCallback((db) => dailyHistory(db, 10, tolerance), [tolerance]))
  const hourly = useDb(useCallback((db) => hourlyProfile(db, today), [today]))
  const summaries = useDb(useCallback((db) => tripSummaries(db, { serviceDate: today }), [today]))
  const incidents = useDb(
    useCallback(
      (db) =>
        db.incidents
          .filter((i) => !['resolved', 'closed'].includes(i.status))
          .map((i) => ({ incident: i, trip: db.trips.find((t) => t.id === i.trip_id)?.trip_code ?? null }))
          .slice(0, 4),
      [],
    ),
  )
  const feed = useDb(
    useCallback(
      (db) =>
        [
          ...db.trip_events.slice(0, 40).map((e) => ({
            id: e.id, at: e.occurred_at, kind: e.type,
            title: `${db.trips.find((t) => t.id === e.trip_id)?.trip_code ?? 'Trip'} ${e.type.replace(/_/g, ' ')}`,
            detail: e.type === 'delayed' ? `${String(e.metadata.minutes ?? '')} minutes behind schedule` : e.type === 'assigned' ? `Vehicle ${String(e.metadata.vehicle ?? '')}` : null,
          })),
          ...db.audit_logs.slice(0, 20).map((a) => ({ id: a.id, at: a.occurred_at, kind: a.action.split('.')[0], title: a.summary, detail: a.actor_name })),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 8),
      [],
    ),
  )
  const { layers } = useMapData(MAP_FILTERS)

  const nowMs = Date.now()
  const upcoming = useMemo(
    () => summaries.filter((s) => ['assigned', 'boarding', 'scheduled', 'held'].includes(s.trip.status) && new Date(s.trip.scheduled_departure_at).getTime() > nowMs - 15 * 60_000).slice(0, 6),
    [summaries, nowMs],
  )
  const live = useMemo(() => summaries.filter((s) => ['departed', 'in_service'].includes(s.trip.status)), [summaries])
  const unassigned = summaries.filter((s) => s.trip.status === 'scheduled' && new Date(s.trip.scheduled_departure_at).getTime() < nowMs + 2 * 3_600_000).length

  const visible = history.slice(-Number(range))
  const spark = (key: 'boarded' | 'revenue' | 'margin' | 'bookings' | 'on_time_rate' | 'trips') => history.map((d) => d[key])
  const delta = (key: 'boarded' | 'revenue' | 'bookings') => windowDelta(history.map((d) => d[key]), 5)
  const revenueDelta = delta('revenue')
  const passengerDelta = delta('boarded')
  const bookingDelta = delta('bookings')
  const periodRevenue = visible.reduce((a, d) => a + d.revenue, 0)
  const periodPassengers = visible.reduce((a, d) => a + d.boarded, 0)
  const busiestHour = hourly.reduce((best, h) => (h.passengers > best.passengers ? h : best), hourly[0])
  const firstName = profile?.full_name.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span>Hello, {firstName} <span className="inline-block origin-bottom-right animate-[wave_1.6s_ease-in-out_1]">👋</span></span>}
        description={`Here is the Abuja network on ${lagosDate(new Date().toISOString())} — every figure is computed from today's operational records.`}
        actions={
          <>
            <Button asChild variant="outline"><Link to="/control/dispatch">Dispatch board</Link></Button>
            <Button asChild><Link to="/control/map">Open live map <ArrowRight className="size-4" /></Link></Button>
          </>
        }
      />

      {unassigned > 0 && (
        <Card className="border-warning/40 bg-warning/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="flex items-center gap-2.5 text-sm">
              <IconTile icon={AlertTriangle} tone="amber" size="sm" />
              <span><span className="font-semibold">{unassigned} departure{unassigned > 1 ? 's' : ''}</span> in the next two hours still need a vehicle and driver.</span>
            </p>
            <Button asChild size="sm" variant="warning"><Link to="/control/dispatch">Assign now</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Headline KPIs with ten-day sparklines */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile index={0} size="lg" label="Passengers carried" value={<AnimatedNumber value={periodPassengers} />} icon={Users} tone="primary" spark={spark('boarded')} delta={{ value: passengerDelta.value, absolute: `${passengerDelta.absolute >= 0 ? '+' : ''}${passengerDelta.absolute.toLocaleString('en-NG')}`, label: '' }} hint={`last ${range} days · vs prior 5`} />
        <StatTile index={1} size="lg" label="Revenue" value={naira(periodRevenue)} icon={Banknote} tone="good" spark={spark('revenue')} delta={{ value: revenueDelta.value, absolute: `${revenueDelta.absolute >= 0 ? '+' : ''}${nairaCompact(revenueDelta.absolute)}`, label: '' }} hint="passenger + recognised sponsor" />
        <StatTile index={2} size="lg" label="Bookings" value={<AnimatedNumber value={visible.reduce((a, d) => a + d.bookings, 0)} />} icon={ScanLine} tone="info" spark={spark('bookings')} delta={{ value: bookingDelta.value, absolute: `${bookingDelta.absolute >= 0 ? '+' : ''}${bookingDelta.absolute.toLocaleString('en-NG')}`, label: '' }} hint="all channels" />
        <StatTile index={3} size="lg" label="Onboard right now" value={<AnimatedNumber value={snapshot.passengers_onboard} />} icon={Bus} tone="primary" spark={spark('trips')} hint={`${snapshot.buses_active} buses between hubs · ${snapshot.trips_boarding} boarding`} />
      </div>

      {/* Revenue trend + today's profile */}
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <p className="text-sm text-muted-foreground">Total revenue</p>
              <p className="font-display mt-1 text-3xl font-semibold tracking-tight tnum">{naira(periodRevenue)}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('font-semibold', revenueDelta.value >= 0 ? 'text-[hsl(152_70%_56%)]' : 'text-[hsl(14_90%_66%)]')}>
                  {revenueDelta.value >= 0 ? '+' : ''}{nairaCompact(revenueDelta.absolute)} ({Math.abs(revenueDelta.value)}%)
                </span>
                <span className="text-muted-foreground/60">•</span> vs the five days before
              </p>
            </div>
            <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <TabsList className="h-8">
                <TabsTrigger value="5" className="px-2.5 py-1 text-xs">5 days</TabsTrigger>
                <TabsTrigger value="10" className="px-2.5 py-1 text-xs">10 days</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-2">
            <AreaTrend
              data={visible}
              x="label"
              series={[{ key: 'passenger_revenue', name: 'Passenger fares' }, { key: 'sponsor_revenue', name: 'Sponsor contributions' }]}
              format={(v) => nairaCompact(v)}
              height={250}
            />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[0] }} />Passenger fares</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[1] }} />Sponsor contributions</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Today, hour by hour</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Passengers per departure hour · busiest {busiestHour?.label}</p>
            </div>
            <IconTile icon={Clock} tone="neutral" size="sm" />
          </CardHeader>
          <CardContent className="pt-2">
            <VolumeBars data={hourly.filter((h) => h.hour >= 5 && h.hour <= 21)} x="label" y="passengers" height={190} highlight={(row) => row.hour === busiestHour?.hour} reference={{ value: Math.round(hourly.reduce((a, h) => a + h.passengers, 0) / Math.max(1, hourly.filter((h) => h.passengers).length)), label: 'avg' }} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Completed', value: snapshot.trips_completed },
                { label: 'In service', value: snapshot.trips_operating },
                { label: 'Still to run', value: snapshot.trips_scheduled + snapshot.trips_boarding },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-background/40 px-2 py-2">
                  <p className="font-display text-lg font-semibold tnum">{item.value}</p>
                  <p className="text-2xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map + live panels */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="flex min-h-[460px] flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" /> Live network</p>
            <div className="flex items-center gap-2">
              <Badge tone="primary" dot pulse>{layers.vehicles.features.filter((f) => !f.properties?.stale).length} live</Badge>
              <Badge tone="warning" size="sm">Demo simulation</Badge>
            </div>
          </div>
          <div className="min-h-[400px] flex-1">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <DamovMap layers={layers} theme={theme} showHubs={false} interactive onFeatureClick={(kind, props) => {
                if (kind === 'vehicle') {
                  const summary = summaries.find((s) => s.trip.id === props.trip_id)
                  if (summary) setSelected(summary)
                }
              }} />
            </Suspense>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>In service</CardTitle>
              <Badge tone="primary" dot pulse>{live.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {live.length === 0 && <p className="text-sm text-muted-foreground">No buses currently between hubs.</p>}
              {live.slice(0, 5).map((s) => (
                <button key={s.trip.id} onClick={() => setSelected(s)} className="press flex w-full items-center gap-3 rounded-xl border border-border bg-background/30 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06]">
                  <RingGauge value={s.occupancy_pct} size={40} stroke={4} color={s.occupancy_pct >= 85 ? STATUS.warning : SERIES[0]}>
                    <span className="text-[10px] font-semibold tnum">{Math.round(s.occupancy_pct)}</span>
                  </RingGauge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{s.trip.trip_code} · {s.vehicle}</p>
                    <p className="truncate text-2xs text-muted-foreground">{s.direction_name} · {delayLabel(s.trip.scheduled_departure_at, s.trip.actual_departure_at)}</p>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Next departures</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/control/dispatch">All</Link></Button>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No further departures today.</p>}
              {upcoming.map((s) => (
                <button key={s.trip.id} onClick={() => setSelected(s)} className="press flex w-full items-center gap-3 rounded-xl border border-border bg-background/30 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06]">
                  <span className="font-display w-12 shrink-0 text-sm font-semibold tnum">{lagosTime(s.trip.scheduled_departure_at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{s.trip.trip_code}</p>
                    <p className="truncate text-2xs text-muted-foreground">{s.vehicle ?? 'Unassigned'} · {s.booked} booked</p>
                  </div>
                  <TripStatusBadge status={s.trip.status} />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Service quality */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile index={0} label="Average occupancy" value={pct(snapshot.average_occupancy)} icon={Gauge} hint="Services opened for boarding" target={{ value: targets.occupancy, label: `Target ${targets.occupancy}% peak`, met: snapshot.average_occupancy >= targets.occupancy }} />
        <StatTile index={1} label="On-time departure" value={pct(snapshot.on_time_departure_rate)} icon={Clock} spark={spark('on_time_rate')} target={{ value: targets.onTime, label: `Target ≥${targets.onTime}%`, met: snapshot.on_time_departure_rate >= targets.onTime }} />
        <StatTile index={2} label="Headway adherence" value={pct(snapshot.headway_adherence)} icon={Activity} hint="Gaps within 25% of plan" target={{ value: targets.headway, label: `Target ≥${targets.headway}%`, met: snapshot.headway_adherence >= targets.headway }} />
        <StatTile index={3} label="Digital validation" value={pct(snapshot.boarding_validation_rate)} icon={ScanLine} hint={`Avg ${snapshot.average_validation_seconds}s per scan`} target={{ value: targets.validation, label: `Target ≥${targets.validation}%`, met: snapshot.boarding_validation_rate >= targets.validation }} />
        <StatTile index={4} label="Direct cost today" value={naira(snapshot.direct_cost_today)} icon={Coins} hint="Energy, crew, reserves, fees" />
        <StatTile index={5} label="Contribution margin" value={naira(snapshot.contribution_margin_today)} icon={Zap} tone={snapshot.contribution_margin_today >= 0 ? 'good' : 'critical'} spark={spark('margin')} hint="Not net profit" />
      </div>

      {/* Activity + incidents */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Latest activity</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Trip events and audited actions, newest first</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/control/audit">Audit log</Link></Button>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-0 border-l border-border pl-5">
              {feed.map((item) => (
                <li key={item.id} className="relative py-2.5">
                  <span className={cn('absolute -left-[25px] top-4 size-2.5 rounded-full border-2 border-card', item.kind === 'delayed' || item.kind === 'cancelled' ? 'bg-warning' : item.kind === 'completed' ? 'bg-good' : 'bg-primary')} />
                  <p className="text-sm">{item.title}</p>
                  <p className="text-2xs text-muted-foreground">{item.detail ? `${item.detail} · ` : ''}{relative(item.at)}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Open incidents</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{snapshot.active_incidents} needing attention</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/control/incidents">All</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {incidents.length === 0 && <p className="text-sm text-muted-foreground">No open incidents.</p>}
            {incidents.map(({ incident, trip }) => (
              <Link key={incident.id} to="/control/incidents" className="flex items-start gap-3 rounded-xl border border-border bg-background/30 p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.06]">
                <SeverityBadge severity={incident.severity} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{incident.reference} · {titleCase(incident.category)}{trip ? ` · ${trip}` : ''}</p>
                  <p className="line-clamp-2 text-2xs text-muted-foreground">{incident.description}</p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">{relative(incident.reported_at)}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <TripDrawer summary={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
