import type { DamovDatabase } from '@/db/schema'
import { store } from '@/db/store'
import { isoDateOf, naira } from '@/lib/format'
import type { FareQuote, Naira, SubsidyPolicy, UUID } from '@/lib/types'
import { DomainError, guard, type Result } from './result'
import { segmentsForJourney } from './capacity'

/**
 * Fare and subsidy evaluation.
 *
 * Runs entirely here — never in a component — and always returns a
 * human-readable explanation, because a passenger and a ministry both need to
 * see *why* a number is what it is.
 */

function resolveFarePolicy(db: DamovDatabase, routeId: UUID, serviceDate: string) {
  const candidates = db.fare_policies.filter(
    (p) =>
      p.status === 'published' &&
      p.effective_from <= serviceDate &&
      (!p.effective_to || p.effective_to >= serviceDate) &&
      (p.route_id === routeId || p.route_id === null),
  )
  // A route-specific policy always wins over the network default.
  return candidates.sort((a, b) => (b.route_id ? 1 : 0) - (a.route_id ? 1 : 0))[0] ?? null
}

function grossFareFor(policy: ReturnType<typeof resolveFarePolicy>, distanceKm: number, segmentCount: number): Naira {
  if (!policy) throw new DomainError('no_fare_policy', 'No published fare policy covers this journey.')
  switch (policy.calculation_type) {
    case 'flat':
      return policy.flat_amount ?? 0
    case 'distance': {
      const raw = Math.round((policy.per_km_amount ?? 0) * distanceKm)
      return Math.max(policy.minimum_amount ?? 0, Math.round(raw / 50) * 50)
    }
    case 'segment': {
      const raw = (policy.flat_amount ?? 0) * segmentCount
      return Math.max(policy.minimum_amount ?? 0, raw)
    }
    case 'origin_destination':
    default: {
      const raw = Math.round((policy.per_km_amount ?? 0) * distanceKm)
      return Math.max(policy.minimum_amount ?? policy.flat_amount ?? 0, Math.round(raw / 50) * 50)
    }
  }
}

function withinTimeBands(policy: SubsidyPolicy, departureLagosTime: string) {
  if (!policy.time_bands?.length) return true
  return policy.time_bands.some((band) => departureLagosTime >= band.start && departureLagosTime <= band.end)
}

function tripsTakenBy(db: DamovDatabase, riderId: UUID, policyId: UUID, sinceIso: string) {
  return db.bookings.filter(
    (b) =>
      b.rider_id === riderId &&
      b.subsidy_policy_snapshot?.id === policyId &&
      b.created_at >= sinceIso &&
      !['cancelled', 'expired', 'refunded'].includes(b.status),
  ).length
}

export interface QuoteInput {
  trip_id: UUID
  origin_route_stop_id: UUID
  destination_route_stop_id: UUID
  rider_id: UUID
}

export function quoteBooking(input: QuoteInput): Result<FareQuote> {
  return guard(() => quoteBookingUnsafe(store.read(), input))
}

