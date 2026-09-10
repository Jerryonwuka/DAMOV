import { store } from '@/db/store'
import type { DamovDatabase } from '@/db/schema'
import { bookingReference, idempotencyKey, qrToken, ticketCode, uuid } from '@/lib/ids'
import { naira, lagosTime } from '@/lib/format'
import type {
  Booking, BookingChannel, Notification, Payment, PaymentMethod, SponsorAuthorization, Ticket, UUID,
} from '@/lib/types'
import { writeAudit } from './audit'
import { releaseSegments, reserveSegments } from './capacity'
import { quoteBookingUnsafe } from './fares'
import { DomainError, guard, type Result } from './result'
import { queueNotification } from './notifications'

export interface CreateBookingInput {
  trip_id: UUID
  rider_id: UUID
  origin_route_stop_id: UUID
  destination_route_stop_id: UUID
  channel: BookingChannel
  payment_method: PaymentMethod
  cash_session_id?: UUID | null
  actor: { id: UUID | null; name: string }
  idempotency_key?: string
  complimentary_reason?: string
}

export interface CreateBookingResult {
  booking: Booking
  ticket: Ticket
  payment: Payment | null
  sponsor_authorization: SponsorAuthorization | null
}

/**
 * The single write path for creating a booking.
 *
 * Everything below happens in one transaction: re-quote against the live
 * snapshot, reserve one seat on every required segment, create the booking,
 * record payment and sponsor liability, and issue the ticket. If any segment is
 * full the whole thing rolls back and no partial booking survives.
 */
