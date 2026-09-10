import { useCallback, useState } from 'react'
import { Bus, Gauge, Wrench, Zap } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { DataTable, type Column } from '@/components/ui/data-table'
import { DefinitionRow, PageHeader, StatTile } from '@/components/ui/patterns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TripStatusBadge, VehicleStatusBadge } from '@/components/ui/status'
import { km, lagosDate, lagosTime, naira, number, pct } from '@/lib/format'
import { tripSummaries } from '@/lib/selectors'
import type { Vehicle, VehicleStatus, VehicleType } from '@/lib/types'
import { calculateTripEconomics } from '@/server/economics'
import { setVehicleStatus } from '@/server/fleet'
import { titleCase } from '@/lib/utils'
import { toast } from 'sonner'

interface FleetRow {
  vehicle: Vehicle
  type: VehicleType
  hub: string
  trips_today: number
  passengers_today: number
  revenue_today: number
  cost_today: number
  margin_today: number
  average_occupancy: number
  distance_today: number
  last_inspection: string | null
}

const STATUSES: VehicleStatus[] = ['available', 'assigned', 'operating', 'charging', 'maintenance', 'out_of_service']

export function FleetPage() {
  const { actor, can } = useAuth()
  const today = useServiceDate()
  const [selected, setSelected] = useState<FleetRow | null>(null)

  const rows = useDb(
    useCallback(
      (db): FleetRow[] => {
        const summaries = tripSummaries(db, { serviceDate: today })
        return db.vehicles.map((vehicle) => {
          const mine = summaries.filter((s) => s.trip.vehicle_id === vehicle.id)
          const ran = mine.filter((s) => s.trip.actual_departure_at)
          const economics = ran.map((s) => calculateTripEconomics(db, s.trip.id))
          const distance = ran.reduce((a, s) => a + (db.route_stops.filter((rs) => rs.route_direction_id === s.trip.route_direction_id).reduce((m, rs) => Math.max(m, rs.distance_from_start_km), 0)), 0)
          const inspection = db.vehicle_inspections.filter((i) => i.vehicle_id === vehicle.id).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0]
          return {
            vehicle,
            type: db.vehicle_types.find((t) => t.id === vehicle.vehicle_type_id)!,
            hub: db.hubs.find((h) => h.id === vehicle.current_hub_id)?.name ?? '—',
            trips_today: mine.length,
            passengers_today: economics.reduce((a, e) => a + e.passenger_count, 0),
            revenue_today: economics.reduce((a, e) => a + e.gross_trip_revenue, 0),
            cost_today: economics.reduce((a, e) => a + e.direct_trip_cost, 0),
            margin_today: economics.reduce((a, e) => a + e.contribution_margin, 0),
            average_occupancy: economics.length ? Math.round(economics.reduce((a, e) => a + e.occupancy_pct, 0) / economics.length) : 0,
            distance_today: distance,
            last_inspection: inspection?.submitted_at ?? null,
          }
        })
      },
      [today],
    ),
  )

  const vehicleTrips = useDb(
    useCallback((db) => (selected ? tripSummaries(db, { serviceDate: today }).filter((s) => s.trip.vehicle_id === selected.vehicle.id) : []), [selected, today]),
  )

  function changeStatus(status: VehicleStatus) {
    if (!selected) return
    const result = setVehicleStatus({ vehicle_id: selected.vehicle.id, status }, actor)
    if (!result.ok) return toast.error('Status not changed', { description: result.error })
    toast.success(`${selected.vehicle.fleet_number} marked ${titleCase(status)}`)
  }

  const columns: Column<FleetRow>[] = [
    { key: 'fleet', header: 'Fleet no.', value: (r) => r.vehicle.fleet_number, cell: (r) => <span className="font-semibold tnum">{r.vehicle.fleet_number}</span> },
    { key: 'reg', header: 'Registration', value: (r) => r.vehicle.registration_number, cell: (r) => <span className="tnum">{r.vehicle.registration_number}</span>, hideable: true },
    { key: 'type', header: 'Type', value: (r) => r.type.name, cell: (r) => <span className="text-xs">{r.type.name}<br /><span className="text-muted-foreground">{r.type.legal_capacity} legal · {r.type.default_bookable_capacity} bookable · {r.type.propulsion.toUpperCase()}</span></span> },
    { key: 'status', header: 'Status', value: (r) => r.vehicle.status, cell: (r) => <VehicleStatusBadge status={r.vehicle.status} /> },
    { key: 'hub', header: 'Location', value: (r) => r.hub, hideable: true },
    { key: 'trips', header: 'Trips today', align: 'right', value: (r) => r.trips_today },
    { key: 'pax', header: 'Passengers', align: 'right', value: (r) => r.passengers_today, hideable: true },
    { key: 'occ', header: 'Avg occupancy', align: 'right', value: (r) => r.average_occupancy, cell: (r) => pct(r.average_occupancy) },
    { key: 'revenue', header: 'Revenue', align: 'right', value: (r) => r.revenue_today, cell: (r) => naira(r.revenue_today) },
    { key: 'margin', header: 'Contribution', align: 'right', value: (r) => r.margin_today, cell: (r) => <span className={r.margin_today >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical'}>{naira(r.margin_today)}</span> },
    { key: 'distance', header: 'Distance', align: 'right', value: (r) => r.distance_today, cell: (r) => km(r.distance_today, 0), hideable: true },
    { key: 'odometer', header: 'Odometer', align: 'right', value: (r) => r.vehicle.odometer_km, cell: (r) => `${number(r.vehicle.odometer_km)} km`, hideable: true, defaultHidden: true },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Fleet" description="Every vehicle, its live state, and what it has earned and cost today." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Operating" value={rows.filter((r) => r.vehicle.status === 'operating').length} icon={Bus} tone="primary" />
        <StatTile index={1} label="Available" value={rows.filter((r) => ['available', 'assigned'].includes(r.vehicle.status)).length} icon={Gauge} />
        <StatTile index={2} label="Charging" value={rows.filter((r) => r.vehicle.status === 'charging').length} icon={Zap} tone="warning" />
        <StatTile index={3} label="Out of service" value={rows.filter((r) => ['maintenance', 'out_of_service'].includes(r.vehicle.status)).length} icon={Wrench} tone="critical" />
      </div>
      <DataTable data={rows} columns={columns} rowKey={(r) => r.vehicle.id} onRowClick={setSelected} searchPlaceholder="Fleet number or registration…" exportName="vehicle-utilization" exportContext={{ 'Service date': today }} pageSize={12} />

      <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent width="sm:max-w-lg">
          {selected && (
            <>
              <DrawerHeader>
                <div className="flex items-center gap-2">
                  <DrawerTitle className="text-lg font-bold">{selected.vehicle.fleet_number}</DrawerTitle>
                  <VehicleStatusBadge status={selected.vehicle.status} />
                </div>
                <p className="text-sm text-muted-foreground">{selected.vehicle.registration_number} · {selected.type.name}</p>
              </DrawerHeader>
              <DrawerBody className="space-y-5">
                {can('action.assign_vehicle') && (
                  <div className="space-y-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Change status</p>
                    <Select value={selected.vehicle.status} onValueChange={(v) => changeStatus(v as VehicleStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <dl className="divide-y divide-border rounded-lg border border-border px-3">
                  <DefinitionRow term="Legal / bookable capacity">{selected.type.legal_capacity} / {selected.type.default_bookable_capacity}</DefinitionRow>
                  <DefinitionRow term="Propulsion">{selected.type.propulsion.toUpperCase()} · {naira(selected.type.energy_cost_per_km)}/km</DefinitionRow>
                  <DefinitionRow term="Odometer">{number(selected.vehicle.odometer_km)} km</DefinitionRow>
                  <DefinitionRow term="Next service due">{selected.vehicle.next_service_due_km ? `${number(selected.vehicle.next_service_due_km)} km` : '—'}</DefinitionRow>
                  <DefinitionRow term="In service since">{selected.vehicle.in_service_since ? lagosDate(`${selected.vehicle.in_service_since}T00:00:00Z`) : '—'}</DefinitionRow>
                  <DefinitionRow term="Last inspection">{selected.last_inspection ? lagosTime(selected.last_inspection) : 'None recorded'}</DefinitionRow>
                </dl>
                <div className="grid grid-cols-2 gap-2 text-center">
                  {[['Trips today', String(selected.trips_today)], ['Passengers', String(selected.passengers_today)], ['Revenue', naira(selected.revenue_today)], ['Contribution', naira(selected.margin_today)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-muted/60 p-2.5"><p className="text-sm font-bold tnum">{v}</p><p className="text-2xs uppercase tracking-wide text-muted-foreground">{l}</p></div>
                  ))}
                </div>
                <section>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Trips today</p>
                  <div className="space-y-1.5">
                    {vehicleTrips.length === 0 && <p className="text-sm text-muted-foreground">No trips assigned today.</p>}
                    {vehicleTrips.map((s) => (
                      <div key={s.trip.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                        <span className="w-11 font-bold tnum">{lagosTime(s.trip.scheduled_departure_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs">{s.trip.trip_code} · {s.direction_name}</span>
                        <TripStatusBadge status={s.trip.status} />
                      </div>
                    ))}
                  </div>
                </section>
                <Badge tone="neutral">Acquisition and lease terms are restricted to finance</Badge>
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
