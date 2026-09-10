import { useCallback, useState } from 'react'
import { Download, FileBarChart, Lock } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useConfig, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/patterns'
import { lagosFullDateTime, lagosTime, naira } from '@/lib/format'
import { tripManifest, tripSummaries } from '@/lib/selectors'
import { calculateRoutePerformance, calculateTripEconomics } from '@/server/economics'
import { downloadCsv, percent, sum, titleCase } from '@/lib/utils'
import { store } from '@/db/store'
import type { DamovDatabase } from '@/db/schema'
import { writeAudit } from '@/server/audit'
import { toast } from 'sonner'

interface ReportDef {
  key: string
  title: string
  description: string
  sensitive: boolean
  definitions: string
  build: (db: DamovDatabase, from: string, to: string, tolerance: number) => (string | number | null)[][]
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to

const REPORTS: ReportDef[] = [
  {
    key: 'daily-operations', title: 'Daily operations summary', description: 'Trips, completion, punctuality, occupancy, revenue and margin for each service day.', sensitive: false,
    definitions: 'On-time = departure within tolerance; occupancy = boarded ÷ bookable capacity; contribution margin = recognised revenue − approved direct cost (not net profit)',
    build: (db, from, to, tolerance) => {
      const dates = [...new Set(db.trips.map((t) => t.service_date))].filter((d) => inRange(d, from, to)).sort()
      return [
        ['Service date', 'Trips', 'Completed', 'Cancelled', 'Departed on time', 'On-time %', 'Passengers boarded', 'Avg occupancy %', 'Recognised revenue ₦', 'Direct cost ₦', 'Contribution margin ₦'],
        ...dates.map((date) => {
          const trips = tripSummaries(db, { serviceDate: date })
          const eco = trips.map((t) => calculateTripEconomics(db, t.trip.id))
          const departed = trips.filter((t) => t.trip.actual_departure_at)
          const onTime = departed.filter((t) => (t.delay_minutes ?? 0) <= tolerance)
          const live = eco.filter((e) => e.capacity > 0 && trips.find((t) => t.trip.id === e.trip_id)?.trip.actual_departure_at)
          return [date, trips.length, trips.filter((t) => t.trip.status === 'completed').length, trips.filter((t) => t.trip.status === 'cancelled').length, onTime.length, percent(onTime.length, departed.length), sum(eco.map((e) => e.passenger_count)), live.length ? Math.round(sum(live.map((e) => e.occupancy_pct)) / live.length) : 0, sum(eco.map((e) => e.gross_trip_revenue)), sum(eco.map((e) => e.direct_trip_cost)), sum(eco.map((e) => e.contribution_margin))]
        }),
      ]
    },
  },
  {
    key: 'trip-manifest', title: 'Trip manifest', description: 'Every booking on every trip in the period with boarding state and contributions.', sensitive: true,
    definitions: 'Passenger identity is included; export is logged as sensitive',
    build: (db, from, to) => [
      ['Service date', 'Trip', 'Direction', 'Passenger', 'Phone', 'Staff ID', 'Origin', 'Destination', 'Reference', 'Ticket', 'Channel', 'Status', 'Boarded at', 'Validation', 'Gross ₦', 'Passenger ₦', 'Sponsor ₦', 'Sponsor'],
      ...db.trips.filter((t) => inRange(t.service_date, from, to)).flatMap((trip) => {
        const summary = tripSummaries(db, { serviceDate: trip.service_date }).find((s) => s.trip.id === trip.id)
        return tripManifest(db, trip.id).map((row) => [trip.service_date, trip.trip_code, summary?.direction_name ?? '', row.passenger, row.phone, row.staff_id, row.origin, row.destination, row.booking.booking_reference, row.ticket_code, row.booking.booking_channel, row.booking.status, row.boarded_at ? lagosTime(row.boarded_at) : '', row.validation_method, row.booking.gross_fare, row.booking.passenger_contribution, row.booking.sponsor_contribution, row.sponsor])
      }),
    ],
  },
  {
    key: 'route-performance', title: 'Route performance', description: 'Per-route trips, volume, revenue, cost, margin, occupancy, punctuality and headway.', sensitive: false,
    definitions: 'Headway adherence = consecutive actual gaps within 25% of planned gap',
    build: (db, from, to, tolerance) => [
      ['Route', 'Name', 'Trips', 'Completed', 'Cancelled', 'Passengers', 'Revenue ₦', 'Direct cost ₦', 'Contribution ₦', 'Avg occupancy %', 'On-time %', 'Headway adherence %', 'Peak departure', 'Weakest departure'],
      ...calculateRoutePerformance(db, { from, to, onTimeToleranceMinutes: tolerance }).map((r) => [r.route_code, r.route_name, r.trips, r.completed, r.cancelled, r.passengers, r.gross_revenue, r.direct_cost, r.contribution_margin, r.average_occupancy, r.on_time_rate, r.headway_adherence, r.peak_departure, r.weakest_departure]),
    ],
  },
  {
    key: 'vehicle-utilization', title: 'Vehicle utilisation', description: 'Trips, passengers, revenue, cost and distance for each vehicle.', sensitive: false,
    definitions: 'Distance = sum of full corridor length for departed trips',
    build: (db, from, to) => [
      ['Fleet no.', 'Registration', 'Type', 'Status', 'Trips', 'Passengers', 'Revenue ₦', 'Direct cost ₦', 'Contribution ₦', 'Distance km'],
      ...db.vehicles.map((v) => {
        const trips = db.trips.filter((t) => t.vehicle_id === v.id && inRange(t.service_date, from, to) && t.actual_departure_at)
        const eco = trips.map((t) => calculateTripEconomics(db, t.id))
        return [v.fleet_number, v.registration_number, db.vehicle_types.find((t) => t.id === v.vehicle_type_id)?.name ?? '', v.status, trips.length, sum(eco.map((e) => e.passenger_count)), sum(eco.map((e) => e.gross_trip_revenue)), sum(eco.map((e) => e.direct_trip_cost)), sum(eco.map((e) => e.contribution_margin)), Math.round(sum(eco.map((e) => e.distance_km)))]
      }),
    ],
  },
  {
    key: 'driver-punctuality', title: 'Driver punctuality & assignment history', description: 'Assignments per driver with departure lateness.', sensitive: false,
    definitions: 'Lateness in minutes against scheduled departure',
    build: (db, from, to) => [
      ['Driver', 'Operator ID', 'Licence expiry', 'Service date', 'Trip', 'Vehicle', 'Scheduled', 'Actual', 'Lateness min', 'Status'],
      ...db.driver_profiles.flatMap((d) => {
        const profile = db.profiles.find((p) => p.id === d.profile_id)
        return db.trips.filter((t) => t.driver_id === d.profile_id && inRange(t.service_date, from, to)).map((t) => [profile?.full_name ?? '', profile?.employment_id ?? '', d.licence_expiry, t.service_date, t.trip_code, db.vehicles.find((v) => v.id === t.vehicle_id)?.fleet_number ?? '', lagosTime(t.scheduled_departure_at), t.actual_departure_at ? lagosTime(t.actual_departure_at) : '', t.actual_departure_at ? Math.round((new Date(t.actual_departure_at).getTime() - new Date(t.scheduled_departure_at).getTime()) / 60000) : null, t.status])
      }),
    ],
  },
  {
    key: 'revenue', title: 'Revenue by route, bus, trip, hub and channel', description: 'Every succeeded payment and recognised sponsor amount with its dimensions.', sensitive: false,
    definitions: 'Recognised sponsor revenue is counted at boarding',
    build: (db, from, to) => [
      ['Service date', 'Route', 'Direction', 'Trip', 'Vehicle', 'Origin hub', 'Channel', 'Payer', 'Method', 'Status', 'Amount ₦'],
      ...db.trips.filter((t) => inRange(t.service_date, from, to)).flatMap((trip) => {
        const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)
        const route = db.routes.find((r) => r.id === direction?.route_id)
        const hub = db.hubs.find((h) => h.id === trip.origin_hub_id)?.name ?? ''
        const vehicle = db.vehicles.find((v) => v.id === trip.vehicle_id)?.fleet_number ?? ''
        const bookings = db.bookings.filter((b) => b.trip_id === trip.id)
        const rows: (string | number | null)[][] = []
        for (const b of bookings) {
          for (const p of db.payments.filter((p) => p.booking_id === b.id)) rows.push([trip.service_date, route?.code ?? '', direction?.name ?? '', trip.trip_code, vehicle, hub, b.booking_channel, 'passenger', p.method, p.status, p.amount])
          for (const s of db.sponsor_authorizations.filter((s) => s.booking_id === b.id && s.status === 'recognized')) rows.push([trip.service_date, route?.code ?? '', direction?.name ?? '', trip.trip_code, vehicle, hub, b.booking_channel, 'sponsor', 'sponsor_ledger', 'recognized', s.amount_recognized])
        }
        return rows
      }),
    ],
  },
  {
    key: 'sponsor-subsidy', title: 'Sponsor subsidy usage', description: 'Reserved and recognised subsidy per organisation and policy.', sensitive: false,
    definitions: 'Reserved at booking confirmation; recognised at boarding; released on cancellation',
    build: (db, from, to) => [
      ['Organisation', 'Policy', 'Service date', 'Bookings', 'Reserved ₦', 'Recognised ₦', 'Released ₦', 'Budget ceiling ₦', 'Budget consumed ₦'],
      ...db.subsidy_policies.flatMap((policy) => {
        const org = db.organizations.find((o) => o.id === policy.organization_id)
        const dates = [...new Set(db.trips.map((t) => t.service_date))].filter((d) => inRange(d, from, to)).sort()
        return dates.map((date) => {
          const tripIds = new Set(db.trips.filter((t) => t.service_date === date).map((t) => t.id))
          const auths = db.sponsor_authorizations.filter((s) => s.subsidy_policy_id === policy.id && tripIds.has(db.bookings.find((b) => b.id === s.booking_id)?.trip_id ?? ''))
          return [org?.name ?? '', `${policy.name} v${policy.version}`, date, auths.length, sum(auths.filter((a) => a.status === 'reserved').map((a) => a.amount_reserved)), sum(auths.filter((a) => a.status === 'recognized').map((a) => a.amount_recognized)), sum(auths.filter((a) => a.status === 'released').map((a) => a.amount_reserved)), policy.programme_budget, policy.budget_consumed]
        })
      }),
    ],
  },
  {
    key: 'cash-reconciliation', title: 'Cash-session reconciliation', description: 'Expected, declared, variance, explanation and supervisor decision per session.', sensitive: true,
    definitions: 'Expected = opening float + cash ticket sales attached to the session',
    build: (db, from, to) => [
      ['Opened', 'Closed', 'Hub', 'Agent', 'Opening float ₦', 'Cash sales ₦', 'Expected ₦', 'Declared ₦', 'Variance ₦', 'Explanation', 'Status', 'Supervisor', 'Note'],
      ...db.cash_sessions.filter((s) => inRange(s.opened_at.slice(0, 10), from, to)).map((s) => [lagosFullDateTime(s.opened_at), s.closed_at ? lagosFullDateTime(s.closed_at) : '', db.hubs.find((h) => h.id === s.hub_id)?.name ?? '', db.profiles.find((p) => p.id === s.agent_id)?.full_name ?? '', s.opening_float, s.expected_cash, s.opening_float + s.expected_cash, s.declared_cash, s.variance, s.variance_explanation, s.status, db.profiles.find((p) => p.id === s.supervisor_id)?.full_name ?? '', s.supervisor_note]),
    ],
  },
  {
    key: 'cost-margin', title: 'Cost and contribution-margin report', description: 'Every approved direct cost line with its trip allocation.', sensitive: false,
    definitions: 'Only approved entries feed contribution margin',
    build: (db, from, to) => [
      ['Service date', 'Trip', 'Vehicle', 'Route', 'Category', 'Quantity', 'Unit', 'Amount ₦', 'Source', 'Approval'],
      ...db.cost_entries.filter((c) => inRange(c.service_date, from, to)).map((c) => [c.service_date, db.trips.find((t) => t.id === c.trip_id)?.trip_code ?? '', db.vehicles.find((v) => v.id === c.vehicle_id)?.fleet_number ?? '', db.routes.find((r) => r.id === c.route_id)?.code ?? '', c.category, c.quantity, c.unit, c.amount, c.source, c.approval_status]),
    ],
  },
  {
    key: 'boarding-validation', title: 'Boarding-validation report', description: 'Every validation attempt with method, result, duration and any override or reversal.', sensitive: true,
    definitions: 'Duration is the time from scan to server decision',
    build: (db, from, to) => [
      ['Trip', 'Service date', 'Time', 'Booking', 'Method', 'Result', 'Rejection reason', 'Override reason', 'Duration s', 'Validator', 'Device', 'Reversed at', 'Reversal reason'],
      ...db.boarding_events.filter((e) => inRange(e.boarded_at.slice(0, 10), from, to)).map((e) => { const trip = db.trips.find((t) => t.id === e.trip_id); return [trip?.trip_code ?? '', trip?.service_date ?? '', lagosTime(e.boarded_at), db.bookings.find((b) => b.id === e.booking_id)?.booking_reference ?? '', e.validation_method, e.result, e.rejection_reason, e.override_reason, e.duration_ms ? Math.round(e.duration_ms / 100) / 10 : null, db.profiles.find((p) => p.id === e.validator_user_id)?.full_name ?? '', e.device_id, e.reversed_at ? lagosFullDateTime(e.reversed_at) : '', e.reversal_reason] }),
    ],
  },
  {
    key: 'incidents', title: 'Incident report', description: 'All incidents with severity, effect, owner and resolution.', sensitive: false,
    definitions: 'Resolution time in minutes from report to resolution',
    build: (db, from, to) => [
      ['Reference', 'Reported', 'Category', 'Severity', 'Status', 'Trip', 'Vehicle', 'Route', 'Effect', 'Reporter', 'Assigned', 'Resolved', 'Minutes to resolve', 'Description', 'Resolution'],
      ...db.incidents.filter((i) => inRange(i.reported_at.slice(0, 10), from, to)).map((i) => [i.reference, lagosFullDateTime(i.reported_at), i.category, i.severity, i.status, db.trips.find((t) => t.id === i.trip_id)?.trip_code ?? '', db.vehicles.find((v) => v.id === i.vehicle_id)?.fleet_number ?? '', db.routes.find((r) => r.id === i.route_id)?.code ?? '', i.operational_effect, db.profiles.find((p) => p.id === i.reported_by)?.full_name ?? '', db.profiles.find((p) => p.id === i.assigned_to)?.full_name ?? '', i.resolved_at ? lagosFullDateTime(i.resolved_at) : '', i.resolved_at ? Math.round((new Date(i.resolved_at).getTime() - new Date(i.reported_at).getTime()) / 60000) : null, i.description, i.resolution]),
    ],
  },
]

