import { useNavigate } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_HOME, ROLE_LABELS } from '@/auth/permissions'
import { useDb } from '@/db/store'
import { DEMO_ACCOUNT_ORDER } from '@/data/seed'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { ChevronsUpDown } from 'lucide-react'

const ENABLED = import.meta.env.VITE_ENABLE_ROLE_SWITCHER !== 'false'

/**
 * Development-only account switcher.
 *
 * Seeded staff and passenger accounts can be assumed without a password so the
 * whole operating loop can be walked in one session. It is compiled out when
 * `VITE_ENABLE_ROLE_SWITCHER` is false and must never ship enabled to
 * production, where sign-in goes through Supabase auth.
 */
export function RoleSwitcher() {
  const navigate = useNavigate()
  const { signIn, role } = useAuth()
  const profiles = useDb((db) => db.profiles)
  const roles = useDb((db) => db.user_roles)

  if (!ENABLED) return null

  const accounts = DEMO_ACCOUNT_ORDER.map((entry) => {
    const assignment = roles.find((r) => r.role === entry.role && r.active)
    const profile = assignment ? profiles.find((p) => p.id === assignment.user_id) : undefined
    return profile ? { ...entry, profile } : null
  }).filter(Boolean) as { role: (typeof DEMO_ACCOUNT_ORDER)[number]['role']; surface: string; description: string; profile: { id: string; full_name: string } }[]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="press flex w-full items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2 text-left text-xs text-white/80 transition-colors hover:bg-white/5">
          <FlaskConical className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Demo role switcher</span>
            <span className="block truncate text-white/50">{role ? ROLE_LABELS[role] : 'Choose an account'}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          Seeded accounts
          <Badge tone="warning" size="sm">Dev only</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.role}
            className="flex-col items-start gap-0.5 py-2"
            onSelect={() => {
              signIn(account.profile.id, account.role)
              navigate(ROLE_HOME[account.role])
            }}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-semibold">{account.profile.full_name}</span>
              <span className="text-2xs text-muted-foreground">{account.surface}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {ROLE_LABELS[account.role]} · {account.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
