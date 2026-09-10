import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { naira } from '@/lib/format'
import type { FareQuote } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The fare a passenger sees before they commit.
 *
 * Gross fare, sponsor contribution and passenger contribution are always shown
 * together with the server's written explanation — a subsidy that cannot be
 * explained is a subsidy nobody trusts.
 */
export function FareBreakdown({ quote, className }: { quote: FareQuote; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <dl className="space-y-2 text-sm">
        <Row label="Gross fare" value={naira(quote.gross_fare)} muted />
        {quote.sponsor_contribution > 0 && (
          <Row
            label={`${quote.sponsor_name ?? 'Sponsor'} contribution`}
            value={`− ${naira(quote.sponsor_contribution)}`}
            accent
          />
        )}
        <div className="border-t border-border pt-2">
          <Row label="You pay" value={naira(quote.passenger_contribution)} emphasis />
        </div>
      </dl>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs leading-relaxed',
          quote.eligible ? 'bg-primary/10 text-primary-800 dark:text-primary-200' : 'bg-muted text-muted-foreground',
        )}
      >
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {quote.explanation}
      </motion.p>
      <p className="mt-2 text-2xs text-muted-foreground">
        {quote.fare_policy.name} v{quote.fare_policy.version} · {quote.distance_km} km
      </p>
    </div>
  )
}

function Row({
  label, value, muted, accent, emphasis,
}: {
  label: string
  value: string
  muted?: boolean
  accent?: boolean
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn('text-sm', muted && 'text-muted-foreground', emphasis && 'font-semibold')}>{label}</dt>
      <dd
        className={cn(
          'tnum text-sm font-semibold',
          accent && 'text-primary-700 dark:text-primary-400',
          emphasis && 'text-lg font-bold',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
