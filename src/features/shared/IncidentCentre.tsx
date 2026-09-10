import { useCallback, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { DataTable, type Column } from '@/components/ui/data-table'
import { DefinitionRow, PageHeader, StatTile } from '@/components/ui/patterns'
import { SeverityBadge } from '@/components/ui/status'
import { lagosDateTime, lagosTime, relative } from '@/lib/format'
import type { Incident, IncidentCategory } from '@/lib/types'
import { createIncident, updateIncident } from '@/server/incidents'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

const CATEGORIES: IncidentCategory[] = ['delay', 'breakdown', 'congestion', 'passenger_issue', 'safety', 'route_obstruction', 'security', 'other']
const SEVERITIES: Incident['severity'][] = ['low', 'medium', 'high', 'critical']
const EFFECTS: Incident['operational_effect'][] = ['none', 'delay', 'trip_cancelled', 'vehicle_withdrawn', 'route_diverted']

interface Row {
  incident: Incident
  trip_code: string | null
  vehicle: string | null
  route: string | null
  reporter: string
  assignee: string | null
}

/** One incident workflow shared by the driver, hub and Control surfaces. */
export function IncidentCentre() {
  const { actor, profile, role } = useAuth()
  const today = useServiceDate()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)
  const [resolution, setResolution] = useState('')
  const [form, setForm] = useState({
    category: 'delay' as IncidentCategory,
    severity: 'medium' as Incident['severity'],
    description: '',
    trip_id: '',
    operational_effect: 'delay' as Incident['operational_effect'],
    passenger_notification_required: true,
    latitude: '',
    longitude: '',
  })

  const rows = useDb(
    useCallback(
      (db): Row[] =>
        db.incidents
          .map((incident) => {
            const trip = incident.trip_id ? db.trips.find((t) => t.id === incident.trip_id) : null
            return {
              incident,
              trip_code: trip?.trip_code ?? null,
              vehicle: incident.vehicle_id ? (db.vehicles.find((v) => v.id === incident.vehicle_id)?.fleet_number ?? null) : null,
              route: incident.route_id ? (db.routes.find((r) => r.id === incident.route_id)?.code ?? null) : null,
              reporter: db.profiles.find((p) => p.id === incident.reported_by)?.full_name ?? 'System',
              assignee: incident.assigned_to ? (db.profiles.find((p) => p.id === incident.assigned_to)?.full_name ?? null) : null,
            }
          })
          .filter((row) => (role === 'driver' ? row.incident.reported_by === profile?.id : true))
          .sort((a, b) => b.incident.reported_at.localeCompare(a.incident.reported_at)),
      [role, profile?.id],
    ),
  )

  const activeTrips = useDb(
    useCallback(
      (db) =>
        db.trips
          .filter((t) => t.service_date === today && !['cancelled', 'completed'].includes(t.status))
          .filter((t) => (role === 'driver' ? t.driver_id === profile?.id : true))
          .sort((a, b) => a.scheduled_departure_at.localeCompare(b.scheduled_departure_at)),
      [today, role, profile?.id],
    ),
  )

  const open = rows.filter((r) => !['resolved', 'closed'].includes(r.incident.status))
  const critical = open.filter((r) => ['high', 'critical'].includes(r.incident.severity))

  function submit() {
    const trip = activeTrips.find((t) => t.id === form.trip_id)
    const result = createIncident(
      {
        category: form.category,
        severity: form.severity,
        description: form.description,
        trip_id: trip?.id ?? null,
        vehicle_id: trip?.vehicle_id ?? null,
        route_id: null,
        operational_effect: form.operational_effect,
        passenger_notification_required: form.passenger_notification_required,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      },
      actor,
    )
    if (!result.ok) {
      toast.error('Incident not recorded', { description: result.error })
      return
    }
    toast.success(`${result.data.reference} recorded`, { description: 'Control has been notified.' })
    setCreating(false)
    setForm({ ...form, description: '', trip_id: '' })
  }

  function transition(status: Incident['status']) {
    if (!selected) return
    const result = updateIncident(
      { id: selected.incident.id, status, resolution: resolution || undefined, assigned_to: status === 'acknowledged' ? profile?.id : undefined },
      actor,
    )
    if (!result.ok) {
      toast.error('Update refused', { description: result.error })
      return
    }
    toast.success(`${selected.incident.reference} ${status.replace('_', ' ')}`)
    setSelected(null)
    setResolution('')
  }

  const columns: Column<Row>[] = [
    { key: 'ref', header: 'Ref', value: (r) => r.incident.reference, cell: (r) => <span className="font-semibold tnum">{r.incident.reference}</span> },
    { key: 'severity', header: 'Severity', value: (r) => SEVERITIES.indexOf(r.incident.severity), cell: (r) => <SeverityBadge severity={r.incident.severity} /> },
    { key: 'category', header: 'Category', value: (r) => r.incident.category, cell: (r) => titleCase(r.incident.category) },
    { key: 'description', header: 'Description', value: (r) => r.incident.description, cell: (r) => <span className="line-clamp-1 max-w-md">{r.incident.description}</span> },
    { key: 'trip', header: 'Trip', value: (r) => r.trip_code ?? '', cell: (r) => r.trip_code ?? '—', hideable: true },
    { key: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle ?? '', cell: (r) => r.vehicle ?? '—', hideable: true },
    { key: 'status', header: 'Status', value: (r) => r.incident.status, cell: (r) => <Badge tone={['resolved', 'closed'].includes(r.incident.status) ? 'forest' : 'warning'}>{titleCase(r.incident.status)}</Badge> },
    { key: 'reported', header: 'Reported', value: (r) => r.incident.reported_at, cell: (r) => relative(r.incident.reported_at) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidents"
        description="Delays, breakdowns, passenger and safety issues, each with an owner, an operational effect and a timeline."
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Report incident</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Open" value={open.length} icon={AlertTriangle} tone={open.length ? 'warning' : 'default'} />
        <StatTile index={1} label="High or critical" value={critical.length} tone={critical.length ? 'critical' : 'default'} />
        <StatTile index={2} label="Resolved today" value={rows.filter((r) => r.incident.resolved_at?.startsWith(today)).length} />
        <StatTile index={3} label="Total on record" value={rows.length} />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.incident.id}
        onRowClick={setSelected}
        searchPlaceholder="Reference, category, description…"
        exportName="incident-report"
        pageSize={10}
      />

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Report an incident</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as IncidentCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <div className="grid grid-cols-4 gap-1">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, severity: s })}
                      className={cn(
                        'press rounded-md border py-2 text-xs font-medium capitalize transition-colors',
                        form.severity === s
                          ? s === 'critical' || s === 'high' ? 'border-critical bg-critical/12' : 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label hint="optional">Affected trip</Label>
              <Select value={form.trip_id} onValueChange={(v) => setForm({ ...form, trip_id: v })}>
                <SelectTrigger><SelectValue placeholder="Not tied to a trip" /></SelectTrigger>
                <SelectContent>
                  {activeTrips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{lagosTime(t.scheduled_departure_at)} · {t.trip_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>What happened</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Where, what, and the current effect on passengers" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Operational effect</Label>
                <Select value={form.operational_effect} onValueChange={(v) => setForm({ ...form, operational_effect: v as Incident['operational_effect'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EFFECTS.map((e) => <SelectItem key={e} value={e}>{titleCase(e)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label hint="optional">Latitude</Label>
                  <Input value={form.latitude} inputMode="decimal" onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="9.006" />
                </div>
                <div className="space-y-1.5">
                  <Label hint="optional">Longitude</Label>
                  <Input value={form.longitude} inputMode="decimal" onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="7.575" />
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.passenger_notification_required} onCheckedChange={(v) => setForm({ ...form, passenger_notification_required: Boolean(v) })} />
              Passengers on affected trips should be notified
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.description.trim()}>Record incident</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent>
          {selected && (
            <>
              <DrawerHeader>
                <div className="flex items-center gap-2">
                  <DrawerTitle className="text-lg font-bold">{selected.incident.reference}</DrawerTitle>
                  <SeverityBadge severity={selected.incident.severity} />
                  <Badge tone="neutral">{titleCase(selected.incident.status)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{titleCase(selected.incident.category)} · reported {lagosDateTime(selected.incident.reported_at)}</p>
              </DrawerHeader>
              <DrawerBody className="space-y-5">
                <Card><CardContent className="pt-5 text-sm leading-relaxed">{selected.incident.description}</CardContent></Card>
                <dl className="divide-y divide-border rounded-lg border border-border px-3">
                  <DefinitionRow term="Reporter">{selected.reporter}</DefinitionRow>
                  <DefinitionRow term="Assigned to">{selected.assignee ?? <span className="text-muted-foreground">Unassigned</span>}</DefinitionRow>
                  <DefinitionRow term="Trip">{selected.trip_code ?? '—'}</DefinitionRow>
                  <DefinitionRow term="Vehicle">{selected.vehicle ?? '—'}</DefinitionRow>
                  <DefinitionRow term="Route">{selected.route ?? '—'}</DefinitionRow>
                  <DefinitionRow term="Operational effect">{titleCase(selected.incident.operational_effect)}</DefinitionRow>
                  <DefinitionRow term="Passenger notification">{selected.incident.passenger_notification_required ? 'Required' : 'Not required'}</DefinitionRow>
                  {selected.incident.latitude !== null && (
                    <DefinitionRow term="Location">{selected.incident.latitude.toFixed(4)}, {selected.incident.longitude?.toFixed(4)}</DefinitionRow>
                  )}
                </dl>
                {selected.incident.resolution && (
                  <div className="rounded-lg bg-primary/[0.07] p-3 text-sm">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Resolution</p>
                    <p className="mt-1">{selected.incident.resolution}</p>
                  </div>
                )}
                {!['resolved', 'closed'].includes(selected.incident.status) && role !== 'driver' && (
                  <div className="space-y-1.5">
                    <Label>Resolution note</Label>
                    <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Required to resolve or close" />
                  </div>
                )}
              </DrawerBody>
              {!['resolved', 'closed'].includes(selected.incident.status) && role !== 'driver' && (
                <DrawerFooter className="flex flex-wrap gap-2">
                  {selected.incident.status === 'open' && <Button size="sm" variant="outline" onClick={() => transition('acknowledged')}>Acknowledge</Button>}
                  {selected.incident.status !== 'in_progress' && <Button size="sm" variant="outline" onClick={() => transition('in_progress')}>Start work</Button>}
                  <Button size="sm" onClick={() => transition('resolved')} disabled={!resolution.trim()}>Resolve</Button>
                </DrawerFooter>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
