import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Inbox, ShieldAlert } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Card, IconTile } from './card'
import { Badge } from './badge'
import { Sparkline, SERIES, STATUS } from '@/components/charts'

/* ------------------------------------------------------------------ */
/* Animated number — metrics roll rather than snap.                     */
/* ------------------------------------------------------------------ */

export function AnimatedNumber({
  value, format = (n) => n.toLocaleString('en-NG'), className, duration = 700,
}: {
  value: number
  format?: (value: number) => string
  className?: string
  duration?: number
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = React.useState(value)
  const previous = React.useRef(value)

  React.useEffect(() => {
    if (reduce || previous.current === value) {
      previous.current = value
      setDisplay(value)
      return
    }
    const from = previous.current
    const start = performance.now()
    let frame = 0
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setDisplay(from + (value - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else previous.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduce])

  return <span className={cn('tnum', className)}>{format(Math.round(display))}</span>
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                            */
/* ------------------------------------------------------------------ */

export interface StatTileProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'primary' | 'warning' | 'critical' | 'info' | 'good'
  delta?: { value: number; label: string; absolute?: string }
  target?: { value: number; label: string; met: boolean }
  /** Trend behind the number — last N periods, oldest first. */
  spark?: number[]
  onClick?: () => void
  className?: string
  index?: number
  size?: 'default' | 'lg'
}

const TILE_TONE: Record<NonNullable<StatTileProps['tone']>, React.ComponentProps<typeof IconTile>['tone']> = {
  default: 'neutral', primary: 'primary', warning: 'amber', critical: 'critical', info: 'sky', good: 'good',
}
const SPARK_COLOR: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: SERIES[0], primary: SERIES[0], warning: STATUS.warning, critical: STATUS.critical, info: SERIES[1], good: STATUS.good,
}

/**
 * The KPI card: icon in a bordered square, the label, the number large, and
 * underneath either a delta against the previous period or a sparkline of the
 * last periods. Everything on it is a computed figure.
 */
export function StatTile({
  label, value, hint, icon: Icon, tone = 'default', delta, target, spark, onClick, className, index = 0, size = 'default',
}: StatTileProps) {
  const up = (delta?.value ?? 0) >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.035, 0.28), ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <Card
        interactive={Boolean(onClick)}
        onClick={onClick}
        className={cn('group relative flex h-full flex-col overflow-hidden p-4', size === 'lg' && 'p-5', className)}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          {Icon ? <IconTile icon={Icon} tone={TILE_TONE[tone]} size={size === 'lg' ? 'default' : 'sm'} /> : <span />}
          {spark && spark.length > 1 && (
            <div className="w-24 opacity-90 transition-opacity group-hover:opacity-100">
              <Sparkline data={spark} color={SPARK_COLOR[tone]} height={30} />
            </div>
          )}
        </div>
        <p className={cn('mt-4 text-xs font-medium text-muted-foreground', size === 'lg' && 'text-sm')}>{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={cn('font-display text-2xl font-semibold tracking-tight tnum', size === 'lg' && 'text-3xl')}>{value}</span>
        </div>
        {(delta || hint) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {delta && (
              <span className={cn('inline-flex items-center gap-0.5 font-semibold', up ? 'text-[hsl(152_70%_56%)]' : 'text-[hsl(14_90%_66%)]')}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {delta.absolute ? `${delta.absolute} (${Math.abs(delta.value)}%)` : `${Math.abs(delta.value)}%`}
              </span>
            )}
            {delta && (hint || delta.label) && <span className="text-muted-foreground/60">•</span>}
            {delta?.label && !hint && <span>{delta.label}</span>}
            {hint && <span>{hint}</span>}
          </p>
        )}
        {target && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <Badge tone={target.met ? 'good' : 'warning'} size="sm">{target.met ? 'On target' : 'Below target'}</Badge>
            <span className="text-2xs text-muted-foreground">{target.label}</span>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Page header                                                          */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title, description, actions, breadcrumb, children, eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
  children?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-3">
      {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow && <p className="text-xs font-medium text-primary">{eyebrow}</p>}
          <h1 className="font-display truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty and denied states                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon = Inbox, title, description, action, className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('surface-dots flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center', className)}>
      <IconTile icon={Icon} tone="neutral" className="mb-3" />
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PermissionDenied({ what = 'this area' }: { what?: string }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You do not have access to this area"
      description={`Your role does not include permission for ${what}. Ask an administrator if you need it — access is enforced by row-level security, not by hiding buttons.`}
    />
  )
}

export function DefinitionRow({ term, children, className }: { term: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-xs font-medium text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right text-sm font-medium tnum">{children}</dd>
    </div>
  )
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045 } } }}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </motion.div>
  )
}

/** Section heading inside a page: title left, optional controls right. */
export function SectionHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
