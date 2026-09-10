import type { DamovDatabase } from '@/db/schema'
import type { Booking, Route, Trip, UUID } from '@/lib/types'
import { tripLowestAvailability } from '@/server/capacity'
import { getConfigNumber } from '@/server/configuration'

/* ------------------------------------------------------------------ */
/* Map sources                                                          */
/* ------------------------------------------------------------------ */

export function routeFeatures(
  db: DamovDatabase,
  options: { statuses?: Route['status'][]; liveRouteIds?: Set<UUID> } = {},
): GeoJSON.FeatureCollection {
  const statuses = options.statuses
  return {
    type: 'FeatureCollection',
    features: db.routes
      .filter((route) => (statuses ? statuses.includes(route.status) : true))
      .map((route) => {
        const version = db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)
        if (!version) return null
        return {
          type: 'Feature' as const,
          id: route.id,
          properties: {
            id: route.id,
            code: route.code,
            name: route.public_name,
            status: route.status,
            color: route.status === 'published' ? route.color : '#7C8B93',
            route_type: route.route_type,
            distance_km: version.distance_km,
            live: options.liveRouteIds?.has(route.id) ?? false,
          },
          geometry: version.geometry,
        }
      })
      .filter(Boolean) as GeoJSON.Feature[],
  }
}

export function stopFeatures(
  db: DamovDatabase,
  options: { onlyActive?: boolean; selectedStopIds?: Set<UUID>; routeId?: UUID | null } = {},
): GeoJSON.FeatureCollection {
  let stops = db.stops
  if (options.onlyActive) stops = stops.filter((s) => s.status === 'active')
  if (options.routeId) {
    const directions = db.route_directions.filter((d) => d.route_id === options.routeId).map((d) => d.id)
    const ids = new Set(db.route_stops.filter((rs) => directions.includes(rs.route_direction_id)).map((rs) => rs.stop_id))
    stops = stops.filter((s) => ids.has(s.id))
  }
  return {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature',
      id: stop.id,
      properties: {
        id: stop.id,
        name: stop.name,
        code: stop.code,
        status: stop.status,
        selected: options.selectedStopIds?.has(stop.id) ?? false,
        shelter: stop.shelter,
        step_free: stop.step_free_access,
      },
      geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
    })),
  }
}

export function hubFeatures(db: DamovDatabase): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: db.hubs.map((hub) => ({
      type: 'Feature',
      id: hub.id,
      properties: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        type: hub.type,
        status: hub.status,
        operational: hub.status === 'active',
      },
      geometry: { type: 'Point', coordinates: [hub.longitude, hub.latitude] },
    })),
  }
}

export interface VehicleMapRecord {
  vehicle_id: UUID
  fleet_number: string
  trip_id: UUID | null
  trip_code: string | null
  route_name: string | null
  driver_name: string | null
  occupancy_pct: number
  boarded: number
  capacity: number
  next_stop: string | null
  delay_minutes: number | null
  recorded_at: string
  age_seconds: number
  stale: boolean
  longitude: number
  latitude: number
  incident_reference: string | null
}

