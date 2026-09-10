import { useCallback } from 'react'
import { Activity } from 'lucide-react'
import { useDb } from '@/db/store'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { naira } from '@/lib/format'
import { percent, sum } from '@/lib/utils'
import { useProgramme } from './institution-data'

interface UsageRow { date: string; trips: number; riders: number; gross: number; passenger: number; sponsor: number; recognized: number }

/** Daily usage, aggregated. No passenger-level rows leave this view. */
export function ProgrammeUsage() {
  const p = useProgramme()
  const rows = useDb(
    useCallback(
      (db): UsageRow[] => {
        const byDate = new Map<string, UsageRow>()
        for (const booking of db.bookings.filter((b) => b.sponsor_id === p.organization?.id && !['cancelled', 'expired', 'refunded'].includes(b.status))) {
          const trip = db.trips.find((t) => t.id === booking.trip_id)
          if (!trip) continue
          const row = byDate.get(trip.service_date) ?? { date: trip.service_date, trips: 0, riders: 0, gross: 0, passenger: 0, sponsor: 0, recognized: 0 }
          row.trips++
          row.gross += booking.gross_fare
          row.passenger += booking.passenger_contribution
          row.sponsor += booking.sponsor_contribution
          const auth = db.sponsor_authorizations.find((s) => s.booking_id === booking.id)
          if (auth?.status === 'recognized') row.recognized += auth.amount_recognized
          byDate.set(trip.service_date, row)
        }
        for (const [date, row] of byDate) {
          const tripIds = new Set(db.trips.filter((t) => t.service_date === date).map((t) => t.id))
          row.riders = new Set(db.bookings.filter((b) => b.sponsor_id === p.organization?.id && tripIds.has(b.trip_id) && b.status !== 'cancelled').map((b) => b.rider_id)).size
        }
        return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
      },
      [p.organization?.id],
    ),
  )

  const columns: Column<UsageRow>[] = [
    { key: 'date', header: 'Service date', value: (r) => r.date, cell: (r) => <span className="font-semibold">{r.date}</span> },
    { key: 'trips', header: 'Sponsored trips', align: 'right', value: (r) => r.trips },
    { key: 'riders', header: 'Active riders', align: 'right', value: (r) => r.riders },
    { key: 'gross', header: 'Gross transport value', align: 'right', value: (r) => r.gross, cell: (r) => naira(r.gross) },
    { key: 'passenger', header: 'Staff paid', align: 'right', value: (r) => r.passenger, cell: (r) => naira(r.passenger) },
    { key: 'sponsor', header: 'Subsidy reserved', align: 'right', value: (r) => r.sponsor, cell: (r) => naira(r.sponsor) },
    { key: 'recognized', header: 'Subsidy recognised', align: 'right', value: (r) => r.recognized, cell: (r) => <span className="font-semibold">{naira(r.recognized)}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Usage" description="Daily programme usage, aggregated across all eligible staff." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Sponsored trips" value={sum(rows.map((r) => r.trips))} icon={Activity} tone="primary" />
        <StatTile index={1} label="Adoption" value={`${percent(p.registered, p.eligibleStaff)}%`} hint={`${p.registered} of ${p.eligibleStaff} eligible staff registered`} />
        <StatTile index={2} label="Subsidy recognised" value={naira(sum(rows.map((r) => r.recognized)))} />
        <StatTile index={3} label="Avg subsidy / trip" value={naira(rows.length ? Math.round(sum(rows.map((r) => r.recognized)) / Math.max(1, sum(rows.map((r) => r.trips)))) : 0)} />
      </div>
      <DataTable data={rows} columns={columns} rowKey={(r) => r.date} searchable={false} exportName="programme-usage" exportContext={{ Organisation: p.organization?.name ?? '', Aggregation: 'Daily totals; no passenger-level rows' }} pageSize={14} />
    </div>
  )
}
