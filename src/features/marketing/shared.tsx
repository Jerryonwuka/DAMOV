import * as React from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import * as Accordion from '@radix-ui/react-accordion'
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, X } from '@/components/icons'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_HOME } from '@/auth/permissions'
import { DamovLogo, DamovMark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

const NAV = [
  { to: '/riders', label: 'Riders' },
  { to: '/institutions', label: 'Institutions' },
  { to: '/operators', label: 'Operators' },
  { to: '/network', label: 'Network' },
  { to: '/about', label: 'About' },
]

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const { session, role } = useAuth()
  const location = useLocation()
  const [open, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  React.useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const appHref = session && role ? ROLE_HOME[role] : '/signin'

  return (
    <div className="dark min-h-screen bg-ink-900 text-foreground">
      <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', scrolled ? 'py-2' : 'py-4')}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className={cn('flex h-14 items-center gap-3 rounded-2xl border px-3 transition-all duration-300 sm:px-4', scrolled ? 'border-border bg-ink-900/80 shadow-lifted backdrop-blur-xl' : 'border-transparent bg-transparent')}>
            <Link to="/" className="press flex items-center gap-2"><DamovLogo size="sm" className="text-white" /></Link>
            <nav className="ml-6 hidden items-center gap-1 lg:flex">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-white/[0.07] text-white' : 'text-white/65 hover:text-white')}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              {!session && <Button asChild variant="ghost" size="sm" className="text-white/80"><Link to="/signin">Sign in</Link></Button>}
              <Button asChild size="sm"><Link to={appHref}>{session ? 'Open Damov' : 'Book a journey'} <ArrowRight /></Link></Button>
            </div>
            <Button variant="ghost" size="icon" className="ml-auto text-white sm:ml-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass mt-2 rounded-2xl border border-border p-3 lg:hidden">
                {NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => cn('block rounded-xl px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/[0.07] text-white' : 'text-white/70')}>
                    {item.label}
                  </NavLink>
                ))}
                <div className="mt-2 flex gap-2 border-t border-border pt-3">
                  {!session && <Button asChild variant="outline" className="flex-1"><Link to="/signin">Sign in</Link></Button>}
                  <Button asChild className="flex-1"><Link to={appHref}>{session ? 'Open Damov' : 'Book a journey'}</Link></Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="pt-24">{children}</main>

      <Footer />
    </div>
  )
}

function Footer() {
  const columns = [
    { title: 'Ride', links: [['Book a journey', '/signin'], ['Routes and stops', '/network'], ['Sponsored commutes', '/institutions'], ['Rider help', '/contact']] },
    { title: 'Operate', links: [['Damov Control', '/operators'], ['Hub and boarding', '/operators'], ['Driver app', '/operators'], ['Become a driver', '/contact']] },
    { title: 'Company', links: [['About Damov', '/about'], ['Partner with us', '/contact'], ['Press', '/contact'], ['Careers', '/contact']] },
  ]
  return (
    <footer className="relative mt-24 border-t border-border">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <DamovLogo className="text-white" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
              A controlled transport operating system for Abuja: guaranteed capacity, predictable scheduled services, every passenger and every naira reconciled.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <StoreBadge label="Rider Lite" sub="Web app · no download" to="/signin" />
              <StoreBadge label="WhatsApp booking" sub="Coming to the pilot" to="/riders" />
            </div>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-white">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map(([label, to]) => (
                  <li key={label}><Link to={to} className="text-sm text-white/60 transition-colors hover:text-primary-300">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Damov Mobility Limited · Abuja, Nigeria · Operated in Africa/Lagos time</p>
          <p className="flex gap-4"><Link to="/about" className="hover:text-white">Privacy</Link><Link to="/about" className="hover:text-white">Terms</Link><Link to="/contact" className="hover:text-white">Status</Link></p>
        </div>
      </div>
    </footer>
  )
}

function StoreBadge({ label, sub, to }: { label: string; sub: string; to: string }) {
  return (
    <Link to={to} className="press flex items-center gap-2.5 rounded-xl border border-border bg-white/[0.03] px-3 py-2 transition-colors hover:border-primary/40">
      <DamovMark className="size-6" />
      <span className="leading-tight"><span className="block text-[10px] text-white/50">{sub}</span><span className="block text-sm font-semibold text-white">{label}</span></span>
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Section primitives                                                   */
/* ------------------------------------------------------------------ */

export function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24', className)}>
      {children}
    </section>
  )
}

