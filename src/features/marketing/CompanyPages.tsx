import { Suspense, lazy, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Bus, Clock, Envelope, Headset, MapPin, Phone, Send, ShieldCheck, Target, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDb } from '@/db/store'
import { useMapData } from '@/hooks/use-map-data'
import { directionStops } from '@/lib/selectors'
import { km } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CtaBand, Headline, Pill, Section, SectionTitle } from './shared'
import { usePublicStats } from './mocks'

const DamovMap = lazy(() => import('@/components/map/DamovMap').then((m) => ({ default: m.DamovMap })))

/* ------------------------------------------------------------------ */

export function PublicNetworkPage() {
  const [routeId, setRouteId] = useState<string | null>(null)
  const { layers } = useMapData({ stops: true, hubs: false, vehicles: true, incidents: false, reference: false, route: routeId, severity: 'all' })
  const routes = useDb(
    useCallback(
      (db) =>
        db.routes
          .filter((r) => r.status === 'published')
          .map((route) => {
            const version = db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)
            const directions = db.route_directions.filter((d) => d.route_id === route.id).map((d) => ({
              direction: d,
              stops: directionStops(db, d.id),
              templates: db.schedule_templates.filter((t) => t.route_direction_id === d.id && t.active),
            }))
            return { route, geometry: version?.geometry ?? null, distance: version?.distance_km ?? 0, directions }
          }),
      [],
    ),
  )
  const selected = routes.find((r) => r.route.id === routeId) ?? routes[0]
  const stats = usePublicStats()

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="ink-gradient pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:pt-14">
          <Pill className="border-primary/30 bg-primary/10 text-primary-200">{stats.routes} published corridors · {stats.stops} stops · {stats.hubs} hubs</Pill>
          <Headline className="mt-6 text-5xl sm:text-6xl">The Abuja network, <span className="text-gradient">stop by stop.</span></Headline>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">Published corridors carry scheduled services with guaranteed capacity. Reference corridors from the FCT planning dataset are being configured and approved one by one.</p>
        </div>
      </section>
      <Section className="pt-4">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {routes.map((entry) => (
              <button key={entry.route.id} onClick={() => setRouteId(entry.route.id)} className={cn('glass press flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors', selected?.route.id === entry.route.id ? 'border-primary/50' : 'border-border hover:border-white/20')}>
                <span className="size-3 rounded-full" style={{ background: entry.route.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{entry.route.public_name}</span>
                  <span className="block text-xs text-white/50">{entry.route.code} · {km(entry.distance)} · {entry.directions[0]?.stops.length ?? 0} stops</span>
                </span>
                <ArrowRight className="size-4 text-white/40" />
              </button>
            ))}
            <div className="glass rounded-2xl border border-dashed border-border p-4 text-xs text-white/50">
              Airport ↔ CBD and eleven further corridors are in planning. They appear here when operations publish them.
            </div>
          </div>
          <div className="glass overflow-hidden rounded-3xl border border-border">
            <div className="h-[460px]">
              <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                <DamovMap layers={layers} theme="dark" mode="rider" showHubs={false} showIncidents={false} selectedRouteId={selected?.route.id ?? null} fitTo={selected?.geometry ?? null} interactive />
              </Suspense>
            </div>
            {selected && (
              <div className="grid gap-6 border-t border-border p-5 md:grid-cols-2">
                {selected.directions.map(({ direction, stops, templates }) => (
                  <div key={direction.id}>
                    <p className="font-semibold text-white">{direction.name}</p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {templates.map((t) => `${t.start_time}–${t.end_time} every ${t.headway_minutes} min`).join(' · ') || 'Schedule pending'}
                    </p>
                    <ol className="mt-3 space-y-0 border-l border-border pl-4">
                      {stops.map(({ routeStop, stop }, i) => (
                        <li key={routeStop.id} className="relative py-1.5 text-sm text-white/80">
                          <span className={cn('absolute -left-[21px] top-2.5 size-2.5 rounded-full border-2 border-ink-900', i === 0 || i === stops.length - 1 ? 'bg-primary' : 'bg-white/40')} />
                          {stop.name} <span className="text-xs text-white/40 tnum">+{routeStop.scheduled_offset_minutes} min</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>
      <CtaBand title="Ride the published corridors today." lead="Guaranteed seats on every departure on the board." primary={{ label: 'Book a journey', to: '/signin' }} />
    </>
  )
}

/* ------------------------------------------------------------------ */

export function AboutPage() {
  const milestones = [
    { when: 'Late 2025', what: 'Abuja reference GIS compiled: 14 corridors, 36 stops, 66 proposed transit hubs.' },
    { when: 'Q1 2026', what: 'Mararaba ↔ CBD configured as the pilot corridor; fare and sponsor policies published.' },
    { when: 'Q2 2026', what: 'First institutional programme live with the Federal Ministry of Transportation.' },
    { when: 'Q3 2026', what: 'Kubwa ↔ CBD published. Company and school programmes join. Cash sessions reconciled daily at two hubs.' },
    { when: 'Next', what: 'Airport Road approval, live telematics feed, WhatsApp booking channel.' },
  ]
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="ink-gradient pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:pt-14">
          <Pill className="border-primary/30 bg-primary/10 text-primary-200">About Damov</Pill>
          <Headline className="mt-6 max-w-4xl text-5xl sm:text-6xl">Feeling uncertain about your commute <span className="text-gradient">should not be normal.</span></Headline>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">Damov is a controlled transport operating system. It guarantees passenger capacity, operates predictable scheduled services, reconciles every passenger and every naira, and proves the economics of each route — so a city can run buses the way it runs anything it takes seriously.</p>
        </div>
      </section>
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Safety should not feel uncertain', body: 'Vehicles are inspected before every run, drivers are licensed and approved, every boarding is a named record, and incidents have an owner and a timeline.' },
            { icon: Clock, title: 'Your time matters', body: 'Scheduled departures with published headways. Fewer stops, smarter routes, a seat you did not have to fight for.' },
            { icon: Target, title: 'Prove it with numbers', body: 'A route either pays its way or it does not. We would rather show the contribution margin than argue about it.' },
          ].map((v) => (
            <div key={v.title} className="glass rounded-3xl border border-border p-7">
              <span className="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-300 [&_svg]:size-6"><v.icon /></span>
              <h3 className="font-display mt-5 text-xl font-semibold text-white">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{v.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <SectionTitle title="How the pilot has grown" lead="From a planning dataset to a reconciled daily service on two corridors." />
          <ol className="relative border-l border-border pl-6">
            {milestones.map((m, i) => (
              <motion.li key={m.when} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="relative pb-8 last:pb-0">
                <span className={cn('absolute -left-[31px] top-1 size-3 rounded-full border-2 border-ink-900', i === milestones.length - 1 ? 'bg-white/30' : 'bg-primary')} />
                <p className="text-xs font-semibold text-primary-300">{m.when}</p>
                <p className="mt-1 text-[15px] text-white/85">{m.what}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </Section>
      <Section className="pt-0">
        <div className="glass grid gap-8 rounded-3xl border border-border p-8 md:grid-cols-3">
          {[
            { icon: Users, title: 'Minimum necessary data', body: 'We collect what a ticket needs. No BVN, no NIN, no biometrics.' },
            { icon: MapPin, title: 'Movement data is sensitive', body: 'Individual travel history is restricted; institutions and executives see aggregates by default.' },
            { icon: Bus, title: 'No fabricated live status', body: 'A stale position is labelled stale. A simulated bus wears a badge that says so.' },
          ].map((p) => (
            <div key={p.title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-white/[0.03] text-white/80 [&_svg]:size-5"><p.icon /></span>
              <div><p className="font-semibold text-white">{p.title}</p><p className="mt-1 text-sm text-white/60">{p.body}</p></div>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand title="Build the corridor with us." lead="Operators, sponsors, and the people who run terminals: there is room on the network." primary={{ label: 'Get in touch', to: '/contact' }} secondary={{ label: 'See the platform', to: '/operators' }} />
    </>
  )
}

/* ------------------------------------------------------------------ */

export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', organisation: '', topic: '', message: '' })
  const [sent, setSent] = useState(false)
  function submit() {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Add your name, email and a message so we can reply.')
      return
    }
    setSent(true)
    toast.success('Message received', { description: 'The operations desk replies within one working day.' })
  }
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="ink-gradient pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:pt-14">
          <Pill className="border-primary/30 bg-primary/10 text-primary-200">Contact</Pill>
          <Headline className="mt-6 text-5xl sm:text-6xl">Talk to a <span className="text-gradient">person.</span></Headline>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">Riders, sponsors, operators and drivers all reach the same desk. Tell us who you are and what you need.</p>
        </div>
      </section>
      <Section className="pt-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            {[
              { icon: Headset, title: 'Rider support', body: 'Tickets, fares and boarding questions.', line: '0700 DAMOV 00 · 05:00–22:00 WAT' },
              { icon: Envelope, title: 'Programmes and partnerships', body: 'Institutions, operators and fleet owners.', line: 'partners@damov.ng' },
              { icon: Phone, title: 'Operations desk', body: 'Incidents and service disruption.', line: 'Control room, Nyanya Operations Depot' },
            ].map((c) => (
              <div key={c.title} className="glass flex gap-4 rounded-2xl border border-border p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary-300 [&_svg]:size-5"><c.icon /></span>
                <div><p className="font-semibold text-white">{c.title}</p><p className="text-sm text-white/60">{c.body}</p><p className="mt-1 text-sm text-primary-300">{c.line}</p></div>
              </div>
            ))}
          </div>
          <div className="glass rounded-3xl border border-border p-6 sm:p-8">
            {sent ? (
              <div className="py-10 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"><Send className="size-6" /></span>
                <p className="font-display mt-4 text-2xl font-semibold text-white">Received</p>
                <p className="mt-2 text-sm text-white/60">We reply within one working day. In the meantime, the network page shows today's services.</p>
                <Button asChild variant="outline" className="mt-6 border-white/15 text-white"><Link to="/network">See the network</Link></Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label required>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label required>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Organisation</Label><Input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>I am</Label>
                  <Select value={form.topic} onValueChange={(v) => setForm({ ...form, topic: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent>
                      {['A rider', 'An institution sponsoring commutes', 'An operator or fleet owner', 'A driver', 'Press', 'Something else'].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2"><Label required>Message</Label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-white/45">This form writes to the operations inbox in production; in this build it confirms locally.</p>
                  <Button size="lg" onClick={submit}>Send message <Send /></Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  )
}
