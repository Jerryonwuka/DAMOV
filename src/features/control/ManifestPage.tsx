import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Ticket, Users, XCircle } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { BookingStatusBadge } from '@/components/ui/status'
import { lagosTime, maskPhone, naira } from '@/lib/format'
import { tripManifest, tripSummaries, type ManifestRow } from '@/lib/selectors'
import { cancelBookingAndReleaseCapacity } from '@/server/bookings'
import { titleCase } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Booking and boarding manifest.
 *
 * One trip, every passenger on it: booked, boarded, no-show, cancelled — with
 * the channel they came through and what each payer contributed.
 */
export function ManifestPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useState(today)
  const [cancelling, setCancelling] = useState<ManifestRow | null>(null)
  const [reason, setReason] = useState('')

  const trips = useDb(useCallback((db) => tripSummaries(db, { serviceDate: date }), [date]))
  const tripId = params.get('trip') ?? ''

  useEffect(() => {
    if (!tripId && trips.length) {
      const live = trips.find((t) => ['departed', 'in_service', 'boarding'].includes(t.trip.status)) ?? trips[0]
      setParams({ trip: live.trip.id }, { replace: true })
    }
  }, [trips, tripId, setParams])

  const summary = trips.find((t) => t.trip.id === tripId)
  const manifest = useDb(useCallback((db) => (tripId ? tripManifest(db, tripId) : []), [tripId]))

  const counts = {
    confirmed: manifest.filter((r) => ['confirmed', 'checked_in'].includes(r.booking.status)).length,
    boarded: manifest.filter((r) => ['boarded', 'completed'].includes(r.booking.status)).length,
    noShow: manifest.filter((r) => r.booking.status === 'no_show').length,
    cancelled: manifest.filter((r) => ['cancelled', 'refunded', 'expired'].includes(r.booking.status)).length,
    passenger: manifest.filter((r) => !['cancelled', 'refunded', 'expired'].includes(r.booking.status)).reduce((a, r) => a + r.booking.passenger_contribution, 0),
    sponsor: manifest.filter((r) => !['cancelled', 'refunded', 'expired'].includes(r.booking.status)).reduce((a, r) => a + r.booking.sponsor_contribution, 0),
  }

  function cancel() {
    if (!cancelling) return
    const result = cancelBookingAndReleaseCapacity(cancelling.booking.id, reason, actor)
    if (!result.ok) return toast.error('Not cancelled', { description: result.error })
    toast.success('Booking cancelled and capacity released')
    setCancelling(null)
    setReason('')
  }

  const columns: Column<ManifestRow>[] = [
    { key: 'passenger', header: 'Passenger', value: (r) => r.passenger, cell: (r) => <span className="font-medium">{r.passenger}</span> },
    { key: 'phone', header: 'Phone', value: (r) => r.phone, cell: (r) => <span className="text-xs tnum">{can('action.view_passenger_identity') ? r.phone : maskPhone(r.phone)}</span>, hideable: true },
    { key: 'staff', header: 'Staff ID', value: (r) => r.staff_id ?? '', cell: (r) => <span className="text-xs tnum">{r.staff_id ?? '—'}</span>, hideable: true, defaultHidden: true },
    { key: 'journey', header: 'Journey', value: (r) => `${r.origin} → ${r.destination}`, cell: (r) => <span className="text-xs">{r.origin} → {r.destination}</span> },
    { key: 'ref', header: 'Reference', value: (r) => r.booking.booking_reference, cell: (r) => <span className="text-xs tnum">{r.booking.booking_reference}<br /><span className="text-muted-foreground">{r.ticket_code}</span></span> },
    { key: 'channel', header: 'Channel', value: (r) => r.booking.booking_channel, cell: (r) => <Badge tone="neutral" size="sm">{titleCase(r.booking.booking_channel)}</Badge>, hideable: true },
    { key: 'status', header: 'Status', value: (r) => r.booking.status, cell: (r) => <BookingStatusBadge status={r.booking.status} /> },
    { key: 'boarded', header: 'Boarded', value: (r) => r.boarded_at ?? '', cell: (r) => (r.boarded_at ? <span className="text-xs">{lagosTime(r.boarded_at)} · {titleCase(r.validation_method ?? '')}</span> : <span className="text-muted-foreground">—</span>) },
    { key: 'gross', header: 'Gross', align: 'right', value: (r) => r.booking.gross_fare, cell: (r) => naira(r.booking.gross_fare), hideable: true },
    { key: 'passenger_paid', header: 'Passenger', align: 'right', value: (r) => r.booking.passenger_contribution, cell: (r) => naira(r.booking.passenger_contribution) },
    { key: 'sponsor_paid', header: 'Sponsor', align: 'right', value: (r) => r.booking.sponsor_contribution, cell: (r) => (r.booking.sponsor_contribution ? <span>{naira(r.booking.sponsor_contribution)} <span className="text-2xs text-muted-foreground">{r.sponsor}</span></span> : '—') },
    {
      key: 'actions', header: '', sortable: false,
      cell: (r) => can('action.cancel_trip') && ['confirmed', 'held'].includes(r.booking.status) ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCancelling(r) }}>Cancel</Button> : null,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Bookings & Boarding" description="The manifest for any trip — who booked, who boarded, who paid what." />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Service date</Label>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setParams({}, { replace: true }) }} className="w-44" />
        </div>
        <div className="min-w-[280px] flex-1 space-y-1.5">
          <Label>Trip</Label>
          <Select value={tripId} onValueChange={(v) => setParams({ trip: v }, { replace: true })}>
            <SelectTrigger><SelectValue placeholder="Select a trip" /></SelectTrigger>
            <SelectContent>
              {trips.map((t) => (
                <SelectItem key={t.trip.id} value={t.trip.id}>{lagosTime(t.trip.scheduled_departure_at)} · {t.trip.trip_code} · {t.direction_name} · {t.booked} booked</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatTile index={0} label="Confirmed" value={counts.confirmed} icon={Ticket} tone="info" />
          <StatTile index={1} label="Boarded" value={counts.boarded} icon={CheckCircle2} tone="primary" hint={`of ${summary.capacity} bookable`} />
          <StatTile index={2} label="No-show" value={counts.noShow} icon={XCircle} tone={counts.noShow ? 'warning' : 'default'} />
          <StatTile index={3} label="Cancelled" value={counts.cancelled} icon={Users} />
          <StatTile index={4} label="Passenger revenue" value={naira(counts.passenger)} />
          <StatTile index={5} label="Sponsor liability" value={naira(counts.sponsor)} hint="Recognised at boarding" />
        </div>
      )}

      <DataTable
        data={manifest}
        columns={columns}
        rowKey={(r) => r.booking.id}
        searchPlaceholder="Passenger, reference or ticket…"
        exportName={`trip-manifest-${summary?.trip.trip_code ?? 'trip'}`}
        exportContext={{ Trip: summary?.trip.trip_code ?? '', 'Service date': date, Direction: summary?.direction_name ?? '' }}
        pageSize={20}
        dense
      />

      <Dialog open={Boolean(cancelling)} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel {cancelling?.booking.booking_reference}?</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">Seats are released on every segment. Payment is marked refunded and any sponsor reservation returns to the programme budget.</p>
            <div className="space-y-1.5">
              <Label required>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep</Button>
            <Button variant="destructive" onClick={cancel} disabled={!reason.trim()}>Cancel booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
