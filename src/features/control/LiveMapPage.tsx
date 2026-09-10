import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Pause, Play, Search, SlidersHorizontal, WifiOff } from 'lucide-react'
import { useDb } from '@/db/store'
import { DamovMap } from '@/components/map/DamovMap'
import { MapFilterPanel, VehicleDrawer, type MapFilters } from '@/components/map/MapPanels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TripDrawer } from '@/features/shared/TripDrawer'
import { useMapData } from '@/hooks/use-map-data'
import { useServiceDate } from '@/hooks/use-damov'
import { useTheme } from '@/hooks/use-theme'
import { useTripSimulator } from '@/hooks/use-simulator'
import { publishedRoutes, tripSummaries, type TripSummary, type VehicleMapRecord } from '@/lib/selectors'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Operations map.
 *
 * Filters live in the URL so a dispatcher can hand a colleague exactly the view
 * they are looking at. Every marker deep-links to its operational record.
 */
export function LiveMapPage() {
  const [params, setParams] = useSearchParams()
  const { theme } = useTheme()
  const today = useServiceDate()
  const simulator = useTripSimulator()
  const [basemap, setBasemap] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [panelOpen, setPanelOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [vehicle, setVehicle] = useState<VehicleMapRecord | null>(null)
  const [trip, setTrip] = useState<TripSummary | null>(null)

  const filters: MapFilters = useMemo(
    () => ({
      stops: params.get('stops') !== '0',
      hubs: params.get('hubs') === '1',
      vehicles: params.get('vehicles') !== '0',
      incidents: params.get('incidents') !== '0',
      reference: params.get('reference') === '1',
      route: params.get('route'),
      severity: params.get('severity') === 'high' ? 'high' : 'all',
    }),
    [params],
  )

  function updateFilters(next: MapFilters) {
    const out = new URLSearchParams()
    if (!next.stops) out.set('stops', '0')
    if (next.hubs) out.set('hubs', '1')
    if (!next.vehicles) out.set('vehicles', '0')
    if (!next.incidents) out.set('incidents', '0')
    if (next.reference) out.set('reference', '1')
    if (next.route) out.set('route', next.route)
    if (next.severity === 'high') out.set('severity', 'high')
    setParams(out, { replace: true })
  }

  const { layers, vehicles } = useMapData(filters)
  const routes = useDb(useCallback((db) => publishedRoutes(db), []))
  const selectedRouteGeometry = useDb(
    useCallback(
      (db) => {
        const route = db.routes.find((r) => r.id === filters.route)
        return route ? (db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)?.geometry ?? null) : null
      },
      [filters.route],
    ),
  )
  const summaries = useDb(useCallback((db) => tripSummaries(db, { serviceDate: today }), [today]))

  const live = vehicles.filter((v) => !v.stale).length
  const stale = vehicles.length - live

  function search() {
    const needle = query.trim().toLowerCase()
    if (!needle) return
    const byVehicle = vehicles.find((v) => v.fleet_number.toLowerCase().includes(needle))
    if (byVehicle) return setVehicle(byVehicle)
    const byRoute = routes.find((r) => r.code.toLowerCase().includes(needle) || r.public_name.toLowerCase().includes(needle))
    if (byRoute) return updateFilters({ ...filters, route: byRoute.id })
    const byTrip = summaries.find((s) => s.trip.trip_code.toLowerCase().includes(needle))
    if (byTrip) return setTrip(byTrip)
    toast.info('No vehicle, route or trip matches that search')
  }

  return (
    <div className="-mx-3 -my-4 flex h-[calc(100vh-4rem)] flex-col sm:-mx-5 sm:-my-6 lg:-mx-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Fleet number, route or trip code" className="h-9 pl-9" />
        </div>
        <Badge tone="primary" dot pulse={live > 0}>{live} live</Badge>
        {stale > 0 && <Badge tone="neutral" dot>{stale} stale</Badge>}
        <Badge tone="warning">{layers.incidents.features.length} incidents</Badge>
        {basemap === 'fallback' && (
          <Badge tone="warning" className="gap-1"><WifiOff className="size-3" /> Basemap unavailable — network geometry still shown</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {simulator.enabled && (
            <button
              onClick={simulator.toggle}
              className={cn('press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide transition-colors', simulator.running ? 'border-warning/40 bg-warning/15' : 'border-border bg-muted')}
            >
              {simulator.running ? <Pause className="size-3" /> : <Play className="size-3" />}
              Demo simulation {simulator.running ? 'running' : 'paused'}
            </button>
          )}
          <Button variant="outline" size="sm" onClick={() => setPanelOpen((v) => !v)}>
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <DamovMap
          layers={layers}
          theme={theme}
          fitTo={selectedRouteGeometry}
          selectedRouteId={filters.route}
          showStops={filters.stops}
          showHubs={filters.hubs}
          showVehicles={filters.vehicles}
          showIncidents={filters.incidents}
          onBasemapStatus={setBasemap}
          onFeatureClick={(kind, props) => {
            if (kind === 'vehicle') {
              const record = vehicles.find((v) => v.vehicle_id === props.vehicle_id)
              if (record) setVehicle(record)
            } else if (kind === 'route') {
              updateFilters({ ...filters, route: String(props.id) })
            } else if (kind === 'incident') {
              toast(`${props.reference} · ${props.category}`, { description: String(props.description) })
            } else if (kind === 'stop' || kind === 'hub') {
              toast(String(props.name), { description: `${props.code ?? ''} · ${props.status ?? ''}` })
            }
          }}
        />

        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute right-3 top-3 w-60 max-h-[calc(100%-1.5rem)] overflow-y-auto"
          >
            <MapFilterPanel filters={filters} onChange={updateFilters} routes={routes} />
          </motion.div>
        )}

        {simulator.enabled && simulator.running && (
          <div className="pointer-events-none absolute bottom-8 left-3 rounded-lg border border-warning/40 bg-card/90 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide shadow-card backdrop-blur">
            Demo simulation · vehicle positions are simulated
          </div>
        )}
      </div>

      <VehicleDrawer record={vehicle} onClose={() => setVehicle(null)} />
      <TripDrawer summary={trip} onClose={() => setTrip(null)} />
    </div>
  )
}
