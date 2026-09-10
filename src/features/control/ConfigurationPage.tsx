import { useCallback, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/patterns'
import { ROLE_LABELS } from '@/auth/permissions'
import type { ConfigurationValue } from '@/lib/types'
import { updateConfiguration } from '@/server/configuration'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

const GROUP_ORDER: ConfigurationValue['group'][] = ['boarding', 'cash', 'telemetry', 'service', 'capacity', 'targets']
const GROUP_DESCRIPTION: Record<ConfigurationValue['group'], string> = {
  boarding: 'Gate validation windows.',
  cash: 'Reconciliation thresholds that escalate a session to a supervisor.',
  telemetry: 'When a vehicle position stops being shown as live.',
  service: 'Punctuality definitions used by every dashboard and report.',
  capacity: 'Seats withheld between legal and bookable capacity.',
  targets: 'Pilot targets. Clearly labelled as targets, never as actuals.',
}

/** Controlled configuration. Every change is audited with before and after values. */
export function ConfigurationPage() {
  const { actor, role, can } = useAuth()
  const config = useDb(useCallback((db) => db.configuration, []))
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function save(item: ConfigurationValue) {
    const raw = drafts[item.key]
    if (raw === undefined || !role) return
    const value = typeof item.value === 'number' ? Number(raw) : raw
    if (typeof item.value === 'number' && Number.isNaN(value)) return toast.error('Enter a number')
    const result = updateConfiguration(item.key, value, { ...actor, role })
    if (!result.ok) return toast.error('Not saved', { description: result.error })
    toast.success(`${item.label} updated`, { description: `Now ${value}${item.unit ? ` ${item.unit}` : ''} — logged to audit.` })
    setDrafts((d) => { const next = { ...d }; delete next[item.key]; return next })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Configuration" description="Operational parameters that shape validation, reconciliation, staleness and performance targets. Changes are logged with before and after values." />
      {GROUP_ORDER.map((group) => {
        const items = config.filter((c) => c.group === group)
        if (!items.length) return null
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 className="size-4 text-primary" /> {titleCase(group)}</CardTitle>
              <p className="text-xs text-muted-foreground">{GROUP_DESCRIPTION[group]}</p>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {items.map((item) => {
                const editable = can('action.edit_configuration') && role !== null && item.editable_by.includes(role)
                const draft = drafts[item.key]
                const dirty = draft !== undefined && draft !== String(item.value)
                return (
                  <div key={item.key} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[220px] flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                      <p className="mt-1 text-2xs text-muted-foreground">Editable by {item.editable_by.map((r) => ROLE_LABELS[r]).join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={draft ?? String(item.value)} disabled={!editable} onChange={(e) => setDrafts({ ...drafts, [item.key]: e.target.value })} className={cn('w-28 text-right tnum', dirty && 'border-primary')} />
                      <span className="w-14 text-xs text-muted-foreground">{item.unit}</span>
                      {editable ? (
                        <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty} onClick={() => save(item)}><Save className="size-3.5" /> Save</Button>
                      ) : (
                        <Badge tone="neutral" size="sm">Read only</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
