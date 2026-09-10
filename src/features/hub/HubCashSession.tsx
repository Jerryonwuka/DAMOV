import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, CheckCircle2, Lock, ShieldQuestion, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useAssignedHub, useConfig, useOpenCashSession } from '@/hooks/use-damov'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CashStatusBadge } from '@/components/ui/status'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/patterns'
import { lagosDateTime, lagosTime, naira } from '@/lib/format'
import type { CashSession, CashTransaction } from '@/lib/types'
import { closeCashSession, openCashSession, reviewCashVariance } from '@/server/cash'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Cash reconciliation at the counter.
 *
 * Expected cash is computed from the session's own transactions — the agent
 * never types it. A variance needs a written explanation, and one above
 * tolerance goes to a supervisor before the session can be locked.
 */
export function HubCashSession() {
  const { profile, actor, can } = useAuth()
  const hub = useAssignedHub()
  const session = useOpenCashSession()
  const tolerance = useConfig('cash.variance_tolerance_naira', 500)

  const [float, setFloat] = useState('25000')
  const [declared, setDeclared] = useState('')
  const [explanation, setExplanation] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewing, setReviewing] = useState<string | null>(null)

  const transactions = useDb(
    useCallback(
      (db) =>
        db.cash_transactions
          .filter((t) => t.cash_session_id === session?.id)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .map((transaction) => ({
            transaction,
            reference: transaction.booking_id
              ? (db.bookings.find((b) => b.id === transaction.booking_id)?.booking_reference ?? null)
              : null,
          })),
      [session?.id],
    ),
  )

  const history = useDb(
    useCallback(
      (db) =>
        db.cash_sessions
          .filter((s) => s.status !== 'open')
          .map((s) => ({
            session: s,
            agent: db.profiles.find((p) => p.id === s.agent_id)?.full_name ?? '—',
            hub: db.hubs.find((h) => h.id === s.hub_id)?.name ?? '—',
          }))
          .sort((a, b) => b.session.opened_at.localeCompare(a.session.opened_at)),
      [],
    ),
  )

  const expected = session ? session.opening_float + session.expected_cash : 0
  const declaredNumber = Number(declared.replace(/[^\d-]/g, '')) || 0
  const variance = declared === '' ? null : declaredNumber - expected
  const needsExplanation = variance !== null && variance !== 0
  const escalates = variance !== null && Math.abs(variance) > tolerance

  function open() {
    if (!profile || !hub) return
    const result = openCashSession({ hub_id: hub.id, agent_id: profile.id, opening_float: Number(float) || 0 }, actor)
    if (!result.ok) {
      toast.error('Could not open session', { description: result.error })
      return
    }
    toast.success('Cash session open', { description: `Opening float ${naira(result.data.opening_float)}.` })
  }

  function close() {
    if (!session) return
    const result = closeCashSession({ session_id: session.id, declared_cash: declaredNumber, explanation }, actor)
    if (!result.ok) {
      toast.error('Session not closed', { description: result.error })
      return
    }
    setDeclared('')
    setExplanation('')
    toast.success(
      result.data.status === 'under_review' ? 'Submitted for supervisor review' : 'Session submitted',
      { description: `Variance ${naira(result.data.variance ?? 0)}.` },
    )
  }

  function decide(decision: 'approved' | 'rejected' | 'returned') {
    if (!reviewing) return
    const result = reviewCashVariance({ session_id: reviewing, decision, note: reviewNote }, actor)
    if (!result.ok) {
      toast.error('Review failed', { description: result.error })
      return
    }
    toast.success(`Session ${decision}`)
    setReviewing(null)
    setReviewNote('')
  }

  const transactionColumns: Column<{ transaction: CashTransaction; reference: string | null }>[] = [
    { key: 'time', header: 'Time', value: (r) => r.transaction.occurred_at, cell: (r) => lagosTime(r.transaction.occurred_at) },
    { key: 'type', header: 'Type', value: (r) => r.transaction.type, cell: (r) => <Badge tone="neutral" size="sm">{titleCase(r.transaction.type)}</Badge> },
    { key: 'reference', header: 'Booking', value: (r) => r.reference ?? '—' },
    { key: 'amount', header: 'Amount', align: 'right', value: (r) => r.transaction.amount, cell: (r) => naira(r.transaction.amount) },
  ]

  const historyColumns: Column<{ session: CashSession; agent: string; hub: string }>[] = [
    { key: 'opened', header: 'Opened', value: (r) => r.session.opened_at, cell: (r) => lagosDateTime(r.session.opened_at) },
    { key: 'hub', header: 'Hub', value: (r) => r.hub },
    { key: 'agent', header: 'Agent', value: (r) => r.agent },
    { key: 'expected', header: 'Expected', align: 'right', value: (r) => r.session.opening_float + r.session.expected_cash, cell: (r) => naira(r.session.opening_float + r.session.expected_cash) },
    { key: 'declared', header: 'Declared', align: 'right', value: (r) => r.session.declared_cash ?? 0, cell: (r) => naira(r.session.declared_cash) },
    {
      key: 'variance', header: 'Variance', align: 'right', value: (r) => r.session.variance ?? 0,
      cell: (r) => (
        <span className={cn('font-semibold', (r.session.variance ?? 0) !== 0 && 'text-critical')}>{naira(r.session.variance)}</span>
      ),
    },
    { key: 'status', header: 'Status', value: (r) => r.session.status, cell: (r) => <CashStatusBadge status={r.session.status} /> },
    {
      key: 'action', header: '', sortable: false,
      cell: (r) =>
        can('action.review_cash_variance') && ['submitted', 'under_review'].includes(r.session.status) ? (
          <Button size="sm" variant="outline" onClick={() => setReviewing(r.session.id)}>Review</Button>
        ) : r.session.status === 'approved' ? (
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground"><Lock className="size-3" /> Locked</span>
        ) : null,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cash session"
        description="Cash collection can be manual. Passenger movement records cannot. Every cash ticket is attached to a session before it is issued."
      />

      {!session ? (
        <Card className="mx-auto max-w-md">
          <CardHeader><CardTitle>Open a session</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Count your opening float and enter it. Everything you take in cash today is measured
              against this figure at close.
            </p>
            <div className="space-y-1.5">
              <Label required>Opening float</Label>
              <div className="relative">
                <Banknote className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={float} inputMode="numeric" onChange={(e) => setFloat(e.target.value.replace(/\D/g, ''))} className="pl-9 tnum" />
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={open}>
              <Wallet className="size-4" /> Open session with {naira(Number(float) || 0)}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile index={0} label="Opening float" value={naira(session.opening_float)} icon={Wallet} />
            <StatTile index={1} label="Cash sales" value={naira(session.expected_cash)} icon={Banknote} tone="primary" hint={`${transactions.filter((t) => t.transaction.type === 'ticket_sale').length} tickets`} />
            <StatTile index={2} label="Expected in drawer" value={naira(expected)} icon={CheckCircle2} tone="info" />
            <StatTile
              index={3}
              label="Variance tolerance"
              value={naira(tolerance)}
              icon={ShieldQuestion}
              hint="Above this a supervisor must review"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Close and declare</CardTitle>
                <p className="text-xs text-muted-foreground">Opened {lagosDateTime(session.opened_at)}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label required>Counted cash in drawer</Label>
                  <Input
                    value={declared}
                    inputMode="numeric"
                    placeholder={String(expected)}
                    onChange={(e) => setDeclared(e.target.value.replace(/[^\d]/g, ''))}
                    className="h-12 text-lg tnum"
                  />
                </div>

                {variance !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'rounded-xl p-3 text-sm',
                      variance === 0 ? 'bg-primary/10' : escalates ? 'bg-critical/10' : 'bg-warning/12',
                    )}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">Variance</span>
                      <span className="text-lg font-bold tnum">{naira(variance)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {variance === 0
                        ? 'Drawer balances exactly.'
                        : escalates
                          ? `Above the ${naira(tolerance)} tolerance — this session goes to a supervisor before it can be locked.`
                          : `Within the ${naira(tolerance)} tolerance, but still needs an explanation.`}
                    </p>
                  </motion.div>
                )}

                {needsExplanation && (
                  <div className="space-y-1.5">
                    <Label required>Explain the variance</Label>
                    <Textarea
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Damaged notes, short payment, float taken for change…"
                    />
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={close}
                  disabled={declared === '' || (needsExplanation && !explanation.trim())}
                >
                  Close session
                </Button>
                <p className="text-2xs text-muted-foreground">
                  A session can never close silently — every close writes an audit entry with the
                  expected figure, the declared figure and the reason for any difference.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Session transactions</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  data={transactions}
                  columns={transactionColumns}
                  rowKey={(r) => r.transaction.id}
                  searchable={false}
                  pageSize={8}
                  dense
                  empty={<EmptyState title="No cash transactions yet" description="Cash ticket sales appear here as you take them." />}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Session history</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            data={history}
            columns={historyColumns}
            rowKey={(r) => r.session.id}
            searchPlaceholder="Search sessions, agents or hubs…"
            exportName="cash-session-reconciliation"
            exportContext={{ 'Variance tolerance': naira(tolerance) }}
            pageSize={8}
          />
        </CardContent>
      </Card>

      {/* Supervisor review */}
      {reviewing && (
        <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg shadow-lifted">
          <CardHeader><CardTitle>Review cash variance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const entry = history.find((h) => h.session.id === reviewing)
              if (!entry) return null
              return (
                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p className="font-medium">{entry.agent} · {entry.hub}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expected {naira(entry.session.opening_float + entry.session.expected_cash)} · declared{' '}
                    {naira(entry.session.declared_cash)} · variance{' '}
                    <span className="font-semibold text-critical">{naira(entry.session.variance)}</span>
                  </p>
                  {entry.session.variance_explanation && (
                    <p className="mt-2 border-t border-border pt-2 text-xs">{entry.session.variance_explanation}</p>
                  )}
                </div>
              )
            })()}
            <div className="space-y-1.5">
              <Label>Supervisor note</Label>
              <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide('approved')}>Approve and lock</Button>
              <Button variant="outline" onClick={() => decide('returned')} disabled={!reviewNote.trim()}>Return to agent</Button>
              <Button variant="destructive" onClick={() => decide('rejected')} disabled={!reviewNote.trim()}>Reject</Button>
              <Button variant="ghost" className="ml-auto" onClick={() => setReviewing(null)}>Close</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
