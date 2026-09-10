import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import type { BoardingEvent, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'
import { getConfigNumber } from './configuration'

export interface ValidateBoardingInput {
  trip_id: UUID
  credential: string
  method: BoardingEvent['validation_method']
  stop_id: UUID | null
  device_id: string
  validator: { id: UUID | null; name: string }
  started_at: number
  override_reason?: string
}

export interface BoardingDecision {
  event: BoardingEvent
  passenger_name: string
  origin: string
  destination: string
  booking_reference: string
  sponsor_name: string | null
}

/**
 * Server-side boarding validation.
 *
 * The scanner sends an opaque token and gets back a decision. It never decides
 * anything itself: ticket state, trip match, origin stop, boarding window,
 * payment/subsidy status, cancellation and prior boarding are all checked here,
 * and every attempt — pass or fail — is written to `boarding_events`.
 */
export function validateBoarding(input: ValidateBoardingInput): Result<BoardingDecision> {
  return guard(() =>
    store.transact((draft) => {
      const now = new Date().toISOString()
      const duration = Math.max(1, Date.now() - input.started_at)
      const credential = input.credential.trim().toUpperCase()

      const reject = (reason: string): never => {
        const event: BoardingEvent = {
          id: uuid(), booking_id: null, ticket_id: null, trip_id: input.trip_id, stop_id: input.stop_id,
          boarded_at: now, validation_method: input.method, validator_user_id: input.validator.id,
          device_id: input.device_id, result: 'rejected', rejection_reason: reason, override_reason: null,
          duration_ms: duration, reversed_at: null, reversed_by: null, reversal_reason: null,
        }
        draft.boarding_events = [event, ...draft.boarding_events]
        throw new DomainError('boarding_rejected', reason)
      }

      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) reject('Trip not found.')
      if (trip!.status === 'cancelled') reject('This trip has been cancelled.')
      if (trip!.status === 'completed') reject('This trip has already completed.')

      // Resolve the credential to a ticket without ever revealing why it missed.
      const ticket =
        draft.tickets.find((t) => t.qr_token === input.credential.trim()) ??
        draft.tickets.find((t) => t.ticket_code.toUpperCase() === credential) ??
        (() => {
          const byRef = draft.bookings.find((b) => b.booking_reference.toUpperCase() === credential)
          if (byRef) return draft.tickets.find((t) => t.booking_id === byRef.id)
          const digits = credential.replace(/\D/g, '')
          if (digits.length >= 7) {
            const profile = draft.profiles.find((p) => p.phone.replace(/\D/g, '').endsWith(digits.slice(-9)))
            if (profile) {
              const booking = draft.bookings.find(
                (b) => b.rider_id === profile.id && b.trip_id === input.trip_id && b.status === 'confirmed',
              )
              if (booking) return draft.tickets.find((t) => t.booking_id === booking.id)
            }
          }
          const rider = draft.rider_profiles.find((r) => (r.staff_id ?? '').toUpperCase() === credential)
          if (rider) {
            const booking = draft.bookings.find(
              (b) => b.rider_id === rider.profile_id && b.trip_id === input.trip_id && b.status === 'confirmed',
            )
            if (booking) return draft.tickets.find((t) => t.booking_id === booking.id)
          }
          return undefined
        })()

      if (!ticket) reject('No valid ticket found for this credential on this departure.')
      if (ticket!.status === 'void') reject('This ticket has been cancelled.')
      if (ticket!.status === 'expired') reject('This ticket has expired.')

      const booking = draft.bookings.find((b) => b.id === ticket!.booking_id)
      if (!booking) reject('Ticket is not linked to a booking.')
      if (booking!.trip_id !== input.trip_id) reject('Ticket is for a different departure.')
      if (['cancelled', 'expired', 'refunded'].includes(booking!.status)) reject('This booking is no longer valid.')

      const priorBoarding = draft.boarding_events.find(
        (e) => e.booking_id === booking!.id && e.result !== 'rejected' && !e.reversed_at,
      )
      if (priorBoarding && !input.override_reason)
        reject('Already boarded. A supervisor must reverse the first scan before re-boarding.')

      // Payment must be settled, or the sponsor must cover the whole fare.
      const payment = draft.payments.find((p) => p.booking_id === booking!.id)
      const passengerOwes = booking!.passenger_contribution > 0
      if (passengerOwes && (!payment || payment.status !== 'succeeded')) reject('Payment is not confirmed for this ticket.')
      if (booking!.sponsor_contribution > 0) {
        const auth = draft.sponsor_authorizations.find((s) => s.booking_id === booking!.id)
        if (!auth || auth.status === 'rejected' || auth.status === 'released')
          reject('Sponsor authorisation is not valid for this ticket.')
      }

      // Boarding window: configurable minutes before/after the scheduled departure.
      const before = getConfigNumber(draft, 'boarding.window_open_minutes', 45)
      const after = getConfigNumber(draft, 'boarding.window_close_minutes', 5)
      const departure = new Date(trip!.scheduled_departure_at).getTime()
      const nowMs = Date.now()
      if (nowMs < departure - before * 60_000 && !input.override_reason)
        reject(`Boarding opens ${before} minutes before departure.`)
      if (nowMs > departure + after * 60_000 && !input.override_reason)
        reject(`Boarding closed ${after} minutes after the scheduled departure.`)

      const originStop = draft.route_stops.find((rs) => rs.id === booking!.origin_route_stop_id)
      if (input.stop_id && originStop && originStop.stop_id !== input.stop_id && !input.override_reason)
        reject('This ticket boards at a different stop.')

      if (input.override_reason && !input.override_reason.trim())
        throw new DomainError('reason_required', 'An override requires a written reason.')

      const event: BoardingEvent = {
        id: uuid(),
        booking_id: booking!.id,
        ticket_id: ticket!.id,
        trip_id: input.trip_id,
        stop_id: input.stop_id,
        boarded_at: now,
        validation_method: input.override_reason ? 'supervisor_override' : input.method,
        validator_user_id: input.validator.id,
        device_id: input.device_id,
        result: input.override_reason ? 'override' : 'valid',
        rejection_reason: null,
        override_reason: input.override_reason ?? null,
        duration_ms: duration,
        reversed_at: null,
        reversed_by: null,
        reversal_reason: null,
      }
      draft.boarding_events = [event, ...draft.boarding_events]
      draft.bookings = draft.bookings.map((b) => (b.id === booking!.id ? { ...b, status: 'boarded' } : b))
      draft.tickets = draft.tickets.map((t) => (t.id === ticket!.id ? { ...t, status: 'used' } : t))

      // Boarding is the recognition event for sponsor liability.
      const auth = draft.sponsor_authorizations.find((s) => s.booking_id === booking!.id)
      if (auth && auth.status === 'reserved') {
        draft.sponsor_authorizations = draft.sponsor_authorizations.map((s) =>
          s.id === auth.id
            ? { ...s, status: 'recognized', amount_recognized: s.amount_reserved, recognized_at: now }
            : s,
        )
      }

      if (input.override_reason) {
        writeAudit(draft, {
          actor_id: input.validator.id,
          actor_name: input.validator.name,
          action: 'boarding.override',
          entity_type: 'booking',
          entity_id: booking!.id,
          summary: `Supervisor override boarding ${booking!.booking_reference} — ${input.override_reason}`,
          severity: 'sensitive',
        })
      }

      const passenger = draft.profiles.find((p) => p.id === booking!.rider_id)
      const destinationStop = draft.route_stops.find((rs) => rs.id === booking!.destination_route_stop_id)
      const stopName = (id?: string) => draft.stops.find((s) => s.id === id)?.name ?? '—'

      return {
        event,
        passenger_name: passenger?.full_name ?? 'Passenger',
        origin: stopName(originStop?.stop_id),
        destination: stopName(destinationStop?.stop_id),
        booking_reference: booking!.booking_reference,
        sponsor_name: booking!.sponsor_id
          ? (draft.organizations.find((o) => o.id === booking!.sponsor_id)?.short_name ?? null)
          : null,
      }
    }),
  )
}

