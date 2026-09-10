import { store } from '@/db/store'
import type { DamovDatabase } from '@/db/schema'
import { tripCode, uuid } from '@/lib/ids'
import { lagosTime } from '@/lib/format'
import type { Trip, TripEvent, TripEventType, UUID, VehicleInspectionItem } from '@/lib/types'
import { writeAudit } from './audit'
import { queueNotification } from './notifications'
import { DomainError, guard, type Result } from './result'
import { getConfigNumber } from './configuration'

/** Legal state machine for a trip. Anything not listed here is refused. */
const TRIP_TRANSITIONS: Record<Trip['status'], Trip['status'][]> = {
  scheduled: ['assigned', 'cancelled', 'held'],
  assigned: ['boarding', 'scheduled', 'cancelled', 'held'],
  boarding: ['departed', 'cancelled', 'held'],
  departed: ['in_service', 'completed', 'cancelled'],
  in_service: ['completed', 'cancelled'],
  held: ['assigned', 'boarding', 'cancelled'],
  completed: [],
  cancelled: [],
}

function assertTransition(from: Trip['status'], to: Trip['status']) {
  if (!TRIP_TRANSITIONS[from].includes(to))
    throw new DomainError('invalid_transition', `A ${from} trip cannot become ${to}.`)
}

export function recordTripEvent(
  draft: DamovDatabase,
  input: { trip_id: UUID; type: TripEventType; stop_id?: UUID | null; actor_id: UUID | null; metadata?: Record<string, unknown> },
): TripEvent {
  const event: TripEvent = {
    id: uuid(),
    trip_id: input.trip_id,
    type: input.type,
    stop_id: input.stop_id ?? null,
    actor_id: input.actor_id,
    occurred_at: new Date().toISOString(),
    metadata: input.metadata ?? {},
  }
  draft.trip_events = [event, ...draft.trip_events]
  return event
}

export function assignTripVehicleDriver(
  input: { trip_id: UUID; vehicle_id: UUID; driver_id: UUID; override_reason?: string },
  actor: { id: UUID | null; name: string },
): Result<Trip> {
  return guard(() =>
    store.transact((draft) => {
      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      if (['completed', 'cancelled'].includes(trip.status))
        throw new DomainError('trip_closed', `A ${trip.status} trip cannot be assigned.`)

      const vehicle = draft.vehicles.find((v) => v.id === input.vehicle_id)
      if (!vehicle) throw new DomainError('vehicle_not_found', 'Vehicle not found.')
      if (['maintenance', 'out_of_service'].includes(vehicle.status))
        throw new DomainError('vehicle_unavailable', `${vehicle.fleet_number} is ${vehicle.status.replace('_', ' ')} and cannot be assigned.`)

      const clash = draft.trips.find(
        (t) =>
          t.id !== trip.id &&
          t.vehicle_id === input.vehicle_id &&
          !['completed', 'cancelled'].includes(t.status) &&
          Math.abs(new Date(t.scheduled_departure_at).getTime() - new Date(trip.scheduled_departure_at).getTime()) <
            45 * 60_000,
      )
      if (clash)
        throw new DomainError('vehicle_clash', `${vehicle.fleet_number} is already on ${clash.trip_code} at ${lagosTime(clash.scheduled_departure_at)}.`)

      const driver = draft.driver_profiles.find((d) => d.profile_id === input.driver_id)
      if (!driver) throw new DomainError('driver_not_found', 'Driver not found.')
      if (!driver.active || driver.approval_state === 'suspended')
        throw new DomainError('driver_unavailable', 'This driver is not active.')
      const licenceExpired = driver.licence_expiry < trip.service_date
      if (licenceExpired && !input.override_reason)
        throw new DomainError(
          'licence_expired',
          `Licence ${driver.licence_number} expired on ${driver.licence_expiry}. A policy exception with a written reason is required.`,
        )

      const type = draft.vehicle_types.find((vt) => vt.id === vehicle.vehicle_type_id)!
      const updated: Trip = {
        ...trip,
        vehicle_id: input.vehicle_id,
        driver_id: input.driver_id,
        status: trip.status === 'scheduled' ? 'assigned' : trip.status,
        legal_capacity_snapshot: type.legal_capacity,
        bookable_capacity_snapshot: Math.min(trip.bookable_capacity_snapshot, type.default_bookable_capacity),
      }
      draft.trips = draft.trips.map((t) => (t.id === trip.id ? updated : t))
      draft.vehicles = draft.vehicles.map((v) => (v.id === vehicle.id ? { ...v, status: 'assigned' } : v))
      recordTripEvent(draft, {
        trip_id: trip.id, type: 'assigned', actor_id: actor.id,
        metadata: { vehicle: vehicle.fleet_number, driver: input.driver_id, override: input.override_reason ?? null },
      })

      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: input.override_reason ? 'trip.assigned_with_override' : 'trip.assigned',
        entity_type: 'trip',
        entity_id: trip.id,
        summary: `${trip.trip_code} → ${vehicle.fleet_number}${input.override_reason ? ` (override: ${input.override_reason})` : ''}`,
        severity: input.override_reason ? 'sensitive' : 'info',
      })
      return updated
    }),
  )
}

