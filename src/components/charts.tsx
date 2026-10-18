import * as React from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

/**
 * Damov chart kit.
 *
 * One palette, one grid, one tooltip. Series colours follow the entity, never
 * the rank: the first series is always Damov green, the second sky, the third
 * amber, the fourth pink. Status colours (good / warning / critical) are reserved for
 * state and never reused as a series.
 */
export const SERIES = ['#7CD35A', '#36B4E8', '#F6AD3C', '#F06AA8'] as const
export const STATUS = { good: '#2FBF8A', warning: '#F6AD3C', critical: '#F0633A' } as const

/* ------------------------------------------------------------------ */
/* Sparkline — a tiny SVG trend with gradient fill, no axes.            */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data, color = SERIES[0], className, height = 36, strokeWidth = 1.75,
}: {
  data: number[]
  color?: string
  className?: string
  height?: number
  strokeWidth?: number
}) {
  const id = React.useId()
  if (data.length < 2) return <div className={cn('h-9', className)} />
  const width = 120
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const)
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const last = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn('h-9 w-full overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Shared tooltip                                                       */
/* ------------------------------------------------------------------ */

interface TooltipRow { name: string; value: string; color?: string }

export function ChartTooltip({ title, rows }: { title: React.ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="glass min-w-[160px] rounded-xl border border-border px-3.5 py-2.5 shadow-lifted">
      <p className="mb-1.5 text-xs text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-0.5 rounded-full" style={{ background: row.color ?? SERIES[0] }} />
              <span className="text-foreground/85">{row.name}</span>
            </span>
            <span className="font-semibold tnum">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Area trend — the hero chart: gradient fill, crosshair, glowing dot.  */
/* ------------------------------------------------------------------ */

export interface AreaSeries { key: string; name: string; color?: string }

export function AreaTrend<T extends object>({
  data, x, series, height = 260, format = (v) => String(v), labelFormat = (v) => String(v), className, yTicks,
}: {
  data: T[]
  x: keyof T & string
  series: AreaSeries[]
  height?: number
  format?: (value: number) => string
  labelFormat?: (value: unknown) => string
  className?: string
  yTicks?: number
}) {
  const id = React.useId()
  return (
    <div className={cn('surface-dots -mx-1 rounded-xl', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? SERIES[i]} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color ?? SERIES[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 6" />
          <XAxis dataKey={x} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={labelFormat} minTickGap={24} />
          <YAxis axisLine={false} tickLine={false} width={46} tickCount={yTicks ?? 5} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => format(Number(v))} />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={labelFormat(label)}
                  rows={payload.map((p) => ({ name: String(p.name), value: format(Number(p.value)), color: String(p.color) }))}
                />
              ) : null
            }
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? SERIES[i]}
              strokeWidth={2}
              fill={`url(#${id}-${s.key})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 3, stroke: 'hsl(var(--background))', fill: s.color ?? SERIES[i] }}
              isAnimationActive
              animationDuration={900}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Volume bars — rounded-top bars, the hovered bar lit, a dashed mean.  */
/* ------------------------------------------------------------------ */

export function VolumeBars<T extends object>({
  data, x, y, height = 220, format = (v) => String(v), highlight, reference, color = SERIES[0], className,
}: {
  data: T[]
  x: keyof T & string
  y: keyof T & string
  height?: number
  format?: (value: number) => string
  highlight?: (row: T) => boolean
  reference?: { value: number; label?: string }
  color?: string
  className?: string
}) {
  const [active, setActive] = React.useState<number | null>(null)
  return (
    <div className={cn('-mx-1', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" onMouseMove={(s) => setActive(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)} onMouseLeave={() => setActive(null)}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 6" />
          <XAxis dataKey={x} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis axisLine={false} tickLine={false} width={40} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => format(Number(v))} />
          <Tooltip
            cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
            content={({ active: isActive, payload, label }) =>
              isActive && payload?.length ? (
                <ChartTooltip title={String(label)} rows={[{ name: String(payload[0].name), value: format(Number(payload[0].value)), color }]} />
              ) : null
            }
          />
          {reference && (
            <ReferenceLine y={reference.value} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={reference.label ? { value: reference.label, position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : undefined} />
          )}
          <Bar dataKey={y} radius={[6, 6, 2, 2]} isAnimationActive animationDuration={700}>
            {data.map((row, index) => {
              const lit = active === index || (active === null && highlight?.(row))
              return <Cell key={index} fill={lit ? color : 'hsl(var(--foreground) / 0.12)'} style={{ transition: 'fill 200ms' }} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Segmented bar — share of a whole, with a 2px gap between segments.   */
/* ------------------------------------------------------------------ */

export function SegmentBar({ segments, className }: { segments: { label: string; value: number; color?: string }[]; className?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div key={s.label} className="h-full rounded-sm transition-all duration-700" style={{ width: `${(s.value / total) * 100}%`, background: s.color ?? SERIES[i % SERIES.length] }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color ?? SERIES[i % SERIES.length] }} />
            {s.label}
            <span className="font-semibold text-foreground tnum">{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Ring gauge — one number against a target.                            */
/* ------------------------------------------------------------------ */

export function RingGauge({ value, max = 100, size = 72, stroke = 7, color = SERIES[0], children }: { value: number; max?: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--foreground) / 0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}
