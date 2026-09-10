import type { DamovDatabase } from '@/db/schema'
import { store } from '@/db/store'
import type { ConfigurationValue, Role } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

export function getConfigNumber(db: DamovDatabase, key: string, fallback: number): number {
  const row = db.configuration.find((c) => c.key === key)
  return typeof row?.value === 'number' ? row.value : fallback
}

export function useConfigValue(db: DamovDatabase, key: string) {
  return db.configuration.find((c) => c.key === key)
}

export function updateConfiguration(
  key: string,
  value: ConfigurationValue['value'],
  actor: { id: string | null; name: string; role: Role },
): Result<ConfigurationValue> {
  return guard(() =>
    store.transact((draft) => {
      const existing = draft.configuration.find((c) => c.key === key)
      if (!existing) throw new DomainError('config_not_found', 'Configuration key not found.')
      if (!existing.editable_by.includes(actor.role))
        throw new DomainError('forbidden', 'Your role cannot change this setting.')

      const updated = { ...existing, value }
      draft.configuration = draft.configuration.map((c) => (c.key === key ? updated : c))
      writeAudit(draft, {
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'configuration.updated',
        entity_type: 'configuration',
        entity_id: key,
        summary: `${existing.label} changed from ${existing.value} to ${value}`,
        diff: { [key]: { before: existing.value, after: value } },
        severity: 'sensitive',
      })
      return updated
    }),
  )
}
