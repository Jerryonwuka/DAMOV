import type { AuditLog } from '@/lib/types'
import { uuid } from '@/lib/ids'
import type { DamovDatabase } from '@/db/schema'

export interface AuditInput {
  actor_id: string | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: string | null
  summary: string
  diff?: AuditLog['diff']
  severity?: AuditLog['severity']
}

/**
 * Appends an audit row inside the caller's transaction, so a rolled-back
 * business action never leaves an audit entry claiming it happened.
 */
export function writeAudit(draft: DamovDatabase, input: AuditInput): AuditLog {
  const entry: AuditLog = {
    id: uuid(),
    actor_id: input.actor_id,
    actor_name: input.actor_name,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    summary: input.summary,
    diff: input.diff ?? null,
    severity: input.severity ?? 'info',
    occurred_at: new Date().toISOString(),
  }
  draft.audit_logs = [entry, ...draft.audit_logs]
  return entry
}
