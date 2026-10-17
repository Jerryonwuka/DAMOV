import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Landmark as Bank, Briefcase, Bus, FileBarChart as ChartLineUp, CheckCircle2, Coins, GraduationCap, Handshake, MapPin,
  QrCode, ScanLine, Seat, ShieldCheck, SteeringWheel, Ticket, Timer, Users, Wallet,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { AnimatedNumber } from '@/components/ui/patterns'
import { SegmentBar } from '@/components/charts'
import { naira, pct } from '@/lib/format'
import { useDb } from '@/db/store'
import { useCallback } from 'react'
import {
  BrowserFrame, CtaBand, Faq, FeatureRow, Headline, Marquee, PhoneFrame, Pill, RecruitCard, Section, SectionTitle,
} from './shared'
import { ControlMock, GateMock, TicketMock, usePublicStats } from './mocks'
import { cn } from '@/lib/utils'

const LOOP = [
  { step: 'Register', body: 'Your phone number is your account. If your employer sponsors commutes, your staff ID links you to the programme.', icon: Users },
  { step: 'Route', body: 'Pick a corridor and your boarding and alighting stops. Availability is checked for every segment in between.', icon: MapPin },
  { step: 'Book', body: 'Your seat is held on each segment of the journey the moment you confirm — no overselling at intermediate stops.', icon: Seat },
  { step: 'Pay', body: 'Card, transfer, or cash at a hub counter. The fare and any sponsor contribution are shown in plain words before you pay.', icon: Wallet },
  { step: 'Board', body: 'Show the QR. The gate checks ticket, trip, stop, time window and payment on the server and answers in seconds.', icon: QrCode },
  { step: 'Move', body: 'Scheduled departures with published headways. Delays are posted; a bus is never shown as live when its signal is stale.', icon: Bus },
  { step: 'Measure', body: 'Every ticket and every naira reconciles to a trip, a bus and a route — and to a contribution margin.', icon: ChartLineUp },
]

