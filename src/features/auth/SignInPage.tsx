import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, Check, KeyRound, Phone, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_HOME, ROLE_LABELS } from '@/auth/permissions'
import { DamovLogo } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useDb } from '@/db/store'
import { DEMO_ACCOUNT_ORDER } from '@/data/seed'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Role-aware entry.
 *
 * The passenger flow is the real onboarding sequence — phone, OTP, then the
 * institution match. In this build the OTP step is a clearly labelled demo
 * stub; swapping in a production SMS provider means replacing `verifyOtp`
 * alone. Staff accounts are never self-registered: they are invited by an
 * administrator, so this screen only assumes an existing seeded account.
 */
export function SignInPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const profiles = useDb((db) => db.profiles)
  const userRoles = useDb((db) => db.user_roles)
  const organizations = useDb((db) => db.organizations)

  const [tab, setTab] = useState<'passenger' | 'staff'>('passenger')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [pending, setPending] = useState(false)

  const riders = userRoles
    .filter((r) => r.role === 'rider' && r.active)
    .map((r) => profiles.find((p) => p.id === r.user_id))
    .filter(Boolean)
    .slice(0, 6) as typeof profiles

  function requestOtp() {
    const match = profiles.find((p) => p.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))
    if (!match) {
      toast.error('No account found for that number', {
        description: 'Pick one of the seeded passenger numbers below, or use the staff tab.',
      })
      return
    }
    setPending(true)
    setTimeout(() => {
      setPending(false)
      setStep('otp')
      toast.info('Demo OTP sent', { description: 'Use code 000000 — no SMS provider is connected in this build.' })
    }, 550)
  }

  function verifyOtp() {
    if (otp !== '000000') {
      toast.error('That code is not valid', { description: 'The demo verification code is 000000.' })
      return
    }
    const match = profiles.find((p) => p.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))
    if (!match) return
    const role = userRoles.find((r) => r.user_id === match.id && r.active)?.role ?? 'rider'
    signIn(match.id, role)
    navigate(ROLE_HOME[role])
  }

  const staffAccounts = DEMO_ACCOUNT_ORDER.filter((a) => a.role !== 'rider')
    .map((entry) => {
      const assignment = userRoles.find((r) => r.role === entry.role && r.active)
      const profile = assignment ? profiles.find((p) => p.id === assignment.user_id) : undefined
      return profile ? { ...entry, profile } : null
    })
    .filter(Boolean) as { role: keyof typeof ROLE_LABELS; surface: string; description: string; profile: (typeof profiles)[number] }[]

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="forest-gradient relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.06]" />
        <DamovLogo size="lg" className="relative" />

        <div className="relative max-w-lg space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-bold leading-[1.08] tracking-tight xl:text-5xl"
          >
            Every passenger.
            <br />
            Every naira.
            <br />
            <span className="text-primary">Accounted for</span>
            <span className="text-warning">.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-base leading-relaxed text-white/70"
          >
            Damov is a controlled transport operating system. It guarantees capacity across every
            segment of a journey, runs predictable scheduled services, reconciles every ticket and
            cash session, and proves the economics of each route.
          </motion.p>
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
            className="grid gap-2.5 text-sm"
          >
            {[
              'Segment-level capacity — never oversold at an intermediate stop',
              'Server-evaluated fares and institutional subsidy, explained in words',
              'Cash sessions that cannot close silently',
              'Contribution margin per trip, per bus, per route',
            ].map((line) => (
              <motion.li
                key={line}
                variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                className="flex items-start gap-2.5 text-white/85"
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
                  <Check className="size-3 stroke-[3]" />
                </span>
                {line}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <p className="relative text-xs text-white/40">
          Abuja pilot corridor · Mararaba ↔ CBD · Operated in Africa/Lagos time
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-background px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <DamovLogo />
          </div>

          <div className="mb-6 inline-flex rounded-xl bg-muted p-1">
            {(['passenger', 'staff'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTab(option)}
                className={cn(
                  'press relative rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                  tab === option ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === option && (
                  <motion.span layoutId="signin-tab" className="absolute inset-0 rounded-lg bg-card shadow-subtle" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                )}
                <span className="relative">{option}</span>
              </button>
            ))}
          </div>

          {tab === 'passenger' ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Sign in to Rider Lite</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your phone number is your account. No BVN, no NIN, no new card.
                </p>
              </div>

              {step === 'phone' ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" required>Phone number</Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={phone}
                        inputMode="tel"
                        autoComplete="tel"
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                        placeholder="0807…"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Button className="w-full" size="lg" onClick={requestOtp} loading={pending}>
                    Send verification code <ArrowRight />
                  </Button>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp" hint="Demo code: 000000" required>Verification code</Label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="otp"
                        value={otp}
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                        placeholder="000000"
                        className="pl-9 tracking-[0.4em]"
                      />
                    </div>
                  </div>
                  <Button className="w-full" size="lg" onClick={verifyOtp}>
                    Verify and continue <ArrowRight />
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => setStep('phone')}>
                    Use a different number
                  </Button>
                </motion.div>
              )}

              <div className="rounded-xl border border-dashed border-border p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="size-3.5" /> Seeded passengers
                </p>
                <div className="mt-2.5 grid gap-1.5">
                  {riders.map((rider) => {
                    const org = organizations.find((o) => o.id === rider.organization_id)
                    return (
                      <button
                        key={rider.id}
                        onClick={() => { setPhone(rider.phone); setStep('phone') }}
                        className="press flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{rider.full_name}</span>
                          <span className="block text-xs text-muted-foreground tnum">{rider.phone}</span>
                        </span>
                        {org && <Badge tone="primary" size="sm">{org.short_name}</Badge>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Staff and partner access</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Staff accounts are created by an administrator, never self-registered. Select a
                  seeded account to enter its surface.
                </p>
              </div>

              <div className="grid gap-2">
                {staffAccounts.map((account, index) => (
                  <motion.div
                    key={account.role}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.3 }}
                  >
                    <Card
                      interactive
                      className="flex items-center gap-3 p-3"
                      onClick={() => {
                        signIn(account.profile.id, account.role)
                        navigate(ROLE_HOME[account.role])
                      }}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                        <Building2 className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{account.profile.full_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {ROLE_LABELS[account.role]} · {account.description}
                        </span>
                      </span>
                      <Badge tone="neutral" size="sm">{account.surface}</Badge>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Passwordless account selection is a development affordance. In production this
                screen authenticates against Supabase with MFA available for elevated roles, and
                every sensitive action is written to the audit log.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