export function createBookingAndReserveCapacity(input: CreateBookingInput): Result<CreateBookingResult> {
  return guard(() =>
    store.transact((draft) => {
      const key = input.idempotency_key ?? idempotencyKey('bk')
      const existing = draft.bookings.find((b) => b.idempotency_key === key)
      if (existing) {
        const ticket = draft.tickets.find((t) => t.booking_id === existing.id)!
        return {
          booking: existing,
          ticket,
          payment: draft.payments.find((p) => p.booking_id === existing.id) ?? null,
          sponsor_authorization: draft.sponsor_authorizations.find((s) => s.booking_id === existing.id) ?? null,
        }
      }

      const trip = draft.trips.find((t) => t.id === input.trip_id)
      if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      if (['cancelled', 'completed'].includes(trip.status))
        throw new DomainError('trip_closed', `This departure is ${trip.status} and cannot be booked.`)
      if (new Date(trip.scheduled_departure_at).getTime() < Date.now() - 15 * 60_000)
        throw new DomainError('departure_passed', 'This departure has already left.')

      const rider = draft.profiles.find((p) => p.id === input.rider_id)
      if (!rider) throw new DomainError('rider_not_found', 'Passenger record not found.')

      const quote = quoteBookingUnsafe(draft, {
        trip_id: input.trip_id,
        origin_route_stop_id: input.origin_route_stop_id,
        destination_route_stop_id: input.destination_route_stop_id,
        rider_id: input.rider_id,
      })

      if (input.payment_method === 'sponsor_only' && quote.passenger_contribution > 0)
        throw new DomainError(
          'sponsor_cannot_cover',
          `Sponsor cover is ${naira(quote.sponsor_contribution)} of ${naira(quote.gross_fare)}; ${naira(quote.passenger_contribution)} still needs a payment method.`,
        )
      if (input.payment_method === 'complimentary' && !input.complimentary_reason)
        throw new DomainError('reason_required', 'A complimentary ticket requires an authorised reason.')

      const heldSegmentIds = reserveSegments(
        draft,
        input.trip_id,
        input.origin_route_stop_id,
        input.destination_route_stop_id,
      )

      const now = new Date().toISOString()
      const booking: Booking = {
        id: uuid(),
        booking_reference: bookingReference(),
        rider_id: input.rider_id,
        trip_id: input.trip_id,
        origin_route_stop_id: input.origin_route_stop_id,
        destination_route_stop_id: input.destination_route_stop_id,
        booking_channel: input.channel,
        status: 'confirmed',
        gross_fare: quote.gross_fare,
        passenger_contribution: input.payment_method === 'complimentary' ? 0 : quote.passenger_contribution,
        sponsor_contribution: quote.sponsor_contribution,
        sponsor_id: quote.sponsor_id,
        fare_policy_snapshot: { ...quote.fare_policy, amount: quote.gross_fare },
        subsidy_policy_snapshot: quote.subsidy_policy
          ? { ...quote.subsidy_policy, explanation: quote.explanation }
          : null,
        currency: 'NGN',
        expires_at: null,
        idempotency_key: key,
        created_by: input.actor.id,
        created_at: now,
        cancelled_at: null,
        cancellation_reason: null,
      }
      draft.bookings = [booking, ...draft.bookings]
      draft.booking_segments = [
        ...draft.booking_segments,
        ...heldSegmentIds.map((id) => ({ id: uuid(), booking_id: booking.id, trip_segment_inventory_id: id })),
      ]

      let payment: Payment | null = null
      if (booking.passenger_contribution > 0) {
        payment = {
          id: uuid(),
          booking_id: booking.id,
          payer_type: 'passenger',
          method: input.payment_method,
          provider:
            input.payment_method === 'cash'
              ? 'cash_desk'
              : input.payment_method === 'complimentary'
                ? 'sponsor_ledger'
                : 'mock_provider',
          provider_reference: input.payment_method === 'cash' ? null : `MOCK-${key.slice(-8).toUpperCase()}`,
          amount: booking.passenger_contribution,
          currency: 'NGN',
          // Cash is only ever "succeeded" because an agent recorded it against an open session.
          status: 'succeeded',
          idempotency_key: `pay_${key}`,
          paid_at: now,
          cash_session_id: input.payment_method === 'cash' ? (input.cash_session_id ?? null) : null,
          created_at: now,
        }
        draft.payments = [payment, ...draft.payments]

        if (input.payment_method === 'cash') {
          if (!input.cash_session_id)
            throw new DomainError('no_cash_session', 'Cash sales require an open cash session.')
          const session = draft.cash_sessions.find((s) => s.id === input.cash_session_id)
          if (!session || session.status !== 'open')
            throw new DomainError('cash_session_closed', 'The cash session is not open.')
          draft.cash_transactions = [
            {
              id: uuid(),
              cash_session_id: session.id,
              booking_id: booking.id,
              payment_id: payment.id,
              amount: booking.passenger_contribution,
              type: 'ticket_sale',
              occurred_at: now,
              reversal_of: null,
            },
            ...draft.cash_transactions,
          ]
          draft.cash_sessions = draft.cash_sessions.map((s) =>
            s.id === session.id ? { ...s, expected_cash: s.expected_cash + booking.passenger_contribution } : s,
          )
        }
      }

      let sponsorAuth: SponsorAuthorization | null = null
      if (booking.sponsor_contribution > 0 && quote.subsidy_policy && quote.sponsor_id) {
        sponsorAuth = {
          id: uuid(),
          booking_id: booking.id,
          organization_id: quote.sponsor_id,
          subsidy_policy_id: quote.subsidy_policy.id,
          amount_reserved: booking.sponsor_contribution,
          amount_recognized: 0,
          status: 'reserved',
          recognized_at: null,
          created_at: now,
        }
        draft.sponsor_authorizations = [sponsorAuth, ...draft.sponsor_authorizations]
        // Liability is reserved at confirmation and recognised at boarding.
        draft.subsidy_policies = draft.subsidy_policies.map((p) =>
          p.id === quote.subsidy_policy!.id
            ? { ...p, budget_consumed: p.budget_consumed + booking.sponsor_contribution }
            : p,
        )
      }

      const ticket: Ticket = {
        id: uuid(),
        booking_id: booking.id,
        ticket_code: ticketCode(),
        qr_token: qrToken(),
        issued_at: now,
        status: 'issued',
      }
      draft.tickets = [ticket, ...draft.tickets]

      queueNotification(draft, {
        recipient_id: booking.rider_id,
        booking_id: booking.id,
        trip_id: trip.id,
        channel: 'in_app',
        template: 'booking_confirmed',
        title: `Booking confirmed · ${booking.booking_reference}`,
        body: `Your ${lagosTime(trip.scheduled_departure_at)} departure is confirmed. Ticket ${ticket.ticket_code}.`,
        payload: { ticket_code: ticket.ticket_code },
      })

      writeAudit(draft, {
        actor_id: input.actor.id,
        actor_name: input.actor.name,
        action: 'booking.created',
        entity_type: 'booking',
        entity_id: booking.id,
        summary: `${booking.booking_reference} · ${naira(booking.gross_fare)} gross, passenger ${naira(booking.passenger_contribution)}, sponsor ${naira(booking.sponsor_contribution)} · ${heldSegmentIds.length} segments reserved`,
        severity: booking.sponsor_contribution > 0 ? 'sensitive' : 'info',
      })

      return { booking, ticket, payment, sponsor_authorization: sponsorAuth }
    }),
  )
}

