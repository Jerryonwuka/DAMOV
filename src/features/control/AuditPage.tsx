import { useCallback, useState } from 'react'
import { ScrollText, ShieldAlert } from 'lucide-react'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader, StatTile } from '@/components/ui/patterns'
import { lagosFullDateTime, relative } from '@/lib/format'
import type { AuditLog } from '@/lib/types'
import { cn } from '@/lib/utils'

const FILTERS = ['all', 'sensitive', 'notice', 'info'] as const

/** Audit review. Sensitive actions — overrides, financial adjustments, policy and role changes — are the default view. */
export function AuditPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const logs = useDb(useCallback((db) => db.audit_logs, []))
  const rows = filter === 'all' ? logs : logs.filter((l) => l.severity === filter)

  const columns: Column<AuditLog>[] = [
    { key: 'time', header: 'When', value: (r) => r.occurred_at, cell: (r) => <span className="text-xs"><span className="font-medium">{relative(r.occurred_at)}</span><br /><span className="text-muted-foreground">{lagosFullDateTime(r.occurred_at)}</span></span>, width: '180px' },
    { key: 'severity', header: 'Severity', value: (r) => ['sensitive', 'notice', 'info'].indexOf(r.severity), cell: (r) => <Badge tone={r.severity === 'sensitive' ? 'critical' : r.severity === 'notice' ? 'warning' : 'neutral'}>{r.severity}</Badge> },
    { key: 'actor', header: 'Actor', value: (r) => r.actor_name, cell: (r) => <span className="font-medium">{r.actor_name}</span> },
    { key: 'action', header: 'Action', value: (r) => r.action, cell: (r) => <code className="rounded bg-muted px-1.5 py-0.5 text-2xs">{r.action}</code> },
    { key: 'entity', header: 'Entity', value: (r) => r.entity_type, cell: (r) => <span className="text-xs">{r.entity_type}{r.entity_id ? <span className="text-muted-foreground tnum"> · {r.entity_id.slice(0, 8)}</span> : null}</span>, hideable: true },
    { key: 'summary', header: 'Summary', value: (r) => r.summary, cell: (r) => <span className="text-xs">{r.summary}{r.diff && <span className="mt-0.5 block text-2xs text-muted-foreground">{Object.entries(r.diff).map(([k, v]) => `${k}: ${String(v.before)} → ${String(v.after)}`).join('; ')}</span>}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Logs" description="Every sensitive read and write, with actor, entity and a safe diff. Append-only." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Entries" value={logs.length} icon={ScrollText} />
        <StatTile index={1} label="Sensitive" value={logs.filter((l) => l.severity === 'sensitive').length} icon={ShieldAlert} tone="critical" />
        <StatTile index={2} label="Overrides & reversals" value={logs.filter((l) => /override|revers/.test(l.action)).length} tone="warning" />
        <StatTile index={3} label="Financial adjustments" value={logs.filter((l) => /cash_session|cost|payment|refund/.test(l.action)).length} />
      </div>
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Actor, action, entity or summary…"
        exportName="audit-log"
        pageSize={20}
        dense
        toolbar={
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {FILTERS.map((f) => (
              <Button key={f} size="sm" variant="ghost" className={cn('h-8 capitalize', filter === f && 'bg-card shadow-subtle')} onClick={() => setFilter(f)}>{f}</Button>
            ))}
          </div>
        }
      />
    </div>
  )
}
