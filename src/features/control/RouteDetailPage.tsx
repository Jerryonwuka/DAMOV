import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, Reorder } from 'framer-motion'
import { ArrowLeft, ArrowUpFromLine, CheckCircle2, GripVertical, Plus, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useTheme } from '@/hooks/use-theme'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DefinitionRow, EmptyState, PageHeader } from '@/components/ui/patterns'
import { RouteStatusBadge } from '@/components/ui/status'
import { km, lagosDateTime, naira } from '@/lib/format'
import { directionStops, hubFeatures, routeFeatures, stopFeatures } from '@/lib/selectors'
import type { MapLayers } from '@/components/map/DamovMap'
import type { UUID } from '@/lib/types'
import { detectDataQuality, publishRoute, setRouteStatus } from '@/server/gis'
import { addGeometryVersion, createDirection, setOrderedStops, updateRouteDetails } from '@/server/routes'
import { calculateRoutePerformance } from '@/server/economics'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

const DamovMap = lazy(() => import('@/components/map/DamovMap').then((m) => ({ default: m.DamovMap })))

/**
 * Route detail and GIS configuration.
 *
 * Where a reference corridor becomes an operational service: name and code,
 * inbound/outbound directions, ordered stops with generated segments,
 * versioned geometry, and the publication gate that checks all of it.
 */