export function reverseBoardingEvent(
  eventId: UUID,
  reason: string,
  actor: { id: UUID | null; name: string },
): Result<BoardingEvent> {
  return guard(() =>
    store.transact((draft) => {
      const event = draft.boarding_events.find((e) => e.id === eventId)
      if (!event) throw new DomainError('event_not_found', 'Boarding event not found.')
      if (event.reversed_at) throw new DomainError('already_reversed', 'This boarding has already been reversed.')
      if (!reason.trim()) throw new DomainError('reason_required', 'A reversal reason is required.')

      const now = new Date().toISOString()
      const updated: BoardingEvent = { ...event, reversed_at: now, reversed_by: actor.id, reversal_reason: reason }
      draft.boarding_events = draft.boarding_events.map((e) => (e.id === eventId ? updated : e))
      if (event.booking_id) {
        draft.bookings = draft.bookings.map((b) => (b.id === event.booking_id ? { ...b, status: 'confirmed' } : b))
        draft.tickets = draft.tickets.map((t) =>
          t.booking_id === event.booking_id ? { ...t, status: 'issued' } : t,
        )
      }

      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'boarding.reversed',
        entity_type: 'boarding_event',
        entity_id: eventId,
        summary: `Boarding reversed — ${reason}`,
        severity: 'sensitive',
      })
      return updated
    }),
  )
}
