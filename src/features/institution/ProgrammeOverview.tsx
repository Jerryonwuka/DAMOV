import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Building2, CreditCard, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { naira, pct } from '@/lib/format'
import { percent } from '@/lib/utils'
import { useProgramme } from './institution-data'

export function ProgrammeOverview() {
  const p = useProgramme()
  const adoption = percent(p.registered, p.eligibleStaff)
  const budget = p.policy?.programme_budget ?? 0
  const consumed = p.policy?.budget_consumed ?? 0

  if (!p.organization) return <EmptyState icon={Building2} title="No organisation linked to this account" />

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${p.organization.name} programme`}
        description={`Aggregated commuter programme reporting for ${p.today.slice(0, 7)}. Individual staff travel history is not shown to the institution.`}
        actions={<Button asChild><Link to="/institution/reports">Monthly statement <ArrowRight className="size-4" /></Link></Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index={0} label="Eligible staff" value={p.eligibleStaff} icon={Users} />
        <StatTile index={1} label="Registered riders" value={p.registered} icon={ShieldCheck} tone="primary" hint={`${pct(adoption)} adoption`} />
        <StatTile index={2} label="Active this month" value={p.activeRiders} tone="info" />
        <StatTile index={3} label="Trips this month" value={p.tripsThisMonth} icon={TrendingUp} />
        <StatTile index={4} label="Gross transport value" value={naira(p.grossTransportValue)} />
        <StatTile index={5} label="Staff contribution" value={naira(p.passengerContribution)} />
        <StatTile index={6} label="Institution subsidy" value={naira(p.subsidyRecognized)} icon={CreditCard} tone="primary" hint={`${naira(p.subsidyReserved)} reserved, not yet boarded`} />
        <StatTile index={7} label="Remaining budget" value={naira(Math.max(0, budget - consumed))} tone={budget && consumed / budget > 0.85 ? 'warning' : 'default'} hint={budget ? `${pct((consumed / budget) * 100, 1)} of ${naira(budget)} used` : 'No ceiling set'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Sponsored trips by departure hour</CardTitle></CardHeader>
          <CardContent className="h-56">
            {p.timeBands.length === 0 ? <EmptyState title="No sponsored trips yet this month" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p.timeBands} margin={{ left: -16, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="band" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <ChartTooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }} />
                  <Bar dataKey="trips" name="Trips" fill="#6FBF48" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle>Primary corridors</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {p.corridors.length === 0 && <p className="text-sm text-muted-foreground">No corridor usage yet.</p>}
              {p.corridors.map((c) => (
                <div key={c.code} className="text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{c.code} · {c.name}</span><span className="text-xs text-muted-foreground tnum">{c.trips} trips · {naira(c.subsidy)}</span></div>
                  <Progress value={percent(c.trips, p.tripsThisMonth)} className="mt-1" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle>Exceptions</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Rejected subsidy claims</span><Badge tone={p.rejections ? 'warning' : 'neutral'}>{p.rejections}</Badge></div>
              <div className="flex items-center justify-between"><span>Pending verifications</span><Badge tone="neutral">{p.eligibility.filter((e) => e.status === 'pending').length}</Badge></div>
              <div className="flex items-center justify-between"><span>Released reservations</span><span className="tnum">{naira(p.subsidyReleased)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
