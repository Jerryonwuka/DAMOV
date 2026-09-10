import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import { bearingBetween, pointAlong } from '@/lib/geo'
import type { VehicleLocation } from '@/lib/types'

/**
 * Vehicle telemetry ingestion.
 *
 * `ingestVehicleLocation` is the single write path for positions, whatever the
 * source. A telematics webhook in production posts to an Edge Function that
 * calls the same thing; the demo simulator below calls it directly.
 */
export function ingestVehicleLocation(input: Omit<VehicleLocation, 'id' | 'received_at'>) {
  store.transact((draft) => {
    const location: VehicleLocation = { ...input, id: uuid(), received_at: new Date().toISOString() }
    // Keep the table bounded in the prototype: latest 40 fixes per vehicle.
    const others = draft.vehicle_locations.filter((l) => l.vehicle_id !== input.vehicle_id)
    const mine = draft.vehicle_locations
      .filter((l) => l.vehicle_id === input.vehicle_id)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .slice(0, 39)
    draft.vehicle_locations = [...others, location, ...mine]
  })
}

/**
 * Demo simulation tick: move every in-service vehicle along its corridor in
 * proportion to elapsed trip time. Output is flagged `source: 'simulator'` so
 * it can never be mistaken for real operational data.
 */
export function simulateTick() {
  const db = store.read()
  const now = Date.now()
  for (const trip of db.trips.filter((t) => ['departed', 'in_service'].includes(t.status) && t.vehicle_id)) {
    const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)
    const route = direction ? db.routes.find((r) => r.id === direction.route_id) : undefined
    const version = route ? db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id) : undefined
    if (!direction || !version) continue

    const departure = new Date(trip.actual_departure_at ?? trip.scheduled_departure_at).getTime()
    const arrival = new Date(trip.scheduled_arrival_at).getTime()
    const progress = Math.max(0.01, Math.min(0.99, (now - departure) / Math.max(1, arrival - departure)))
    const along = direction.direction_code === 'outbound' ? 1 - progress : progress
    const distance = along * version.distance_km
    const position = pointAlong(version.geometry, distance)
    const ahead = pointAlong(version.geometry, Math.min(version.distance_km, distance + 0.2))
    const heading = direction.direction_code === 'outbound' ? bearingBetween(ahead, position) : bearingBetween(position, ahead)

    ingestVehicleLocation({
      vehicle_id: trip.vehicle_id!,
      trip_id: trip.id,
      latitude: position[1],
      longitude: position[0],
      heading: Math.round(heading),
      speed_kph: Math.round(18 + Math.random() * 30),
      accuracy_m: 6,
      recorded_at: new Date().toISOString(),
      source: 'simulator',
    })
  }
}