/** Export centre. Every CSV carries period, generation time, filters, user and metric definitions. */
export function ReportsPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const tolerance = useConfig('service.on_time_tolerance_minutes', 5)
  const [from, setFrom] = useState(() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10) })
  const [to, setTo] = useState(today)

  const recent = useDb(useCallback((db) => db.audit_logs.filter((a) => a.action === 'report.exported').slice(0, 6), []))

  function run(report: ReportDef) {
    if (report.sensitive && !can('action.export_sensitive')) {
      toast.error('This export needs elevated permission', { description: 'Sensitive exports are restricted to finance and operations management.' })
      return
    }
    const db = store.read()
    const rows = report.build(db, from, to, tolerance)
    const provenance: (string | number | null)[][] = [
      [],
      ['Report', report.title],
      ['Period', `${from} to ${to}`],
      ['Generated', lagosFullDateTime(new Date().toISOString())],
      ['Generated by', actor.name],
      ['Filters', `service_date between ${from} and ${to}; on-time tolerance ${tolerance} min`],
      ['Definitions', report.definitions],
      ['Rows', rows.length - 1],
    ]
    downloadCsv(`damov-${report.key}-${from}-to-${to}.csv`, [...rows, ...provenance])
    store.transact((draft) => {
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'report.exported', entity_type: 'report', entity_id: report.key, summary: `${report.title} exported for ${from} → ${to} (${rows.length - 1} rows)`, severity: report.sensitive ? 'sensitive' : 'notice' })
    })
    toast.success(`${report.title} exported`, { description: `${rows.length - 1} rows · CSV with provenance footer` })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="CSV exports with the report period, generation time, filters, the generating user and a definition note for every key metric. PDF statements follow in the next milestone."
        actions={
          <div className="flex items-end gap-2">
            <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
            <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report, index) => (
          <Card key={report.key} className="flex flex-col p-4 animate-rise-in" style={{ animationDelay: `${index * 40}ms` }}>
            <div className="flex items-start justify-between gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary"><FileBarChart className="size-4" /></span>
              {report.sensitive && <Badge tone="warning" size="sm"><Lock className="size-3" /> Sensitive</Badge>}
            </div>
            <p className="mt-3 text-sm font-semibold">{report.title}</p>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{report.description}</p>
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => run(report)}><Download className="size-4" /> Export CSV</Button>
          </Card>
        ))}
      </div>
      {recent.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Recent exports</p>
            <ul className="space-y-1 text-sm">
              {recent.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{entry.summary}</span>
                  <span className="text-muted-foreground">{entry.actor_name} · {lagosFullDateTime(entry.occurred_at)} · {titleCase(entry.severity)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-2xs text-muted-foreground">Amounts are whole Naira. {naira(1000)} formatting is applied in the UI only; CSV cells hold raw integers for spreadsheet arithmetic.</p>
    </div>
  )
}
