import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Surfaces.
 *
 * A card is a dark panel with a one-pixel top highlight — depth without a
 * drop shadow. `interactive` adds the green glow ring on hover, which is the
 * only hover effect a card is allowed to have.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; glow?: boolean }
>(({ className, interactive, glow, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'glass rounded-2xl border border-border text-card-foreground',
      interactive &&
        'cursor-pointer transition-all duration-200 ease-damov hover:-translate-y-0.5 hover:border-white/20',
      glow && 'border-primary/50',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-[15px] font-semibold leading-tight tracking-tight', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />,
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3 p-5 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

/** Icon in a bordered square — the reference dashboards' signature tile mark. */
export function IconTile({
  icon: Icon,
  tone = 'primary',
  className,
  size = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  tone?: 'primary' | 'sky' | 'amber' | 'pink' | 'good' | 'critical' | 'neutral'
  className?: string
  size?: 'sm' | 'default' | 'lg'
}) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    primary: 'border-primary/30 bg-primary/10 text-primary-300',
    sky: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    pink: 'border-pink-400/30 bg-pink-400/10 text-pink-300',
    good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    critical: 'border-critical/40 bg-critical/10 text-[hsl(14_90%_70%)]',
    neutral: 'border-border bg-muted text-muted-foreground',
  }
  const sizes = { sm: 'size-8 rounded-lg [&_svg]:size-4', default: 'size-11 rounded-xl [&_svg]:size-5', lg: 'size-14 rounded-2xl [&_svg]:size-7' }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center border shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      <Icon />
    </span>
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