export function submitVehicleInspection(
  input: { vehicle_id: UUID; driver_id: UUID; trip_id: UUID | null; checklist: VehicleInspectionItem[]; defects: string; odometer_km: number },
  actor: { id: UUID | null; name: string },
): Result<{ passed: boolean }> {
  return guard(() =>
    store.transact((draft) => {
      const passed = input.checklist.every((item) => item.passed)
      const now = new Date().toISOString()
      draft.vehicle_inspections = [
        {
          id: uuid(), vehicle_id: input.vehicle_id, driver_id: input.driver_id, trip_id: input.trip_id,
          checklist: input.checklist, passed, defects: input.defects.trim() || null,
          odometer_km: input.odometer_km, submitted_at: now,
          supervisor_decision: passed ? 'not_required' : 'pending', supervisor_id: null,
        },
        ...draft.vehicle_inspections,
      ]
      draft.vehicles = draft.vehicles.map((v) =>
        v.id === input.vehicle_id ? { ...v, odometer_km: Math.max(v.odometer_km, input.odometer_km) } : v,
      )
      if (input.trip_id && passed) recordTripEvent(draft, { trip_id: input.trip_id, type: 'inspection_passed', actor_id: actor.id })
      if (!passed) {
        writeAudit(draft, {
          actor_id: actor.id, actor_name: actor.name, action: 'inspection.failed',
          entity_type: 'vehicle', entity_id: input.vehicle_id,
          summary: `Pre-trip inspection failed — ${input.checklist.filter((i) => !i.passed).map((i) => i.label).join(', ')}`,
          severity: 'sensitive',
        })
      }
      return { passed }
    }),
  )
}

