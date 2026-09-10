import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Database, MapPinned, Upload } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { RouteStatusBadge } from '@/components/ui/status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { km } from '@/lib/format'
import type { DataQualityFlag, Hub, Route, Stop } from '@/lib/types'
import { detectDataQuality, importGeoJson } from '@/server/gis'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

interface RouteRow {
  route: Route
  distance_km: number
  directions: number
  stops: number
  flags: number
}

/**
 * Routes, stops and hubs.
 *
 * Imported corridors arrive as `reference`. The data-quality gate is the
 * first thing an operations manager sees, because the source dataset has known
 * gaps that must be resolved before anything is published to riders.
 */
export function NetworkPage() {
  const navigate = useNavigate()
  const { actor } = useAuth()
  const [tab, setTab] = useState('routes')

  const routes = useDb(
    useCallback(
      (db): RouteRow[] => {
        const flags = detectDataQuality(db)
        return db.routes
          .filter((r) => r.status !== 'archived')
          .map((route) => {
            const version = db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)
            const directions = db.route_directions.filter((d) => d.route_id === route.id)
            return {
              route,
              distance_km: version?.distance_km ?? 0,
              directions: directions.length,
              stops: db.route_stops.filter((rs) => directions.some((d) => d.id === rs.route_direction_id)).length,
              flags: flags.filter((f) => f.entity_type === 'route' && f.entity_id === route.id).length,
            }
          })
          .sort((a, b) => statusOrder(a.route.status) - statusOrder(b.route.status) || a.route.code.localeCompare(b.route.code))
      },
      [],
    ),
  )
  const stops = useDb(useCallback((db) => db.stops, []))
  const hubs = useDb(useCallback((db) => db.hubs, []))
  const flags = useDb(useCallback((db) => detectDataQuality(db), []))

  const counts = useMemo(
    () => ({
      published: routes.filter((r) => r.route.status === 'published').length,
      reference: routes.filter((r) => r.route.status === 'reference').length,
      pending: routes.filter((r) => ['draft', 'pending_approval'].includes(r.route.status)).length,
      blocking: flags.filter((f) => f.severity === 'blocking').length,
    }),
    [routes, flags],
  )

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as GeoJSON.FeatureCollection
        if (parsed.type !== 'FeatureCollection') throw new Error('Not a FeatureCollection')
        const lines = { ...parsed, features: parsed.features.filter((f) => f.geometry?.type === 'LineString') }
        const points = { ...parsed, features: parsed.features.filter((f) => f.geometry?.type === 'Point') }
        const result = importGeoJson({ routes: lines, stops: points }, actor)
        if (!result.ok) toast.error('Import failed', { description: result.error })
        else toast.success('GeoJSON imported as reference data', { description: `${result.data.routes} corridors, ${result.data.stops} points, ${result.data.flags} quality flags to review.` })
      } catch (err) {
        toast.error('Could not read file', { description: err instanceof Error ? err.message : 'Invalid GeoJSON' })
      }
    })
    event.target.value = ''
  }

  const routeColumns: Column<RouteRow>[] = [
    { key: 'code', header: 'Code', value: (r) => r.route.code, cell: (r) => <span className="inline-flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full" style={{ background: r.route.status === 'published' ? r.route.color : '#94A3B8' }} />{r.route.code}</span> },
    { key: 'name', header: 'Route', value: (r) => r.route.public_name },
    { key: 'status', header: 'Status', value: (r) => statusOrder(r.route.status), cell: (r) => <RouteStatusBadge status={r.route.status} /> },
    { key: 'type', header: 'Type', value: (r) => r.route.route_type, cell: (r) => titleCase(r.route.route_type), hideable: true },
    { key: 'distance', header: 'Length', align: 'right', value: (r) => r.distance_km, cell: (r) => km(r.distance_km) },
    { key: 'directions', header: 'Directions', align: 'right', value: (r) => r.directions, hideable: true },
    { key: 'stops', header: 'Ordered stops', align: 'right', value: (r) => r.stops, hideable: true },
    { key: 'flags', header: 'Quality', align: 'right', value: (r) => r.flags, cell: (r) => r.flags ? <Badge tone="warning" size="sm">{r.flags} flag{r.flags > 1 ? 's' : ''}</Badge> : <Badge tone="primary" size="sm"><CheckCircle2 className="size-3" /> Clean</Badge> },
    { key: 'source', header: 'Source ID', value: (r) => r.route.external_source_id ?? '', cell: (r) => <span className="text-xs text-muted-foreground tnum">{r.route.external_source_id ?? '—'}</span>, hideable: true, defaultHidden: true },
  ]

  const stopColumns: Column<Stop>[] = [
    { key: 'code', header: 'Code', value: (s) => s.code, cell: (s) => <span className="font-semibold tnum">{s.code}</span> },
    { key: 'name', header: 'Stop', value: (s) => s.name },
    { key: 'status', header: 'Status', value: (s) => s.status, cell: (s) => <Badge tone={s.status === 'active' ? 'primary' : 'neutral'}>{titleCase(s.status)}</Badge> },
    { key: 'coords', header: 'Coordinates', value: (s) => `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`, cell: (s) => <span className="text-xs tnum">{s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</span>, hideable: true },
    { key: 'access', header: 'Access', value: (s) => (s.step_free_access ? 1 : 0), cell: (s) => <span className="text-xs">{[s.step_free_access && 'Step-free', s.shelter && 'Shelter'].filter(Boolean).join(' · ') || '—'}</span>, hideable: true },
    { key: 'source', header: 'Source ID', value: (s) => s.external_source_id ?? '', cell: (s) => <span className="text-xs text-muted-foreground">{s.external_source_id ?? '—'}</span>, hideable: true, defaultHidden: true },
  ]

  const hubColumns: Column<Hub>[] = [
    { key: 'code', header: 'Code', value: (h) => h.code, cell: (h) => <span className="font-semibold tnum">{h.code}</span> },
    { key: 'name', header: 'Hub', value: (h) => h.name, cell: (h) => <span className={cn(/^unnamed/i.test(h.name) && 'italic text-muted-foreground')}>{h.name}</span> },
    { key: 'type', header: 'Type', value: (h) => h.type, cell: (h) => titleCase(h.type) },
    { key: 'status', header: 'Status', value: (h) => h.status, cell: (h) => <Badge tone={h.status === 'active' ? 'primary' : 'neutral'}>{titleCase(h.status)}</Badge> },
    { key: 'hours', header: 'Hours', value: (h) => h.operating_hours ?? '', cell: (h) => h.operating_hours ?? '—', hideable: true },
    { key: 'coords', header: 'Coordinates', value: (h) => `${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)}`, cell: (h) => <span className="text-xs tnum">{h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</span>, hideable: true, defaultHidden: true },
  ]

  const flagColumns: Column<DataQualityFlag>[] = [
    { key: 'severity', header: 'Severity', value: (f) => (f.severity === 'blocking' ? 0 : 1), cell: (f) => <Badge tone={f.severity === 'blocking' ? 'critical' : 'warning'}>{f.severity}</Badge> },
    { key: 'entity', header: 'Record', value: (f) => f.entity_label, cell: (f) => <span><span className="text-2xs uppercase text-muted-foreground">{f.entity_type}</span> <span className="font-medium">{f.entity_label}</span></span> },
    { key: 'issue', header: 'Issue', value: (f) => f.issue, cell: (f) => titleCase(f.issue) },
    { key: 'detail', header: 'Detail', value: (f) => f.detail, cell: (f) => <span className="text-xs text-muted-foreground">{f.detail}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Routes & Stops"
        description="The Abuja reference dataset lives here as planning corridors. Operations attach directions, ordered stops and geometry, then publish a route before it can carry a trip."
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold shadow-subtle transition-colors hover:bg-accent">
            <Upload className="size-4" /> Import GeoJSON
            <input type="file" accept=".json,.geojson,application/geo+json,application/json" className="sr-only" onChange={handleImport} />
          </label>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Published routes" value={counts.published} icon={MapPinned} tone="primary" />
        <StatTile index={1} label="Awaiting approval" value={counts.pending} tone={counts.pending ? 'warning' : 'default'} />
        <StatTile index={2} label="Reference corridors" value={counts.reference} icon={Database} hint={`${stops.length} stops · ${hubs.length} hubs imported`} />
        <StatTile index={3} label="Blocking data issues" value={counts.blocking} icon={AlertTriangle} tone={counts.blocking ? 'critical' : 'default'} hint={`${flags.length} flags in total`} />
      </div>

      {flags.length > 0 && tab !== 'quality' && (
        <Card className="border-warning/40 bg-warning/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              The source dataset carries {flags.length} data-quality flags — placeholder names, missing codes, unsnapped stops. They are shown, not silently normalised.
            </p>
            <Button size="sm" variant="warning" onClick={() => setTab('quality')}>Review flags</Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="routes">Routes ({routes.length})</TabsTrigger>
          <TabsTrigger value="stops">Stops ({stops.length})</TabsTrigger>
          <TabsTrigger value="hubs">Transit hubs ({hubs.length})</TabsTrigger>
          <TabsTrigger value="quality">Data quality ({flags.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="routes">
          <DataTable data={routes} columns={routeColumns} rowKey={(r) => r.route.id} onRowClick={(r) => navigate(`/control/network/${r.route.id}`)} searchPlaceholder="Route code or name…" exportName="routes" pageSize={16} />
        </TabsContent>
        <TabsContent value="stops">
          <DataTable data={stops} columns={stopColumns} rowKey={(s) => s.id} searchPlaceholder="Stop name or code…" exportName="stops" pageSize={14} />
        </TabsContent>
        <TabsContent value="hubs">
          <DataTable data={hubs} columns={hubColumns} rowKey={(h) => h.id} searchPlaceholder="Hub name or code…" exportName="transit-hubs" pageSize={14} />
        </TabsContent>
        <TabsContent value="quality">
          <Card>
            <CardHeader>
              <CardTitle>Import data-quality review</CardTitle>
              <p className="text-xs text-muted-foreground">
                Blocking issues must be resolved on the route detail screen before a route can be published. Warnings should be confirmed by a planner.
              </p>
            </CardHeader>
            <CardContent>
              <DataTable data={flags} columns={flagColumns} rowKey={(f) => `${f.entity_id}-${f.issue}`} onRowClick={(f) => f.entity_type === 'route' && navigate(`/control/network/${f.entity_id}`)} searchPlaceholder="Record or issue…" exportName="gis-data-quality" pageSize={12} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function statusOrder(status: Route['status']) {
  return ['published', 'pending_approval', 'draft', 'suspended', 'reference', 'archived'].indexOf(status)
}
