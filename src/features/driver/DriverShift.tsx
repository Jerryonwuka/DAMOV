import { useCallback } from 'react'
import { CheckCircle2, Clock, Route, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, km, lagosTime } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'
import { titleCase } from '@/lib/utils'

export function DriverShift() {
  const { profile } = useAuth()
  const today = useServiceDate()

  const shift = useDb(
    useCallback(
      (db) => {
        const trips = tripSummaries(db, { serviceDate: today }).filter((s) => s.trip.driver_id === profile?.id)
        const completed = trips.filter((s) => s.trip.status === 'completed')
        const distance = completed.reduce((a, s) => {
          const stops = db.route_stops.filter((rs) => rs.route_direction_id === s.trip.route_direction_id)
          return a + Math.max(...stops.map((rs) => rs.distance_from_start_km), 0)
        }, 0)
        const onTime = completed.filter((s) => (s.delay_minutes ?? 0) <= 5).length
        const incidents = db.incidents.filter((i) => i.reported_by === profile?.id && i.reported_at.startsWith(today))
        return { trips, completed, distance, onTime, incidents, passengers: completed.reduce((a, s) => a + s.boarded, 0) }
      },
      [profile?.id, today],
    ),
  )

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Shift summary" description="Today's trips, punctuality and passengers carried." />
      <div className="grid grid-cols-2 gap-3">
        <StatTile index={0} label="Trips completed" value={`${shift.completed.length}/${shift.trips.length}`} icon={CheckCircle2} tone="primary" />
        <StatTile index={1} label="Passengers carried" value={shift.passengers} icon={Users} />
        <StatTile index={2} label="On-time departures" value={`${shift.onTime}/${shift.completed.length}`} icon={Clock} tone={shift.completed.length && shift.onTime < shift.completed.length ? 'warning' : 'default'} />
        <StatTile index={3} label="Distance operated" value={km(shift.distance, 0)} icon={Route} />
      </div>
      <Card>
        <CardHeader><CardTitle>Trip log</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {shift.trips.map((s) => (
            <div key={s.trip.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <span className="w-12 text-sm font-bold tnum">{lagosTime(s.trip.scheduled_departure_at)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.direction_name}</p>
                <p className="text-xs text-muted-foreground">{delayLabel(s.trip.scheduled_departure_at, s.trip.actual_departure_at)} · {s.boarded} boarded</p>
              </div>
              <TripStatusBadge status={s.trip.status} />
            </div>
          ))}
        </CardContent>
      </Card>
      {shift.incidents.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Incidents reported</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {shift.incidents.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{i.reference} · {titleCase(i.category)}</p>
                <p className="text-xs text-muted-foreground">{i.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