export function startTrip(
  input: { trip_id: UUID; override_reason?: string },
  actor: { id: UUID | null; name: string },
): Result<Trip> {
  return guard(() =>
    store.transact((draft) => {
      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      if (!trip.vehicle_id || !trip.driver_id)
        throw new DomainError('not_assigned', 'A vehicle and driver must be assigned before departure.')

      const inspection = draft.vehicle_inspections.find(
        (i) => i.vehicle_id === trip.vehicle_id && i.submitted_at >= `${trip.service_date}T00:00:00.000Z`,
      )
      if ((!inspection || !inspection.passed) && !input.override_reason)
        throw new DomainError(
          'inspection_required',
          'A passed pre-trip inspection is required before this trip can start. A supervisor override must be recorded.',
        )

      assertTransition(trip.status, 'departed')
      const now = new Date().toISOString()
      const firstStop = draft.route_stops
        .filter((rs) => rs.route_direction_id === trip.route_direction_id)
        .sort((a, b) => a.sequence - b.sequence)[0]

      const updated: Trip = { ...trip, status: 'departed', actual_departure_at: now, current_route_stop_id: firstStop?.id ?? null }
      draft.trips = draft.trips.map((t) => (t.id === trip.id ? updated : t))
      draft.vehicles = draft.vehicles.map((v) => (v.id === trip.vehicle_id ? { ...v, status: 'operating' } : v))
      recordTripEvent(draft, { trip_id: trip.id, type: 'departed', actor_id: actor.id, metadata: { override: input.override_reason ?? null } })

      const tolerance = getConfigNumber(draft, 'service.on_time_tolerance_minutes', 5)
      const lateBy = Math.round((Date.now() - new Date(trip.scheduled_departure_at).getTime()) / 60_000)
      if (lateBy > tolerance) {
        recordTripEvent(draft, { trip_id: trip.id, type: 'delayed', actor_id: actor.id, metadata: { minutes: lateBy } })
        for (const booking of draft.bookings.filter((b) => b.trip_id === trip.id && b.status !== 'cancelled')) {
          queueNotification(draft, {
            recipient_id: booking.rider_id, booking_id: booking.id, trip_id: trip.id,
            channel: 'in_app', template: 'trip_delayed',
            title: `${trip.trip_code} departed ${lateBy} minutes late`,
            body: `Your ${lagosTime(trip.scheduled_departure_at)} departure left at ${lagosTime(now)}.`,
            payload: { minutes: lateBy },
          })
        }
      }

      if (input.override_reason) {
        writeAudit(draft, {
          actor_id: actor.id, actor_name: actor.name, action: 'trip.started_with_override',
          entity_type: 'trip', entity_id: trip.id,
          summary: `${trip.trip_code} started without a passed inspection — ${input.override_reason}`,
          severity: 'sensitive',
        })
      }
      return updated
    }),
  )
}

export function advanceTripToStop(
  input: { trip_id: UUID; route_stop_id: UUID },
  actor: { id: UUID | null; name: string },
): Result<Trip> {
  return guard(() =>
    store.transact((draft) => {
      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      if (!['departed', 'in_service'].includes(trip.status))
        throw new DomainError('not_in_service', 'Only a departed trip can advance through stops.')

      const routeStop = draft.route_stops.find((rs) => rs.id === input.route_stop_id)
      if (!routeStop) throw new DomainError('stop_not_found', 'Stop not found on this direction.')

      const updated: Trip = { ...trip, status: 'in_service', current_route_stop_id: input.route_stop_id }
      draft.trips = draft.trips.map((t) => (t.id === trip.id ? updated : t))
      recordTripEvent(draft, { trip_id: trip.id, type: 'stop_arrived', stop_id: routeStop.stop_id, actor_id: actor.id })
      return updated
    }),
  )
}

export function completeTrip(
  input: { trip_id: UUID; final_passenger_count: number; odometer_km: number; notes: string },
  actor: { id: UUID | null; name: string },
): Result<Trip> {
  return guard(() =>
    store.transact((draft) => {
      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      assertTransition(trip.status, 'completed')

      const now = new Date().toISOString()
      const updated: Trip = { ...trip, status: 'completed', actual_arrival_at: now }
      draft.trips = draft.trips.map((t) => (t.id === trip.id ? updated : t))
      draft.vehicles = draft.vehicles.map((v) =>
        v.id === trip.vehicle_id ? { ...v, status: 'available', odometer_km: Math.max(v.odometer_km, input.odometer_km) } : v,
      )
      draft.bookings = draft.bookings.map((b) =>
        b.trip_id === trip.id && b.status === 'boarded'
          ? { ...b, status: 'completed' }
          : b.trip_id === trip.id && b.status === 'confirmed'
            ? { ...b, status: 'no_show' }
            : b,
      )
      recordTripEvent(draft, {
        trip_id: trip.id, type: 'completed', actor_id: actor.id,
        metadata: { final_passenger_count: input.final_passenger_count, odometer_km: input.odometer_km, notes: input.notes },
      })
      return updated
    }),
  )
}

