import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import type { EligibilityRecord, SubsidyPolicy, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

/** Eligibility import from a CSV of staff_id,full_name,phone. Matches existing riders by phone or staff ID. */
export function importEligibleRiders(
  input: { organization_id: UUID; rows: { staff_id: string; full_name: string; phone: string | null }[]; batch: string },
  actor: { id: UUID | null; name: string },
): Result<{ created: number; updated: number; matched: number }> {
  return guard(() =>
    store.transact((draft) => {
      let created = 0
      let updated = 0
      let matched = 0
      const now = new Date().toISOString()
      for (const row of input.rows) {
        const staffId = row.staff_id.trim()
        if (!staffId) continue
        const phone = row.phone?.replace(/\D/g, '') || null
        const rider = draft.rider_profiles.find((r) => r.organization_id === input.organization_id && r.staff_id === staffId)
          ?? (phone ? draft.rider_profiles.find((r) => draft.profiles.find((p) => p.id === r.profile_id)?.phone.replace(/\D/g, '') === phone) : undefined)
        const existing = draft.eligibility_records.find((e) => e.organization_id === input.organization_id && e.staff_id === staffId)
        if (existing) {
          draft.eligibility_records = draft.eligibility_records.map((e) => (e.id === existing.id ? { ...e, full_name: row.full_name.trim() || e.full_name, phone: phone ?? e.phone, status: 'active', import_batch: input.batch, verified_at: now, verified_by: actor.id, rider_id: rider?.profile_id ?? e.rider_id } : e))
          updated++
        } else {
          draft.eligibility_records = [...draft.eligibility_records, { id: uuid(), rider_id: rider?.profile_id ?? null, organization_id: input.organization_id, staff_id: staffId, full_name: row.full_name.trim(), phone, status: 'active', valid_from: now.slice(0, 10), valid_to: null, import_batch: input.batch, verified_at: now, verified_by: actor.id }]
          created++
        }
        if (rider) {
          matched++
          draft.rider_profiles = draft.rider_profiles.map((r) => (r.id === rider.id ? { ...r, organization_id: input.organization_id, staff_id: staffId, eligibility_state: 'verified', verification_method: 'staff_list_import' } : r))
        }
      }
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'eligibility.imported', entity_type: 'eligibility_record', entity_id: null, summary: `Batch ${input.batch}: ${created} added, ${updated} updated, ${matched} matched to registered riders.`, severity: 'sensitive' })
      return { created, updated, matched }
    }),
  )
}

export function setEligibilityStatus(
  input: { record_id: UUID; status: EligibilityRecord['status'] },
  actor: { id: UUID | null; name: string },
): Result<EligibilityRecord> {
  return guard(() =>
    store.transact((draft) => {
      const record = draft.eligibility_records.find((e) => e.id === input.record_id)
      if (!record) throw new DomainError('record_not_found', 'Eligibility record not found.')
      const updated: EligibilityRecord = { ...record, status: input.status, verified_at: input.status === 'active' ? new Date().toISOString() : record.verified_at, verified_by: actor.id }
      draft.eligibility_records = draft.eligibility_records.map((e) => (e.id === record.id ? updated : e))
      if (record.rider_id) {
        draft.rider_profiles = draft.rider_profiles.map((r) => (r.profile_id === record.rider_id ? { ...r, eligibility_state: input.status === 'active' ? 'verified' : input.status === 'pending' ? 'pending' : input.status === 'revoked' ? 'rejected' : 'expired' } : r))
        draft.notifications = [{ id: uuid(), recipient_id: record.rider_id, booking_id: null, trip_id: null, channel: 'in_app', template: 'eligibility_changed', title: 'Eligibility updated', body: `Your institutional eligibility is now ${input.status}.`, payload: {}, status: 'delivered', sent_at: new Date().toISOString(), read_at: null, created_at: new Date().toISOString() }, ...draft.notifications]
      }
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'eligibility.changed', entity_type: 'eligibility_record', entity_id: record.id, summary: `${record.full_name} (${record.staff_id}): ${record.status} → ${input.status}`, diff: { status: { before: record.status, after: input.status } }, severity: 'sensitive' })
      return updated
    }),
  )
}

export type SubsidyPolicyDraft = Omit<SubsidyPolicy, 'id' | 'version' | 'created_at' | 'budget_consumed' | 'status'>

/** Saves a new policy version. A published policy is never edited in place — booking snapshots refer to versions. */
export function saveSubsidyPolicy(
  input: { policy_id: UUID | null; draft: SubsidyPolicyDraft; publish: boolean },
  actor: { id: UUID | null; name: string },
): Result<SubsidyPolicy> {
  return guard(() =>
    store.transact((draft) => {
      const d = input.draft
      if (!d.name.trim()) throw new DomainError('name_required', 'Give the policy a name.')
      if (d.subsidy_type === 'fixed' && !(d.fixed_amount && d.fixed_amount > 0)) throw new DomainError('amount_required', 'Fixed subsidy needs an amount.')
      if (d.subsidy_type === 'percentage' && !(d.percentage && d.percentage > 0 && d.percentage <= 100)) throw new DomainError('percentage_invalid', 'Percentage must be between 1 and 100.')
      if (d.valid_to && d.valid_to < d.valid_from) throw new DomainError('dates_invalid', 'Valid-to must be after valid-from.')

      const previous = input.policy_id ? draft.subsidy_policies.find((p) => p.id === input.policy_id) : undefined
      const policy: SubsidyPolicy = {
        ...d,
        id: uuid(),
        version: (previous?.version ?? 0) + 1,
        budget_consumed: previous?.budget_consumed ?? 0,
        status: input.publish ? 'published' : 'draft',
        created_at: new Date().toISOString(),
      }
      if (input.publish) {
        draft.subsidy_policies = draft.subsidy_policies.map((p) => (p.organization_id === policy.organization_id && p.status === 'published' ? { ...p, status: 'archived' } : p))
      }
      draft.subsidy_policies = [policy, ...draft.subsidy_policies]
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: input.publish ? 'subsidy_policy.published' : 'subsidy_policy.drafted', entity_type: 'subsidy_policy', entity_id: policy.id, summary: `${policy.name} v${policy.version} ${input.publish ? 'published' : 'saved as draft'}.`, severity: 'sensitive' })
      return policy
    }),
  )
}
