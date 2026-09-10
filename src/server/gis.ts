import type { DamovDatabase } from '@/db/schema'
import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import type { DataQualityFlag, Hub, Route, RouteGeometryVersion, Stop } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'
import { lineLengthKm, nearestDistanceMetres } from '@/lib/geo'

/**
 * GIS import and data-quality gate.
 *
 * Imported corridors land as `reference` — never as advertised Damov services.
 * Operations must attach directions, ordered stops and geometry and then publish
 * before a route can carry a trip, and every defect below has to be visible
 * rather than silently normalised away.
 */

export interface ImportSummary {
  routes: number
  stops: number
  hubs: number
  flags: number
}

export function importGeoJson(
  payload: { routes?: GeoJSON.FeatureCollection; stops?: GeoJSON.FeatureCollection; hubs?: GeoJSON.FeatureCollection },
  actor: { id: string | null; name: string },
): Result<ImportSummary> {
  return guard(() =>
    store.transact((draft) => {
      let routes = 0
      let stops = 0
      let hubs = 0

      for (const feature of payload.hubs?.features ?? []) {
        if (feature.geometry?.type !== 'Point') continue
        const [lon, lat] = feature.geometry.coordinates
        const sourceId = String(feature.id ?? feature.properties?.source_index ?? uuid())
        if (draft.hubs.some((h) => h.external_source_id === sourceId)) continue
        const name = (feature.properties?.hub_name as string | null) ?? null
        const hub: Hub = {
          id: uuid(),
          name: name ?? `Unnamed hub ${sourceId}`,
          code: (feature.properties?.hub_code as string) ?? `H-${sourceId}`,
          type: 'proposed_transit_hub',
          latitude: lat, longitude: lon, address: null,
          status: 'reference',
          external_source_id: sourceId,
          operating_hours: null,
          created_at: new Date().toISOString(),
        }
        draft.hubs = [...draft.hubs, hub]
        hubs++
      }

      for (const feature of payload.stops?.features ?? []) {
        if (feature.geometry?.type !== 'Point') continue
        const [lon, lat] = feature.geometry.coordinates
        const sourceId = String(feature.id ?? feature.properties?.source_index ?? uuid())
        if (draft.stops.some((s) => s.external_source_id === sourceId)) continue
        const stop: Stop = {
          id: uuid(),
          name: (feature.properties?.stop_name as string) ?? `Unnamed stop ${sourceId}`,
          code: (feature.properties?.stop_code as string) ?? `S-${sourceId}`,
          latitude: lat, longitude: lon, hub_id: null,
          status: 'reference',
          step_free_access: Boolean(feature.properties?.step_free),
          shelter: Boolean(feature.properties?.shelter),
          external_source_id: sourceId,
          created_at: new Date().toISOString(),
        }
        draft.stops = [...draft.stops, stop]
        stops++
      }

      for (const feature of payload.routes?.features ?? []) {
        if (feature.geometry?.type !== 'LineString') continue
        const sourceId = String(feature.id ?? feature.properties?.source_index ?? uuid())
        if (draft.routes.some((r) => r.external_source_id === sourceId)) continue
        const props = feature.properties ?? {}
        const routeId = uuid()
        const versionId = uuid()
        const geometry = feature.geometry as GeoJSON.LineString

        const version: RouteGeometryVersion = {
          id: versionId,
          route_id: routeId,
          version_number: 1,
          geometry,
          distance_km: lineLengthKm(geometry),
          source: 'gis_import',
          approval_state: 'draft',
          effective_from: null, effective_to: null,
          created_by: actor.id, approved_by: null,
          created_at: new Date().toISOString(),
        }
        const route: Route = {
          id: routeId,
          name: (props.route_name as string) ?? `Reference corridor ${sourceId}`,
          public_name: (props.public_name as string) ?? (props.route_name as string) ?? `Corridor ${sourceId}`,
          code: (props.route_code as string) ?? `REF-${String(sourceId).replace(/\D/g, '').padStart(2, '0')}`,
          route_type: props.category === 'Secondary / Feeder' ? 'secondary_feeder' : 'primary_trunk',
          service_class: 'standard',
          // Imported corridors are planning references until operations publish them.
          status: 'reference',
          color: (props.color as string) ?? '#94A3B8',
          current_geometry_version_id: versionId,
          external_source_id: sourceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        draft.routes = [...draft.routes, route]
        draft.route_geometry_versions = [...draft.route_geometry_versions, version]
        routes++
      }

      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'gis.imported',
        entity_type: 'route', entity_id: null,
        summary: `Imported ${routes} corridors, ${stops} stops and ${hubs} transit hubs as reference data.`,
        severity: 'notice',
      })

      if (!routes && !stops && !hubs)
        throw new DomainError('nothing_imported', 'Nothing new to import — these features are already in the network.')

      return { routes, stops, hubs, flags: detectDataQuality(draft).length }
    }),
  )
}

