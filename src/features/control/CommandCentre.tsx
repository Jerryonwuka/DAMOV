import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, Banknote, Bus, Clock, Coins, Gauge, Route as RouteIcon, ScanLine, TrendingUp, Users,
} from 'lucide-react'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { useMapData } from '@/hooks/use-map-data'
import { useTheme } from '@/hooks/use-theme'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber, PageHeader, StatTile } from '@/components/ui/patterns'
import { SeverityBadge, TripStatusBadge } from '@/components/ui/status'
import { TripDrawer } from '@/features/shared/TripDrawer'
import { delayLabel, lagosDate, lagosTime, naira, pct, relative } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import { calculateNetworkSnapshot } from '@/server/economics'
import { cn, titleCase } from '@/lib/utils'
import type { MapFilters } from '@/components/map/MapPanels'

const DamovMap = lazy(() => import('@/components/map/DamovMap').then((m) => ({ default: m.DamovMap })))

const MAP_FILTERS: MapFilters = { stops: true, hubs: false, vehicles: true, incidents: true, reference: false, route: null, severity: 'all' }

/**
 * Command Centre.
 *
 * Every tile is a query over the same tables the hub, driver and rider write
 * to. Nothing here is a static number: the map is the centre, the panels
 * around it are the network's state right now.
 */
