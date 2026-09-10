import { useCallback, useState } from 'react'
import { CalendarClock, Play } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { TripDrawer } from '@/features/shared/TripDrawer'
import { lagosTime } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import type { ScheduleTemplate, ServiceCalendar } from '@/lib/types'
import { generateTripsFromSchedule } from '@/server/trips'
import { toast } from 'sonner'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface TemplateRow {
  template: ScheduleTemplate
  route_code: string
  direction: string
  calendar: ServiceCalendar
  vehicle_type: string
  departures_per_day: number
}

export function SchedulesPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const [date, setDate] = useState(() => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [selected, setSelected] = useState<TripSummary | null>(null)

  const templates = useDb(
    useCallback(
      (db): TemplateRow[] =>
        db.schedule_templates.map((template) => {
          const direction = db.route_directions.find((d) => d.id === template.route_direction_id)!
          const route = db.routes.find((r) => r.id === direction.route_id)!
          const calendar = db.service_calendars.find((c) => c.id === template.service_calendar_id)!
          const [sh, sm] = template.start_time.split(':').map(Number)
          const [eh, em] = template.end_time.split(':').map(Number)
          const count = template.explicit_departure_times?.length ?? Math.floor((eh * 60 + em - (sh * 60 + sm)) / (template.headway_minutes ?? 30)) + 1
          return {
            template, route_code: route.code, direction: direction.name, calendar,
            vehicle_type: db.vehicle_types.find((v) => v.id === template.default_vehicle_type_id)?.name ?? '—',
            departures_per_day: count,
          }
        }),
      [],
    ),
  )
  const trips = useDb(useCallback((db) => tripSummaries(db, { serviceDate: date }), [date]))
  const calendars = useDb(useCallback((db) => db.service_calendars, []))

  function generateAll() {
    let created = 0
    let skipped = 0
    const errors: string[] = []
    for (const row of templates) {
      const result = generateTripsFromSchedule({ schedule_template_id: row.template.id, service_date: date }, actor)
      if (result.ok) {
        created += result.data.created
        skipped += result.data.skipped
      } else if (result.code !== 'no_service') errors.push(`${row.template.name}: ${result.error}`)
    }
    if (errors.length) toast.warning('Some templates were skipped', { description: errors.join(' · ') })
    toast.success(`${created} trips generated for ${date}`, { description: `${skipped} already existed. Segment inventory created for every trip.` })
  }

  const templateColumns: Column<TemplateRow>[] = [
    { key: 'name', header: 'Template', value: (r) => r.template.name, cell: (r) => <span className="font-medium">{r.template.name}</span> },
    { key: 'route', header: 'Service', value: (r) => `${r.route_code} ${r.direction}` },
    { key: 'window', header: 'Window', value: (r) => r.template.start_time, cell: (r) => <span className="tnum">{r.template.start_time} – {r.template.end_time}</span> },
    { key: 'headway', header: 'Headway', align: 'right', value: (r) => r.template.headway_minutes ?? 0, cell: (r) => `${r.template.headway_minutes ?? '—'} min` },
    { key: 'count', header: 'Departures / day', align: 'right', value: (r) => r.departures_per_day },
    { key: 'calendar', header: 'Calendar', value: (r) => r.calendar.name, cell: (r) => <span className="text-xs">{r.calendar.name}<br /><span className="text-muted-foreground">{r.calendar.days_of_week.map((d) => DAYS[d]).join(' ')}</span></span> },
    { key: 'vehicle', header: 'Vehicle type', value: (r) => r.vehicle_type, hideable: true },
    { key: 'active', header: 'Active', value: (r) => (r.template.active ? 1 : 0), cell: (r) => <Badge tone={r.template.active ? 'primary' : 'neutral'}>{r.template.active ? 'Active' : 'Paused'}</Badge> },
  ]

  const tripColumns: Column<TripSummary>[] = [
    { key: 'time', header: 'Departure', value: (r) => r.trip.scheduled_departure_at, cell: (r) => <span className="font-semibold tnum">{lagosTime(r.trip.scheduled_departure_at)}</span> },
    { key: 'code', header: 'Trip', value: (r) => r.trip.trip_code },
    { key: 'service', header: 'Service', value: (r) => `${r.route_code} ${r.direction_name}` },
    { key: 'status', header: 'Status', value: (r) => r.trip.status, cell: (r) => <TripStatusBadge status={r.trip.status} /> },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle ?? '', cell: (r) => r.vehicle ?? <span className="text-muted-foreground">—</span> },
    { key: 'capacity', header: 'Bookable', align: 'right', value: (r) => r.capacity, cell: (r) => `${r.capacity} / ${r.trip.legal_capacity_snapshot}` },
    { key: 'booked', header: 'Booked', align: 'right', value: (r) => r.booked },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Schedules & Trips" description="Departure templates and service calendars generate the day's trips, each with segment inventory created from the vehicle type's bookable capacity." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Schedule templates" value={templates.length} icon={CalendarClock} />
        <StatTile index={1} label="Service calendars" value={calendars.length} />
        <StatTile index={2} label={`Trips on ${date}`} value={trips.length} tone="primary" />
        <StatTile index={3} label="Departures / day (all templates)" value={templates.reduce((a, t) => a + t.departures_per_day, 0)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Departure templates</CardTitle></CardHeader>
        <CardContent>
          <DataTable data={templates} columns={templateColumns} rowKey={(r) => r.template.id} searchable={false} pageSize={10} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Generate trips</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Idempotent — departures that already exist are skipped, never duplicated. Only published routes can be generated.</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="service-date">Service date</Label>
              <Input id="service-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            {can('control.schedules') && (
              <Button onClick={generateAll}><Play className="size-4" /> Generate</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable data={trips} columns={tripColumns} rowKey={(r) => r.trip.id} onRowClick={setSelected} searchPlaceholder="Trip code or service…" pageSize={12} exportName={`trips-${date}`} exportContext={{ 'Service date': date }} />
        </CardContent>
      </Card>

      <TripDrawer summary={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
