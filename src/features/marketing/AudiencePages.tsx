import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Banknote, Bus, ChartLine, ClipboardCheck, Coins, Compass, CreditCard, Eye, FileBarChart, Gauge,
  Landmark, ListChecks, Lock, MapPin, QrCode, ScanLine, Seat, ShieldCheck, Smartphone, Timer, Users, Wallet,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { SegmentBar } from '@/components/charts'
import { naira } from '@/lib/format'
import { BrowserFrame, CtaBand, Faq, FeatureRow, Headline, PhoneFrame, Pill, Section, SectionTitle } from './shared'
import { ControlMock, GateMock, TicketMock, usePublicStats } from './mocks'

type Feature = { icon: React.ComponentType<{ className?: string }>; title: string; body: string }

function Hero({ eyebrow, title, lead, primary, secondary, visual }: { eyebrow: string; title: React.ReactNode; lead: string; primary: { label: string; to: string }; secondary?: { label: string; to: string }; visual: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div className="ink-gradient pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-14">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <Pill className="border-primary/30 bg-primary/10 text-primary-200">{eyebrow}</Pill>
          <Headline className="mt-6 text-5xl sm:text-6xl">{title}</Headline>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">{lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="xl"><Link to={primary.to}>{primary.label} <ArrowRight /></Link></Button>
            {secondary && <Button asChild size="xl" variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10"><Link to={secondary.to}>{secondary.label}</Link></Button>}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="flex justify-center">{visual}</motion.div>
      </div>
    </section>
  )
}

function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f, i) => (
        <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.05 }} className="glass rounded-2xl border border-border p-6">
          <span className="grid size-11 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary-300 [&_svg]:size-5"><f.icon /></span>
          <p className="mt-4 font-semibold text-white">{f.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">{f.body}</p>
        </motion.div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function RidersPage() {
  const stats = usePublicStats()
  return (
    <>
      <Hero
        eyebrow="Damov Rider Lite"
        title={<>Book it. Scan it. <span className="text-gradient">Sit down.</span></>}
        lead="A guaranteed seat on your corridor, a fare you can read before you pay, and a QR that gets you through the gate in seconds. Your phone number is your account — no new card, no wallet to top up."
        primary={{ label: 'Book a journey', to: '/signin' }}
        secondary={{ label: 'See routes and times', to: '/network' }}
        visual={<PhoneFrame><TicketMock /></PhoneFrame>}
      />
      <Section>
        <SectionTitle title="Everything a commute should have had all along" lead={`${stats.weekPassengers.toLocaleString('en-NG')} passengers rode with a guaranteed seat this week. Here is what they get.`} />
        <FeatureGrid features={[
          { icon: Seat, title: 'A seat on every segment', body: 'Your booking holds one seat on each stretch between your boarding and alighting stops. Nobody standing, nobody turned away at Nyanya because the bus filled at Mararaba.' },
          { icon: Timer, title: 'Departures that mean it', body: 'Published headways, scheduled times, and a departure recorded to the minute. Our on-time target is 90%; the live rate is on every operator screen.' },
          { icon: Wallet, title: 'Fares in plain words', body: 'Gross fare, sponsor contribution, what you pay. If a subsidy does not apply, the screen says why — "outside programme hours", not a silent higher price.' },
          { icon: QrCode, title: 'A QR that carries nothing', body: 'The code is an opaque token. It holds no name, no fare, no staff ID. The gate asks the server; a screenshot proves nothing.' },
          { icon: CreditCard, title: 'Pay how you already pay', body: 'Card, bank transfer, or cash at a hub counter. Cash passengers get the same ticket and the same seat guarantee.' },
          { icon: Lock, title: 'Your movements are yours', body: 'Sponsors see aggregated usage and the subsidy they funded — never where a named person travelled. Location sharing is off unless you turn it on.' },
        ]} />
      </Section>
      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionTitle title="If your employer sponsors commutes, it shows up automatically." lead="Enter your staff ID once. Every eligible booking is priced with your organisation's contribution, and the rules — days, hours, trips per day — are explained on the quote." />
            <div className="glass mt-8 rounded-2xl border border-border p-5">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between text-white/70"><dt>Mararaba Park → CBD Terminal</dt><dd className="tnum">{naira(550)}</dd></div>
                <div className="flex justify-between text-primary-300"><dt>FMoT contribution</dt><dd className="tnum">− {naira(300)}</dd></div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold text-white"><dt>You pay</dt><dd className="font-display tnum text-xl">{naira(250)}</dd></div>
              </dl>
              <SegmentBar className="mt-4" segments={[{ label: 'You', value: 250 }, { label: 'Sponsor', value: 300 }]} />
            </div>
          </div>
          <div className="space-y-5">
            <FeatureRow icon={Smartphone} title="Works on any phone">Rider Lite is a web app. Nothing to download; it opens in the browser you already have and remembers you.</FeatureRow>
            <FeatureRow icon={MapPin} title="Scheduled estimates, honestly labelled">You see the planned time for your stop and the trip's live status. We never show a bus as live when its signal is stale.</FeatureRow>
            <FeatureRow icon={ShieldCheck} title="Cancel and the seat goes back">Cancel before departure and every segment you held is released for someone else — and any sponsor share returns to the programme.</FeatureRow>
          </div>
        </div>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <SectionTitle title="Rider questions" />
          <Faq items={[
            { q: 'Which corridors run today?', a: 'Mararaba ↔ CBD and Kubwa ↔ CBD are published. Airport Road is in approval. The network page lists every stop and the current headways.' },
            { q: 'How early should I be at the stop?', a: 'Boarding opens 45 minutes before departure and closes 5 minutes after it. Your ticket shows the scheduled time for your boarding stop.' },
            { q: 'Can someone else use my ticket?', a: 'A ticket can be boarded once. The gate shows the passenger name to the agent, and a second scan is refused unless a supervisor reverses the first — which is logged.' },
            { q: 'What happens if the trip is cancelled?', a: 'You are notified in the app and by SMS, your payment is reversed, and any sponsor contribution returns to the programme budget.' },
          ]} />
        </div>
      </Section>
      <CtaBand title="Your next departure is on the board." lead="Sign in with your phone number and book a guaranteed seat on today's services." primary={{ label: 'Book a journey', to: '/signin' }} secondary={{ label: 'Routes and times', to: '/network' }} />
    </>
  )
}

/* ------------------------------------------------------------------ */

export function InstitutionsPage() {
  return (
    <>
      <Hero
        eyebrow="Damov Institutional"
        title={<>Sponsor the commute. <span className="text-gradient">Audit every naira.</span></>}
        lead="Ministries, companies and schools fund staff travel with rules they set: routes, days, time bands, trips per day, a fixed amount or a percentage, and a budget ceiling. Every booking is evaluated against the policy on the server, and the programme dashboard shows exactly what the money bought."
        primary={{ label: 'Talk to the programme team', to: '/contact' }}
        secondary={{ label: 'How riders see it', to: '/riders' }}
        visual={<BrowserFrame title="institutional.damov.ng · Programme Overview"><ControlMock compact /></BrowserFrame>}
      />
      <Section>
        <SectionTitle title="A programme you can defend in a budget meeting" lead="Aggregated by default. Individual travel history is never exposed to the sponsor — the report is trips, riders, gross transport value, your contribution and what remains." />
        <FeatureGrid features={[
          { icon: ListChecks, title: 'Policy builder', body: 'Eligible routes and directions, days of the week, time bands, trips per day or month, fixed or percentage subsidy with a per-trip cap, validity dates and a budget ceiling. Versioned, with an approval step.' },
          { icon: Users, title: 'Eligible rider management', body: 'Import a staff list by CSV, verify against staff IDs, revoke or extend eligibility. Riders match themselves at sign-up; you confirm.' },
          { icon: Coins, title: 'Reserved, then recognised', body: 'Liability is reserved when a booking is confirmed and recognised when the passenger boards. Cancellations return the reservation to the budget automatically.' },
          { icon: FileBarChart, title: 'Monthly statement', body: 'Gross transport value, passenger contributions, your contribution, active riders, adoption rate, peak time bands, exceptions — exported with the period, the filters and the generating user on it.' },
          { icon: Eye, title: 'Aggregated reporting', body: 'Primary corridors, peak hours and utilisation are reported as totals. Executives and sponsors do not see a named person’s movements.' },
          { icon: Landmark, title: 'Built for Nigerian institutions', body: 'Staff IDs in your own format, Naira throughout, Africa/Lagos time, and a WhatsApp booking channel modelled from day one.' },
        ]} />
      </Section>
      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <BrowserFrame title="institutional.damov.ng · Subsidy Rules">
            <div className="p-5">
              <p className="text-xs text-white/50">FMoT Staff Commute Co-pay 2026 · v2 · published</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[['Routes', 'AB-01, AB-02'], ['Days', 'Mon – Fri'], ['Time bands', '05:30–09:30 · 15:30–20:00'], ['Per trip', '₦300 fixed'], ['Daily cap', '2 trips'], ['Monthly cap', '44 trips'], ['Budget', '₦14,000,000'], ['Valid', 'Jan – Dec 2026']].map(([k, v]) => (
                  <div key={k} className="glass rounded-xl border border-border p-3"><dt className="text-[11px] text-white/50">{k}</dt><dd className="mt-0.5 font-medium text-white">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl bg-primary/10 p-3 text-xs text-primary-200">Eligible: FMoT covers ₦300; passenger pays ₦250.</div>
            </div>
          </BrowserFrame>
          <div className="space-y-5">
            <SectionTitle title="Rules in, explanations out." lead="Every quote carries a one-line reason the passenger can read and your finance team can audit: eligible and how much, or not eligible and why." />
            <FeatureRow icon={ShieldCheck} title="Server-side, every time">Eligibility is never decided on a phone. The same function prices a counter sale, a web booking and a WhatsApp booking.</FeatureRow>
            <FeatureRow icon={ChartLine} title="Budget burn you can watch">Reserved against recognised, by day and by corridor, with the ceiling drawn on the chart.</FeatureRow>
          </div>
        </div>
      </Section>
      <CtaBand title="Bring your organisation onto the corridor." lead="A programme can be live within a week of a signed staff list. Start with a pilot cohort and scale by route." primary={{ label: 'Talk to the programme team', to: '/contact' }} />
    </>
  )
}

/* ------------------------------------------------------------------ */

export function OperatorsPage() {
  const stats = usePublicStats()
  return (
    <>
      <Hero
        eyebrow="Damov Control · Hub · Driver"
        title={<>Run the network like <span className="text-gradient">an operating system.</span></>}
        lead="Dispatch, boarding, cash sessions, incidents and route economics in one place, over one dataset. The map is the shared spatial layer under all of it — and a stale position is labelled stale, never passed off as live."
        primary={{ label: 'Request a walkthrough', to: '/contact' }}
        secondary={{ label: 'See the network map', to: '/network' }}
        visual={<BrowserFrame><ControlMock compact /></BrowserFrame>}
      />
      <Section>
        <SectionTitle title="Three surfaces, one source of truth" lead="Control for dispatchers, finance and leadership. Hub for the counter and the gate. Driver for the person behind the wheel." />
        <FeatureGrid features={[
          { icon: Compass, title: 'Dispatch board', body: 'Assign vehicle and driver per trip with availability, maintenance and licence checks enforced. Hold, reassign, cancel or short-turn with a reason and an audit entry.' },
          { icon: Seat, title: 'Segment inventory', body: 'Per-trip, per-segment capacity. A booking reserves every segment it spans in one transaction, or fails whole. No statistical overbooking.' },
          { icon: ScanLine, title: 'Boarding that decides', body: 'QR, booking code, phone or staff ID. Eight server-side checks, a large green or red, duplicate scans refused, supervisor overrides written to the log.' },
          { icon: Banknote, title: 'Cash sessions', body: 'Opening float in, every cash ticket attached, expected cash computed. A variance needs an explanation; above tolerance it goes to a supervisor. No silent close.' },
          { icon: ClipboardCheck, title: 'Driver app', body: 'Pre-trip inspection with a hard gate, stop-by-stop progression, incident capture with location, shift summary. Built for a phone in a moving bus.' },
          { icon: Gauge, title: 'Route economics', body: 'Gross revenue, direct cost by category, contribution margin per trip, bus and route. Cost per passenger, revenue per kilometre, subsidy per boarded passenger.' },
        ]} />
      </Section>
      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="flex justify-center"><PhoneFrame><GateMock /></PhoneFrame></div>
          <div>
            <SectionTitle title={`A gate decision in ${stats.validationSeconds} seconds, on average.`} lead="The scanner never guesses. It sends an opaque token and gets back a decision with the passenger’s name, journey and sponsor — or a plain reason to refuse." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[['Ticket valid for this departure', 'trip and ticket state'], ['Boarding window open', `configurable before and after`], ['Payment or sponsor settled', 'provider-verified or cash-recorded'], ['Not previously boarded', 'unless a supervisor reversed it']].map(([t, d]) => (
                <div key={t} className="glass rounded-xl border border-border p-4"><p className="text-sm font-semibold text-white">{t}</p><p className="mt-1 text-xs text-white/50">{d}</p></div>
              ))}
            </div>
          </div>
        </div>
      </Section>
      <Section className="pt-0">
        <SectionTitle title="Pilot targets, on every screen" lead="Seeded as configuration and drawn next to the live number — met or not." align="center" />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Trip completion', '≥ 97%'], ['On-time departure', '≥ 90%'], ['Headway adherence', '≥ 85%'], ['Digitally validated boardings', '≥ 95%'], ['Cash variance', '≤ 1%'], ['Digital payment success', '≥ 98%'], ['Peak occupancy', '75 – 90%'], ['Gate validation', '< 10 s']].map(([k, v]) => (
            <div key={k} className="glass rounded-2xl border border-border p-5"><p className="font-display text-2xl font-semibold text-white tnum">{v}</p><p className="mt-1 text-sm text-white/60">{k}</p></div>
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <SectionTitle title="For operators and fleets" />
          <Faq items={[
            { q: 'Can we bring our own vehicles onto the network?', a: 'Yes. Vehicles are registered against an operator organisation with legal and bookable capacity per type; operators see their own fleet, assignments and earnings.' },
            { q: 'What about telematics?', a: 'Vehicle positions are an append-only telemetry table with a webhook abstraction for third-party GPS providers. Until a provider is connected the map shows scheduled estimates and a clearly marked demo simulation.' },
            { q: 'How is the data protected?', a: 'Row-level security per organisation and hub, least-privilege roles, opaque QR tokens, signed access to incident evidence, rate-limited OTP and validation endpoints, and an audit log for every sensitive change.' },
            { q: 'Is this a ride-hailing app?', a: 'No. Damov runs scheduled services with published headways and guaranteed capacity. There is no surge pricing and no seat selection — there is a seat, or there is the next departure.' },
          ]} />
        </div>
      </Section>
      <CtaBand title="See it run on your corridor." lead="A guided walkthrough of Control, Hub and Driver on the live pilot dataset takes forty minutes." primary={{ label: 'Request a walkthrough', to: '/contact' }} />
    </>
  )
}

export { Bus }
