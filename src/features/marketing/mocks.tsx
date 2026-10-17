import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bus, Clock, MapPin, ScanLine, ShieldCheck, Users } from '@/components/icons'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { AreaTrend, RingGauge, SERIES, Sparkline } from '@/components/charts'
import { IconTile } from '@/components/ui/card'
import { QrToken } from '@/features/shared/QrToken'
import { dailyHistory, windowDelta } from '@/lib/history'
import { lagosTime, naira, nairaCompact, pct } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'
import { calculateNetworkSnapshot } from '@/server/economics'
import { cn } from '@/lib/utils'

/**
 * Marketing mock-ups rendered from the live dataset.
 *
 * Nothing on the landing page is a static picture of a dashboard: the phone
 * shows a real seeded ticket, the control panel plots the real ten-day
 * revenue series. What a visitor sees is what an operator sees.
 */

export function usePublicStats() {
  const today = useServiceDate()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)
  return useDb(
    useCallback(
      (db) => {
        const history = dailyHistory(db, 10, tolerance)
        const snapshot = calculateNetworkSnapshot(db, today, tolerance)
        const week = history.slice(-7)
        return {
          history,
          snapshot,
          weekPassengers: week.reduce((a, d) => a + d.boarded, 0),
          weekRevenue: week.reduce((a, d) => a + d.revenue, 0),
          passengerDelta: windowDelta(history.map((d) => d.boarded), 3),
          revenueDelta: windowDelta(history.map((d) => d.revenue), 3),
          routes: db.routes.filter((r) => r.status === 'published').length,
          stops: db.stops.filter((s) => s.status === 'active').length,
          hubs: db.hubs.filter((h) => h.status === 'active').length,
          sponsors: db.organizations.filter((o) => ['ministry', 'company', 'school', 'government'].includes(o.type)).length,
          validationSeconds: snapshot.average_validation_seconds,
          onTime: snapshot.on_time_departure_rate,
        }
      },
      [today, tolerance],
    ),
  )
}

