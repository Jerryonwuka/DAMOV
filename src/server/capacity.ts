import type { DamovDatabase } from '@/db/schema'
import { store } from '@/db/store'
import type { JourneyAvailability, UUID } from '@/lib/types'
import { DomainError, guard, type Result } from './result'

/**
 * Segment inventory engine.
 *
 * A bus is never modelled as "N seats left". Every trip owns one inventory row
 * per consecutive stop pair, and a journey consumes a seat on each segment it
 * actually traverses — so a Mararaba→Nyanya passenger frees their seat for the
 * Nyanya→CBD leg. Availability for a requested journey is the *minimum* free
 * count across the segments it spans.
 */

export function segmentsForJourney(
  db: DamovDatabase,
  tripId: UUID,
  originRouteStopId: UUID,
  destinationRouteStopId: UUID,
) {
  const trip = db.trips.find((t) => t.id === tripId)
  if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')

  const routeStops = db.route_stops
    .filter((rs) => rs.route_direction_id === trip.route_direction_id)
    .sort((a, b) => a.sequence - b.sequence)

  const origin = routeStops.find((rs) => rs.id === originRouteStopId)
  const destination = routeStops.find((rs) => rs.id === destinationRouteStopId)
  if (!origin || !destination) throw new DomainError('stop_not_on_route', 'Stop is not on this route direction.')
  if (destination.sequence <= origin.sequence)
    throw new DomainError('invalid_journey', 'Destination must come after the origin on this direction.')
  if (!origin.boarding_allowed) throw new DomainError('boarding_not_allowed', 'Boarding is not permitted at this stop.')
  if (!destination.alighting_allowed)
    throw new DomainError('alighting_not_allowed', 'Alighting is not permitted at this stop.')

  const segments = db.route_segments
    .filter((seg) => seg.route_direction_id === trip.route_direction_id)
    .sort((a, b) => a.sequence - b.sequence)
    .filter((seg) => {
      const from = routeStops.find((rs) => rs.id === seg.from_route_stop_id)
      return from ? from.sequence >= origin.sequence && from.sequence < destination.sequence : false
    })

  if (!segments.length) throw new DomainError('no_segments', 'This journey spans no route segments.')

  const inventory = segments.map((seg) => {
    const row = db.trip_segment_inventory.find((i) => i.trip_id === tripId && i.route_segment_id === seg.id)
    if (!row) throw new DomainError('inventory_missing', 'Segment inventory has not been generated for this trip.')
    return { segment: seg, inventory: row }
  })

  return { trip, origin, destination, routeStops, inventory }
}

function freeSeats(row: { capacity: number; reserved_count: number; boarded_adjustment: number }) {
  return row.capacity - row.reserved_count - row.boarded_adjustment
}

/** Read-only availability check used by search results and the checkout quote. */
export function checkJourneyAvailability(
  tripId: UUID,
  originRouteStopId: UUID,
  destinationRouteStopId: UUID,
): Result<JourneyAvailability> {
  return guard(() => {
    const db = store.read()
    const { inventory } = segmentsForJourney(db, tripId, originRouteStopId, destinationRouteStopId)

    let limiting = inventory[0]
    for (const entry of inventory) {
      if (freeSeats(entry.inventory) < freeSeats(limiting.inventory)) limiting = entry
    }
    const seats = Math.max(0, freeSeats(limiting.inventory))
    const fromStop = db.route_stops.find((rs) => rs.id === limiting.segment.from_route_stop_id)
    const toStop = db.route_stops.find((rs) => rs.id === limiting.segment.to_route_stop_id)
    const label = (id?: string) => db.stops.find((s) => s.id === id)?.name ?? 'Unknown'

    return {
      available: seats > 0,
      seats_available: seats,
      limiting_segment_id: limiting.segment.id,
      limiting_segment_label: `${label(fromStop?.stop_id)} → ${label(toStop?.stop_id)}`,
      segments_checked: inventory.length,
    }
  })
}

/**
 * Reserves one seat on every segment of the journey inside an open transaction.
 * Throws — and therefore rolls the caller's whole booking back — if any segment
 * is full. Returns the inventory rows that were touched so the caller can write
 * `booking_segments`.
 */
export function reserveSegments(
  draft: DamovDatabase,
  tripId: UUID,
  originRouteStopId: UUID,
  destinationRouteStopId: UUID,
): string[] {
  const { inventory } = segmentsForJourney(draft, tripId, originRouteStopId, destinationRouteStopId)

  for (const entry of inventory) {
    if (freeSeats(entry.inventory) <= 0) {
      const from = draft.route_stops.find((rs) => rs.id === entry.segment.from_route_stop_id)
      const to = draft.route_stops.find((rs) => rs.id === entry.segment.to_route_stop_id)
      const name = (id?: string) => draft.stops.find((s) => s.id === id)?.name ?? 'stop'
      throw new DomainError(
        'segment_full',
        `No capacity on ${name(from?.stop_id)} → ${name(to?.stop_id)}. Try the next departure.`,
      )
    }
  }

  const touched: string[] = []
  draft.trip_segment_inventory = draft.trip_segment_inventory.map((row) => {
    const match = inventory.find((entry) => entry.inventory.id === row.id)
    if (!match) return row
    touched.push(row.id)
    return { ...row, reserved_count: row.reserved_count + 1, version: row.version + 1 }
  })
  return touched
}

/** Releases seats held by a booking. Used by cancellation and expiry. */
export function releaseSegments(draft: DamovDatabase, bookingId: UUID) {
  const held = draft.booking_segments.filter((bs) => bs.booking_id === bookingId)
  const ids = new Set(held.map((bs) => bs.trip_segment_inventory_id))
  draft.trip_segment_inventory = draft.trip_segment_inventory.map((row) =>
    ids.has(row.id)
      ? { ...row, reserved_count: Math.max(0, row.reserved_count - 1), version: row.version + 1 }
      : row,
  )
  draft.booking_segments = draft.booking_segments.filter((bs) => bs.booking_id !== bookingId)
  return held.length
}

/** Lowest free-seat count across the whole trip — the number shown on a departure card. */
export function tripLowestAvailability(db: DamovDatabase, tripId: UUID) {
  const rows = db.trip_segment_inventory.filter((i) => i.trip_id === tripId)
  if (!rows.length) return 0
  return Math.max(0, Math.min(...rows.map(freeSeats)))
}

export { freeSeats }