export function CommandCentre() {
  const today = useServiceDate()
  const { theme } = useTheme()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)
  const targets = {
    onTime: useConfig('targets.on_time_departure_pct', 90),
    headway: useConfig('targets.headway_adherence_pct', 85),
    validation: useConfig('targets.digital_boarding_pct', 95),
    occupancy: useConfig('targets.peak_occupancy_pct', 82),
    validationSeconds: useConfig('targets.validation_seconds', 10),
  }
  const [selected, setSelected] = useState<TripSummary | null>(null)

  const snapshot = useDb(useCallback((db) => calculateNetworkSnapshot(db, today, tolerance), [today, tolerance]))
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
  const { layers } = useMapData(MAP_FILTERS)

  const nowMs = Date.now()
  const upcoming = useMemo(
    () => summaries.filter((s) => ['assigned', 'boarding', 'scheduled', 'held'].includes(s.trip.status) && new Date(s.trip.scheduled_departure_at).getTime() > nowMs - 15 * 60_000).slice(0, 5),
    [summaries, nowMs],
  )
  const live = useMemo(() => summaries.filter((s) => ['departed', 'in_service'].includes(s.trip.status)), [summaries])
  const unassigned = summaries.filter((s) => s.trip.status === 'scheduled' && new Date(s.trip.scheduled_departure_at).getTime() < nowMs + 2 * 3_600_000).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Command Centre"
        description={`Abuja network · ${lagosDate(new Date().toISOString())} · all figures computed from today's operational records.`}
        actions={
          <>
            <Button asChild variant="outline"><Link to="/control/dispatch">Dispatch board</Link></Button>
            <Button asChild><Link to="/control/map">Open live map <ArrowRight className="size-4" /></Link></Button>
          </>
        }
      />

      {unassigned > 0 && (
        <Card className="border-warning/40 bg-warning/[0.07]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              <span><span className="font-semibold">{unassigned} departure{unassigned > 1 ? 's' : ''}</span> in the next two hours still need a vehicle and driver.</span>
            </p>
            <Button asChild size="sm" variant="warning"><Link to="/control/dispatch">Assign now</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Fleet and trips */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatTile index={0} label="Buses active" value={<AnimatedNumber value={snapshot.buses_active} />} icon={Bus} tone="primary" />
        <StatTile index={1} label="Buses unavailable" value={<AnimatedNumber value={snapshot.buses_unavailable} />} icon={Bus} tone={snapshot.buses_unavailable ? 'warning' : 'default'} />
        <StatTile index={2} label="Scheduled" value={<AnimatedNumber value={snapshot.trips_scheduled} />} icon={Clock} />
        <StatTile index={3} label="Boarding" value={<AnimatedNumber value={snapshot.trips_boarding} />} icon={ScanLine} tone="info" />
        <StatTile index={4} label="Operating" value={<AnimatedNumber value={snapshot.trips_operating} />} icon={Activity} tone="primary" />
        <StatTile index={5} label="Completed" value={<AnimatedNumber value={snapshot.trips_completed} />} icon={RouteIcon} />
        <StatTile index={6} label="Cancelled" value={<AnimatedNumber value={snapshot.trips_cancelled} />} tone={snapshot.trips_cancelled ? 'critical' : 'default'} />
        <StatTile index={7} label="Onboard now" value={<AnimatedNumber value={snapshot.passengers_onboard} />} icon={Users} tone="primary" />
      </div>

      {/* Map + panels */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="flex min-h-[440px] flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Live network</p>
            <div className="flex items-center gap-2">
              <Badge tone="primary" dot pulse>{layers.vehicles.features.filter((f) => !f.properties?.stale).length} live</Badge>
              <Badge tone="warning" size="sm">Demo simulation</Badge>
            </div>
          </div>
          <div className="min-h-[380px] flex-1">
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
                <button key={s.trip.id} onClick={() => setSelected(s)} className="press flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{s.trip.trip_code} · {s.vehicle}</p>
                    <p className="truncate text-2xs text-muted-foreground">{s.direction_name} · {delayLabel(s.trip.scheduled_departure_at, s.trip.actual_departure_at)}</p>
                  </div>
                  <span className={cn('text-xs font-semibold tnum', s.occupancy_pct >= 85 ? 'text-warning-foreground' : '')}>{pct(s.occupancy_pct)}</span>
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
              {upcoming.map((s) => (
                <button key={s.trip.id} onClick={() => setSelected(s)} className="press flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent">
                  <span className="w-11 shrink-0 text-sm font-bold tnum">{lagosTime(s.trip.scheduled_departure_at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{s.trip.trip_code}</p>
                    <p className="truncate text-2xs text-muted-foreground">{s.vehicle ?? 'Unassigned'} · {s.booked} booked</p>
                  </div>
                  <TripStatusBadge status={s.trip.status} />
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Active incidents</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/control/incidents">All</Link></Button>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {incidents.length === 0 && <p className="text-sm text-muted-foreground">No open incidents.</p>}
              {incidents.map(({ incident, trip }) => (
                <Link key={incident.id} to="/control/incidents" className="flex items-start gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/40 hover:bg-accent">
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
      </div>

      {/* Performance and money */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile index={0} label="Average occupancy" value={pct(snapshot.average_occupancy)} icon={Gauge} hint="Services opened for boarding today" target={{ value: targets.occupancy, label: `Target ${targets.occupancy}% peak`, met: snapshot.average_occupancy >= targets.occupancy }} />
        <StatTile index={1} label="On-time departure" value={pct(snapshot.on_time_departure_rate)} icon={Clock} hint={`Within ${tolerance} min of schedule`} target={{ value: targets.onTime, label: `Target ≥${targets.onTime}%`, met: snapshot.on_time_departure_rate >= targets.onTime }} />
        <StatTile index={2} label="Headway adherence" value={pct(snapshot.headway_adherence)} icon={Activity} hint="Gaps within 25% of plan" target={{ value: targets.headway, label: `Target ≥${targets.headway}%`, met: snapshot.headway_adherence >= targets.headway }} />
        <StatTile index={3} label="Digital validation" value={pct(snapshot.boarding_validation_rate)} icon={ScanLine} hint={`Avg ${snapshot.average_validation_seconds}s per scan`} target={{ value: targets.validation, label: `Target ≥${targets.validation}%`, met: snapshot.boarding_validation_rate >= targets.validation }} />
        <StatTile index={4} label="Revenue today" value={naira(snapshot.revenue_today)} icon={Banknote} tone="primary" hint="Passenger + recognised sponsor" />
        <StatTile
          index={5}
          label="Contribution margin"
          value={naira(snapshot.contribution_margin_today)}
          icon={snapshot.contribution_margin_today >= 0 ? TrendingUp : Coins}
          tone={snapshot.contribution_margin_today >= 0 ? 'primary' : 'critical'}
          hint={`Direct cost ${naira(snapshot.direct_cost_today)} · not net profit`}
        />
      </div>

      <TripDrawer summary={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
