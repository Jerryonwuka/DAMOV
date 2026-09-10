import { useState } from 'react'
import { Upload, UserCheck, UserX, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { lagosDate, maskPhone } from '@/lib/format'
import type { EligibilityRecord } from '@/lib/types'
import { importEligibleRiders, setEligibilityStatus } from '@/server/institution'
import { percent, titleCase } from '@/lib/utils'
import { toast } from 'sonner'
import { useProgramme } from './institution-data'

/** Eligible rider management with CSV import. Formula-leading cells are neutralised on preview. */
export function EligibleRiders() {
  const { actor, organizationId } = useAuth()
  const p = useProgramme()
  const [importing, setImporting] = useState(false)
  const [csv, setCsv] = useState('')

  const preview = csv
    .split(/\r?\n/)
    .map((line) => line.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, '')))
    .filter((cells) => cells.length >= 2 && cells[0] && !/^staff/i.test(cells[0]))
    .map(([staff_id, full_name, phone]) => ({ staff_id: staff_id.replace(/^[=+\-@]/, ''), full_name: (full_name ?? '').replace(/^[=+\-@]/, ''), phone: phone || null }))

  function runImport() {
    if (!organizationId) return
    const batch = `${p.organization?.code ?? 'ORG'}-${new Date().toISOString().slice(0, 10)}`
    const result = importEligibleRiders({ organization_id: organizationId, rows: preview, batch }, actor)
    if (!result.ok) return toast.error('Import failed', { description: result.error })
    toast.success('Eligibility list imported', { description: `${result.data.created} added · ${result.data.updated} updated · ${result.data.matched} matched to registered riders.` })
    setImporting(false)
    setCsv('')
  }

  function change(record: EligibilityRecord, status: EligibilityRecord['status']) {
    const result = setEligibilityStatus({ record_id: record.id, status }, actor)
    if (!result.ok) return toast.error('Not updated', { description: result.error })
    toast.success(`${record.full_name} ${status}`)
  }

  const columns: Column<EligibilityRecord>[] = [
    { key: 'staff', header: 'Staff ID', value: (r) => r.staff_id, cell: (r) => <span className="font-semibold tnum">{r.staff_id}</span> },
    { key: 'name', header: 'Name', value: (r) => r.full_name },
    { key: 'phone', header: 'Phone', value: (r) => r.phone ?? '', cell: (r) => <span className="text-xs tnum">{r.phone ? maskPhone(r.phone) : '—'}</span>, hideable: true },
    { key: 'registered', header: 'Registered', value: (r) => (r.rider_id ? 1 : 0), cell: (r) => (r.rider_id ? <Badge tone="primary" size="sm">Registered</Badge> : <Badge tone="neutral" size="sm">Not yet</Badge>) },
    { key: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <Badge tone={r.status === 'active' ? 'primary' : r.status === 'pending' ? 'warning' : 'critical'}>{titleCase(r.status)}</Badge> },
    { key: 'valid', header: 'Valid', value: (r) => r.valid_from, cell: (r) => <span className="text-xs">{lagosDate(`${r.valid_from}T00:00:00Z`)} → {r.valid_to ? lagosDate(`${r.valid_to}T00:00:00Z`) : 'open'}</span>, hideable: true },
    { key: 'batch', header: 'Batch', value: (r) => r.import_batch ?? '', cell: (r) => <span className="text-xs text-muted-foreground">{r.import_batch ?? '—'}</span>, hideable: true },
    {
      key: 'actions', header: '', sortable: false,
      cell: (r) => (
        <div className="flex gap-1">
          {r.status !== 'active' && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); change(r, 'active') }}><UserCheck className="size-3.5" /> Activate</Button>}
          {r.status === 'active' && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); change(r, 'revoked') }}><UserX className="size-3.5" /> Revoke</Button>}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Eligible riders"
        description="Who the programme covers. Riders match to this list by staff ID or phone when they register; changes take effect on the next fare quote."
        actions={<Button onClick={() => setImporting(true)}><Upload className="size-4" /> Import CSV</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Eligible" value={p.eligibleStaff} icon={Users} />
        <StatTile index={1} label="Registered" value={p.registered} tone="primary" hint={`${percent(p.registered, p.eligibleStaff)}% adoption`} />
        <StatTile index={2} label="Pending verification" value={p.eligibility.filter((e) => e.status === 'pending').length} tone="warning" />
        <StatTile index={3} label="Revoked or expired" value={p.eligibility.filter((e) => ['revoked', 'expired'].includes(e.status)).length} />
      </div>
      <DataTable data={p.eligibility} columns={columns} rowKey={(r) => r.id} searchPlaceholder="Staff ID or name…" exportName="eligible-riders" pageSize={15} dense />

      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Import eligible staff</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-xs text-muted-foreground">Paste CSV rows as <code>staff_id,full_name,phone</code>. A header row is ignored. Cells beginning with =, +, − or @ are neutralised to prevent formula injection.</p>
            <div className="space-y-1.5">
              <Label>CSV</Label>
              <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={'FMOT/2024/2301,Ada Nwachukwu,08031234567\nFMOT/2024/2302,Yusuf Bello,'} className="font-mono text-xs" />
            </div>
            {preview.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Preview · {preview.length} rows</CardTitle></CardHeader>
                <CardContent className="max-h-40 overflow-auto text-xs">
                  {preview.slice(0, 20).map((row, i) => <p key={i} className="tnum">{row.staff_id} · {row.full_name} · {row.phone ?? '—'}</p>)}
                  {preview.length > 20 && <p className="text-muted-foreground">…and {preview.length - 20} more</p>}
                </CardContent>
              </Card>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImporting(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={preview.length === 0}>Import {preview.length} rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
