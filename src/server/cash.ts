import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import { naira } from '@/lib/format'
import type { CashSession, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { getConfigNumber } from './configuration'
import { DomainError, guard, type Result } from './result'

/**
 * Cash reconciliation.
 *
 * Cash collection can be manual; the passenger movement record never is. Every
 * cash ticket is attached to an open session, expected cash is computed from
 * those transactions rather than typed in, and a session cannot close silently:
 * a variance needs an explanation and, past tolerance, a supervisor decision.
 */

export function openCashSession(
  input: { hub_id: UUID; agent_id: UUID; opening_float: number },
  actor: { id: UUID | null; name: string },
): Result<CashSession> {
  return guard(() =>
    store.transact((draft) => {
      const already = draft.cash_sessions.find((s) => s.agent_id === input.agent_id && s.status === 'open')
      if (already) throw new DomainError('session_already_open', 'You already have an open cash session.')
      if (input.opening_float < 0) throw new DomainError('invalid_float', 'Opening float cannot be negative.')

      const session: CashSession = {
        id: uuid(),
        hub_id: input.hub_id,
        agent_id: input.agent_id,
        opened_at: new Date().toISOString(),
        closed_at: null,
        opening_float: input.opening_float,
        expected_cash: 0,
        declared_cash: null,
        variance: null,
        variance_explanation: null,
        status: 'open',
        supervisor_id: null,
        reviewed_at: null,
        supervisor_note: null,
      }
      draft.cash_sessions = [session, ...draft.cash_sessions]
      draft.cash_transactions = [
        {
          id: uuid(), cash_session_id: session.id, booking_id: null, payment_id: null,
          amount: input.opening_float, type: 'float_in', occurred_at: session.opened_at, reversal_of: null,
        },
        ...draft.cash_transactions,
      ]
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'cash_session.opened',
        entity_type: 'cash_session', entity_id: session.id,
        summary: `Cash session opened with ${naira(input.opening_float)} float.`,
      })
      return session
    }),
  )
}

export function closeCashSession(
  input: { session_id: UUID; declared_cash: number; explanation: string },
  actor: { id: UUID | null; name: string },
): Result<CashSession> {
  return guard(() =>
    store.transact((draft) => {
      const session = draft.cash_sessions.find((s) => s.id === input.session_id)
      if (!session) throw new DomainError('session_not_found', 'Cash session not found.')
      if (session.status !== 'open' && session.status !== 'returned')
        throw new DomainError('session_not_open', 'This session is no longer open.')
      if (input.declared_cash < 0) throw new DomainError('invalid_amount', 'Declared cash cannot be negative.')

      const expected = session.opening_float + session.expected_cash
      const variance = input.declared_cash - expected
      const tolerance = getConfigNumber(draft, 'cash.variance_tolerance_naira', 500)

      if (variance !== 0 && !input.explanation.trim())
        throw new DomainError(
          'explanation_required',
          `A variance of ${naira(variance)} requires a written explanation before this session can close.`,
        )

      const needsReview = Math.abs(variance) > tolerance
      const now = new Date().toISOString()
      const updated: CashSession = {
        ...session,
        closed_at: now,
        declared_cash: input.declared_cash,
        variance,
        variance_explanation: input.explanation.trim() || null,
        status: needsReview ? 'under_review' : 'submitted',
      }
      draft.cash_sessions = draft.cash_sessions.map((s) => (s.id === session.id ? updated : s))

      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'cash_session.closed',
        entity_type: 'cash_session',
        entity_id: session.id,
        summary: `Declared ${naira(input.declared_cash)} against ${naira(expected)} expected — variance ${naira(variance)}${needsReview ? ' (above tolerance, escalated)' : ''}.`,
        severity: variance === 0 ? 'info' : 'sensitive',
      })
      return updated
    }),
  )
}

export function reviewCashVariance(
  input: { session_id: UUID; decision: 'approved' | 'rejected' | 'returned'; note: string },
  actor: { id: UUID | null; name: string },
): Result<CashSession> {
  return guard(() =>
    store.transact((draft) => {
      const session = draft.cash_sessions.find((s) => s.id === input.session_id)
      if (!session) throw new DomainError('session_not_found', 'Cash session not found.')
      if (!['submitted', 'under_review'].includes(session.status))
        throw new DomainError('not_reviewable', 'Only a submitted session can be reviewed.')
      if (input.decision !== 'approved' && !input.note.trim())
        throw new DomainError('note_required', 'A rejection or return requires a supervisor note.')

      const updated: CashSession = {
        ...session,
        status: input.decision,
        supervisor_id: actor.id,
        reviewed_at: new Date().toISOString(),
        supervisor_note: input.note.trim() || null,
      }
      draft.cash_sessions = draft.cash_sessions.map((s) => (s.id === session.id ? updated : s))
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: `cash_session.${input.decision}`,
        entity_type: 'cash_session', entity_id: session.id,
        summary: `Session ${input.decision} by supervisor — variance ${naira(session.variance ?? 0)}. ${input.note}`.trim(),
        severity: 'sensitive',
      })
      return updated
    }),
  )
}
