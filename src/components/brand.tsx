import { cn } from '@/lib/utils'

/**
 * The Damov mark.
 *
 * Vector reproduction of the brand mark: the green panel with the white return
 * arrow. Kept as inline SVG so it inherits currentColor for the wordmark and
 * stays crisp at every size. `public/brand/damov-mark.svg` carries the same
 * artwork for favicons, exports and print.
 */
export function DamovMark({ className, monochrome = false }: { className?: string; monochrome?: boolean }) {
  return (
    <svg viewBox="0 0 712 600" className={cn('size-6', className)} role="img" aria-label="Damov">
      <path
        fill={monochrome ? 'currentColor' : '#6FBF48'}
        d="M150 0H562A150 150 0 0 1 712 150V600H150A150 150 0 0 1 0 450V150A150 150 0 0 1 150 0Z"
      />
      <path
        fill="none"
        stroke={monochrome ? 'var(--mark-cut, #0E392C)' : '#FFFFFF'}
        strokeWidth="80"
        strokeLinejoin="round"
        d="M545 600V325A100 100 0 0 0 445 225H350A100 100 0 0 0 250 325V470"
      />
      <path fill={monochrome ? 'var(--mark-cut, #0E392C)' : '#FFFFFF'} d="M176 346L324 494L144 526Z" />
    </svg>
  )
}

export function DamovLogo({
  className,
  markClassName,
  showWordmark = true,
  size = 'default',
}: {
  className?: string
  markClassName?: string
  showWordmark?: boolean
  size?: 'sm' | 'default' | 'lg'
}) {
  const markSize = size === 'sm' ? 'size-6' : size === 'lg' ? 'size-10' : 'size-8'
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl'
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <DamovMark className={cn(markSize, markClassName)} />
      {showWordmark && (
        <span className={cn('font-bold leading-none tracking-tight', textSize)}>Damov</span>
      )}
    </span>
  )
}
