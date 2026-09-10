import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import { naira } from '@/lib/format'
import type { CostCategory, CostEntry, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

export function createCostEntry(
  input: { service_date: string; trip_id: UUID | null; vehicle_id: UUID | null; route_id: UUID | null; category: CostCategory; amount: number; quantity: number | null; unit: string | null; approve: boolean },
  actor: { id: UUID | null; name: string },
): Result<CostEntry> {
  return guard(() =>
    store.transact((draft) => {
      if (!(input.amount > 0)) throw new DomainError('invalid_amount', 'Amount must be greater than zero.')
      if (input.trip_id) {
        const trip = draft.trips.find((t) => t.id === input.trip_id)
        if (!trip) throw new DomainError('trip_not_found', 'Trip not found.')
      }
      const entry: CostEntry = {
        id: uuid(), service_date: input.service_date, trip_id: input.trip_id, vehicle_id: input.vehicle_id, route_id: input.route_id,
        category: input.category, amount: Math.round(input.amount), quantity: input.quantity, unit: input.unit, evidence_url: null,
        source: 'manual', approval_status: input.approve ? 'approved' : 'submitted', created_by: actor.id, created_at: new Date().toISOString(),
      }
      draft.cost_entries = [entry, ...draft.cost_entries]
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'cost.entered', entity_type: 'cost_entry', entity_id: entry.id, summary: `${naira(entry.amount)} ${entry.category.replace('_', ' ')} on ${entry.service_date}${entry.approval_status === 'approved' ? ' (approved)' : ''}`, severity: 'sensitive' })
      return entry
    }),
  )
}

export function setCostApproval(
  input: { cost_entry_id: UUID; status: CostEntry['approval_status'] },
  actor: { id: UUID | null; name: string },
): Result<CostEntry> {
  return guard(() =>
    store.transact((draft) => {
      const entry = draft.cost_entries.find((c) => c.id === input.cost_entry_id)
      if (!entry) throw new DomainError('cost_not_found', 'Cost entry not found.')
      const updated = { ...entry, approval_status: input.status }
      draft.cost_entries = draft.cost_entries.map((c) => (c.id === entry.id ? updated : c))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: `cost.${input.status}`, entity_type: 'cost_entry', entity_id: entry.id, summary: `${naira(entry.amount)} ${entry.category} ${input.status}`, severity: 'sensitive' })
      return updated
    }),
  )
}
