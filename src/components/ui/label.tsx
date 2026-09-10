import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { hint?: string; required?: boolean }
>(({ className, children, hint, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
    {...props}
  >
    <span>
      {children}
      {required && <span className="ml-0.5 text-critical">*</span>}
    </span>
    {hint && <span className="font-normal normal-case tracking-normal text-muted-foreground/70">{hint}</span>}
  </LabelPrimitive.Root>
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