/** The Rider Lite ticket, exactly as a passenger carries it. */
export function TicketMock({ className }: { className?: string }) {
  const ticket = useDb(
    useCallback((db) => {
      // A co-paid ticket tells the whole story: gross fare, sponsor share, what was paid.
      const coPaid = db.bookings.find((b) => b.status === 'confirmed' && b.sponsor_contribution > 0 && b.passenger_contribution > 0)
      const t = (coPaid && db.tickets.find((x) => x.booking_id === coPaid.id)) ?? db.tickets.find((x) => x.status === 'issued') ?? db.tickets[0]
      if (!t) return null
      const booking = db.bookings.find((b) => b.id === t.booking_id)!
      const trip = db.trips.find((x) => x.id === booking.trip_id)!
      const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
      const route = db.routes.find((r) => r.id === direction.route_id)!
      const name = (id: string) => db.stops.find((s) => s.id === db.route_stops.find((rs) => rs.id === id)?.stop_id)?.name ?? '—'
      const passenger = db.profiles.find((p) => p.id === booking.rider_id)
      return { t, booking, trip, route, origin: name(booking.origin_route_stop_id), destination: name(booking.destination_route_stop_id), passenger: passenger?.full_name ?? 'Passenger', sponsor: db.organizations.find((o) => o.id === booking.sponsor_id)?.short_name ?? null }
    }, []),
  )
  if (!ticket) return null
  return (
    <div className={cn('flex h-full flex-col bg-ink-900 text-left', className)}>
      <div className="flex items-center justify-between px-5 pb-3 pt-12">
        <div>
          <p className="text-[11px] text-white/50">Tickets</p>
          <p className="text-base font-semibold text-white">Show at the gate</p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-300">Valid</span>
      </div>
      <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="ink-gradient px-4 py-3 text-white">
          <p className="text-[10px] text-white/60">{ticket.route.code} · {ticket.route.public_name}</p>
          <p className="font-display mt-0.5 text-2xl font-semibold tnum">{lagosTime(ticket.trip.scheduled_departure_at)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs"><MapPin className="size-3 text-primary-300" />{ticket.origin} → {ticket.destination}</p>
        </div>
        <div className="flex flex-col items-center px-4 py-4">
          <QrToken token={ticket.t.qr_token} size={150} />
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/40">Ticket code</p>
          <p className="text-sm font-bold tracking-widest text-white tnum">{ticket.t.ticket_code}</p>
          <dl className="mt-3 w-full space-y-1 border-t border-border pt-3 text-xs">
            <div className="flex justify-between text-white/70"><dt>Passenger</dt><dd className="text-white">{ticket.passenger}</dd></div>
            <div className="flex justify-between text-white/70"><dt>Gross fare</dt><dd className="tnum">{naira(ticket.booking.gross_fare)}</dd></div>
            {ticket.sponsor && <div className="flex justify-between text-white/70"><dt>{ticket.sponsor} covered</dt><dd className="tnum text-primary-300">− {naira(ticket.booking.sponsor_contribution)}</dd></div>}
            <div className="flex justify-between font-semibold text-white"><dt>You paid</dt><dd className="tnum">{naira(ticket.booking.passenger_contribution)}</dd></div>
          </dl>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-5 border-t border-border px-2 py-2 text-[9px] text-white/50">
        {['Home', 'Book', 'Trips', 'Tickets', 'Profile'].map((l) => <span key={l} className={cn('text-center', l === 'Tickets' && 'text-primary-300')}>{l}</span>)}
      </div>
    </div>
  )
}

/** A slice of Damov Control: live KPIs and the revenue trend. */
export function ControlMock({ className, compact = false }: { className?: string; compact?: boolean }) {
  const stats = usePublicStats()
  const today = useServiceDate()
  const live = useDb(useCallback((db) => tripSummaries(db, { serviceDate: today }).filter((s) => ['departed', 'in_service'].includes(s.trip.status)).slice(0, 3), [today]))
  const tiles = [
    { label: 'Passengers · 7 days', value: stats.weekPassengers.toLocaleString('en-NG'), delta: stats.passengerDelta, icon: Users, spark: stats.history.map((d) => d.boarded) },
    { label: 'Revenue · 7 days', value: nairaCompact(stats.weekRevenue), delta: stats.revenueDelta, icon: ScanLine, spark: stats.history.map((d) => d.revenue) },
    { label: 'On-time departure', value: pct(stats.onTime), icon: Clock, spark: stats.history.map((d) => d.on_time_rate) },
  ]
  return (
    <div className={cn('p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50">Damov Control / Command Centre</p>
          <p className="text-sm font-semibold text-white">Abuja network · live</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] text-white/70"><span className="size-1.5 rounded-full bg-good" />{stats.snapshot.buses_active} buses in service</span>
      </div>
      <div className={cn('grid gap-3', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
        {tiles.map((tile, i) => (
          <motion.div key={tile.label} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="glass rounded-xl border border-border p-3">
            <div className="flex items-start justify-between">
              <IconTile icon={tile.icon} size="sm" tone={i === 1 ? 'good' : i === 2 ? 'sky' : 'primary'} />
              <div className="w-16"><Sparkline data={tile.spark} height={24} color={i === 1 ? '#2FBF8A' : i === 2 ? SERIES[1] : SERIES[0]} /></div>
            </div>
            <p className="mt-3 text-[11px] text-white/55">{tile.label}</p>
            <p className="font-display text-xl font-semibold text-white tnum">{tile.value}</p>
            {tile.delta && <p className="text-[11px] font-semibold text-[hsl(152_70%_56%)]">{tile.delta.value >= 0 ? '+' : ''}{tile.delta.value}% <span className="font-normal text-white/40">vs prior 3 days</span></p>}
          </motion.div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="glass rounded-xl border border-border p-3">
          <p className="text-[11px] text-white/55">Revenue · last 10 days</p>
          <p className="font-display text-lg font-semibold text-white tnum">{naira(stats.history.reduce((a, d) => a + d.revenue, 0))}</p>
          <AreaTrend data={stats.history} x="label" series={[{ key: 'passenger_revenue', name: 'Passenger fares' }, { key: 'sponsor_revenue', name: 'Sponsor' }]} format={(v) => nairaCompact(v)} height={compact ? 140 : 180} yTicks={4} />
        </div>
        <div className="glass rounded-xl border border-border p-3">
          <p className="text-[11px] text-white/55">In service</p>
          <div className="mt-2 space-y-2">
            {live.length === 0 && <p className="text-xs text-white/50">Next departure {lagosTime(stats.snapshot ? new Date().toISOString() : null)}</p>}
            {live.map((s) => (
              <div key={s.trip.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-ink-800/60 p-2">
                <RingGauge value={s.occupancy_pct} size={34} stroke={3.5}><span className="text-[9px] font-semibold text-white tnum">{Math.round(s.occupancy_pct)}</span></RingGauge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{s.trip.trip_code}</p>
                  <p className="truncate text-[10px] text-white/50">{s.direction_name}</p>
                </div>
                <Bus className="size-4 text-primary-300" />
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 p-2 text-[11px] text-primary-200">
              <ShieldCheck className="size-4" /> Every seat held on every segment
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The gate decision — what a hub agent sees the moment a QR is scanned. */
export function GateMock({ className }: { className?: string }) {
  const stats = usePublicStats()
  return (
    <div className={cn('flex h-full flex-col bg-ink-900 p-5 pt-12 text-left', className)}>
      <p className="text-[11px] text-white/50">Boarding · AB-01 07:40</p>
      <p className="text-base font-semibold text-white">Mararaba → CBD</p>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="mt-5 rounded-2xl border-2 border-primary bg-primary/15 px-4 py-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary text-primary-foreground"><ShieldCheck className="size-7" /></span>
        <p className="font-display mt-4 text-2xl font-semibold text-white">Board the passenger</p>
        <p className="mt-1 text-sm text-white/70">Grace Adeyinka</p>
        <p className="text-xs text-white/50">Mararaba Park → CBD Terminal</p>
        <div className="mt-3 flex justify-center gap-2 text-[10px]">
          <span className="rounded-full border border-border px-2 py-0.5 text-white/70">FMoT sponsored</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-white/70 tnum">{stats.validationSeconds}s</span>
        </div>
      </motion.div>
      <div className="mt-4 space-y-1.5">
        {['Ticket valid for this departure', 'Payment confirmed', 'Sponsor authorisation recognised', 'Not previously boarded'].map((line, i) => (
          <motion.p key={line} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.08 }} className="flex items-center gap-2 text-xs text-white/70">
            <span className="grid size-4 place-items-center rounded-full bg-primary/20 text-primary-300"><ShieldCheck className="size-2.5" /></span>{line}
          </motion.p>
        ))}
      </div>
    </div>
  )
}
