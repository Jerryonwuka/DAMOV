import * as React from 'react'
import maplibregl, { type LngLatBoundsLike, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'
import { ABUJA_BOUNDS, DARK_STYLE_URL, LIGHT_STYLE_URL, fallbackStyle } from './style'

export type MapMode = 'operations' | 'hub' | 'rider' | 'planning'

export interface MapLayers {
  routes: GeoJSON.FeatureCollection
  stops: GeoJSON.FeatureCollection
  hubs: GeoJSON.FeatureCollection
  vehicles: GeoJSON.FeatureCollection
  incidents: GeoJSON.FeatureCollection
}

export interface DamovMapProps {
  layers: MapLayers
  mode?: MapMode
  theme?: 'dark' | 'light'
  className?: string
  fitTo?: GeoJSON.Geometry | null
  selectedRouteId?: string | null
  showStops?: boolean
  showHubs?: boolean
  showVehicles?: boolean
  showIncidents?: boolean
  onFeatureClick?: (kind: 'route' | 'stop' | 'hub' | 'vehicle' | 'incident', properties: Record<string, unknown>) => void
  onBasemapStatus?: (status: 'loading' | 'ready' | 'fallback') => void
  interactive?: boolean
}

const SOURCES = {
  routes: 'damov-routes',
  stops: 'damov-stops',
  hubs: 'damov-hubs',
  vehicles: 'damov-vehicles',
  incidents: 'damov-incidents',
} as const

/**
 * The shared spatial layer.
 *
 * One map component serves route design, terminal operations, rider journey
 * information, dispatch and incident response — every mode reads the same
 * sources, so what a dispatcher sees and what a passenger sees can never drift.
 */
export function DamovMap({
  layers, mode = 'operations', theme = 'dark', className, fitTo, selectedRouteId,
  showStops = true, showHubs = false, showVehicles = true, showIncidents = true,
  onFeatureClick, onBasemapStatus, interactive = true,
}: DamovMapProps) {
  const container = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = React.useState(false)
  const clickHandler = React.useRef(onFeatureClick)
  clickHandler.current = onFeatureClick
  const statusHandler = React.useRef(onBasemapStatus)
  statusHandler.current = onBasemapStatus

  /* --- Map lifecycle ------------------------------------------------- */
  React.useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: theme === 'dark' ? DARK_STYLE_URL : LIGHT_STYLE_URL,
      bounds: ABUJA_BOUNDS as LngLatBoundsLike,
      fitBoundsOptions: { padding: 48 },
      attributionControl: { compact: true },
      interactive,
    })
    mapRef.current = map
    statusHandler.current?.('loading')

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    }

    let usedFallback = false
    const applyFallback = () => {
      if (usedFallback) return
      usedFallback = true
      map.setStyle(fallbackStyle(theme))
      statusHandler.current?.('fallback')
    }
    // A basemap that has not produced a style within four seconds is treated as
    // unavailable; the operational layers matter more than the backdrop.
    const timeout = setTimeout(() => {
      if (!map.isStyleLoaded()) applyFallback()
    }, 4000)

    map.on('error', (event) => {
      const message = String((event as { error?: Error }).error?.message ?? '')
      if (message.includes('style') || message.includes('Failed to fetch')) applyFallback()
    })

    const install = () => {
      installLayers(map, theme)
      setReady(true)
      if (map.isStyleLoaded() && !usedFallback) statusHandler.current?.('ready')
    }
    map.on('load', () => {
      clearTimeout(timeout)
      install()
    })
    // A style swap wipes custom sources, so they are reinstalled every time.
    map.on('styledata', () => {
      if (map.isStyleLoaded() && !map.getSource(SOURCES.routes)) install()
    })

    return () => {
      clearTimeout(timeout)
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // Theme changes rebuild the map so the basemap and layer palette stay in sync.
  }, [theme, interactive])

  /* --- Data ---------------------------------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const set = (id: string, data: GeoJSON.FeatureCollection) => {
      const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
      source?.setData(data)
    }
    set(SOURCES.routes, layers.routes)
    set(SOURCES.stops, layers.stops)
    set(SOURCES.hubs, layers.hubs)
    set(SOURCES.vehicles, layers.vehicles)
    set(SOURCES.incidents, layers.incidents)
  }, [layers, ready])

  /* --- Visibility ---------------------------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const toggle = (ids: string[], visible: boolean) => {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    }
    toggle(['stops-circle', 'stops-label', 'stops-cluster', 'stops-cluster-count'], showStops)
    toggle(['hubs-circle', 'hubs-label', 'hubs-cluster', 'hubs-cluster-count'], showHubs)
    toggle(['vehicles-halo', 'vehicles-circle', 'vehicles-label'], showVehicles)
    toggle(['incidents-circle', 'incidents-pulse'], showIncidents)
  }, [showStops, showHubs, showVehicles, showIncidents, ready])

  /* --- Selection ----------------------------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const selected = selectedRouteId ?? '__none__'
    for (const id of ['routes-line', 'routes-casing', 'routes-flow']) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', routeOpacity(selected))
    }
  }, [selectedRouteId, ready])

  /* --- Camera -------------------------------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !fitTo) return
    try {
      const bounds = new maplibregl.LngLatBounds()
      const walk = (coords: unknown): void => {
        if (Array.isArray(coords) && typeof coords[0] === 'number') {
          bounds.extend(coords as [number, number])
          return
        }
        if (Array.isArray(coords)) coords.forEach(walk)
      }
      walk((fitTo as { coordinates?: unknown }).coordinates)
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 72, duration: 900, maxZoom: 14 })
    } catch {
      // A malformed geometry must never break the view.
    }
  }, [fitTo, ready])

  /* --- Interaction --------------------------------------------------- */
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !interactive) return

    const targets: [string, 'route' | 'stop' | 'hub' | 'vehicle' | 'incident'][] = [
      ['vehicles-circle', 'vehicle'],
      ['incidents-circle', 'incident'],
      ['stops-circle', 'stop'],
      ['hubs-circle', 'hub'],
      ['routes-line', 'route'],
    ]
    const onClick = (event: maplibregl.MapMouseEvent) => {
      const existing = targets.filter(([id]) => map.getLayer(id)).map(([id]) => id)
      const features = map.queryRenderedFeatures(event.point, { layers: existing }) as MapGeoJSONFeature[]
      const hit = features[0]
      if (!hit) return
      const kind = targets.find(([id]) => id === hit.layer.id)?.[1]
      if (kind) clickHandler.current?.(kind, hit.properties ?? {})
    }
    const onMove = (event: maplibregl.MapMouseEvent) => {
      const existing = targets.filter(([id]) => map.getLayer(id)).map(([id]) => id)
      const features = map.queryRenderedFeatures(event.point, { layers: existing })
      map.getCanvas().style.cursor = features.length ? 'pointer' : ''
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
    }
  }, [ready, interactive])

  return (
    <div
      ref={container}
      className={cn('h-full w-full', mode === 'rider' && 'rounded-xl', className)}
      role="application"
      aria-label="Damov network map"
    />
  )
}

