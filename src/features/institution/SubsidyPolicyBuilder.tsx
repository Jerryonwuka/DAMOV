import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/misc'
import { PageHeader } from '@/components/ui/patterns'
import { lagosDateTime, naira } from '@/lib/format'
import { saveSubsidyPolicy, type SubsidyPolicyDraft } from '@/server/institution'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'
import { useProgramme } from './institution-data'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Subsidy policy builder.
 *
 * Saving always creates a new version — booking snapshots refer to versions,
 * so a published policy is never edited underneath a passenger. The preview
 * on the right uses the same rule text the server returns at quote time.
 */
export function SubsidyPolicyBuilder() {
  const { actor, organizationId } = useAuth()
  const p = useProgramme()
  const routes = useDb(useCallback((db) => db.routes.filter((r) => r.status === 'published'), []))
  const [draft, setDraft] = useState<SubsidyPolicyDraft | null>(null)

  useEffect(() => {
    if (!draft && organizationId) {
      const base = p.policy
      setDraft({
        name: base?.name ?? 'Staff Commute Co-pay',
        organization_id: organizationId,
        route_ids: base?.route_ids ?? routes.map((r) => r.id),
        direction_codes: base?.direction_codes ?? null,
        days_of_week: base?.days_of_week ?? [1, 2, 3, 4, 5],
        time_bands: base?.time_bands ?? [{ start: '05:30', end: '09:30' }, { start: '15:30', end: '20:00' }],
        max_trips_per_day: base?.max_trips_per_day ?? 2,
        max_trips_per_week: base?.max_trips_per_week ?? null,
        max_trips_per_month: base?.max_trips_per_month ?? 44,
        subsidy_type: base?.subsidy_type ?? 'fixed',
        fixed_amount: base?.fixed_amount ?? 300,
        percentage: base?.percentage ?? null,
        max_subsidy_per_trip: base?.max_subsidy_per_trip ?? 300,
        valid_from: base?.valid_from ?? p.today,
        valid_to: base?.valid_to ?? null,
        programme_budget: base?.programme_budget ?? 10_000_000,
      })
    }
  }, [draft, organizationId, p.policy, p.today, routes])

  if (!draft) return null

  function save(publish: boolean) {
    if (!draft) return
    const result = saveSubsidyPolicy({ policy_id: p.policy?.id ?? null, draft, publish }, actor)
    if (!result.ok) return toast.error('Policy not saved', { description: result.error })
    toast.success(`${result.data.name} v${result.data.version} ${publish ? 'published' : 'saved as draft'}`, { description: publish ? 'Applies to every quote from now on.' : 'Publish when ready.' })
  }

  const field = <K extends keyof SubsidyPolicyDraft>(key: K, value: SubsidyPolicyDraft[K]) => setDraft({ ...draft, [key]: value })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subsidy rules"
        description="Define who is covered, on which corridors, when, how much, and up to what ceiling. Evaluated on the server at every booking with a written explanation."
        actions={
          <>
            <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
            <Button onClick={() => save(true)}><Send className="size-4" /> Approve and publish</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Programme</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label required>Policy name</Label><Input value={draft.name} onChange={(e) => field('name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Valid from</Label><Input type="date" value={draft.valid_from} onChange={(e) => field('valid_from', e.target.value)} /></div>
              <div className="space-y-1.5"><Label hint="blank = open-ended">Valid to</Label><Input type="date" value={draft.valid_to ?? ''} onChange={(e) => field('valid_to', e.target.value || null)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label hint="blank = no ceiling">Programme budget ceiling ₦</Label><Input value={draft.programme_budget ?? ''} inputMode="numeric" onChange={(e) => field('programme_budget', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)} className="tnum" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contribution</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['fixed', 'percentage'] as const).map((type) => (
                  <button key={type} onClick={() => field('subsidy_type', type)} className={cn('press rounded-lg border p-3 text-left text-sm transition-all', draft.subsidy_type === type ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                    <p className="font-semibold">{type === 'fixed' ? 'Fixed amount' : 'Percentage of fare'}</p>
                    <p className="text-xs text-muted-foreground">{type === 'fixed' ? 'e.g. ₦300 per eligible trip' : 'e.g. 60% of the gross fare'}</p>
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {draft.subsidy_type === 'fixed' ? (
                  <div className="space-y-1.5"><Label required>Amount per trip ₦</Label><Input value={draft.fixed_amount ?? ''} inputMode="numeric" onChange={(e) => field('fixed_amount', Number(e.target.value.replace(/\D/g, '')) || null)} className="tnum" /></div>
                ) : (
                  <div className="space-y-1.5"><Label required>Percentage %</Label><Input value={draft.percentage ?? ''} inputMode="numeric" onChange={(e) => field('percentage', Number(e.target.value.replace(/\D/g, '')) || null)} className="tnum" /></div>
                )}
                <div className="space-y-1.5"><Label hint="optional">Maximum per trip ₦</Label><Input value={draft.max_subsidy_per_trip ?? ''} inputMode="numeric" onChange={(e) => field('max_subsidy_per_trip', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)} className="tnum" /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Limits</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Trips per day</Label><Input value={draft.max_trips_per_day ?? ''} inputMode="numeric" onChange={(e) => field('max_trips_per_day', e.target.value ? Number(e.target.value) : null)} className="tnum" /></div>
              <div className="space-y-1.5"><Label>Trips per week</Label><Input value={draft.max_trips_per_week ?? ''} inputMode="numeric" onChange={(e) => field('max_trips_per_week', e.target.value ? Number(e.target.value) : null)} className="tnum" /></div>
              <div className="space-y-1.5"><Label>Trips per month</Label><Input value={draft.max_trips_per_month ?? ''} inputMode="numeric" onChange={(e) => field('max_trips_per_month', e.target.value ? Number(e.target.value) : null)} className="tnum" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Where and when</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2">Eligible routes</Label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {routes.map((route) => {
                    const checked = !draft.route_ids || draft.route_ids.includes(route.id)
                    return (
                      <label key={route.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent">
                        <Checkbox checked={checked} onCheckedChange={(v) => {
                          const current = draft.route_ids ?? routes.map((r) => r.id)
                          field('route_ids', v ? [...new Set([...current, route.id])] : current.filter((id) => id !== route.id))
                        }} />
                        <span className="size-2.5 rounded-full" style={{ background: route.color }} />
                        {route.code} · {route.public_name}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <Label className="mb-2">Directions</Label>
                <div className="flex gap-2">
                  {(['inbound', 'outbound'] as const).map((code) => {
                    const checked = !draft.direction_codes || draft.direction_codes.includes(code)
                    return (
                      <label key={code} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
                        <Checkbox checked={checked} onCheckedChange={(v) => {
                          const current = draft.direction_codes ?? ['inbound', 'outbound']
                          const next = v ? [...new Set([...current, code])] : current.filter((c) => c !== code)
                          field('direction_codes', next.length === 2 ? null : next)
                        }} />
                        {titleCase(code)}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <Label className="mb-2">Travel days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((day, index) => {
                    const on = draft.days_of_week?.includes(index) ?? true
                    return (
                      <button key={day} onClick={() => { const current = draft.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]; field('days_of_week', on ? current.filter((d) => d !== index) : [...current, index].sort()) }} className={cn('press rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground')}>
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Time bands</Label>
                  <Button size="sm" variant="ghost" onClick={() => field('time_bands', [...(draft.time_bands ?? []), { start: '12:00', end: '14:00' }])}><Plus className="size-3.5" /> Add band</Button>
                </div>
                <div className="space-y-2">
                  {(draft.time_bands ?? []).map((band, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input type="time" value={band.start} onChange={(e) => field('time_bands', draft.time_bands!.map((b, i) => (i === index ? { ...b, start: e.target.value } : b)))} className="w-32" />
                      <span className="text-muted-foreground">to</span>
                      <Input type="time" value={band.end} onChange={(e) => field('time_bands', draft.time_bands!.map((b, i) => (i === index ? { ...b, end: e.target.value } : b)))} className="w-32" />
                      <Button size="icon-sm" variant="ghost" onClick={() => field('time_bands', draft.time_bands!.filter((_, i) => i !== index))} aria-label="Remove band"><Trash2 className="size-3.5" /></Button>
                    </div>
                  ))}
                  {!draft.time_bands?.length && <p className="text-xs text-muted-foreground">No time restriction — any departure qualifies.</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <motion.div layout>
            <Card className="border-primary/30">
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> How this reads to a passenger</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="rounded-lg bg-primary/[0.08] p-3 leading-relaxed">
                  <span className="font-semibold">{p.organization?.short_name}</span> covers{' '}
                  {draft.subsidy_type === 'fixed' ? naira(draft.fixed_amount ?? 0) : `${draft.percentage ?? 0}%`}
                  {draft.max_subsidy_per_trip && draft.subsidy_type === 'percentage' ? ` (max ${naira(draft.max_subsidy_per_trip)})` : ''} of each eligible trip
                  {draft.max_trips_per_day ? `, up to ${draft.max_trips_per_day} trips a day` : ''}
                  {draft.max_trips_per_month ? ` and ${draft.max_trips_per_month} a month` : ''}
                  {draft.time_bands?.length ? `, departing ${draft.time_bands.map((b) => `${b.start}–${b.end}`).join(' or ')}` : ''}
                  {draft.days_of_week && draft.days_of_week.length < 7 ? ` on ${draft.days_of_week.map((d) => DAYS[d]).join(', ')}` : ''}.
                </p>
                <p className="text-xs text-muted-foreground">Example quote on a {naira(500)} fare:</p>
                <div className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex justify-between"><span>Gross fare</span><span className="tnum">{naira(500)}</span></div>
                  <div className="flex justify-between text-primary-700 dark:text-primary-400"><span>{p.organization?.short_name} contribution</span><span className="tnum">− {naira(Math.min(500, draft.subsidy_type === 'fixed' ? (draft.fixed_amount ?? 0) : Math.min(Math.round((500 * (draft.percentage ?? 0)) / 100), draft.max_subsidy_per_trip ?? Infinity)))}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Passenger pays</span><span className="tnum">{naira(500 - Math.min(500, draft.subsidy_type === 'fixed' ? (draft.fixed_amount ?? 0) : Math.min(Math.round((500 * (draft.percentage ?? 0)) / 100), draft.max_subsidy_per_trip ?? Infinity)))}</span></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <Card>
            <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {p.policies.map((policy) => (
                <div key={policy.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-xs">
                  <span><span className="font-semibold">v{policy.version}</span> · {policy.name}<br /><span className="text-muted-foreground">{lagosDateTime(policy.created_at)}</span></span>
                  <Badge tone={policy.status === 'published' ? 'primary' : policy.status === 'draft' ? 'warning' : 'neutral'} size="sm">{titleCase(policy.status)}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
