import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import { distanceAlongLineKm, lineLengthKm } from '@/lib/geo'
import type { Route, RouteDirection, RouteGeometryVersion, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

/** Route configuration — directions, ordered stops, segments and geometry versions. */

export function createDirection(
  input: { route_id: UUID; name: string; direction_code: 'inbound' | 'outbound' },
  actor: { id: UUID | null; name: string },
): Result<RouteDirection> {
  return guard(() =>
    store.transact((draft) => {
      const route = draft.routes.find((r) => r.id === input.route_id)
      if (!route) throw new DomainError('route_not_found', 'Route not found.')
      if (draft.route_directions.some((d) => d.route_id === route.id && d.direction_code === input.direction_code))
        throw new DomainError('direction_exists', `An ${input.direction_code} direction already exists.`)
      const direction: RouteDirection = {
        id: uuid(), route_id: route.id, name: input.name.trim() || `${route.public_name} ${input.direction_code}`,
        direction_code: input.direction_code, origin_stop_id: null, destination_stop_id: null, active: true,
      }
      draft.route_directions = [...draft.route_directions, direction]
      if (route.status === 'reference') {
        draft.routes = draft.routes.map((r) => (r.id === route.id ? { ...r, status: 'draft', updated_at: new Date().toISOString() } : r))
      }
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'route.direction_added', entity_type: 'route', entity_id: route.id, summary: `${route.code}: ${direction.name} added.` })
      return direction
    }),
  )
}

/**
 * Replaces the ordered stop list for a direction and regenerates its segments.
 * Distances are projected onto the current geometry so offsets stay honest.
 */
export function setOrderedStops(
  input: { route_direction_id: UUID; stop_ids: UUID[]; run_minutes: number },
  actor: { id: UUID | null; name: string },
): Result<{ stops: number; segments: number }> {
  return guard(() =>
    store.transact((draft) => {
      const direction = draft.route_directions.find((d) => d.id === input.route_direction_id)
      if (!direction) throw new DomainError('direction_not_found', 'Direction not found.')
      if (input.stop_ids.length < 2) throw new DomainError('too_few_stops', 'A direction needs at least two stops.')
      if (new Set(input.stop_ids).size !== input.stop_ids.length) throw new DomainError('duplicate_stop', 'A stop can only appear once in a direction.')

      const route = draft.routes.find((r) => r.id === direction.route_id)!
      const version = draft.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)
      const inUse = draft.trips.some((t) => t.route_direction_id === direction.id && !['completed', 'cancelled'].includes(t.status))
      if (inUse) throw new DomainError('direction_in_use', 'Stops cannot change while trips are scheduled on this direction. Cancel or complete them first.')

      const stops = input.stop_ids.map((id) => {
        const stop = draft.stops.find((s) => s.id === id)
        if (!stop) throw new DomainError('stop_not_found', 'Stop not found.')
        return stop
      })
      const distances = stops.map((stop) => (version ? distanceAlongLineKm(version.geometry, [stop.longitude, stop.latitude]) : 0))
      const total = version?.distance_km ?? Math.max(...distances, 1)
      // Outbound runs the corridor in reverse, so distance-from-start flips.
      const oriented = direction.direction_code === 'outbound' ? distances.map((d) => Math.max(0, total - d)) : distances
      const base = Math.min(...oriented)

      draft.route_segments = draft.route_segments.filter((s) => s.route_direction_id !== direction.id)
      draft.route_stops = draft.route_stops.filter((rs) => rs.route_direction_id !== direction.id)

      const ids: UUID[] = []
      stops.forEach((stop, index) => {
        const id = uuid()
        ids.push(id)
        const distance = Math.round((oriented[index] - base) * 100) / 100
        draft.route_stops.push({
          id, route_direction_id: direction.id, stop_id: stop.id, sequence: index + 1,
          distance_from_start_km: distance,
          scheduled_offset_minutes: Math.round((distance / Math.max(0.1, total)) * input.run_minutes),
          boarding_allowed: index < stops.length - 1,
          alighting_allowed: index > 0,
        })
      })
      for (let i = 0; i < ids.length - 1; i++) {
        const from = draft.route_stops.find((rs) => rs.id === ids[i])!
        const to = draft.route_stops.find((rs) => rs.id === ids[i + 1])!
        draft.route_segments.push({
          id: uuid(), route_direction_id: direction.id, from_route_stop_id: from.id, to_route_stop_id: to.id, sequence: i + 1,
          distance_km: Math.round((to.distance_from_start_km - from.distance_from_start_km) * 100) / 100,
          planned_duration_minutes: Math.max(2, to.scheduled_offset_minutes - from.scheduled_offset_minutes),
        })
      }
      draft.route_directions = draft.route_directions.map((d) =>
        d.id === direction.id ? { ...d, origin_stop_id: stops[0].id, destination_stop_id: stops[stops.length - 1].id } : d,
      )
      draft.stops = draft.stops.map((s) => (input.stop_ids.includes(s.id) && s.status === 'reference' ? { ...s, status: 'draft' } : s))

      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'route.stops_ordered', entity_type: 'route', entity_id: route.id,
        summary: `${route.code} ${direction.name}: ${stops.length} ordered stops, ${stops.length - 1} segments regenerated.`,
      })
      return { stops: stops.length, segments: stops.length - 1 }
    }),
  )
}

