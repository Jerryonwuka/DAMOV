import { useCallback, useState } from 'react'
import { Building2, Fingerprint, KeyRound, Plug, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, surfacesFor, SURFACE_LABELS } from '@/auth/permissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { lagosDateTime, relative } from '@/lib/format'
import { ROLES, type Organization, type Profile, type Role, type UserRole } from '@/lib/types'
import { changeUserRole, createOrganization, inviteStaff, setUserStatus } from '@/server/admin'
import { detectDataQuality } from '@/server/gis'
import { cn, titleCase } from '@/lib/utils'
import { AuditPage } from '@/features/control/AuditPage'
import { NetworkPage } from '@/features/control/NetworkPage'
import { toast } from 'sonner'

/* ------------------------------------------------------------------ */
/* Organizations                                                        */
/* ------------------------------------------------------------------ */

export function OrganizationsPage() {
  const { actor } = useAuth()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', short_name: '', type: 'ministry' as Organization['type'], code: '', contact_name: '', contact_email: '' })
  const rows = useDb(
    useCallback(
      (db) => db.organizations.map((org) => ({
        org,
        members: db.profiles.filter((p) => p.organization_id === org.id).length,
        eligible: db.eligibility_records.filter((e) => e.organization_id === org.id && e.status === 'active').length,
        policy: db.subsidy_policies.find((p) => p.organization_id === org.id && p.status === 'published') ?? null,
      })),
      [],
    ),
  )

  function submit() {
    const result = createOrganization(form, actor)
    if (!result.ok) return toast.error('Not created', { description: result.error })
    toast.success(`${result.data.name} created`)
    setCreating(false)
    setForm({ name: '', short_name: '', type: 'ministry', code: '', contact_name: '', contact_email: '' })
  }

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'name', header: 'Organisation', value: (r) => r.org.name, cell: (r) => <span><span className="font-semibold">{r.org.name}</span><br /><span className="text-xs text-muted-foreground">{r.org.code} · {r.org.short_name}</span></span> },
    { key: 'type', header: 'Type', value: (r) => r.org.type, cell: (r) => <Badge tone="neutral">{titleCase(r.org.type)}</Badge> },
    { key: 'status', header: 'Status', value: (r) => r.org.status, cell: (r) => <Badge tone={r.org.status === 'active' ? 'primary' : 'warning'}>{titleCase(r.org.status)}</Badge> },
    { key: 'members', header: 'Accounts', align: 'right', value: (r) => r.members },
    { key: 'eligible', header: 'Eligible staff', align: 'right', value: (r) => r.eligible },
    { key: 'policy', header: 'Subsidy policy', value: (r) => r.policy?.name ?? '', cell: (r) => (r.policy ? `${r.policy.name} v${r.policy.version}` : <span className="text-muted-foreground">—</span>) },
    { key: 'contact', header: 'Primary contact', value: (r) => r.org.primary_contact_name ?? '', cell: (r) => <span className="text-xs">{r.org.primary_contact_name ?? '—'}<br /><span className="text-muted-foreground">{r.org.primary_contact_email ?? ''}</span></span>, hideable: true },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Organizations" description="Damov, operators, and every participating ministry, company and school. Tenant separation is enforced per organisation." actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> New organisation</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Organisations" value={rows.length} icon={Building2} />
        <StatTile index={1} label="Sponsoring institutions" value={rows.filter((r) => r.policy).length} tone="primary" />
        <StatTile index={2} label="Operators" value={rows.filter((r) => r.org.type === 'operator').length} />
        <StatTile index={3} label="Eligible staff (all)" value={rows.reduce((a, r) => a + r.eligible, 0)} />
      </div>
      <DataTable data={rows} columns={columns} rowKey={(r) => r.org.id} searchPlaceholder="Name or code…" exportName="organizations" pageSize={10} />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New organisation</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5"><Label required>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Short name</Label><Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label required>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Organization['type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(['government', 'ministry', 'company', 'school', 'operator'] as const).map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Primary contact</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.name.trim() || !form.code.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Users & roles                                                        */
/* ------------------------------------------------------------------ */

