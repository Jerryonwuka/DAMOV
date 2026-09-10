import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Inbox, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './card'
import { Badge } from './badge'

/* ------------------------------------------------------------------ */
/* Animated number — metrics roll rather than snap.                     */
/* ------------------------------------------------------------------ */

export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString('en-NG'),
  className,
  duration = 700,
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
      // easeOutExpo keeps the last digits settling gently rather than snapping.
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
  tone?: 'default' | 'primary' | 'warning' | 'critical' | 'info'
  delta?: { value: number; label: string }
  target?: { value: number; label: string; met: boolean }
  onClick?: () => void
  className?: string
  index?: number
}

const TONE_RING: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary-700 dark:text-primary-300',
  warning: 'bg-warning/15 text-[hsl(45_96%_28%)] dark:text-[hsl(45_92%_60%)]',
  critical: 'bg-critical/12 text-[hsl(14_70%_40%)] dark:text-[hsl(14_80%_66%)]',
  info: 'bg-info/12 text-[hsl(206_74%_36%)] dark:text-[hsl(206_74%_64%)]',
}

export function StatTile({
  label, value, hint, icon: Icon, tone = 'default', delta, target, onClick, className, index = 0,
}: StatTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.035, 0.28), ease: [0.22, 1, 0.36, 1] }}
    >
      <Card
        interactive={Boolean(onClick)}
        onClick={onClick}
        className={cn('group h-full p-4', className)}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon && (
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition-transform duration-300 ease-damov group-hover:scale-110', TONE_RING[tone])}>
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="whitespace-nowrap text-2xl font-bold tracking-tight tnum">{value}</span>
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                delta.value >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-critical',
              )}
            >
              {delta.value >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta.value)}%
            </span>
          )}
        </div>
        {hint && <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
        {target && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <Badge tone={target.met ? 'primary' : 'warning'} size="sm">
              {target.met ? 'On target' : 'Below target'}
            </Badge>
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
  title, description, actions, breadcrumb, children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-5 space-y-3">
      {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
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
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
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

/* ------------------------------------------------------------------ */
/* Definition list — metric definitions live next to the metric.        */
/* ------------------------------------------------------------------ */

export function DefinitionRow({ term, children, className }: { term: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-xs font-medium text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right text-sm font-medium tnum">{children}</dd>
    </div>
  )
}

/** Staggered container for lists — every surface enters the same way. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045 } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}