/** Attaches a new geometry version; historical trips keep the version they ran under. */
export function addGeometryVersion(
  input: { route_id: UUID; geometry: GeoJSON.LineString; source: RouteGeometryVersion['source'] },
  actor: { id: UUID | null; name: string },
): Result<RouteGeometryVersion> {
  return guard(() =>
    store.transact((draft) => {
      const route = draft.routes.find((r) => r.id === input.route_id)
      if (!route) throw new DomainError('route_not_found', 'Route not found.')
      if (input.geometry.type !== 'LineString' || input.geometry.coordinates.length < 2)
        throw new DomainError('invalid_geometry', 'Geometry must be a LineString with at least two points.')
      const previous = draft.route_geometry_versions.filter((v) => v.route_id === route.id)
      const version: RouteGeometryVersion = {
        id: uuid(), route_id: route.id, version_number: previous.length + 1, geometry: input.geometry,
        distance_km: lineLengthKm(input.geometry), source: input.source, approval_state: 'draft',
        effective_from: null, effective_to: null, created_by: actor.id, approved_by: null, created_at: new Date().toISOString(),
      }
      draft.route_geometry_versions = draft.route_geometry_versions.map((v) =>
        v.route_id === route.id && v.approval_state === 'approved' ? { ...v, approval_state: 'superseded', effective_to: version.created_at } : v,
      )
      draft.route_geometry_versions = [...draft.route_geometry_versions, version]
      draft.routes = draft.routes.map((r) => (r.id === route.id ? { ...r, current_geometry_version_id: version.id, updated_at: version.created_at } : r))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'route.geometry_versioned', entity_type: 'route', entity_id: route.id, summary: `${route.code}: geometry v${version.version_number} attached (${version.distance_km} km, ${input.source}).`, severity: 'notice' })
      return version
    }),
  )
}

export function updateRouteDetails(
  input: { route_id: UUID; public_name?: string; code?: string; color?: string; route_type?: Route['route_type']; service_class?: Route['service_class'] },
  actor: { id: UUID | null; name: string },
): Result<Route> {
  return guard(() =>
    store.transact((draft) => {
      const route = draft.routes.find((r) => r.id === input.route_id)
      if (!route) throw new DomainError('route_not_found', 'Route not found.')
      if (input.code && draft.routes.some((r) => r.id !== route.id && r.code === input.code))
        throw new DomainError('code_taken', `Route code ${input.code} is already in use.`)
      const updated: Route = {
        ...route,
        public_name: input.public_name?.trim() || route.public_name,
        code: input.code?.trim() || route.code,
        color: input.color ?? route.color,
        route_type: input.route_type ?? route.route_type,
        service_class: input.service_class ?? route.service_class,
        status: route.status === 'reference' ? 'draft' : route.status,
        updated_at: new Date().toISOString(),
      }
      draft.routes = draft.routes.map((r) => (r.id === route.id ? updated : r))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'route.updated', entity_type: 'route', entity_id: route.id, summary: `${updated.code} details updated.` })
      return updated
    }),
  )
}
