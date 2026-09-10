import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useDb } from '@/db/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { lagosTime } from '@/lib/format'
import { directionStops } from '@/lib/selectors'
import { cn } from '@/lib/utils'
import { useDriverShift } from './driver-data'

export function DriverStops() {
  const shift = useDriverShift()
  const trip = shift.current?.trip
  const stops = useDb(useCallback((db) => (trip ? directionStops(db, trip.route_direction_id) : []), [trip]))

  const loads = useDb(
    useCallback(
      (db) => {
        if (!trip) return new Map<string, { on: number; off: number }>()
        const map = new Map<string, { on: number; off: number }>()
        for (const booking of db.bookings.filter((b) => b.trip_id === trip.id && !['cancelled', 'expired', 'refunded'].includes(b.status))) {
          const on = map.get(booking.origin_route_stop_id) ?? { on: 0, off: 0 }
          on.on++
          map.set(booking.origin_route_stop_id, on)
          const off = map.get(booking.destination_route_stop_id) ?? { on: 0, off: 0 }
          off.off++
          map.set(booking.destination_route_stop_id, off)
        }
        return map
      },
      [trip],
    ),
  )

  if (!trip) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Stops" />
        <EmptyState icon={MapPin} title="No active trip" action={<Button asChild variant="outline"><Link to="/driver">Assignment</Link></Button>} />
      </div>
    )
  }

  const currentIndex = stops.findIndex((s) => s.routeStop.id === trip.current_route_stop_id)
  let onboard = 0

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Stops" description={`${trip.trip_code} · expected boardings and alightings at every stop.`} />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {stops.map(({ routeStop, stop }, index) => {
            const load = loads.get(routeStop.id) ?? { on: 0, off: 0 }
            onboard += load.on - load.off
            const reached = index <= currentIndex
            const isCurrent = index === currentIndex
            return (
              <div key={routeStop.id} className={cn('flex items-center gap-3 p-4', isCurrent && 'bg-primary/[0.06]')}>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold', reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', reached ? 'font-semibold' : 'font-medium')}>{stop.name}</p>
                  <p className="text-2xs text-muted-foreground tnum">
                    {lagosTime(new Date(new Date(trip.scheduled_departure_at).getTime() + routeStop.scheduled_offset_minutes * 60_000).toISOString())} · {routeStop.distance_from_start_km} km
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs tnum">
                  <div><p className="font-semibold text-primary">+{load.on}</p><p className="text-2xs text-muted-foreground">on</p></div>
                  <div><p className="font-semibold text-critical">−{load.off}</p><p className="text-2xs text-muted-foreground">off</p></div>
                  <div><p className="font-semibold">{Math.max(0, onboard)}</p><p className="text-2xs text-muted-foreground">aboard</p></div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
