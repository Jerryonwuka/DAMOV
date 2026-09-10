import { useCallback, useMemo } from 'react'
import { useDb } from '@/db/store'
import { useClock } from '@/hooks/use-clock'
import {
  hubFeatures, incidentFeatures, liveVehicleRecords, routeFeatures, stopFeatures, vehicleFeatures,
} from '@/lib/selectors'
import type { MapLayers } from '@/components/map/DamovMap'
import type { MapFilters } from '@/components/map/MapPanels'

/** Builds the five map sources from the database, honouring the active filters. */
export function useMapData(filters: MapFilters): { layers: MapLayers; vehicles: ReturnType<typeof liveVehicleRecords> } {
  const now = useClock(15_000)

  const routes = useDb(
    useCallback(
      (db) => {
        const live = new Set(
          db.trips
            .filter((t) => ['departed', 'in_service'].includes(t.status))
            .map((t) => db.route_directions.find((d) => d.id === t.route_direction_id)?.route_id ?? ''),
        )
        const statuses = filters.reference
          ? (['published', 'pending_approval', 'draft', 'reference', 'suspended'] as const)
          : (['published', 'pending_approval', 'suspended'] as const)
        const all = routeFeatures(db, { statuses: [...statuses], liveRouteIds: live })
        return filters.route
          ? { ...all, features: all.features.filter((f) => f.properties?.id === filters.route) }
          : all
      },
      [filters.reference, filters.route],
    ),
  )
  const stops = useDb(
    useCallback(
      (db) => stopFeatures(db, { onlyActive: !filters.reference, routeId: filters.route }),
      [filters.reference, filters.route],
    ),
  )
  const hubs = useDb(useCallback((db) => hubFeatures(db), []))
  const vehicles = useDb(useCallback((db) => liveVehicleRecords(db, now), [now]))
  const incidents = useDb(
    useCallback(
      (db) => {
        const all = incidentFeatures(db)
        return filters.severity === 'high'
          ? { ...all, features: all.features.filter((f) => ['high', 'critical'].includes(String(f.properties?.severity))) }
          : all
      },
      [filters.severity],
    ),
  )

  const layers = useMemo<MapLayers>(
    () => ({ routes, stops, hubs, vehicles: vehicleFeatures(vehicles), incidents }),
    [routes, stops, hubs, vehicles, incidents],
  )
  return { layers, vehicles }
}