/** Latest position per vehicle, with the staleness verdict already applied. */
export function liveVehicleRecords(db: DamovDatabase, nowMs: number): VehicleMapRecord[] {
  const staleAfter = getConfigNumber(db, 'telemetry.stale_after_seconds', 120)
  const latest = new Map<UUID, (typeof db.vehicle_locations)[number]>()
  for (const location of db.vehicle_locations) {
    const existing = latest.get(location.vehicle_id)
    if (!existing || location.recorded_at > existing.recorded_at) latest.set(location.vehicle_id, location)
  }

  return [...latest.values()].map((location) => {
    const vehicle = db.vehicles.find((v) => v.id === location.vehicle_id)
    const trip = location.trip_id ? db.trips.find((t) => t.id === location.trip_id) : undefined
    const direction = trip ? db.route_directions.find((d) => d.id === trip.route_direction_id) : undefined
    const route = direction ? db.routes.find((r) => r.id === direction.route_id) : undefined
    const driver = trip?.driver_id ? db.profiles.find((p) => p.id === trip.driver_id) : undefined
    const boarded = trip
      ? db.boarding_events.filter((e) => e.trip_id === trip.id && e.result !== 'rejected' && !e.reversed_at).length
      : 0
    const capacity = trip?.bookable_capacity_snapshot ?? 0
    const nextStop = trip?.current_route_stop_id
      ? db.route_stops.find((rs) => rs.id === trip.current_route_stop_id)
      : undefined
    const age = Math.round((nowMs - new Date(location.recorded_at).getTime()) / 1000)
    const incident = trip ? db.incidents.find((i) => i.trip_id === trip.id && !['resolved', 'closed'].includes(i.status)) : undefined

    return {
      vehicle_id: location.vehicle_id,
      fleet_number: vehicle?.fleet_number ?? '—',
      trip_id: trip?.id ?? null,
      trip_code: trip?.trip_code ?? null,
      route_name: route ? `${route.code} · ${direction?.name}` : null,
      driver_name: driver?.full_name ?? null,
      occupancy_pct: capacity ? Math.round((boarded / capacity) * 1000) / 10 : 0,
      boarded,
      capacity,
      next_stop: nextStop ? (db.stops.find((s) => s.id === nextStop.stop_id)?.name ?? null) : null,
      delay_minutes:
        trip?.actual_departure_at
          ? Math.round((new Date(trip.actual_departure_at).getTime() - new Date(trip.scheduled_departure_at).getTime()) / 60_000)
          : null,
      recorded_at: location.recorded_at,
      age_seconds: age,
      stale: age > staleAfter,
      longitude: location.longitude,
      latitude: location.latitude,
      incident_reference: incident?.reference ?? null,
    }
  })
}

export function vehicleFeatures(records: VehicleMapRecord[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: records.map((record) => ({
      type: 'Feature',
      id: record.vehicle_id,
      properties: { ...record },
      geometry: { type: 'Point', coordinates: [record.longitude, record.latitude] },
    })),
  }
}

export function incidentFeatures(db: DamovDatabase): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: db.incidents
      .filter((incident) => incident.latitude !== null && incident.longitude !== null && !['resolved', 'closed'].includes(incident.status))
      .map((incident) => ({
        type: 'Feature',
        id: incident.id,
        properties: {
          id: incident.id,
          reference: incident.reference,
          severity: incident.severity,
          category: incident.category,
          description: incident.description,
        },
        geometry: { type: 'Point', coordinates: [incident.longitude!, incident.latitude!] },
      })),
  }
}

/* ------------------------------------------------------------------ */
/* Operational read models                                              */
/* ------------------------------------------------------------------ */

export interface TripSummary {
  trip: Trip
  route_code: string
  route_id: UUID
  route_name: string
  direction_name: string
  origin: string
  destination: string
  vehicle: string | null
  driver: string | null
  booked: number
  boarded: number
  capacity: number
  occupancy_pct: number
  seats_available: number
  delay_minutes: number | null
  revenue: number
}