/** Callable inside a transaction so booking prices against the same snapshot it reserves on. */
export function quoteBookingUnsafe(db: DamovDatabase, input: QuoteInput): FareQuote {
  const { trip, origin, destination, inventory } = segmentsForJourney(
    db,
    input.trip_id,
    input.origin_route_stop_id,
    input.destination_route_stop_id,
  )
  const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)
  if (!direction) throw new DomainError('direction_not_found', 'Route direction not found.')

  const distanceKm = Math.max(0.5, destination.distance_from_start_km - origin.distance_from_start_km)
  const farePolicy = resolveFarePolicy(db, direction.route_id, trip.service_date)
  const gross = grossFareFor(farePolicy, distanceKm, inventory.length)

  const base = {
    gross_fare: gross,
    fare_policy: { id: farePolicy!.id, name: farePolicy!.name, version: farePolicy!.version },
    distance_km: Math.round(distanceKm * 10) / 10,
  }

  const rider = db.rider_profiles.find((r) => r.profile_id === input.rider_id)
  const notSponsored = (explanation: string): FareQuote => ({
    ...base,
    passenger_contribution: gross,
    sponsor_contribution: 0,
    sponsor_id: null,
    sponsor_name: null,
    subsidy_policy: null,
    eligible: false,
    explanation,
  })

  if (!rider?.organization_id) return notSponsored('Standard fare — no sponsoring organisation on this profile.')
  if (rider.eligibility_state !== 'verified')
    return notSponsored(`Standard fare — institutional eligibility is ${rider.eligibility_state.replace('_', ' ')}.`)

  const org = db.organizations.find((o) => o.id === rider.organization_id)
  const serviceDate = trip.service_date
  const departure = isoDateOf(trip.scheduled_departure_at)
  const departureTime = new Date(trip.scheduled_departure_at).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  })
  const dayOfWeek = new Date(`${departure}T12:00:00Z`).getUTCDay()

  const policy = db.subsidy_policies.find(
    (p) =>
      p.organization_id === rider.organization_id &&
      p.status === 'published' &&
      p.valid_from <= serviceDate &&
      (!p.valid_to || p.valid_to >= serviceDate),
  )
  if (!policy) return notSponsored(`Standard fare — ${org?.short_name ?? 'the organisation'} has no active programme.`)

  const reject = (reason: string): FareQuote => ({
    ...base,
    passenger_contribution: gross,
    sponsor_contribution: 0,
    sponsor_id: null,
    sponsor_name: org?.short_name ?? null,
    subsidy_policy: { id: policy.id, name: policy.name, version: policy.version },
    eligible: false,
    explanation: `Not eligible: ${reason}`,
  })

  if (policy.route_ids?.length && !policy.route_ids.includes(direction.route_id))
    return reject('this route is not in the sponsored programme.')
  if (policy.direction_codes?.length && !policy.direction_codes.includes(direction.direction_code))
    return reject(`the ${direction.direction_code} direction is not sponsored.`)
  if (policy.days_of_week?.length && !policy.days_of_week.includes(dayOfWeek))
    return reject('travel day is outside the programme calendar.')
  if (!withinTimeBands(policy, departureTime)) return reject('departure is outside programme hours.')

  if (policy.max_trips_per_day) {
    const since = `${serviceDate}T00:00:00.000Z`
    if (tripsTakenBy(db, input.rider_id, policy.id, since) >= policy.max_trips_per_day)
      return reject('daily sponsored-trip limit reached.')
  }
  if (policy.max_trips_per_month) {
    const since = `${serviceDate.slice(0, 7)}-01T00:00:00.000Z`
    if (tripsTakenBy(db, input.rider_id, policy.id, since) >= policy.max_trips_per_month)
      return reject('monthly sponsored-trip limit reached.')
  }

  let subsidy =
    policy.subsidy_type === 'fixed'
      ? (policy.fixed_amount ?? 0)
      : Math.round((gross * (policy.percentage ?? 0)) / 100)
  if (policy.max_subsidy_per_trip) subsidy = Math.min(subsidy, policy.max_subsidy_per_trip)
  subsidy = Math.min(subsidy, gross)

  if (policy.programme_budget !== null && policy.budget_consumed + subsidy > policy.programme_budget)
    return reject('the programme budget ceiling has been reached for this period.')

  return {
    ...base,
    passenger_contribution: gross - subsidy,
    sponsor_contribution: subsidy,
    sponsor_id: policy.organization_id,
    sponsor_name: org?.short_name ?? null,
    subsidy_policy: { id: policy.id, name: policy.name, version: policy.version },
    eligible: true,
    explanation: `Eligible: ${org?.short_name ?? 'Sponsor'} covers ${naira(subsidy)}; passenger pays ${naira(gross - subsidy)}.`,
  }
}
