import { useCallback, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { BookingStatusBadge } from '@/components/ui/status'
import { EmptyState, PageHeader } from '@/components/ui/patterns'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { delayLabel, lagosDateTime, naira } from '@/lib/format'
import { cancelBookingAndReleaseCapacity } from '@/server/bookings'
import { toast } from 'sonner'

export function RiderTrips() {
  const { profile, actor } = useAuth()
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const trips = useDb(
    useCallback(
      (db) =>
        db.bookings
          .filter((b) => b.rider_id === profile?.id)
          .map((booking) => {
            const trip = db.trips.find((t) => t.id === booking.trip_id)!
            const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
            const route = db.routes.find((r) => r.id === direction.route_id)!
            const stopName = (id: string) => {
              const rs = db.route_stops.find((s) => s.id === id)
              return db.stops.find((s) => s.id === rs?.stop_id)?.name ?? '—'
            }
            return {
              booking,
              trip,
              route,
              origin: stopName(booking.origin_route_stop_id),
              destination: stopName(booking.destination_route_stop_id),
            }
          })
          .sort((a, b) => b.trip.scheduled_departure_at.localeCompare(a.trip.scheduled_departure_at)),
      [profile?.id],
    ),
  )

  const nowMs = Date.now()
  const visible = trips.filter((entry) =>
    filter === 'upcoming'
      ? new Date(entry.trip.scheduled_arrival_at).getTime() > nowMs && entry.booking.status !== 'cancelled'
      : new Date(entry.trip.scheduled_arrival_at).getTime() <= nowMs || entry.booking.status === 'cancelled',
  )

  function confirmCancel() {
    if (!cancelling) return
    const result = cancelBookingAndReleaseCapacity(cancelling, reason, actor)
    if (!result.ok) {
      toast.error('Could not cancel', { description: result.error })
      return
    }
    toast.success('Booking cancelled', { description: 'Your seat has been returned to every segment it was held on.' })
    setCancelling(null)
    setReason('')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My trips" description="Every journey you have booked, with its live status." />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past & cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <EmptyState icon={CalendarClock} title={filter === 'upcoming' ? 'No upcoming trips' : 'No past trips yet'} />
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => (
            <Card key={entry.booking.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{entry.origin} → {entry.destination}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.route.code} · {lagosDateTime(entry.trip.scheduled_departure_at)}
                    {entry.trip.actual_departure_at && ` · ${delayLabel(entry.trip.scheduled_departure_at, entry.trip.actual_departure_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.booking.sponsor_contribution > 0 && <Badge tone="primary">Sponsored</Badge>}
                  <BookingStatusBadge status={entry.booking.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">
                  <span className="tnum">{entry.booking.booking_reference}</span> · you paid{' '}
                  <span className="font-semibold text-foreground tnum">{naira(entry.booking.passenger_contribution)}</span>
                  {entry.booking.sponsor_contribution > 0 && ` of ${naira(entry.booking.gross_fare)}`}
                </div>
                {entry.booking.status === 'confirmed' && new Date(entry.trip.scheduled_departure_at).getTime() > nowMs && (
                  <Button variant="ghost" size="sm" onClick={() => setCancelling(entry.booking.id)}>
                    <X className="size-3.5" /> Cancel
                  </Button>
                )}
              </div>
              {entry.booking.cancellation_reason && (
                <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                  {entry.booking.cancellation_reason}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(cancelling)} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel this booking?</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your seat is released back to every segment it was held on, so another passenger can
              take it. Any sponsor contribution returns to the programme budget.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reason" required>Reason</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Plans changed…" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep booking</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={!reason.trim()}>Cancel booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