interface UserRow { profile: Profile; role: UserRole | null; organization: string; hub: string | null }

export function UsersRolesPage() {
  const { actor } = useAuth()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', role: 'hub_agent' as Role, organization_id: '', hub_id: '', employment_id: '' })
  const [roleDraft, setRoleDraft] = useState<{ role: Role; hub_id: string }>({ role: 'hub_agent', hub_id: '' })

  const rows = useDb(
    useCallback(
      (db): UserRow[] => db.profiles.map((profile) => {
        const role = db.user_roles.find((r) => r.user_id === profile.id && r.active) ?? null
        return { profile, role, organization: db.organizations.find((o) => o.id === profile.organization_id)?.short_name ?? '—', hub: db.hubs.find((h) => h.id === role?.hub_id)?.name ?? null }
      }).filter((r) => r.role?.role !== 'rider'),
      [],
    ),
  )
  const organizations = useDb(useCallback((db) => db.organizations, []))
  const hubs = useDb(useCallback((db) => db.hubs.filter((h) => h.status === 'active'), []))

  function invite() {
    const result = inviteStaff({ ...form, organization_id: form.organization_id || null, hub_id: form.hub_id || null }, actor)
    if (!result.ok) return toast.error('Not invited', { description: result.error })
    toast.success(`${result.data.full_name} invited`, { description: 'An invitation would be sent by SMS/email in production.' })
    setInviting(false)
  }

  function saveRole() {
    if (!editing) return
    const result = changeUserRole({ profile_id: editing.profile.id, role: roleDraft.role, hub_id: roleDraft.hub_id || null }, actor)
    if (!result.ok) return toast.error('Not changed', { description: result.error })
    toast.success('Role updated and audited')
    setEditing(null)
  }

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'User', value: (r) => r.profile.full_name, cell: (r) => <span><span className="font-semibold">{r.profile.full_name}</span><br /><span className="text-xs text-muted-foreground tnum">{r.profile.phone}{r.profile.email ? ` · ${r.profile.email}` : ''}</span></span> },
    { key: 'role', header: 'Role', value: (r) => r.role?.role ?? '', cell: (r) => <Badge tone="primary">{r.role ? ROLE_LABELS[r.role.role] : '—'}</Badge> },
    { key: 'org', header: 'Organisation', value: (r) => r.organization },
    { key: 'hub', header: 'Hub', value: (r) => r.hub ?? '', cell: (r) => r.hub ?? '—', hideable: true },
    { key: 'id', header: 'Employment ID', value: (r) => r.profile.employment_id ?? '', cell: (r) => <span className="tnum">{r.profile.employment_id ?? '—'}</span>, hideable: true },
    { key: 'status', header: 'Status', value: (r) => r.profile.status, cell: (r) => <Badge tone={r.profile.status === 'active' ? 'primary' : r.profile.status === 'invited' ? 'info' : 'critical'}>{titleCase(r.profile.status)}</Badge> },
    { key: 'mfa', header: 'MFA', value: (r) => (r.profile.mfa_enrolled ? 1 : 0), cell: (r) => (r.profile.mfa_enrolled ? <Badge tone="forest" size="sm">Enrolled</Badge> : <span className="text-xs text-muted-foreground">Ready</span>), hideable: true },
    { key: 'login', header: 'Last login', value: (r) => r.profile.last_login_at ?? '', cell: (r) => <span className="text-xs">{r.profile.last_login_at ? relative(r.profile.last_login_at) : 'Never'}</span> },
    {
      key: 'actions', header: '', sortable: false,
      cell: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditing(r); setRoleDraft({ role: r.role?.role ?? 'hub_agent', hub_id: r.role?.hub_id ?? '' }) }}>Role</Button>
          {r.profile.status === 'active' ? (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); const res = setUserStatus({ profile_id: r.profile.id, status: 'suspended' }, actor); if (!res.ok) toast.error(res.error); else toast.success('Suspended') }}>Suspend</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); const res = setUserStatus({ profile_id: r.profile.id, status: 'active' }, actor); if (!res.ok) toast.error(res.error); else toast.success('Activated') }}>Activate</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Users & Roles" description="Staff and partner accounts are invited by an administrator, never self-registered. Every role or status change is audited." actions={<Button onClick={() => setInviting(true)}><UserPlus className="size-4" /> Invite staff</Button>} />
      <DataTable data={rows} columns={columns} rowKey={(r) => r.profile.id} searchPlaceholder="Name, phone, email or ID…" exportName="users-roles" pageSize={15} />

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Invite a staff account</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5"><Label required>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label required>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.filter((r) => r !== 'rider').map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Organisation</Label>
              <Select value={form.organization_id} onValueChange={(v) => setForm({ ...form, organization_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label hint="hub agents and supervisors">Assigned hub</Label>
              <Select value={form.hub_id} onValueChange={(v) => setForm({ ...form, hub_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{hubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Employment / operator ID</Label><Input value={form.employment_id} onChange={(e) => setForm({ ...form, employment_id: e.target.value })} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(false)}>Cancel</Button>
            <Button onClick={invite} disabled={!form.full_name.trim() || !form.phone.trim()}>Send invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Change role · {editing?.profile.full_name}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={roleDraft.role} onValueChange={(v) => setRoleDraft({ ...roleDraft, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Assigned hub</Label>
              <Select value={roleDraft.hub_id} onValueChange={(v) => setRoleDraft({ ...roleDraft, hub_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{hubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Grants: {ROLE_PERMISSIONS[roleDraft.role].length} capabilities across {surfacesFor(roleDraft.role).map((s) => SURFACE_LABELS[s]).join(', ')}.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveRole}>Save role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Access policies                                                      */
/* ------------------------------------------------------------------ */

export function AccessPoliciesPage() {
  const groups = [...new Set(PERMISSIONS.map((p) => p.split('.')[0]))]
  return (
    <div className="space-y-5">
      <PageHeader title="Access Policies" description="The capability matrix rendered from code. Navigation, actions and routes are derived from it; Supabase RLS enforces the same boundaries on every table." />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Capability</th>
                {ROLES.map((role) => <th key={role} className="px-2 py-2 text-center font-semibold"><span className="block max-w-[64px] truncate">{ROLE_LABELS[role]}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <>
                  <tr key={`g-${group}`} className="bg-muted/40"><td colSpan={ROLES.length + 1} className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{titleCase(group)}</td></tr>
                  {PERMISSIONS.filter((p) => p.startsWith(`${group}.`)).map((permission) => (
                    <tr key={permission} className="border-t border-border/60">
                      <td className="px-3 py-1.5 font-mono text-2xs">{permission}</td>
                      {ROLES.map((role) => {
                        const granted = ROLE_PERMISSIONS[role].includes(permission)
                        return <td key={role} className="px-2 py-1.5 text-center"><span className={cn('inline-block size-2.5 rounded-full', granted ? 'bg-primary' : 'bg-border')} aria-label={granted ? 'granted' : 'not granted'} /></td>
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { icon: Fingerprint, title: 'Tenant separation', body: 'An institution admin only ever queries rows where organization_id matches their own. No cross-institution passenger or financial reads.' },
          { icon: ShieldCheck, title: 'Hub scoping', body: 'Hub agents and supervisors see trips, sales and boardings for their assigned hub. Cash sessions are bound to the agent who opened them.' },
          { icon: KeyRound, title: 'Aggregated by default', body: 'Executive viewers and institutions receive aggregates. Individual movement history is reserved for operations roles with a recorded reason.' },
        ].map((item) => (
          <Card key={item.title} className="p-4"><item.icon className="size-5 text-primary" /><p className="mt-2 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p></Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Integrations                                                         */
/* ------------------------------------------------------------------ */

const INTEGRATIONS = [
  { key: 'supabase', name: 'Supabase', role: 'Postgres, auth, storage, RLS, Edge Functions, Realtime', env: 'VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY', status: 'Schema ready · not connected' },
  { key: 'payments', name: 'Payment provider', role: 'Card and transfer collection; webhook verification', env: 'VITE_PAYMENT_PROVIDER (mock | paystack | flutterwave)', status: 'Mock provider' },
  { key: 'sms', name: 'SMS / OTP', role: 'Passenger OTP and departure reminders', env: 'VITE_SMS_PROVIDER', status: 'Demo OTP 000000' },
  { key: 'whatsapp', name: 'WhatsApp', role: 'Booking channel and notifications', env: 'VITE_WHATSAPP_PROVIDER', status: 'Channel modelled · templates not configured' },
  { key: 'gps', name: 'Telematics / GPS', role: 'Vehicle positions via ingest_vehicle_location', env: 'VITE_GPS_PROVIDER (simulator | webhook)', status: 'Demo simulation' },
  { key: 'basemap', name: 'Map basemap', role: 'CARTO vector tiles for MapLibre', env: 'VITE_MAP_STYLE_DARK · VITE_MAP_STYLE_LIGHT', status: 'Public style · offline fallback ready' },
]

export function IntegrationsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Integrations" description="Every external dependency is behind an abstraction with a safe development stand-in. Nothing here claims a live production connection that does not exist." />
      <div className="grid gap-3 md:grid-cols-2">
        {INTEGRATIONS.map((item) => (
          <Card key={item.key} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary"><Plug className="size-4" /></span>
              <Badge tone={/mock|demo|not/i.test(item.status) ? 'warning' : 'primary'}>{item.status}</Badge>
            </div>
            <p className="mt-3 text-sm font-semibold">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.role}</p>
            <p className="mt-2 rounded-md bg-muted px-2 py-1 font-mono text-2xs">{item.env}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Data imports                                                         */
/* ------------------------------------------------------------------ */

export function DataImportsPage() {
  const flags = useDb(useCallback((db) => detectDataQuality(db), []))
  const batches = useDb(useCallback((db) => [...new Set(db.eligibility_records.map((e) => e.import_batch).filter(Boolean))], []))
  const lastImports = useDb(useCallback((db) => db.audit_logs.filter((a) => /imported/.test(a.action)).slice(0, 5), []))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="GIS quality flags" value={flags.length} tone={flags.some((f) => f.severity === 'blocking') ? 'critical' : 'warning'} />
        <StatTile index={1} label="Eligibility batches" value={batches.length} />
        <StatTile index={2} label="Blocking issues" value={flags.filter((f) => f.severity === 'blocking').length} />
        <StatTile index={3} label="Recent imports" value={lastImports.length} />
      </div>
      {lastImports.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Import history</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {lastImports.map((entry) => <p key={entry.id}>{entry.summary} <span className="text-muted-foreground">· {entry.actor_name} · {lagosDateTime(entry.occurred_at)}</span></p>)}
          </CardContent>
        </Card>
      )}
      <NetworkPage />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Security                                                             */
/* ------------------------------------------------------------------ */

export function SecurityPage() {
  const controls = [
    ['Row-level security', 'Policies per table in supabase/migrations; organisation and hub scoping.'],
    ['Secure QR tokens', 'Opaque, server-resolved tokens; no passenger data in the code.'],
    ['Idempotent writes', 'Bookings, payments and telemetry carry idempotency keys; replays return the original result.'],
    ['CSV formula neutralisation', 'Every export and import preview strips leading =, +, −, @ characters.'],
    ['Phone masking', 'Passenger numbers are masked outside roles with view_passenger_identity.'],
    ['Audit trail', 'Overrides, reversals, cash decisions, policy and role changes are logged with before/after values.'],
    ['Rate limiting', 'OTP, validation, import and public endpoints — enforced at the Edge Function layer (not in this client build).'],
    ['Signed evidence access', 'Incident attachments served via signed private URLs from Supabase Storage.'],
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Audit & Security" description="Controls in force and where each is enforced." />
      <div className="grid gap-3 md:grid-cols-2">
        {controls.map(([title, body]) => (
          <Card key={title} className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">{title}</p><p className="text-xs leading-relaxed text-muted-foreground">{body}</p></div></Card>
        ))}
      </div>
      <AuditPage />
    </div>
  )
}