export function cancelBookingAndReleaseCapacity(
  bookingId: UUID,
  reason: string,
  actor: { id: UUID | null; name: string },
): Result<Booking> {
  return guard(() =>
    store.transact((draft) => {
      const booking = draft.bookings.find((b) => b.id === bookingId)
      if (!booking) throw new DomainError('booking_not_found', 'Booking not found.')
      if (['cancelled', 'refunded'].includes(booking.status))
        throw new DomainError('already_cancelled', 'This booking is already cancelled.')
      if (['boarded', 'completed'].includes(booking.status))
        throw new DomainError('already_travelled', 'A boarded passenger cannot be cancelled — raise a refund instead.')
      if (!reason.trim()) throw new DomainError('reason_required', 'A cancellation reason is required.')

      const released = releaseSegments(draft, bookingId)
      const now = new Date().toISOString()

      const updated: Booking = { ...booking, status: 'cancelled', cancelled_at: now, cancellation_reason: reason }
      draft.bookings = draft.bookings.map((b) => (b.id === bookingId ? updated : b))
      draft.tickets = draft.tickets.map((t) => (t.booking_id === bookingId ? { ...t, status: 'void' } : t))

      draft.payments = draft.payments.map((p) =>
        p.booking_id === bookingId && p.status === 'succeeded' ? { ...p, status: 'refunded' } : p,
      )
      const auth = draft.sponsor_authorizations.find((s) => s.booking_id === bookingId)
      if (auth && auth.status === 'reserved') {
        draft.sponsor_authorizations = draft.sponsor_authorizations.map((s) =>
          s.id === auth.id ? { ...s, status: 'released' } : s,
        )
        draft.subsidy_policies = draft.subsidy_policies.map((p) =>
          p.id === auth.subsidy_policy_id
            ? { ...p, budget_consumed: Math.max(0, p.budget_consumed - auth.amount_reserved) }
            : p,
        )
      }

      queueNotification(draft, {
        recipient_id: booking.rider_id,
        booking_id: booking.id,
        trip_id: booking.trip_id,
        channel: 'in_app',
        template: 'trip_cancelled',
        title: `Booking cancelled · ${booking.booking_reference}`,
        body: reason,
        payload: {},
      })

      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'booking.cancelled',
        entity_type: 'booking',
        entity_id: booking.id,
        summary: `${booking.booking_reference} cancelled — ${reason}. ${released} segment reservations released.`,
        severity: 'sensitive',
      })

      return updated
    }),
  )
}

/** Lightweight walk-in passenger record created at a hub counter. */
export function createWalkInPassenger(
  input: { full_name: string; phone: string; organization_id: UUID | null; staff_id: string | null },
  actor: { id: UUID | null; name: string },
): Result<{ profile_id: UUID }> {
  return guard(() =>
    store.transact((draft) => {
      const phone = input.phone.replace(/\s+/g, '')
      const existing = draft.profiles.find((p) => p.phone.replace(/\s+/g, '') === phone)
      if (existing) return { profile_id: existing.id }

      const now = new Date().toISOString()
      const id = uuid()
      draft.profiles = [
        {
          id,
          full_name: input.full_name.trim(),
          phone,
          email: null,
          avatar_url: null,
          status: 'active',
          default_role: 'rider',
          organization_id: input.organization_id,
          employment_id: null,
          last_login_at: null,
          mfa_enrolled: false,
          created_at: now,
          updated_at: now,
        },
        ...draft.profiles,
      ]
      draft.user_roles = [
        { id: uuid(), user_id: id, role: 'rider', organization_id: input.organization_id, hub_id: null, active: true, created_at: now },
        ...draft.user_roles,
      ]

      // A walk-in registered at a counter is agent-verified only if a staff id was checked.
      const eligibility = draft.eligibility_records.find(
        (e) => e.organization_id === input.organization_id && e.staff_id === input.staff_id && e.status === 'active',
      )
      draft.rider_profiles = [
        {
          id: uuid(),
          profile_id: id,
          organization_id: input.organization_id,
          staff_id: input.staff_id,
          eligibility_state: eligibility ? 'verified' : input.staff_id ? 'pending' : 'unverified',
          verification_method: eligibility ? 'agent_verified' : 'self_declared',
          emergency_contact_name: null,
          emergency_contact_phone: null,
          created_at: now,
        },
        ...draft.rider_profiles,
      ]

      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'passenger.walk_in_created',
        entity_type: 'profile',
        entity_id: id,
        summary: `Walk-in passenger ${input.full_name} registered at the counter.`,
      })
      return { profile_id: id }
    }),
  )
}

/** Expires unpaid holds so their capacity returns to the pool. */
export function expireStaleHolds(draft: DamovDatabase) {
  const now = Date.now()
  for (const booking of draft.bookings) {
    if (booking.status === 'held' && booking.expires_at && new Date(booking.expires_at).getTime() < now) {
      releaseSegments(draft, booking.id)
      draft.bookings = draft.bookings.map((b) => (b.id === booking.id ? { ...b, status: 'expired' } : b))
    }
  }
}

export type { Notification }