export function changeTripStatus(
  input: { trip_id: UUID; status: Trip['status']; reason: string },
  actor: { id: UUID | null; name: string },
): Result<Trip> {
  return guard(() =>
    store.transact((draft) => {
      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      assertTransition(trip.status, input.status)
      if ((input.status === 'cancelled' || input.status === 'held') && !input.reason.trim())
        throw new DomainError('reason_required', `A ${input.status} action requires a reason.`)

      const updated: Trip = {
        ...trip,
        status: input.status,
        cancellation_reason: input.status === 'cancelled' ? input.reason : trip.cancellation_reason,
      }
      draft.trips = draft.trips.map((t) => (t.id === trip.id ? updated : t))
      recordTripEvent(draft, {
        trip_id: trip.id,
        type: input.status === 'cancelled' ? 'cancelled' : input.status === 'held' ? 'held' : 'boarding_opened',
        actor_id: actor.id,
        metadata: { reason: input.reason },
      })

      if (input.status === 'cancelled') {
        if (trip.vehicle_id)
          draft.vehicles = draft.vehicles.map((v) => (v.id === trip.vehicle_id ? { ...v, status: 'available' } : v))
        for (const booking of draft.bookings.filter((b) => b.trip_id === trip.id && ['confirmed', 'held'].includes(b.status))) {
          queueNotification(draft, {
            recipient_id: booking.rider_id, booking_id: booking.id, trip_id: trip.id,
            channel: 'in_app', template: 'trip_cancelled',
            title: `${trip.trip_code} cancelled`,
            body: `${input.reason} — your fare will be reversed.`,
            payload: {},
          })
        }
        writeAudit(draft, {
          actor_id: actor.id, actor_name: actor.name, action: 'trip.cancelled',
          entity_type: 'trip', entity_id: trip.id,
          summary: `${trip.trip_code} cancelled — ${input.reason}`, severity: 'sensitive',
        })
      }
      if (input.status === 'boarding') {
        for (const booking of draft.bookings.filter((b) => b.trip_id === trip.id && b.status === 'confirmed')) {
          queueNotification(draft, {
            recipient_id: booking.rider_id, booking_id: booking.id, trip_id: trip.id,
            channel: 'in_app', template: 'boarding_opened',
            title: `Boarding open · ${trip.trip_code}`,
            body: `Please proceed to your boarding point for the ${lagosTime(trip.scheduled_departure_at)} departure.`,
            payload: {},
          })
        }
      }
      return updated
    }),
  )
}

export interface GenerateTripsInput {
  schedule_template_id: UUID
  service_date: string
}

/** Materialises trips and their per-segment inventory from a schedule template. */
export function generateTripsFromSchedule(
  input: GenerateTripsInput,
  actor: { id: UUID | null; name: string },
): Result<{ created: number; skipped: number }> {
  return guard(() =>
    store.transact((draft) => {
      const template = draft.schedule_templates.find((s) => s.id === input.schedule_template_id)
      if (!template) throw new DomainError('template_not_found', 'Schedule template not found.')
      if (!template.active) throw new DomainError('template_inactive', 'This schedule template is not active.')

      const calendar = draft.service_calendars.find((c) => c.id === template.service_calendar_id)
      if (!calendar) throw new DomainError('calendar_not_found', 'Service calendar not found.')
      const dow = new Date(`${input.service_date}T12:00:00Z`).getUTCDay()
      const runsToday =
        (calendar.days_of_week.includes(dow) && !calendar.excluded_dates.includes(input.service_date)) ||
        calendar.added_dates.includes(input.service_date)
      if (!runsToday) throw new DomainError('no_service', 'This calendar does not run on the selected date.')

      const direction = draft.route_directions.find((d) => d.id === template.route_direction_id)
      if (!direction) throw new DomainError('direction_not_found', 'Route direction not found.')
      const route = draft.routes.find((r) => r.id === direction.route_id)!
      if (route.status !== 'published')
        throw new DomainError('route_not_published', 'Trips can only be generated for a published route.')

      const result = materialiseTrips(draft, template.id, input.service_date)
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'trips.generated',
        entity_type: 'schedule_template', entity_id: template.id,
        summary: `${result.created} trips generated for ${route.code} on ${input.service_date} (${result.skipped} already existed).`,
      })
      return result
    }),
  )
}

