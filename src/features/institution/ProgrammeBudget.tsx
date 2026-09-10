import { CreditCard, Landmark, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { DefinitionRow, EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { lagosDate, naira, pct } from '@/lib/format'
import { useProgramme } from './institution-data'

export function ProgrammeBudget() {
  const p = useProgramme()
  const budget = p.policy?.programme_budget ?? 0
  const consumed = p.policy?.budget_consumed ?? 0
  const remaining = Math.max(0, budget - consumed)
  const daysElapsed = Math.max(1, Number(p.today.slice(8, 10)))
  const burn = consumed / daysElapsed
  const projected = burn * 30

  if (!p.policy) return <div><PageHeader title="Budget & spend" /><EmptyState icon={Landmark} title="No published policy" description="Publish a subsidy policy to track its budget." /></div>

  return (
    <div className="space-y-5">
      <PageHeader title="Budget & spend" description={`${p.policy.name} v${p.policy.version} · reserved at booking, recognised at boarding, released on cancellation.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Programme ceiling" value={naira(budget)} icon={Landmark} />
        <StatTile index={1} label="Consumed" value={naira(consumed)} icon={CreditCard} tone="primary" hint={`${pct(budget ? (consumed / budget) * 100 : 0, 1)} of ceiling`} />
        <StatTile index={2} label="Remaining" value={naira(remaining)} tone={budget && remaining / budget < 0.15 ? 'warning' : 'default'} />
        <StatTile index={3} label="Projected monthly spend" value={naira(projected)} icon={TrendingDown} hint={`${naira(Math.round(burn))} per day so far`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Budget consumption</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Progress value={budget ? Math.min(100, (consumed / budget) * 100) : 0} className="h-3" indicatorClassName={budget && consumed / budget > 0.85 ? 'bg-warning' : undefined} />
          <dl className="divide-y divide-border rounded-lg border border-border px-3">
            <DefinitionRow term="This month · reserved (booked, not yet boarded)">{naira(p.subsidyReserved)}</DefinitionRow>
            <DefinitionRow term="This month · recognised (boarded)">{naira(p.subsidyRecognized)}</DefinitionRow>
            <DefinitionRow term="Released back on cancellation">{naira(p.subsidyReleased)}</DefinitionRow>
            <DefinitionRow term="Gross transport value delivered">{naira(p.grossTransportValue)}</DefinitionRow>
            <DefinitionRow term="Staff contribution">{naira(p.passengerContribution)}</DefinitionRow>
            <DefinitionRow term="Policy validity">{lagosDate(`${p.policy.valid_from}T00:00:00Z`)} → {p.policy.valid_to ? lagosDate(`${p.policy.valid_to}T00:00:00Z`) : 'open'}</DefinitionRow>
          </dl>
          <p className="text-2xs text-muted-foreground">When the ceiling is reached the server declines further subsidy with the explanation "the programme budget ceiling has been reached", and passengers are quoted the standard fare.</p>
        </CardContent>
      </Card>
    </div>
  )
}
