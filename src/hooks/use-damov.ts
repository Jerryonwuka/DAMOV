import { useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { lagosToday } from '@/lib/format'
import { getConfigNumber } from '@/server/configuration'

/** Today's service date in the operating timezone. */
export function useServiceDate() {
  return lagosToday()
}

export function useConfig(key: string, fallback: number) {
  return useDb(useCallback((db) => getConfigNumber(db, key, fallback), [key, fallback]))
}

/** The rider profile attached to the signed-in account, if any. */
export function useRiderProfile() {
  const { profile } = useAuth()
  return useDb(
    useCallback((db) => db.rider_profiles.find((r) => r.profile_id === profile?.id) ?? null, [profile?.id]),
  )
}

export function useOrganization(id: string | null | undefined) {
  return useDb(useCallback((db) => (id ? (db.organizations.find((o) => o.id === id) ?? null) : null), [id]))
}

/** The hub an agent or supervisor is assigned to, falling back to the first terminal. */
export function useAssignedHub() {
  const { hubId } = useAuth()
  return useDb(
    useCallback(
      (db) => db.hubs.find((h) => h.id === hubId) ?? db.hubs.find((h) => h.status === 'active') ?? null,
      [hubId],
    ),
  )
}

/** The cash session this agent currently has open, if any. */
export function useOpenCashSession() {
  const { profile } = useAuth()
  return useDb(
    useCallback(
      (db) => db.cash_sessions.find((s) => s.agent_id === profile?.id && s.status === 'open') ?? null,
      [profile?.id],
    ),
  )
}
