import type { DamovDatabase } from '@/db/schema'
import type { CostCategory, TripEconomics, UUID } from '@/lib/types'
import { percent, sum } from '@/lib/utils'

const EMPTY_COSTS: Record<CostCategory, number> = {
  energy: 0, driver: 0, support_staff: 0, maintenance_reserve: 0, tyre_reserve: 0, cleaning: 0,
  payment_processing: 0, terminal: 0, toll: 0, lease_allocation: 0, other_direct: 0,
}

/**
 * Trip economics.
 *
 *   gross_trip_revenue  = passenger contributions + recognised sponsor contributions
 *   direct_trip_cost    = every approved direct cost attributed to the trip
 *   contribution_margin = gross_trip_revenue - direct_trip_cost
 *
 * Contribution margin is never presented as net profit: indirect overhead,
 * financing and depreciation sit outside this calculation by design.
 */
export function calculateTripEconomics(db: DamovDatabase, tripId: UUID): TripEconomics {
  const trip = db.trips.find((t) => t.id === tripId)
  const bookings = db.bookings.filter((b) => b.trip_id === tripId && !['cancelled', 'expired', 'refunded'].includes(b.status))
  const boarded = db.boarding_events.filter((e) => e.trip_id === tripId && e.result !== 'rejected' && !e.reversed_at)

  const passengerRevenue = sum(
    db.payments
      .filter((p) => p.status === 'succeeded' && bookings.some((b) => b.id === p.booking_id))
      .map((p) => p.amount),
  )
  const auths = db.sponsor_authorizations.filter((s) => bookings.some((b) => b.id === s.booking_id))
  const sponsorRecognized = sum(auths.filter((a) => a.status === 'recognized').map((a) => a.amount_recognized))
  const sponsorReserved = sum(auths.filter((a) => a.status === 'reserved').map((a) => a.amount_reserved))

  const costs = { ...EMPTY_COSTS }
  for (const entry of db.cost_entries.filter((c) => c.trip_id === tripId && c.approval_status === 'approved')) {
    costs[entry.category] += entry.amount
  }

  const direction = db.route_directions.find((d) => d.id === trip?.route_direction_id)
  const routeStops = db.route_stops
    .filter((rs) => rs.route_direction_id === direction?.id)
    .sort((a, b) => a.sequence - b.sequence)
  const distanceKm = routeStops[routeStops.length - 1]?.distance_from_start_km ?? 0

  const grossRevenue = passengerRevenue + sponsorRecognized
  const directCost = sum(Object.values(costs))
  const passengerCount = boarded.length
  const capacity = trip?.bookable_capacity_snapshot ?? 0
  // Before a bus leaves, occupancy means seats sold; once it has left, it means
  // passengers actually validated at the gate.
  const departed = Boolean(trip?.actual_departure_at)
  const occupancyBasis = departed ? passengerCount : bookings.length

  return {
    trip_id: tripId,
    passenger_count: passengerCount,
    capacity,
    booked_count: bookings.length,
    occupancy_pct: percent(occupancyBasis, capacity),
    gross_fare_value: sum(bookings.map((b) => b.gross_fare)),
    passenger_revenue: passengerRevenue,
    sponsor_revenue_recognized: sponsorRecognized,
    sponsor_revenue_reserved: sponsorReserved,
    gross_trip_revenue: grossRevenue,
    direct_trip_cost: directCost,
    cost_breakdown: costs,
    contribution_margin: grossRevenue - directCost,
    distance_km: distanceKm,
    cost_per_passenger: passengerCount ? Math.round(directCost / passengerCount) : 0,
    revenue_per_passenger: passengerCount ? Math.round(grossRevenue / passengerCount) : 0,
    revenue_per_km: distanceKm ? Math.round(grossRevenue / distanceKm) : 0,
    cost_per_km: distanceKm ? Math.round(directCost / distanceKm) : 0,
    subsidy_per_boarded_passenger: passengerCount ? Math.round(sponsorRecognized / passengerCount) : 0,
  }
}

export interface RoutePerformance {
  route_id: UUID
  route_code: string
  route_name: string
  trips: number
  completed: number
  cancelled: number
  passengers: number
  gross_revenue: number
  direct_cost: number
  contribution_margin: number
  average_occupancy: number
  on_time_rate: number
  headway_adherence: number
  peak_departure: string | null
  weakest_departure: string | null
}