export function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>()
  const { actor, can } = useAuth()
  const { theme } = useTheme()
  const today = useServiceDate()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)

  const data = useDb(
    useCallback(
      (db) => {
        const route = db.routes.find((r) => r.id === routeId)
        if (!route) return null
        const versions = db.route_geometry_versions.filter((v) => v.route_id === route.id).sort((a, b) => b.version_number - a.version_number)
        const directions = db.route_directions.filter((d) => d.route_id === route.id).map((d) => ({ direction: d, stops: directionStops(db, d.id), segments: db.route_segments.filter((s) => s.route_direction_id === d.id).sort((a, b) => a.sequence - b.sequence) }))
        const flags = detectDataQuality(db).filter((f) => f.entity_type === 'route' && f.entity_id === route.id)
        const fare = db.fare_policies.find((f) => f.status === 'published' && (f.route_id === route.id || f.route_id === null)) ?? null
        const templates = db.schedule_templates.filter((t) => directions.some((d) => d.direction.id === t.route_direction_id))
        const performance = calculateRoutePerformance(db, { from: today, to: today, onTimeToleranceMinutes: tolerance }).find((p) => p.route_id === route.id) ?? null
        const layers: MapLayers = {
          routes: routeFeatures(db, { statuses: [route.status] }),
          stops: stopFeatures(db, { routeId: route.id }),
          hubs: hubFeatures(db),
          vehicles: { type: 'FeatureCollection', features: [] },
          incidents: { type: 'FeatureCollection', features: [] },
        }
        layers.routes = { ...layers.routes, features: layers.routes.features.filter((f) => f.properties?.id === route.id) }
        return { route, versions, directions, flags, fare, templates, performance, layers, geometry: versions.find((v) => v.id === route.current_geometry_version_id)?.geometry ?? null }
      },
      [routeId, today, tolerance],
    ),
  )
  const allStops = useDb(useCallback((db) => [...db.stops].sort((a, b) => a.name.localeCompare(b.name)), []))

  const [details, setDetails] = useState<{ public_name: string; code: string; color: string } | null>(null)
  const [editing, setEditing] = useState<{ directionId: UUID; stopIds: UUID[]; runMinutes: number } | null>(null)
  const [addStop, setAddStop] = useState('')
  const [newDirection, setNewDirection] = useState<{ code: 'inbound' | 'outbound'; name: string } | null>(null)

  const blocking = useMemo(() => data?.flags.filter((f) => f.severity === 'blocking') ?? [], [data])

  if (!data) {
    return (
      <div>
        <PageHeader title="Route not found" />
        <Button asChild variant="outline"><Link to="/control/network"><ArrowLeft className="size-4" /> Back to routes</Link></Button>
      </div>
    )
  }
  const { route } = data

  function saveDetails() {
    if (!details) return
    const result = updateRouteDetails({ route_id: route.id, ...details }, actor)
    if (!result.ok) return toast.error('Not saved', { description: result.error })
    toast.success('Route details saved')
    setDetails(null)
  }

  function publish() {
    const result = publishRoute(route.id, actor)
    if (!result.ok) return toast.error('Cannot publish yet', { description: result.error })
    toast.success(`${route.code} published`, { description: 'Riders can now see and book this service.' })
  }

  function saveStops() {
    if (!editing) return
    const result = setOrderedStops({ route_direction_id: editing.directionId, stop_ids: editing.stopIds, run_minutes: editing.runMinutes }, actor)
    if (!result.ok) return toast.error('Stops not saved', { description: result.error })
    toast.success('Ordered stops saved', { description: `${result.data.segments} segments regenerated from the geometry.` })
    setEditing(null)
  }

  function addDirection() {
    if (!newDirection) return
    const result = createDirection({ route_id: route.id, name: newDirection.name, direction_code: newDirection.code }, actor)
    if (!result.ok) return toast.error('Direction not added', { description: result.error })
    toast.success(`${result.data.name} added`)
    setNewDirection(null)
  }

  function importGeometry(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as GeoJSON.Feature | GeoJSON.FeatureCollection | GeoJSON.LineString
        const geometry =
          parsed.type === 'LineString' ? parsed
          : parsed.type === 'Feature' ? (parsed.geometry as GeoJSON.LineString)
          : (parsed.features.find((f) => f.geometry.type === 'LineString')?.geometry as GeoJSON.LineString | undefined)
        if (!geometry || geometry.type !== 'LineString') throw new Error('No LineString found in the file')
        const result = addGeometryVersion({ route_id: route.id, geometry, source: 'gis_import' }, actor)
        if (!result.ok) return toast.error('Geometry not attached', { description: result.error })
        toast.success(`Geometry v${result.data.version_number} attached`, { description: `${result.data.distance_km} km. Re-save ordered stops to re-project distances.` })
      } catch (err) {
        toast.error('Could not read geometry', { description: err instanceof Error ? err.message : 'Invalid file' })
      }
    })
    event.target.value = ''
  }

  const current = details ?? { public_name: route.public_name, code: route.code, color: route.color }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={<Link to="/control/network" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3" /> Routes & Stops</Link>}
        title={<span className="inline-flex items-center gap-3"><span className="size-3 rounded-full" style={{ background: route.color }} />{route.code} · {route.public_name}</span>}
        description={route.name}
        actions={
          <>
            <RouteStatusBadge status={route.status} />
            {can('action.publish_route') && route.status !== 'published' && (
              <Button onClick={publish} disabled={blocking.length > 0}><Send className="size-4" /> Publish route</Button>
            )}
            {can('action.publish_route') && route.status === 'published' && (
              <Button variant="outline" onClick={() => { const r = setRouteStatus(route.id, 'suspended', actor); if (r.ok) toast.success('Route suspended') }}>Suspend</Button>
            )}
            {can('action.publish_route') && route.status === 'suspended' && (
              <Button onClick={() => { const r = setRouteStatus(route.id, 'published', actor); if (r.ok) toast.success('Route reinstated') }}>Reinstate</Button>
            )}
          </>
        }
      />

      {/* Publication gate */}
      {route.status !== 'published' && (
        <Card className={cn(blocking.length ? 'border-critical/40 bg-critical/[0.05]' : 'border-primary/40 bg-primary/[0.05]')}>
          <CardContent className="pt-5">
            <p className="mb-2 text-sm font-semibold">Publication checklist</p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {[
                { ok: data.directions.length > 0, label: 'At least one direction defined' },
                { ok: data.directions.every((d) => d.stops.length >= 2), label: 'Every direction has ordered stops' },
                { ok: data.directions.every((d) => d.segments.length === Math.max(0, d.stops.length - 1)), label: 'Segments generated for every stop pair' },
                { ok: Boolean(route.current_geometry_version_id), label: 'Route geometry attached' },
                { ok: Boolean(data.fare), label: 'Published fare policy covers this route' },
                { ok: !/^REF-/.test(route.code), label: 'Real route code assigned' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  {item.ok ? <CheckCircle2 className="size-4 text-primary" /> : <X className="size-4 text-critical" />}
                  <span className={cn(!item.ok && 'text-muted-foreground')}>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="h-[360px]">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <DamovMap layers={data.layers} theme={theme} fitTo={data.geometry} selectedRouteId={route.id} showHubs={false} showVehicles={false} showIncidents={false} />
            </Suspense>
          </div>
          <CardContent className="flex flex-wrap items-center gap-4 pt-4 text-sm">
            <span><span className="text-muted-foreground">Length</span> <span className="font-semibold tnum">{km(data.versions[0]?.distance_km)}</span></span>
            <span><span className="text-muted-foreground">Geometry</span> <span className="font-semibold">v{data.versions.find((v) => v.id === route.current_geometry_version_id)?.version_number ?? '—'}</span></span>
            <span><span className="text-muted-foreground">Source</span> <span className="font-semibold tnum">{route.external_source_id ?? 'drawn'}</span></span>
            {can('action.publish_route') && (
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold hover:bg-accent">
                <ArrowUpFromLine className="size-3.5" /> Attach geometry
                <input type="file" accept=".json,.geojson" className="sr-only" onChange={importGeometry} />
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label>Public name</Label>
                <Input value={current.public_name} onChange={(e) => setDetails({ ...current, public_name: e.target.value })} disabled={!can('action.publish_route')} />
              </div>
              <div className="space-y-1.5">
                <Label>Colour</Label>
                <input type="color" value={current.color} onChange={(e) => setDetails({ ...current, color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card p-1" disabled={!can('action.publish_route')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Route code</Label>
              <Input value={current.code} onChange={(e) => setDetails({ ...current, code: e.target.value.toUpperCase() })} disabled={!can('action.publish_route')} />
            </div>
            {details && (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveDetails}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setDetails(null)}>Discard</Button>
              </div>
            )}
            <dl className="divide-y divide-border rounded-lg border border-border px-3">
              <DefinitionRow term="Type">{titleCase(route.route_type)}</DefinitionRow>
              <DefinitionRow term="Service class">{titleCase(route.service_class)}</DefinitionRow>
              <DefinitionRow term="Fare policy">{data.fare ? `${data.fare.name} v${data.fare.version}` : <span className="text-critical">None published</span>}</DefinitionRow>
              <DefinitionRow term="Schedule templates">{data.templates.length}</DefinitionRow>
              <DefinitionRow term="Updated">{lagosDateTime(route.updated_at)}</DefinitionRow>
            </dl>
            {data.flags.length > 0 && (
              <div className="space-y-1">
                {data.flags.map((flag) => (
                  <p key={flag.issue} className="flex items-start gap-2 rounded-lg bg-warning/12 p-2 text-xs">
                    <Badge tone={flag.severity === 'blocking' ? 'critical' : 'warning'} size="sm">{flag.severity}</Badge>
                    <span>{flag.detail}</span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="directions">
        <TabsList>
          <TabsTrigger value="directions">Directions & stops</TabsTrigger>
          <TabsTrigger value="geometry">Geometry versions ({data.versions.length})</TabsTrigger>
          <TabsTrigger value="performance">Performance today</TabsTrigger>
        </TabsList>

        <TabsContent value="directions" className="space-y-4">
          {data.directions.length === 0 && (
            <EmptyState title="No directions yet" description="Define an inbound and an outbound direction, then attach ordered stops to each." />
          )}
          {data.directions.map(({ direction, stops, segments }) => {
            const isEditing = editing?.directionId === direction.id
            return (
              <Card key={direction.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>{direction.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{titleCase(direction.direction_code)} · {stops.length} stops · {segments.length} segments · {km(stops[stops.length - 1]?.routeStop.distance_from_start_km ?? 0)}</p>
                  </div>
                  {can('action.publish_route') && !isEditing && (
                    <Button size="sm" variant="outline" onClick={() => setEditing({ directionId: direction.id, stopIds: stops.map((s) => s.stop.id), runMinutes: stops[stops.length - 1]?.routeStop.scheduled_offset_minutes || 60 })}>Edit stops</Button>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditing && editing ? (
                    <div className="space-y-3">
                      <Reorder.Group axis="y" values={editing.stopIds} onReorder={(ids) => setEditing({ ...editing, stopIds: ids })} className="space-y-1.5">
                        {editing.stopIds.map((id, index) => {
                          const stop = allStops.find((s) => s.id === id)
                          return (
                            <Reorder.Item key={id} value={id} className="flex cursor-grab items-center gap-3 rounded-lg border border-border bg-card p-2.5 active:cursor-grabbing">
                              <GripVertical className="size-4 text-muted-foreground" />
                              <span className="grid size-6 place-items-center rounded-full bg-muted text-2xs font-bold">{index + 1}</span>
                              <span className="flex-1 text-sm">{stop?.name}</span>
                              <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ ...editing, stopIds: editing.stopIds.filter((s) => s !== id) })} aria-label="Remove stop"><Trash2 className="size-3.5" /></Button>
                            </Reorder.Item>
                          )
                        })}
                      </Reorder.Group>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px] flex-1 space-y-1.5">
                          <Label>Add stop</Label>
                          <Select value={addStop} onValueChange={setAddStop}>
                            <SelectTrigger><SelectValue placeholder="Choose a stop" /></SelectTrigger>
                            <SelectContent>
                              {allStops.filter((s) => !editing.stopIds.includes(s.id)).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground">· {s.code}</span></SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="outline" disabled={!addStop} onClick={() => { setEditing({ ...editing, stopIds: [...editing.stopIds, addStop] }); setAddStop('') }}><Plus className="size-4" /> Add</Button>
                        <div className="w-32 space-y-1.5">
                          <Label>End-to-end min</Label>
                          <Input value={editing.runMinutes} inputMode="numeric" onChange={(e) => setEditing({ ...editing, runMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} className="tnum" />
                        </div>
                      </div>
                      <p className="text-2xs text-muted-foreground">Distances are projected onto the current geometry when you save; segments and scheduled offsets are regenerated from consecutive stop pairs.</p>
                      <div className="flex gap-2">
                        <Button onClick={saveStops} disabled={editing.stopIds.length < 2}>Save ordered stops</Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : stops.length === 0 ? (
                    <EmptyState title="No ordered stops" description="Attach at least two stops to generate segments." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-3 text-left">#</th>
                            <th className="py-2 pr-3 text-left">Stop</th>
                            <th className="py-2 pr-3 text-right">km</th>
                            <th className="py-2 pr-3 text-right">+min</th>
                            <th className="py-2 pr-3 text-left">Segment to next</th>
                            <th className="py-2 text-left">Rules</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stops.map(({ routeStop, stop }, index) => {
                            const segment = segments[index]
                            return (
                              <motion.tr key={routeStop.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.03 }} className="border-b border-border/60 last:border-0">
                                <td className="py-2 pr-3 tnum">{routeStop.sequence}</td>
                                <td className="py-2 pr-3 font-medium">{stop.name}</td>
                                <td className="py-2 pr-3 text-right tnum">{routeStop.distance_from_start_km.toFixed(1)}</td>
                                <td className="py-2 pr-3 text-right tnum">{routeStop.scheduled_offset_minutes}</td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{segment ? `${segment.distance_km.toFixed(1)} km · ${segment.planned_duration_minutes} min` : '—'}</td>
                                <td className="py-2 text-xs text-muted-foreground">{[routeStop.boarding_allowed && 'board', routeStop.alighting_allowed && 'alight'].filter(Boolean).join(' · ')}</td>
                              </motion.tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
          {can('action.publish_route') && data.directions.length < 2 && (
            newDirection ? (
              <Card>
                <CardContent className="flex flex-wrap items-end gap-3 pt-5">
                  <div className="space-y-1.5">
                    <Label>Direction</Label>
                    <Select value={newDirection.code} onValueChange={(v) => setNewDirection({ ...newDirection, code: v as 'inbound' | 'outbound' })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbound" disabled={data.directions.some((d) => d.direction.direction_code === 'inbound')}>Inbound</SelectItem>
                        <SelectItem value="outbound" disabled={data.directions.some((d) => d.direction.direction_code === 'outbound')}>Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[240px] flex-1 space-y-1.5">
                    <Label>Name</Label>
                    <Input value={newDirection.name} onChange={(e) => setNewDirection({ ...newDirection, name: e.target.value })} placeholder="Mararaba → CBD" />
                  </div>
                  <Button onClick={addDirection}>Add direction</Button>
                  <Button variant="ghost" onClick={() => setNewDirection(null)}>Cancel</Button>
                </CardContent>
              </Card>
            ) : (
              <Button variant="outline" onClick={() => setNewDirection({ code: data.directions.some((d) => d.direction.direction_code === 'inbound') ? 'outbound' : 'inbound', name: '' })}>
                <Plus className="size-4" /> Add direction
              </Button>
            )
          )}
        </TabsContent>

        <TabsContent value="geometry">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.versions.map((version) => (
                <div key={version.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className="font-semibold">v{version.version_number}</span>
                  <Badge tone={version.approval_state === 'approved' ? 'primary' : version.approval_state === 'superseded' ? 'neutral' : 'warning'}>{titleCase(version.approval_state)}</Badge>
                  <span className="text-muted-foreground">{km(version.distance_km)} · {titleCase(version.source)} · {version.geometry.coordinates.length} vertices</span>
                  <span className="ml-auto text-xs text-muted-foreground">{lagosDateTime(version.created_at)}</span>
                  {version.id === route.current_geometry_version_id && <Badge tone="forest" size="sm">Current</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="mt-2 text-2xs text-muted-foreground">Every geometry change creates a new version. Trips keep the version they were generated under, so history is never rewritten.</p>
        </TabsContent>

        <TabsContent value="performance">
          {!data.performance || data.performance.trips === 0 ? (
            <EmptyState title="No trips today" description="Performance appears once the route has run scheduled trips." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Trips', String(data.performance.trips)],
                ['Passengers', String(data.performance.passengers)],
                ['Average occupancy', `${data.performance.average_occupancy}%`],
                ['On-time rate', `${data.performance.on_time_rate}%`],
                ['Headway adherence', `${data.performance.headway_adherence}%`],
                ['Gross revenue', naira(data.performance.gross_revenue)],
                ['Direct cost', naira(data.performance.direct_cost)],
                ['Contribution margin', naira(data.performance.contribution_margin)],
              ].map(([label, value]) => (
                <Card key={label} className="p-4">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-bold tnum">{value}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
