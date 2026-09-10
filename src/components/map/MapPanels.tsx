import { AlertTriangle, Bus, Clock, Gauge, Layers, MapPin, Radio, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/misc'
import { DefinitionRow } from '@/components/ui/patterns'
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { lagosTime, pct } from '@/lib/format'
import type { VehicleMapRecord } from '@/lib/selectors'
import type { Route } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface MapFilters {
  stops: boolean
  hubs: boolean
  vehicles: boolean
  incidents: boolean
  reference: boolean
  route: string | null
  severity: 'all' | 'high'
}

export function MapFilterPanel({
  filters, onChange, routes, className,
}: {
  filters: MapFilters
  onChange: (next: MapFilters) => void
  routes: Route[]
  className?: string
}) {
  const toggles: { key: keyof Pick<MapFilters, 'vehicles' | 'stops' | 'hubs' | 'incidents' | 'reference'>; label: string }[] = [
    { key: 'vehicles', label: 'Vehicles' },
    { key: 'stops', label: 'Stops' },
    { key: 'hubs', label: 'Transit hubs' },
    { key: 'incidents', label: 'Incidents' },
    { key: 'reference', label: 'Reference corridors' },
  ]
  return (
    <div className={cn('space-y-4 rounded-xl border border-border bg-card/95 p-3 text-sm shadow-card backdrop-blur', className)}>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" /> Layers
        </p>
        <div className="space-y-1.5">
          {toggles.map((toggle) => (
            <label key={toggle.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent">
              <Checkbox checked={filters[toggle.key]} onCheckedChange={(v) => onChange({ ...filters, [toggle.key]: Boolean(v) })} />
              <span className="text-xs">{toggle.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Routes</p>
        <div className="space-y-1">
          <button
            onClick={() => onChange({ ...filters, route: null })}
            className={cn('press flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors', filters.route === null ? 'bg-accent font-semibold' : 'hover:bg-accent')}
          >
            <span className="size-2.5 rounded-full bg-muted-foreground/40" /> All published
          </button>
          {routes.map((route) => (
            <button
              key={route.id}
              onClick={() => onChange({ ...filters, route: filters.route === route.id ? null : route.id })}
              className={cn('press flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors', filters.route === route.id ? 'bg-accent font-semibold' : 'hover:bg-accent')}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: route.color }} />
              <span className="truncate">{route.code} · {route.public_name}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Legend</p>
        <ul className="space-y-1 text-2xs text-muted-foreground">
          <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-primary" /> Live vehicle</li>
          <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-slate-400" /> Stale position</li>
          <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" /> Incident · medium</li>
          <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-critical" /> Incident · high / critical</li>
          <li className="flex items-center gap-2"><span className="h-0.5 w-3 rounded bg-slate-400" /> Reference corridor</li>
        </ul>
      </div>
    </div>
  )
}

export function VehicleDrawer({ record, onClose }: { record: VehicleMapRecord | null; onClose: () => void }) {
  return (
    <Drawer open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent width="sm:max-w-md">
        {record && (
          <>
            <DrawerHeader>
              <div className="flex items-center gap-2">
                <DrawerTitle className="text-lg font-bold">{record.fleet_number}</DrawerTitle>
                {record.stale ? (
                  <Badge tone="neutral" dot>Location stale · {formatAge(record.age_seconds)}</Badge>
                ) : (
                  <Badge tone="primary" dot pulse>Live · {formatAge(record.age_seconds)}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{record.route_name ?? 'Not on a trip'}</p>
            </DrawerHeader>
            <DrawerBody className="space-y-4">
              {record.incident_reference && (
                <p className="flex items-center gap-2 rounded-lg bg-warning/12 p-3 text-sm">
                  <AlertTriangle className="size-4 shrink-0" /> Active incident {record.incident_reference}
                </p>
              )}
              <dl className="divide-y divide-border rounded-lg border border-border px-3">
                <DefinitionRow term={<span className="flex items-center gap-1.5"><Bus className="size-3.5" /> Trip</span>}>{record.trip_code ?? '—'}</DefinitionRow>
                <DefinitionRow term={<span className="flex items-center gap-1.5"><User className="size-3.5" /> Driver</span>}>{record.driver_name ?? '—'}</DefinitionRow>
                <DefinitionRow term={<span className="flex items-center gap-1.5"><Gauge className="size-3.5" /> Occupancy</span>}>
                  {record.boarded} / {record.capacity} · {pct(record.occupancy_pct)}
                </DefinitionRow>
                <DefinitionRow term={<span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> Next stop</span>}>{record.next_stop ?? '—'}</DefinitionRow>
                <DefinitionRow term={<span className="flex items-center gap-1.5"><Clock className="size-3.5" /> Departure</span>}>
                  {record.delay_minutes === null ? '—' : record.delay_minutes <= 5 ? 'On time' : <span className="text-critical">{record.delay_minutes} min late</span>}
                </DefinitionRow>
                <DefinitionRow term={<span className="flex items-center gap-1.5"><Radio className="size-3.5" /> Last GPS</span>}>
                  {lagosTime(record.recorded_at)} · {formatAge(record.age_seconds)} ago
                </DefinitionRow>
              </dl>
              <p className="rounded-lg bg-muted/60 p-3 text-2xs text-muted-foreground">
                Positions come from the <span className="font-semibold">demo simulation</span> feed. A stale
                position is never shown as live; the threshold is configurable under Control → Configuration.
              </p>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

export function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}