export function calculateRoutePerformance(
  db: DamovDatabase,
  options: { from: string; to: string; onTimeToleranceMinutes: number },
): RoutePerformance[] {
  return db.routes
    .filter((r) => r.status === 'published')
    .map((route) => {
      const directions = db.route_directions.filter((d) => d.route_id === route.id).map((d) => d.id)
      const trips = db.trips.filter(
        (t) => directions.includes(t.route_direction_id) && t.service_date >= options.from && t.service_date <= options.to,
      )
      const economics = trips.map((t) => calculateTripEconomics(db, t.id))
      const departed = trips.filter((t) => t.actual_departure_at)
      const onTime = departed.filter(
        (t) =>
          (new Date(t.actual_departure_at!).getTime() - new Date(t.scheduled_departure_at).getTime()) / 60_000 <=
          options.onTimeToleranceMinutes,
      )

      // Headway adherence: share of consecutive gaps within 25% of the planned gap.
      const ordered = [...departed].sort(
        (a, b) => new Date(a.scheduled_departure_at).getTime() - new Date(b.scheduled_departure_at).getTime(),
      )
      let adherent = 0
      let gaps = 0
      for (let i = 1; i < ordered.length; i++) {
        const planned = (new Date(ordered[i].scheduled_departure_at).getTime() - new Date(ordered[i - 1].scheduled_departure_at).getTime()) / 60_000
        const actual = (new Date(ordered[i].actual_departure_at!).getTime() - new Date(ordered[i - 1].actual_departure_at!).getTime()) / 60_000
        if (planned <= 0) continue
        gaps++
        if (Math.abs(actual - planned) / planned <= 0.25) adherent++
      }

      const ranked = [...economics].sort((a, b) => b.passenger_count - a.passenger_count)
      const tripOf = (id?: UUID) => trips.find((t) => t.id === id)

      return {
        route_id: route.id,
        route_code: route.code,
        route_name: route.public_name,
        trips: trips.length,
        completed: trips.filter((t) => t.status === 'completed').length,
        cancelled: trips.filter((t) => t.status === 'cancelled').length,
        passengers: sum(economics.map((e) => e.passenger_count)),
        gross_revenue: sum(economics.map((e) => e.gross_trip_revenue)),
        direct_cost: sum(economics.map((e) => e.direct_trip_cost)),
        contribution_margin: sum(economics.map((e) => e.contribution_margin)),
        average_occupancy: economics.length
          ? Math.round((sum(economics.map((e) => e.occupancy_pct)) / economics.length) * 10) / 10
          : 0,
        on_time_rate: percent(onTime.length, departed.length),
        headway_adherence: percent(adherent, gaps),
        peak_departure: tripOf(ranked[0]?.trip_id)?.trip_code ?? null,
        weakest_departure: tripOf(ranked[ranked.length - 1]?.trip_id)?.trip_code ?? null,
      }
    })
}

export interface NetworkSnapshot {
  buses_active: number
  buses_unavailable: number
  trips_scheduled: number
  trips_boarding: number
  trips_operating: number
  trips_completed: number
  trips_cancelled: number
  passengers_onboard: number
  average_occupancy: number
  on_time_departure_rate: number
  headway_adherence: number
  active_incidents: number
  revenue_today: number
  direct_cost_today: number
  contribution_margin_today: number
  boarding_validation_rate: number
  average_validation_seconds: number
}

export function calculateNetworkSnapshot(
  db: DamovDatabase,
  serviceDate: string,
  onTimeToleranceMinutes: number,
): NetworkSnapshot {
  const trips = db.trips.filter((t) => t.service_date === serviceDate)
  const economics = trips.map((t) => calculateTripEconomics(db, t.id))
  const departed = trips.filter((t) => t.actual_departure_at)
  const onTime = departed.filter(
    (t) =>
      (new Date(t.actual_departure_at!).getTime() - new Date(t.scheduled_departure_at).getTime()) / 60_000 <=
      onTimeToleranceMinutes,
  )
  const inService = trips.filter((t) => ['departed', 'in_service'].includes(t.status))
  const onboard = sum(
    inService.map((t) => db.boarding_events.filter((e) => e.trip_id === t.id && e.result !== 'rejected' && !e.reversed_at).length),
  )
  // Average occupancy covers services that have actually opened for boarding —
  // averaging in departures that are still hours away would only dilute it.
  const liveStatuses = ['boarding', 'departed', 'in_service', 'completed']
  const liveTripIds = new Set(trips.filter((t) => liveStatuses.includes(t.status)).map((t) => t.id))
  const occupancies = economics
    .filter((e) => e.capacity > 0 && liveTripIds.has(e.trip_id))
    .map((e) => e.occupancy_pct)
  const validations = db.boarding_events.filter((e) => trips.some((t) => t.id === e.trip_id))
  const digital = validations.filter((e) => ['qr_scan', 'booking_code'].includes(e.validation_method))
  const durations = validations.map((e) => e.duration_ms ?? 0).filter(Boolean)

  const routePerf = calculateRoutePerformance(db, { from: serviceDate, to: serviceDate, onTimeToleranceMinutes })
  const withGaps = routePerf.filter((r) => r.headway_adherence > 0)

  return {
    buses_active: db.vehicles.filter((v) => v.status === 'operating').length,
    buses_unavailable: db.vehicles.filter((v) => ['maintenance', 'out_of_service', 'charging'].includes(v.status)).length,
    trips_scheduled: trips.filter((t) => ['scheduled', 'assigned', 'held'].includes(t.status)).length,
    trips_boarding: trips.filter((t) => t.status === 'boarding').length,
    trips_operating: inService.length,
    trips_completed: trips.filter((t) => t.status === 'completed').length,
    trips_cancelled: trips.filter((t) => t.status === 'cancelled').length,
    passengers_onboard: onboard,
    average_occupancy: occupancies.length ? Math.round((sum(occupancies) / occupancies.length) * 10) / 10 : 0,
    on_time_departure_rate: percent(onTime.length, departed.length),
    headway_adherence: withGaps.length ? Math.round(sum(withGaps.map((r) => r.headway_adherence)) / withGaps.length) : 0,
    active_incidents: db.incidents.filter((i) => !['resolved', 'closed'].includes(i.status)).length,
    revenue_today: sum(economics.map((e) => e.gross_trip_revenue)),
    direct_cost_today: sum(economics.map((e) => e.direct_trip_cost)),
    contribution_margin_today: sum(economics.map((e) => e.contribution_margin)),
    boarding_validation_rate: percent(digital.length, validations.filter((e) => e.result !== 'rejected').length),
    average_validation_seconds: durations.length ? Math.round((sum(durations) / durations.length / 1000) * 10) / 10 : 0,
  }
}