export function SectionTitle({ title, lead, align = 'left', className }: { title: React.ReactNode; lead?: React.ReactNode; align?: 'left' | 'center'; className?: string }) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <h2 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-base leading-relaxed text-white/60 sm:text-lg">{lead}</p>}
    </div>
  )
}

/** Hero-grade headline used on every marketing page. */
export function Headline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn('font-display text-5xl font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl', className)}>{children}</h1>
}

export function FeatureRow({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary-300 [&_svg]:size-5"><Icon /></span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/60">{children}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Device frames                                                        */
/* ------------------------------------------------------------------ */

export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-[300px] rounded-[2.6rem] border border-white/15 bg-ink-800 p-2.5 shadow-lifted', className)}>
      <div className="pointer-events-none absolute inset-0 rounded-[2.6rem] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)]" />
      <div className="absolute left-1/2 top-4 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink-950" />
      <div className="relative h-[620px] overflow-hidden rounded-[2.1rem] bg-ink-900">{children}</div>
    </div>
  )
}

export function BrowserFrame({ children, className, title = 'control.damov.ng' }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div className={cn('glass overflow-hidden rounded-2xl border border-border shadow-lifted', className)}>
      <div className="flex items-center gap-2 border-b border-border bg-ink-800/80 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
        <span className="mx-auto rounded-md bg-black/30 px-3 py-0.5 text-[11px] text-white/50">{title}</span>
      </div>
      <div className="bg-ink-900">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Marquee                                                              */
/* ------------------------------------------------------------------ */

export function Marquee({ items, duration = 48, className }: { items: React.ReactNode[]; duration?: number; className?: string }) {
  const row = [...items, ...items]
  return (
    <div className={cn('relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]', className)}>
      <div className="marquee flex w-max gap-3" style={{ ['--marquee-duration' as string]: `${duration}s` }}>
        {row.map((item, i) => <React.Fragment key={i}>{item}</React.Fragment>)}
      </div>
    </div>
  )
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white/[0.03] px-4 py-2 text-sm text-white/80', className)}>{children}</span>
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                  */
/* ------------------------------------------------------------------ */

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-border rounded-2xl border border-border">
      {items.map((item, i) => (
        <Accordion.Item key={item.q} value={`item-${i}`} className="px-5">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-white [&[data-state=open]_svg]:rotate-180">
              {item.q}
              <ChevronDown className="size-4 shrink-0 text-white/50 transition-transform duration-300" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden text-sm leading-relaxed text-white/60 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <p className="pb-5">{item.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}

/* ------------------------------------------------------------------ */
/* Calls to action                                                      */
/* ------------------------------------------------------------------ */

export function CtaBand({ title, lead, primary, secondary }: { title: React.ReactNode; lead: string; primary: { label: string; to: string }; secondary?: { label: string; to: string } }) {
  return (
    <Section className="py-8 sm:py-12">
      <div className="ink-gradient relative overflow-hidden rounded-3xl border border-primary/20 px-6 py-14 text-center sm:px-12">
        <div className="surface-dots pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h2>
          <p className="mt-4 text-base text-white/65 sm:text-lg">{lead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="xl"><Link to={primary.to}>{primary.label} <ArrowRight /></Link></Button>
            {secondary && <Button asChild size="xl" variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10"><Link to={secondary.to}>{secondary.label} <ArrowUpRight /></Link></Button>}
          </div>
        </div>
      </div>
    </Section>
  )
}

export function RecruitCard({ title, lead, to, cta, icon: Icon, tone = 'primary' }: { title: string; lead: string; to: string; cta: string; icon: React.ComponentType<{ className?: string }>; tone?: 'primary' | 'amber' }) {
  return (
    <Link to={to} className="group glass relative flex flex-col overflow-hidden rounded-3xl border border-border p-7 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
      <span className={cn('grid size-14 place-items-center rounded-2xl border [&_svg]:size-7', tone === 'primary' ? 'border-primary/30 bg-primary/10 text-primary-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300')}><Icon /></span>
      <h3 className="font-display mt-6 text-2xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{lead}</p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-300">{cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
    </Link>
  )
}
