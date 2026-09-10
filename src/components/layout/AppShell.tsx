import * as React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, ChevronDown, LogOut, Menu, Moon, RefreshCw, Sun, X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_LABELS, SURFACE_LABELS, surfacesFor, type Surface } from '@/auth/permissions'
import { DamovLogo, DamovMark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, Tooltip } from '@/components/ui/misc'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { useDb, store } from '@/db/store'
import { buildSeed } from '@/data/seed'
import { initials, lagosTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/use-theme'
import { useClock } from '@/hooks/use-clock'
import { SURFACE_ICON, SURFACE_NAV } from './navigation'
import { RoleSwitcher } from './RoleSwitcher'
import { toast } from 'sonner'

const SURFACE_BY_PREFIX: [string, Surface][] = [
  ['/rider', 'rider'],
  ['/hub', 'hub'],
  ['/driver', 'driver'],
  ['/control', 'control'],
  ['/institution', 'institution'],
  ['/admin', 'admin'],
]

export function currentSurface(pathname: string): Surface {
  return SURFACE_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'control'
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, role, permissions, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const now = useClock(30_000)

  const surface = currentSurface(location.pathname)
  const sections = SURFACE_NAV[surface]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => permissions.includes(item.permission)),
    }))
    .filter((section) => section.items.length > 0)

  const availableSurfaces = role ? surfacesFor(role) : []
  const mobileItems = sections.flatMap((s) => s.items).filter((item) => item.primary).slice(0, 5)
  const isFieldSurface = surface === 'rider' || surface === 'driver'

  const unread = useDb(
    React.useCallback(
      (db) => db.notifications.filter((n) => n.recipient_id === profile?.id && n.status !== 'read').length,
      [profile?.id],
    ),
  )

  React.useEffect(() => setMobileNavOpen(false), [location.pathname])

  async function reseed() {
    await store.reset(buildSeed)
    toast.success('Demo data reset', { description: 'A fresh operating day has been seeded.' })
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop navigation rail */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex',
          isFieldSurface && 'lg:hidden',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <DamovLogo className="text-white" size="sm" />
        </div>
        <div className="px-3 pb-2">
          <SurfaceSwitcher current={surface} available={availableSurfaces} onSelect={(s) => navigate(surfaceHome(s))} />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {sections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && (
                <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className="block">
                      {({ isActive }) => (
                        <span
                          className={cn(
                            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-damov',
                            isActive
                              ? 'bg-white/10 text-white'
                              : 'text-sidebar-foreground/70 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-sidebar-accent"
                              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            />
                          )}
                          <item.icon
                            className={cn(
                              'size-4 shrink-0 transition-transform duration-200 ease-damov group-hover:scale-110',
                              isActive && 'text-sidebar-accent',
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <RoleSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className={cn('lg:hidden', isFieldSurface && 'hidden')}
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>

          {isFieldSurface ? (
            <div className="flex items-center gap-2">
              <DamovMark className="size-7" />
              <div className="leading-tight">
                <p className="text-sm font-bold">{SURFACE_LABELS[surface].replace('Damov ', '')}</p>
                <p className="text-2xs text-muted-foreground">{profile?.full_name}</p>
              </div>
            </div>
          ) : (
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold">{SURFACE_LABELS[surface]}</p>
              <p className="text-2xs text-muted-foreground">
                Abuja network · {lagosTime(new Date(now).toISOString())} WAT
              </p>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip label="Reseed the demo operating day">
              <Button variant="ghost" size="icon" onClick={reseed} aria-label="Reset demo data">
                <RefreshCw className="size-4" />
              </Button>
            </Tooltip>
            <Tooltip label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={theme}
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate(surface === 'rider' ? '/rider/notifications' : '/control/incidents')}
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-critical text-[9px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="press ml-1 flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-accent">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(profile?.full_name ?? 'DM')}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[9rem] truncate text-xs font-semibold">{profile?.full_name}</span>
                    <span className="block text-2xs text-muted-foreground">{role ? ROLE_LABELS[role] : ''}</span>
                  </span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <p className="text-sm font-semibold">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.phone}</p>
                  <Badge tone="primary" className="mt-2">
                    {role ? ROLE_LABELS[role] : ''}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                {availableSurfaces.length > 1 && (
                  <>
                    <DropdownMenuLabel>Surfaces</DropdownMenuLabel>
                    {availableSurfaces.map((s) => {
                      const Icon = SURFACE_ICON[s]
                      return (
                        <DropdownMenuItem key={s} onSelect={() => navigate(surfaceHome(s))}>
                          <Icon /> {SURFACE_LABELS[s]}
                        </DropdownMenuItem>
                      )
                    })}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem destructive onSelect={() => { signOut(); navigate('/') }}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main
          className={cn(
            'flex-1 px-3 py-4 sm:px-5 sm:py-6',
            isFieldSurface && 'pb-24',
            surface === 'control' && 'lg:px-6',
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[1400px]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile tab bar for the field surfaces */}
        {isFieldSurface && mobileItems.length > 0 && (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
            <ul className="mx-auto flex max-w-lg items-stretch">
              {mobileItems.map((item) => (
                <li key={item.to} className="flex-1">
                  <NavLink to={item.to} end={item.end} className="block">
                    {({ isActive }) => (
                      <span
                        className={cn(
                          'relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-200',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="tab-active"
                            className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                          />
                        )}
                        <item.icon className={cn('size-5 transition-transform duration-200 ease-damov', isActive && 'scale-110')} />
                        {item.label}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* Mobile drawer navigation for desk surfaces */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-forest-950/50 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className="flex h-16 items-center justify-between px-5">
                <DamovLogo className="text-white" size="sm" />
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                  <X className="size-5" />
                </Button>
              </div>
              <div className="px-3 pb-2">
                <SurfaceSwitcher current={surface} available={availableSurfaces} onSelect={(s) => navigate(surfaceHome(s))} />
              </div>
              <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
                {sections.map((section, i) => (
                  <div key={section.label ?? i}>
                    {section.label && (
                      <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted">
                        {section.label}
                      </p>
                    )}
                    <ul className="space-y-0.5">
                      {section.items.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                isActive ? 'bg-white/10 text-white' : 'text-sidebar-foreground/70',
                              )
                            }
                          >
                            <item.icon className="size-4 shrink-0" />
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
              <div className="border-t border-sidebar-border p-3">
                <RoleSwitcher />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function surfaceHome(surface: Surface) {
  return { rider: '/rider', hub: '/hub', driver: '/driver', control: '/control', institution: '/institution', admin: '/admin' }[surface]
}

function SurfaceSwitcher({
  current, available, onSelect,
}: {
  current: Surface
  available: Surface[]
  onSelect: (surface: Surface) => void
}) {
  if (available.length <= 1) {
    const Icon = SURFACE_ICON[current]
    return (
      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/80">
        <Icon className="size-4 text-sidebar-accent" />
        {SURFACE_LABELS[current]}
      </div>
    )
  }
  const Icon = SURFACE_ICON[current]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="press flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10">
          <Icon className="size-4 text-sidebar-accent" />
          <span className="truncate">{SURFACE_LABELS[current]}</span>
          <ChevronDown className="ml-auto size-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch surface</DropdownMenuLabel>
        {available.map((surface) => {
          const SurfaceIcon = SURFACE_ICON[surface]
          return (
            <DropdownMenuItem key={surface} onSelect={() => onSelect(surface)}>
              <SurfaceIcon /> {SURFACE_LABELS[surface]}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