export function Landing() {
  const stats = usePublicStats()
  const corridors = useDb(
    useCallback(
      (db) =>
        db.route_directions
          .filter((d) => d.direction_code === 'inbound' && db.routes.find((r) => r.id === d.route_id)?.status === 'published')
          .map((d) => ({
            name: d.name,
            stops: db.route_stops.filter((rs) => rs.route_direction_id === d.id).sort((a, b) => a.sequence - b.sequence).map((rs) => db.stops.find((s) => s.id === rs.stop_id)?.name ?? ''),
          })),
      [],
    ),
  )
  const marqueeItems = corridors.flatMap((c) => c.stops).concat(['Mararaba', 'Kubwa', 'Central Business District', 'Nyanya', 'Berger', 'Gwarinpa', 'Jabi', 'Wuse'])

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="ink-gradient pointer-events-none absolute inset-0 -z-10" />
        <div className="surface-dots pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-16">
          <div>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              <Pill className="border-primary/30 bg-primary/10 text-primary-200">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-primary" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
                Live in Abuja · {stats.snapshot.buses_active} buses on the road right now
              </Pill>
              <Headline className="mt-6">
                A seat that is
                <br />
                yours. A bus that
                <br />
                <span className="text-gradient">leaves on time.</span>
              </Headline>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">
                Damov runs scheduled, capacity-guaranteed shuttle services across Abuja. Book a seat on your corridor, pay
                what you see, scan to board, and let your employer cover their share. No crowding at the door, no guessing
                when the next bus comes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="xl"><Link to="/signin">Book a journey <ArrowRight /></Link></Button>
                <Button asChild size="xl" variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10"><Link to="/network">See the network</Link></Button>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
                {[
                  { label: 'Passengers this week', value: <AnimatedNumber value={stats.weekPassengers} /> },
                  { label: 'On-time departures', value: pct(stats.onTime) },
                  { label: 'Gate validation', value: `${stats.validationSeconds}s` },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-white/50">{item.label}</dt>
                    <dd className="font-display mt-1 text-2xl font-semibold text-white tnum sm:text-3xl">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>

          {/* Device cluster */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto h-[640px] w-full max-w-[560px]">
            <BrowserFrame className="absolute left-0 top-6 w-[520px] max-w-full origin-top-left scale-[0.82] sm:scale-95" title="control.damov.ng · Command Centre">
              <ControlMock compact />
            </BrowserFrame>
            <div className="absolute -bottom-2 right-0 origin-bottom-right scale-[0.78] sm:scale-90">
              <PhoneFrame><TicketMock /></PhoneFrame>
            </div>
            <div className="pointer-events-none absolute -right-20 top-10 size-72 rounded-full bg-primary/20 blur-3xl" />
          </motion.div>
        </div>

        {/* Corridor marquee */}
        <div className="border-y border-border/70 bg-ink-900/60 py-4 backdrop-blur">
          <Marquee items={marqueeItems.map((stop, i) => <Pill key={`${stop}-${i}`}><MapPin className="size-3.5 text-primary-300" />{stop}</Pill>)} />
        </div>
      </section>

      {/* Audiences */}
      <Section>
        <SectionTitle title="One network. Built for everyone on the corridor." lead="Passengers, the organisations that sponsor their commute, and the people who run the buses all work from the same source of truth." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { to: '/riders', icon: Ticket, title: 'Riders', lead: 'Book a guaranteed seat, pay the fare you were shown, scan to board.', tone: 'primary' },
            { to: '/institutions', icon: Bank, title: 'Institutions', lead: 'Sponsor staff commutes with rules you set and spend you can audit.', tone: 'sky' },
            { to: '/operators', icon: Briefcase, title: 'Operators', lead: 'Dispatch, boarding, cash sessions and route economics in one control room.', tone: 'amber' },
            { to: '/contact', icon: SteeringWheel, title: 'Drivers', lead: 'Inspect, start and run a trip from a phone built for a moving bus.', tone: 'pink' },
          ].map((card, i) => (
            <motion.div key={card.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: i * 0.06 }}>
              <Link to={card.to} className="group glass relative flex h-full flex-col overflow-hidden rounded-3xl border border-border p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                <span className={cn('grid size-14 place-items-center rounded-2xl border [&_svg]:size-7', {
                  'border-primary/30 bg-primary/10 text-primary-300': card.tone === 'primary',
                  'border-sky-400/30 bg-sky-400/10 text-sky-300': card.tone === 'sky',
                  'border-amber-400/30 bg-amber-400/10 text-amber-300': card.tone === 'amber',
                  'border-pink-400/30 bg-pink-400/10 text-pink-300': card.tone === 'pink',
                })}><card.icon /></span>
                <h3 className="font-display mt-6 text-2xl font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{card.lead}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary-300">Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* The loop */}
      <Section className="pt-0">
        <SectionTitle title="Register → Route → Book → Pay → Board → Move → Measure" lead="The whole operation is one loop. Each step writes to the record the next one reads, so a cash ticket sold at a counter is as visible as a card booking made on a phone." />
        <ol className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {LOOP.map((item, i) => (
            <motion.li key={item.step} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.05 }} className="glass relative rounded-2xl border border-border p-5">
              <span className="font-display text-xs font-semibold text-primary-300 tnum">{String(i + 1).padStart(2, '0')}</span>
              <span className="mt-3 grid size-10 place-items-center rounded-xl border border-border bg-white/[0.03] text-white/80 [&_svg]:size-5"><item.icon /></span>
              <p className="mt-4 font-semibold text-white">{item.step}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/55">{item.body}</p>
            </motion.li>
          ))}
        </ol>
      </Section>

      {/* Control showcase */}
      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionTitle title="A control room that proves the economics of every route." lead="Dispatchers see the network move. Finance sees what each trip earned and cost. Leadership sees contribution margin by route, by bus, by departure — computed from the same tickets passengers carry." />
            <div className="mt-8 space-y-5">
              <FeatureRow icon={Seat} title="Segment-level capacity">A journey from Mararaba to Nyanya frees its seat for the Nyanya to CBD leg. The bus is never oversold at an intermediate stop.</FeatureRow>
              <FeatureRow icon={Coins} title="Cash that reconciles">Every cash ticket belongs to an open session. Expected cash is computed, never typed, and a variance needs an explanation before a session can close.</FeatureRow>
              <FeatureRow icon={ShieldCheck} title="Audited overrides">Supervisor overrides at the gate, driver reassignments and policy changes are written to an audit log against a named person.</FeatureRow>
            </div>
            <Button asChild variant="link" className="mt-6 px-0 text-primary-300"><Link to="/operators">Explore Damov Control <ArrowRight /></Link></Button>
          </div>
          <BrowserFrame><ControlMock /></BrowserFrame>
        </div>
      </Section>

      {/* Gate + fare transparency */}
      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="order-2 flex justify-center lg:order-1">
            <PhoneFrame><GateMock /></PhoneFrame>
          </div>
          <div className="order-1 lg:order-2">
            <SectionTitle title="Scan. Decide. Board — in seconds." lead="The gate never guesses. A ticket's QR carries nothing but an opaque token; the server resolves it, checks eight things, and shows a large green or a large red. Duplicate boarding is refused unless a supervisor reverses the first scan." />
            <div className="glass mt-8 rounded-2xl border border-border p-5">
              <p className="text-sm font-semibold text-white">A sponsored fare, explained in words</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-white/70"><dt>Gross fare</dt><dd className="tnum">{naira(550)}</dd></div>
                <div className="flex justify-between text-primary-300"><dt>FMoT contribution</dt><dd className="tnum">− {naira(300)}</dd></div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold text-white"><dt>You pay</dt><dd className="tnum text-lg">{naira(250)}</dd></div>
              </dl>
              <p className="mt-3 rounded-lg bg-primary/10 p-2.5 text-xs text-primary-200">Eligible: FMoT covers ₦300; passenger pays ₦250.</p>
              <SegmentBar className="mt-4" segments={[{ label: 'Passenger', value: 250 }, { label: 'Sponsor', value: 300 }]} />
            </div>
          </div>
        </div>
      </Section>

      {/* Numbers */}
      <Section className="pt-0">
        <div className="ink-gradient relative overflow-hidden rounded-3xl border border-border p-8 sm:p-12">
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Published corridors', value: stats.routes, note: `${stats.stops} active stops · ${stats.hubs} hubs` },
              { label: 'Passengers · 7 days', value: stats.weekPassengers, note: `${stats.passengerDelta.value >= 0 ? '+' : ''}${stats.passengerDelta.value}% vs the days before` },
              { label: 'Sponsoring organisations', value: stats.sponsors, note: 'Ministries, companies, schools' },
              { label: 'Average gate validation', value: stats.validationSeconds, note: 'seconds, target under 10', suffix: 's' },
            ].map((item) => (
              <div key={item.label}>
                <p className="font-display text-4xl font-semibold text-white tnum sm:text-5xl"><AnimatedNumber value={Number(item.value)} />{item.suffix ?? ''}</p>
                <p className="mt-2 text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-white/50">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Voices */}
      <Section className="pt-0">
        <SectionTitle title="What the pilot corridor is saying" align="center" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { quote: 'I stopped leaving home at five. The 06:40 leaves at 06:40, and my seat is mine whether I board at Mararaba or Nyanya.', who: 'Commuter, Mararaba → CBD' },
            { quote: 'For the first time I can tell the permanent secretary exactly what the transport programme bought: trips, staff, naira — and nothing about where any named person went.', who: 'Programme lead, sponsoring ministry' },
            { quote: 'My drawer balances to the naira because the system already knows what it should hold. Closing a session takes two minutes, not an argument.', who: 'Hub agent, CBD Central Interchange' },
          ].map((t, i) => (
            <motion.figure key={t.who} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="glass flex flex-col rounded-3xl border border-border p-6">
              <ScanLine className="size-6 text-primary-300" />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-white/85">“{t.quote}”</blockquote>
              <figcaption className="mt-5 text-xs text-white/50">{t.who}</figcaption>
            </motion.figure>
          ))}
        </div>
      </Section>

      {/* Recruit */}
      <Section className="pt-0">
        <div className="grid gap-4 md:grid-cols-2">
          <RecruitCard icon={SteeringWheel} title="Drive with Damov" lead="Scheduled shifts, a vehicle you inspect before every run, and a phone app that walks you stop by stop. Professional drivers with a valid FCT licence are welcome to apply." to="/contact" cta="Apply to drive" />
          <RecruitCard icon={Handshake} title="Partner with Damov" lead="Ministries, companies and schools sponsor staff commutes with rules they set. Operators bring vehicles onto a network that reconciles every trip. Let's talk." to="/contact" cta="Start a conversation" tone="amber" />
        </div>
      </Section>

      {/* FAQ */}
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <SectionTitle title="Questions, answered plainly" lead="If yours is not here, the contact page reaches a person at the operations desk." />
          <Faq
            items={[
              { q: 'Do I need a new card or a wallet to ride?', a: 'No. Your phone number is your account. Pay by card, transfer or cash at a hub. There is no stored-value wallet to top up.' },
              { q: 'What does “guaranteed seat” actually mean?', a: 'When you confirm a booking, one seat is reserved on every segment between your boarding and alighting stops in a single database transaction. If any segment is full the whole booking fails and you are offered the next departure — you are never sold a seat the bus does not have.' },
              { q: 'How does my employer pay their share?', a: 'Your organisation publishes a subsidy policy — routes, days, time bands, trip limits, an amount or percentage, and a budget ceiling. Every booking is evaluated against it on the server and you see the result in words before you pay. Your employer sees aggregated usage and spend, never your individual travel history.' },
              { q: 'Can I see where my bus is?', a: 'In the pilot you see the scheduled estimate and live trip status. Live positions appear as the telematics feed is connected — and a position is never shown as live once it is stale.' },
              { q: 'What if I miss the bus?', a: 'Cancel before departure and your seat returns to every segment it was held on; sponsor contributions return to the programme budget. A no-show after departure is recorded as such on the manifest.' },
            ]}
          />
        </div>
      </Section>

      <CtaBand title={<>Your corridor. <span className="text-gradient">Your seat.</span></>} lead="Book the next departure on the Mararaba ↔ CBD and Kubwa ↔ CBD corridors, or bring your organisation onto the programme." primary={{ label: 'Book a journey', to: '/signin' }} secondary={{ label: 'Talk to us', to: '/contact' }} />
    </>
  )
}

export { CheckCircle2, GraduationCap, Timer }
