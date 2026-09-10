import { store } from '@/db/store'
import { uuid } from '@/lib/ids'
import type { Organization, Profile, Role, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

export function createOrganization(
  input: { name: string; short_name: string; type: Organization['type']; code: string; contact_name: string; contact_email: string },
  actor: { id: UUID | null; name: string },
): Result<Organization> {
  return guard(() =>
    store.transact((draft) => {
      if (!input.name.trim() || !input.code.trim()) throw new DomainError('required', 'Name and code are required.')
      if (draft.organizations.some((o) => o.code.toUpperCase() === input.code.trim().toUpperCase())) throw new DomainError('code_taken', 'That organisation code is already in use.')
      const now = new Date().toISOString()
      const org: Organization = { id: uuid(), name: input.name.trim(), short_name: input.short_name.trim() || input.name.trim(), type: input.type, code: input.code.trim().toUpperCase(), status: 'active', primary_contact_name: input.contact_name || null, primary_contact_phone: null, primary_contact_email: input.contact_email || null, created_at: now, updated_at: now }
      draft.organizations = [...draft.organizations, org]
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'organization.created', entity_type: 'organization', entity_id: org.id, summary: `${org.name} (${org.code}) created as ${org.type}.`, severity: 'sensitive' })
      return org
    }),
  )
}

export function inviteStaff(
  input: { full_name: string; phone: string; email: string; role: Role; organization_id: UUID | null; hub_id: UUID | null; employment_id: string },
  actor: { id: UUID | null; name: string },
): Result<Profile> {
  return guard(() =>
    store.transact((draft) => {
      if (!input.full_name.trim() || !input.phone.trim()) throw new DomainError('required', 'Name and phone are required.')
      if (draft.profiles.some((p) => p.phone.replace(/\D/g, '') === input.phone.replace(/\D/g, ''))) throw new DomainError('phone_taken', 'A profile with this phone number already exists.')
      const now = new Date().toISOString()
      const profile: Profile = { id: uuid(), full_name: input.full_name.trim(), phone: input.phone.trim(), email: input.email || null, avatar_url: null, status: 'invited', default_role: input.role, organization_id: input.organization_id, employment_id: input.employment_id || null, last_login_at: null, mfa_enrolled: false, created_at: now, updated_at: now }
      draft.profiles = [...draft.profiles, profile]
      draft.user_roles = [...draft.user_roles, { id: uuid(), user_id: profile.id, role: input.role, organization_id: input.organization_id, hub_id: input.hub_id, active: true, created_at: now }]
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'user.invited', entity_type: 'profile', entity_id: profile.id, summary: `${profile.full_name} invited as ${input.role}.`, severity: 'sensitive' })
      return profile
    }),
  )
}

export function setUserStatus(
  input: { profile_id: UUID; status: Profile['status'] },
  actor: { id: UUID | null; name: string },
): Result<Profile> {
  return guard(() =>
    store.transact((draft) => {
      const profile = draft.profiles.find((p) => p.id === input.profile_id)
      if (!profile) throw new DomainError('not_found', 'User not found.')
      if (profile.id === actor.id) throw new DomainError('self', 'You cannot change your own status.')
      const updated = { ...profile, status: input.status, updated_at: new Date().toISOString() }
      draft.profiles = draft.profiles.map((p) => (p.id === profile.id ? updated : p))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: `user.${input.status}`, entity_type: 'profile', entity_id: profile.id, summary: `${profile.full_name}: ${profile.status} → ${input.status}`, diff: { status: { before: profile.status, after: input.status } }, severity: 'sensitive' })
      return updated
    }),
  )
}

export function changeUserRole(
  input: { profile_id: UUID; role: Role; hub_id: UUID | null },
  actor: { id: UUID | null; name: string },
): Result<void> {
  return guard(() =>
    store.transact((draft) => {
      const profile = draft.profiles.find((p) => p.id === input.profile_id)
      if (!profile) throw new DomainError('not_found', 'User not found.')
      const previous = draft.user_roles.find((r) => r.user_id === profile.id && r.active)
      draft.user_roles = draft.user_roles.map((r) => (r.user_id === profile.id ? { ...r, active: false } : r))
      draft.user_roles = [...draft.user_roles, { id: uuid(), user_id: profile.id, role: input.role, organization_id: profile.organization_id, hub_id: input.hub_id, active: true, created_at: new Date().toISOString() }]
      draft.profiles = draft.profiles.map((p) => (p.id === profile.id ? { ...p, default_role: input.role } : p))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'user.role_changed', entity_type: 'profile', entity_id: profile.id, summary: `${profile.full_name}: ${previous?.role ?? 'none'} → ${input.role}`, diff: { role: { before: previous?.role ?? null, after: input.role } }, severity: 'sensitive' })
    }),
  )
}