/** Shared by the seed and the generation endpoint so both build identical trips. */
export function materialiseTrips(draft: DamovDatabase, templateId: UUID, serviceDate: string) {
  const template = draft.schedule_templates.find((s) => s.id === templateId)!
  const direction = draft.route_directions.find((d) => d.id === template.route_direction_id)!
  const route = draft.routes.find((r) => r.id === direction.route_id)!
  const vehicleType = draft.vehicle_types.find((vt) => vt.id === template.default_vehicle_type_id)!
  const routeStops = draft.route_stops
    .filter((rs) => rs.route_direction_id === direction.id)
    .sort((a, b) => a.sequence - b.sequence)
  const segments = draft.route_segments
    .filter((seg) => seg.route_direction_id === direction.id)
    .sort((a, b) => a.sequence - b.sequence)
  const lastStop = routeStops[routeStops.length - 1]

  const times =
    template.explicit_departure_times ??
    (() => {
      const out: string[] = []
      const [sh, sm] = template.start_time.split(':').map(Number)
      const [eh, em] = template.end_time.split(':').map(Number)
      const headway = template.headway_minutes ?? 30
      for (let m = sh * 60 + sm; m <= eh * 60 + em; m += headway) {
        out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
      }
      return out
    })()

  let created = 0
  let skipped = 0
  times.forEach((time, index) => {
    // Africa/Lagos is UTC+1 year-round, so the wall clock maps directly to UTC.
    const departureUtc = new Date(`${serviceDate}T${time}:00.000+01:00`).toISOString()
    const exists = draft.trips.find(
      (t) => t.route_direction_id === direction.id && t.scheduled_departure_at === departureUtc,
    )
    if (exists) {
      skipped++
      return
    }
    const tripId = uuid()
    const arrival = new Date(
      new Date(departureUtc).getTime() + (lastStop?.scheduled_offset_minutes ?? 60) * 60_000,
    ).toISOString()

    draft.trips = [
      {
        id: tripId,
        trip_code: tripCode(route.code, serviceDate, index + 1),
        route_direction_id: direction.id,
        route_geometry_version_id: route.current_geometry_version_id,
        service_date: serviceDate,
        scheduled_departure_at: departureUtc,
        scheduled_arrival_at: arrival,
        actual_departure_at: null,
        actual_arrival_at: null,
        origin_hub_id: draft.stops.find((s) => s.id === routeStops[0]?.stop_id)?.hub_id ?? null,
        destination_hub_id: draft.stops.find((s) => s.id === lastStop?.stop_id)?.hub_id ?? null,
        vehicle_id: null,
        driver_id: null,
        status: 'scheduled',
        legal_capacity_snapshot: vehicleType.legal_capacity,
        bookable_capacity_snapshot: vehicleType.default_bookable_capacity,
        cancellation_reason: null,
        current_route_stop_id: null,
        created_at: new Date().toISOString(),
      },
      ...draft.trips,
    ]
    draft.trip_segment_inventory = [
      ...draft.trip_segment_inventory,
      ...segments.map((seg) => ({
        id: uuid(),
        trip_id: tripId,
        route_segment_id: seg.id,
        capacity: vehicleType.default_bookable_capacity,
        reserved_count: 0,
        boarded_adjustment: 0,
        version: 1,
      })),
    ]
    created++
  })

  return { created, skipped }
}
