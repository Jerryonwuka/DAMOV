import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bus, Clock, MapPin, User } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/misc'
import { DefinitionRow } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { delayLabel, lagosDateTime, lagosTime, naira, pct } from '@/lib/format'
import { directionStops, type TripSummary } from '@/lib/selectors'
import { calculateTripEconomics } from '@/server/economics'
import { changeTripStatus } from '@/server/trips'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Trip control drawer.
 *
 * Opened from the map, the dispatch board, the departures table and the
 * manifest. One drawer for one record, so every surface sees the same trip.
 */
export function TripDrawer({ summary, onClose }: { summary: TripSummary | null; onClose: () => void }) {
  const { actor, can } = useAuth()
  const [reason, setReason] = useState('')
  const [action, setAction] = useState<'cancel' | 'hold' | null>(null)
  const trip = summary?.trip

  const detail = useDb(
    useCallback(
      (db) => {
        if (!trip) return null
        const stops = directionStops(db, trip.route_direction_id)
        const events = db.trip_events.filter((e) => e.trip_id === trip.id).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        const incidents = db.incidents.filter((i) => i.trip_id === trip.id && !['resolved', 'closed'].includes(i.status))
        const inventory = db.trip_segment_inventory
          .filter((i) => i.trip_id === trip.id)
          .map((row) => {
            const segment = db.route_segments.find((s) => s.id === row.route_segment_id)!
            const from = stops.find((s) => s.routeStop.id === segment.from_route_stop_id)?.stop.name ?? '—'
            const to = stops.find((s) => s.routeStop.id === segment.to_route_stop_id)?.stop.name ?? '—'
            return { row, segment, label: `${from} → ${to}` }
          })
          .sort((a, b) => a.segment.sequence - b.segment.sequence)
        return { stops, events, incidents, inventory, economics: calculateTripEconomics(db, trip.id) }
      },
      [trip],
    ),
  )

  function act(status: 'cancelled' | 'held' | 'boarding') {
    if (!trip) return
    const result = changeTripStatus({ trip_id: trip.id, status, reason }, actor)
    if (!result.ok) {
      toast.error('Action refused', { description: result.error })
      return
    }
    toast.success(`Trip ${status}`)
    setAction(null)
    setReason('')
  }

  return (
    <Drawer open={Boolean(summary)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        {summary && trip && detail && (
          <>
            <DrawerHeader>
              <div className="flex items-center gap-2">
                <DrawerTitle className="text-lg font-bold">{trip.trip_code}</DrawerTitle>
                <TripStatusBadge status={trip.status} />
              </div>
              <DrawerDescription className="text-sm text-muted-foreground">
                {summary.route_code} · {summary.direction_name} · {lagosDateTime(trip.scheduled_departure_at)}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Boarded', value: `${summary.boarded}/${summary.capacity}` },
                  { label: 'Occupancy', value: pct(summary.occupancy_pct) },
                  { label: 'Departure', value: delayLabel(trip.scheduled_departure_at, trip.actual_departure_at) },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-sm font-bold tnum">{item.value}</p>
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>

              {detail.incidents.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  {detail.incidents.map((incident) => (
                    <p key={incident.id} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(45_96%_30%)]" />
                      <span>
                        <span className="font-semibold">{incident.reference}</span> · {titleCase(incident.category)} · {incident.description}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment</h4>
                <dl className="divide-y divide-border rounded-lg border border-border px-3">
                  <DefinitionRow term={<span className="flex items-center gap-1.5"><Bus className="size-3.5" /> Vehicle</span>}>
                    {summary.vehicle ?? <span className="text-muted-foreground">Unassigned</span>}
                  </DefinitionRow>
                  <DefinitionRow term={<span className="flex items-center gap-1.5"><User className="size-3.5" /> Driver</span>}>
                    {summary.driver ?? <span className="text-muted-foreground">Unassigned</span>}
                  </DefinitionRow>
                  <DefinitionRow term={<span className="flex items-center gap-1.5"><Clock className="size-3.5" /> Scheduled</span>}>
                    {lagosTime(trip.scheduled_departure_at)} → {lagosTime(trip.scheduled_arrival_at)}
                  </DefinitionRow>
                  <DefinitionRow term="Capacity">
                    {trip.bookable_capacity_snapshot} bookable of {trip.legal_capacity_snapshot} legal
                  </DefinitionRow>
                </dl>
              </section>

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Segment inventory</h4>
                <div className="space-y-1.5">
                  {detail.inventory.map(({ row, label }) => {
                    const used = row.reserved_count + row.boarded_adjustment
                    const load = (used / Math.max(1, row.capacity)) * 100
                    return (
                      <div key={row.id} className="rounded-lg border border-border p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{label}</span>
                          <span className={cn('shrink-0 tnum', load >= 100 && 'font-semibold text-critical')}>
                            {used}/{row.capacity}
                          </span>
                        </div>
                        <Progress value={Math.min(100, load)} indicatorClassName={load >= 100 ? 'bg-critical' : load >= 85 ? 'bg-warning' : undefined} />
                      </div>
                    )
                  })}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Stops</h4>
                <ol className="relative ml-2 border-l border-border pl-4">
                  {detail.stops.map(({ routeStop, stop }, index) => {
                    const reached = trip.current_route_stop_id
                      ? routeStop.sequence <= (detail.stops.find((s) => s.routeStop.id === trip.current_route_stop_id)?.routeStop.sequence ?? 0)
                      : trip.status === 'completed'
                    return (
                      <li key={routeStop.id} className="relative pb-3 last:pb-0">
                        <span className={cn('absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-card', reached ? 'bg-primary' : 'bg-muted-foreground/40')} />
                        <p className={cn('text-sm', reached && 'font-medium')}>{stop.name}</p>
                        <p className="text-2xs text-muted-foreground">
                          +{routeStop.scheduled_offset_minutes} min · {routeStop.distance_from_start_km} km
                          {index === 0 && ' · origin'}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Economics</h4>
                <dl className="divide-y divide-border rounded-lg border border-border px-3">
                  <DefinitionRow term="Gross revenue">{naira(detail.economics.gross_trip_revenue)}</DefinitionRow>
                  <DefinitionRow term="Direct cost">{naira(detail.economics.direct_trip_cost)}</DefinitionRow>
                  <DefinitionRow term="Contribution margin">
                    <span className={detail.economics.contribution_margin >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical'}>
                      {naira(detail.economics.contribution_margin)}
                    </span>
                  </DefinitionRow>
                </dl>
              </section>

              <section>
                <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
                <ul className="space-y-1.5 text-xs">
                  {detail.events.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
                  {detail.events.map((event) => (
                    <li key={event.id} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-muted-foreground tnum">{lagosTime(event.occurred_at)}</span>
                      <Badge tone="neutral" size="sm">{titleCase(event.type)}</Badge>
                      {typeof event.metadata.minutes === 'number' && <span className="text-critical">+{event.metadata.minutes}m</span>}
                    </li>
                  ))}
                </ul>
              </section>

              {action && (
                <div className="space-y-2 rounded-lg border border-critical/40 bg-critical/[0.06] p-3">
                  <Label required>Reason to {action} this trip</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" disabled={!reason.trim()} onClick={() => act(action === 'cancel' ? 'cancelled' : 'held')}>
                      Confirm {action}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAction(null)}>Back</Button>
                  </div>
                </div>
              )}
            </DrawerBody>

            <DrawerFooter className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/control/manifest?trip=${trip.id}`}>
                  <MapPin className="size-3.5" /> Manifest <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              {can('action.cancel_trip') && !['completed', 'cancelled'].includes(trip.status) && (
                <>
                  {trip.status === 'assigned' && (
                    <Button size="sm" onClick={() => act('boarding')}>Open boarding</Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setAction('hold')} disabled={trip.status === 'held'}>Hold</Button>
                  <Button variant="destructive" size="sm" onClick={() => setAction('cancel')}>Cancel trip</Button>
                </>
              )}
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
