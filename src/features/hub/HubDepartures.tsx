import { useCallback, useState } from 'react'
import { useDb } from '@/db/store'
import { useAssignedHub, useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/patterns'
import { TripStatusBadge } from '@/components/ui/status'
import { Progress } from '@/components/ui/misc'
import { delayLabel, lagosTime, pct } from '@/lib/format'
import { tripSummaries, type TripSummary } from '@/lib/selectors'
import { TripDrawer } from '@/features/shared/TripDrawer'

export function HubDepartures() {
  const hub = useAssignedHub()
  const today = useServiceDate()
  const [selected, setSelected] = useState<TripSummary | null>(null)

  const departures = useDb(
    useCallback(
      (db) =>
        tripSummaries(db, { serviceDate: today }).filter(
          (s) => !hub || s.trip.origin_hub_id === hub.id || s.trip.destination_hub_id === hub.id,
        ),
      [today, hub],
    ),
  )

  const columns: Column<TripSummary>[] = [
    { key: 'time', header: 'Scheduled', value: (r) => r.trip.scheduled_departure_at, cell: (r) => <span className="font-semibold">{lagosTime(r.trip.scheduled_departure_at)}</span> },
    { key: 'code', header: 'Trip', value: (r) => r.trip.trip_code },
    { key: 'direction', header: 'Service', value: (r) => `${r.route_code} ${r.direction_name}` },
    { key: 'status', header: 'Status', value: (r) => r.trip.status, cell: (r) => <TripStatusBadge status={r.trip.status} /> },
    { key: 'actual', header: 'Departure', value: (r) => r.delay_minutes ?? -999, cell: (r) => delayLabel(r.trip.scheduled_departure_at, r.trip.actual_departure_at) },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle ?? '', cell: (r) => r.vehicle ?? <span className="text-muted-foreground">Unassigned</span>, hideable: true },
    {
      key: 'load', header: 'Boarded / booked', value: (r) => r.boarded,
      cell: (r) => (
        <div className="w-32">
          <div className="mb-1 flex justify-between text-2xs text-muted-foreground tnum">
            <span>{r.boarded} / {r.booked}</span>
            <span>{pct(r.occupancy_pct)}</span>
          </div>
          <Progress value={Math.min(100, r.occupancy_pct)} />
        </div>
      ),
    },
    { key: 'free', header: 'Free seats', align: 'right', value: (r) => r.seats_available, cell: (r) => <Badge tone={r.seats_available > 5 ? 'neutral' : 'warning'} size="sm">{r.seats_available}</Badge> },
  ]

  return (
    <div>
      <PageHeader title="Departures" description={`Every service touching ${hub?.name ?? 'this hub'} today.`} />
      <DataTable
        data={departures}
        columns={columns}
        rowKey={(r) => r.trip.id}
        onRowClick={setSelected}
        searchPlaceholder="Trip code, service or vehicle…"
        pageSize={15}
        exportName="hub-departures"
        exportContext={{ Hub: hub?.name ?? '', 'Service date': today }}
      />
      <TripDrawer summary={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