/** Selected corridor stays fully saturated; the rest recede without disappearing. */
function routeOpacity(selectedId: string): maplibregl.DataDrivenPropertyValueSpecification<number> {
  return ['case', ['==', ['get', 'id'], selectedId], 1, selectedId === '__none__' ? 0.85 : 0.22]
}

function installLayers(map: maplibregl.Map, theme: 'dark' | 'light') {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  const label = theme === 'dark' ? '#E7F0EA' : '#123227'
  const halo = theme === 'dark' ? 'rgba(6,32,24,0.9)' : 'rgba(255,255,255,0.9)'

  for (const [key, id] of Object.entries(SOURCES)) {
    if (map.getSource(id)) continue
    const clustered = key === 'stops' || key === 'hubs'
    map.addSource(id, {
      type: 'geojson',
      data: empty,
      ...(clustered ? { cluster: true, clusterRadius: 46, clusterMaxZoom: 11 } : {}),
    })
  }

  map.addLayer({
    id: 'routes-casing',
    type: 'line',
    source: SOURCES.routes,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': theme === 'dark' ? '#04160F' : '#FFFFFF',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 11],
      'line-opacity': 0.85,
    },
  })
  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: SOURCES.routes,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#6FBF48'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 7],
      'line-opacity': 0.85,
    },
  })
  // Dashed overlay animates only on the corridor currently in service.
  map.addLayer({
    id: 'routes-flow',
    type: 'line',
    source: SOURCES.routes,
    filter: ['==', ['get', 'live'], true],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5],
      'line-opacity': 0.45,
      'line-dasharray': [0.5, 3],
    },
  })

  map.addLayer({
    id: 'hubs-cluster',
    type: 'circle',
    source: SOURCES.hubs,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(14,57,44,0.85)',
      'circle-stroke-color': '#6FBF48',
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 19, 30, 25],
    },
  })
  map.addLayer({
    id: 'hubs-cluster-count',
    type: 'symbol',
    source: SOURCES.hubs,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 },
    paint: { 'text-color': '#FFFFFF' },
  })
  map.addLayer({
    id: 'hubs-circle',
    type: 'circle',
    source: SOURCES.hubs,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'operational'], true], 7, 4],
      'circle-color': ['case', ['==', ['get', 'operational'], true], '#6FBF48', 'rgba(148,163,184,0.75)'],
      'circle-stroke-color': theme === 'dark' ? '#06201A' : '#FFFFFF',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'hubs-label',
    type: 'symbol',
    source: SOURCES.hubs,
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'operational'], true]],
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.4 },
  })

  map.addLayer({
    id: 'stops-cluster',
    type: 'circle',
    source: SOURCES.stops,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(111,191,72,0.25)',
      'circle-stroke-color': '#6FBF48',
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 13, 8, 17, 20, 22],
    },
  })
  map.addLayer({
    id: 'stops-cluster-count',
    type: 'symbol',
    source: SOURCES.stops,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.2 },
  })
  map.addLayer({
    id: 'stops-circle',
    type: 'circle',
    source: SOURCES.stops,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 15, 6],
      'circle-color': ['case', ['==', ['get', 'selected'], true], '#E9B10A', theme === 'dark' ? '#E7F0EA' : '#123227'],
      'circle-stroke-color': ['coalesce', ['get', 'color'], '#6FBF48'],
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'stops-label',
    type: 'symbol',
    source: SOURCES.stops,
    filter: ['!', ['has', 'point_count']],
    minzoom: 11.5,
    layout: { 'text-field': ['get', 'name'], 'text-size': 10.5, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.3 },
  })

  map.addLayer({
    id: 'incidents-pulse',
    type: 'circle',
    source: SOURCES.incidents,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 12, 15, 26],
      'circle-color': ['match', ['get', 'severity'], 'critical', '#D9522A', 'high', '#D9522A', '#E9B10A'],
      'circle-opacity': 0.18,
    },
  })
  map.addLayer({
    id: 'incidents-circle',
    type: 'circle',
    source: SOURCES.incidents,
    paint: {
      'circle-radius': 6,
      'circle-color': ['match', ['get', 'severity'], 'critical', '#D9522A', 'high', '#D9522A', '#E9B10A'],
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 1.5,
    },
  })

  map.addLayer({
    id: 'vehicles-halo',
    type: 'circle',
    source: SOURCES.vehicles,
    paint: {
      'circle-radius': 16,
      'circle-color': ['case', ['==', ['get', 'stale'], true], '#94A3B8', '#6FBF48'],
      'circle-opacity': 0.16,
    },
  })
  map.addLayer({
    id: 'vehicles-circle',
    type: 'circle',
    source: SOURCES.vehicles,
    paint: {
      'circle-radius': 8,
      // Stale positions are visually demoted so they can never read as live.
      'circle-color': ['case', ['==', ['get', 'stale'], true], '#94A3B8', '#6FBF48'],
      'circle-stroke-color': theme === 'dark' ? '#06201A' : '#FFFFFF',
      'circle-stroke-width': 2.5,
    },
  })
  map.addLayer({
    id: 'vehicles-label',
    type: 'symbol',
    source: SOURCES.vehicles,
    minzoom: 10,
    layout: {
      'text-field': ['get', 'fleet_number'],
      'text-size': 10,
      'text-offset': [0, -1.6],
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
    },
    paint: { 'text-color': label, 'text-halo-color': halo, 'text-halo-width': 1.4 },
  })
}
