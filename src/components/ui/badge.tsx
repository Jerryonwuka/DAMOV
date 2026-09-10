import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Status is always carried by colour *and* text — never colour alone, so the
 * board stays readable to colour-blind operators and in print exports.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/25 bg-primary/12 text-primary-700 dark:text-primary-300',
        forest: 'border-forest-700/20 bg-forest-700/10 text-forest-700 dark:border-forest-300/25 dark:bg-forest-300/10 dark:text-forest-200',
        warning: 'border-warning/30 bg-warning/15 text-[hsl(45_96%_26%)] dark:text-[hsl(45_92%_62%)]',
        critical: 'border-critical/30 bg-critical/12 text-[hsl(14_70%_38%)] dark:text-[hsl(14_80%_66%)]',
        info: 'border-info/30 bg-info/12 text-[hsl(206_74%_34%)] dark:text-[hsl(206_74%_66%)]',
        outline: 'border-border bg-transparent text-foreground',
      },
      size: {
        default: 'px-2.5 py-0.5 text-2xs',
        sm: 'px-2 py-0 text-[10px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
  pulse?: boolean
}

export function Badge({ className, tone, size, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-current" />}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}

export { badgeVariants }