/** Every defect the import screen must surface rather than silently normalise. */
export function detectDataQuality(db: DamovDatabase): DataQualityFlag[] {
  const flags: DataQualityFlag[] = []
  const placeholder = /^(unnamed|stop|hub|route|corridor|od[ -])/i

  for (const route of db.routes) {
    if (route.status === 'archived') continue
    const label = `${route.code} · ${route.public_name}`
    if (!route.external_source_id && route.status === 'reference')
      flags.push({ entity_type: 'route', entity_id: route.id, entity_label: label, issue: 'missing_stable_id', detail: 'No source identifier was preserved for this corridor.', severity: 'warning' })
    if (/^REF-/.test(route.code))
      flags.push({ entity_type: 'route', entity_id: route.id, entity_label: label, issue: 'missing_route_code', detail: 'Source data carried no route code; a placeholder was generated.', severity: 'blocking' })
    if (placeholder.test(route.public_name))
      flags.push({ entity_type: 'route', entity_id: route.id, entity_label: label, issue: 'placeholder_name', detail: `"${route.public_name}" looks like a placeholder from the source dataset.`, severity: 'warning' })

    const directions = db.route_directions.filter((d) => d.route_id === route.id)
    if (!directions.length)
      flags.push({ entity_type: 'route', entity_id: route.id, entity_label: label, issue: 'missing_direction', detail: 'No inbound/outbound direction is defined.', severity: 'blocking' })
    else if (!directions.some((d) => db.route_stops.some((rs) => rs.route_direction_id === d.id)))
      flags.push({ entity_type: 'route', entity_id: route.id, entity_label: label, issue: 'missing_ordered_stops', detail: 'Directions exist but no ordered stops are attached.', severity: 'blocking' })
  }

  const seen = new Map<string, string>()
  for (const hub of db.hubs) {
    const key = `${hub.latitude.toFixed(5)},${hub.longitude.toFixed(5)}`
    if (seen.has(key))
      flags.push({ entity_type: 'hub', entity_id: hub.id, entity_label: hub.name, issue: 'duplicate_coordinates', detail: `Shares an exact coordinate with ${seen.get(key)}.`, severity: 'warning' })
    else seen.set(key, hub.name)
    if (/^unnamed hub/i.test(hub.name))
      flags.push({ entity_type: 'hub', entity_id: hub.id, entity_label: hub.name, issue: 'unnamed_hub', detail: 'Source record has no hub name.', severity: 'warning' })
  }

  const lines = db.route_geometry_versions
    .filter((v) => db.routes.some((r) => r.current_geometry_version_id === v.id))
    .map((v) => v.geometry)
  for (const stop of db.stops) {
    if (/^(unnamed stop|stop \d+)$/i.test(stop.name))
      flags.push({ entity_type: 'stop', entity_id: stop.id, entity_label: stop.name, issue: 'placeholder_name', detail: 'Stop name is a placeholder in the source dataset.', severity: 'warning' })
    const distance = nearestDistanceMetres([stop.longitude, stop.latitude], lines)
    if (distance !== null && distance > 400)
      flags.push({ entity_type: 'stop', entity_id: stop.id, entity_label: stop.name, issue: 'stop_not_snapped', detail: `${Math.round(distance)} m from the nearest corridor — confirm or move it.`, severity: 'warning' })
  }

  return flags
}

export function publishRoute(routeId: string, actor: { id: string | null; name: string }): Result<Route> {
  return guard(() =>
    store.transact((draft) => {
      const route = draft.routes.find((r) => r.id === routeId)
      if (!route) throw new DomainError('route_not_found', 'Route not found.')
      const directions = draft.route_directions.filter((d) => d.route_id === routeId)
      if (!directions.length) throw new DomainError('no_directions', 'Define at least one direction before publishing.')
      for (const direction of directions) {
        const stops = draft.route_stops.filter((rs) => rs.route_direction_id === direction.id)
        if (stops.length < 2)
          throw new DomainError('no_stops', `${direction.name} needs at least two ordered stops before publishing.`)
        const segments = draft.route_segments.filter((s) => s.route_direction_id === direction.id)
        if (segments.length !== stops.length - 1)
          throw new DomainError('segments_mismatch', `${direction.name} has ${segments.length} segments for ${stops.length} stops. Regenerate segments.`)
      }
      if (!route.current_geometry_version_id) throw new DomainError('no_geometry', 'Attach route geometry before publishing.')
      if (!draft.fare_policies.some((f) => f.status === 'published' && (f.route_id === routeId || f.route_id === null)))
        throw new DomainError('no_fare_policy', 'A published fare policy must cover this route.')

      const updated: Route = { ...route, status: 'published', updated_at: new Date().toISOString() }
      draft.routes = draft.routes.map((r) => (r.id === routeId ? updated : r))
      draft.route_geometry_versions = draft.route_geometry_versions.map((v) =>
        v.id === route.current_geometry_version_id
          ? { ...v, approval_state: 'approved', approved_by: actor.id, effective_from: new Date().toISOString() }
          : v,
      )
      // Stops on a published route become live operational records.
      const stopIds = new Set(
        draft.route_stops
          .filter((rs) => directions.some((d) => d.id === rs.route_direction_id))
          .map((rs) => rs.stop_id),
      )
      draft.stops = draft.stops.map((s) => (stopIds.has(s.id) ? { ...s, status: 'active' } : s))

      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'route.published',
        entity_type: 'route', entity_id: routeId,
        summary: `${route.code} · ${route.public_name} published to riders.`,
        severity: 'sensitive',
      })
      return updated
    }),
  )
}

export function setRouteStatus(
  routeId: string,
  status: Route['status'],
  actor: { id: string | null; name: string },
): Result<Route> {
  return guard(() =>
    store.transact((draft) => {
      const route = draft.routes.find((r) => r.id === routeId)
      if (!route) throw new DomainError('route_not_found', 'Route not found.')
      const updated: Route = { ...route, status, updated_at: new Date().toISOString() }
      draft.routes = draft.routes.map((r) => (r.id === routeId ? updated : r))
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: `route.${status}`,
        entity_type: 'route', entity_id: routeId,
        summary: `${route.code} moved to ${status}.`, severity: 'sensitive',
      })
      return updated
    }),
  )
}