export function tripSummaries(db: DamovDatabase, filter: { serviceDate?: string; routeId?: UUID } = {}): TripSummary[] {
  const trips = db.trips.filter((trip) => (filter.serviceDate ? trip.service_date === filter.serviceDate : true))
  return trips
    .map((trip) => {
      const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)
      if (!direction) return null
      if (filter.routeId && direction.route_id !== filter.routeId) return null
      const route = db.routes.find((r) => r.id === direction.route_id)!
      const stops = db.route_stops
        .filter((rs) => rs.route_direction_id === direction.id)
        .sort((a, b) => a.sequence - b.sequence)
      const name = (routeStopId?: UUID) => {
        const rs = stops.find((s) => s.id === routeStopId)
        return rs ? (db.stops.find((s) => s.id === rs.stop_id)?.name ?? '—') : '—'
      }
      const bookings = db.bookings.filter(
        (b) => b.trip_id === trip.id && !['cancelled', 'expired', 'refunded'].includes(b.status),
      )
      const boarded = db.boarding_events.filter(
        (e) => e.trip_id === trip.id && e.result !== 'rejected' && !e.reversed_at,
      ).length
      const revenue =
        db.payments
          .filter((p) => p.status === 'succeeded' && bookings.some((b) => b.id === p.booking_id))
          .reduce((a, p) => a + p.amount, 0) +
        db.sponsor_authorizations
          .filter((s) => s.status === 'recognized' && bookings.some((b) => b.id === s.booking_id))
          .reduce((a, s) => a + s.amount_recognized, 0)
      const capacity = trip.bookable_capacity_snapshot
      const basis = trip.actual_departure_at ? boarded : bookings.length

      return {
        trip,
        route_id: route.id,
        route_code: route.code,
        route_name: route.public_name,
        direction_name: direction.name,
        origin: name(stops[0]?.id),
        destination: name(stops[stops.length - 1]?.id),
        vehicle: trip.vehicle_id ? (db.vehicles.find((v) => v.id === trip.vehicle_id)?.fleet_number ?? null) : null,
        driver: trip.driver_id ? (db.profiles.find((p) => p.id === trip.driver_id)?.full_name ?? null) : null,
        booked: bookings.length,
        boarded,
        capacity,
        occupancy_pct: capacity ? Math.round((basis / capacity) * 1000) / 10 : 0,
        seats_available: tripLowestAvailability(db, trip.id),
        delay_minutes: trip.actual_departure_at
          ? Math.round((new Date(trip.actual_departure_at).getTime() - new Date(trip.scheduled_departure_at).getTime()) / 60_000)
          : null,
        revenue,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a!.trip.scheduled_departure_at).getTime() - new Date(b!.trip.scheduled_departure_at).getTime()) as TripSummary[]
}

export interface ManifestRow {
  booking: Booking
  passenger: string
  phone: string
  staff_id: string | null
  origin: string
  destination: string
  ticket_code: string | null
  boarded_at: string | null
  validation_method: string | null
  sponsor: string | null
}

export function tripManifest(db: DamovDatabase, tripId: UUID): ManifestRow[] {
  const stopName = (routeStopId: UUID) => {
    const rs = db.route_stops.find((s) => s.id === routeStopId)
    return rs ? (db.stops.find((s) => s.id === rs.stop_id)?.name ?? '—') : '—'
  }
  return db.bookings
    .filter((b) => b.trip_id === tripId)
    .map((booking) => {
      const profile = db.profiles.find((p) => p.id === booking.rider_id)
      const rider = db.rider_profiles.find((r) => r.profile_id === booking.rider_id)
      const ticket = db.tickets.find((t) => t.booking_id === booking.id)
      const boarding = db.boarding_events.find((e) => e.booking_id === booking.id && e.result !== 'rejected' && !e.reversed_at)
      return {
        booking,
        passenger: profile?.full_name ?? 'Unknown',
        phone: profile?.phone ?? '',
        staff_id: rider?.staff_id ?? null,
        origin: stopName(booking.origin_route_stop_id),
        destination: stopName(booking.destination_route_stop_id),
        ticket_code: ticket?.ticket_code ?? null,
        boarded_at: boarding?.boarded_at ?? null,
        validation_method: boarding?.validation_method ?? null,
        sponsor: booking.sponsor_id ? (db.organizations.find((o) => o.id === booking.sponsor_id)?.short_name ?? null) : null,
      }
    })
    .sort((a, b) => a.passenger.localeCompare(b.passenger))
}

/** Ordered stops of a direction, resolved to display names. */
export function directionStops(db: DamovDatabase, directionId: UUID) {
  return db.route_stops
    .filter((rs) => rs.route_direction_id === directionId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((rs) => ({ routeStop: rs, stop: db.stops.find((s) => s.id === rs.stop_id)! }))
    .filter((entry) => Boolean(entry.stop))
}

export function publishedRoutes(db: DamovDatabase) {
  return db.routes.filter((r) => r.status === 'published')
}
