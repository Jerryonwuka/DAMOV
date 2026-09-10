import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { store, useDb } from '@/db/store'
import type { Profile, Role, UUID } from '@/lib/types'
import { hasPermission, ROLE_PERMISSIONS, type Permission } from './permissions'

const SESSION_KEY = 'damov.session'

export interface Session {
  profile_id: UUID
  role: Role
}

interface AuthValue {
  session: Session | null
  profile: Profile | null
  role: Role | null
  organizationId: UUID | null
  hubId: UUID | null
  permissions: Permission[]
  can: (permission: Permission) => boolean
  signIn: (profileId: UUID, role: Role) => void
  signOut: () => void
  actor: { id: UUID | null; name: string }
}

const AuthContext = createContext<AuthValue | null>(null)

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStoredSession)

  const profile = useDb(
    useCallback((db) => (session ? (db.profiles.find((p) => p.id === session.profile_id) ?? null) : null), [session]),
  )
  const roleAssignment = useDb(
    useCallback(
      (db) => (session ? (db.user_roles.find((r) => r.user_id === session.profile_id && r.role === session.role) ?? null) : null),
      [session],
    ),
  )

  const signIn = useCallback((profileId: UUID, role: Role) => {
    const next = { profile_id: profileId, role }
    setSession(next)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
    store.transact((draft) => {
      draft.profiles = draft.profiles.map((p) =>
        p.id === profileId ? { ...p, last_login_at: new Date().toISOString() } : p,
      )
    })
  }, [])

  const signOut = useCallback(() => {
    setSession(null)
    try {
      localStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value = useMemo<AuthValue>(() => {
    const role = session?.role ?? null
    return {
      session,
      profile,
      role,
      organizationId: profile?.organization_id ?? null,
      hubId: roleAssignment?.hub_id ?? null,
      permissions: role ? ROLE_PERMISSIONS[role] : [],
      can: (permission) => (role ? hasPermission(role, permission) : false),
      signIn,
      signOut,
      actor: { id: profile?.id ?? null, name: profile?.full_name ?? 'System' },
    }
  }, [session, profile, roleAssignment, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
