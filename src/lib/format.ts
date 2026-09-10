import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

export const OPERATING_TIMEZONE = 'Africa/Lagos'

/** ₦500 · ₦145,000 — never a decimal, Naira fare collection is whole-naira. */
export function naira(amount: number | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const sign = amount < 0 ? '-' : ''
  return `${sign}₦${Math.abs(Math.round(amount)).toLocaleString('en-NG')}`
}

/** Compact form for dense operational tiles: ₦145k, ₦1.2m */
export function nairaCompact(amount: number | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`
  if (abs >= 10_000) return `${sign}₦${Math.round(abs / 1000)}k`
  return naira(amount)
}

export function number(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-NG', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function pct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** 07:30 — displayed in Africa/Lagos regardless of the viewer's device clock. */
export function lagosTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return formatInTimeZone(parseISO(iso), OPERATING_TIMEZONE, 'HH:mm')
}

/** Fri 12 Sep — the familiar Nigerian short-date form. */
export function lagosDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return formatInTimeZone(parseISO(iso), OPERATING_TIMEZONE, 'EEE d MMM')
}

/** Fri 12 Sep · 07:30 */
export function lagosDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return formatInTimeZone(parseISO(iso), OPERATING_TIMEZONE, "EEE d MMM · HH:mm")
}

export function lagosFullDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return `${formatInTimeZone(parseISO(iso), OPERATING_TIMEZONE, 'd MMMM yyyy, HH:mm:ss')} WAT`
}

export function relative(iso: string | null | undefined) {
  if (!iso) return '—'
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`
}

/** "4m 20s late" / "on time" — used for departure adherence chips. */
export function delayLabel(scheduled: string, actual: string | null) {
  if (!actual) return 'not departed'
  const diff = Math.round((parseISO(actual).getTime() - parseISO(scheduled).getTime()) / 1000)
  if (Math.abs(diff) < 60) return 'on time'
  const minutes = Math.round(Math.abs(diff) / 60)
  return diff > 0 ? `${minutes}m late` : `${minutes}m early`
}

export function delayMinutes(scheduled: string, actual: string | null) {
  if (!actual) return null
  return Math.round((parseISO(actual).getTime() - parseISO(scheduled).getTime()) / 60000)
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Current wall-clock date in the operating timezone, as YYYY-MM-DD. */
export function lagosToday(now: Date = new Date()) {
  return format(toZonedTime(now, OPERATING_TIMEZONE), 'yyyy-MM-dd')
}

export function isoDateOf(iso: string) {
  return formatInTimeZone(parseISO(iso), OPERATING_TIMEZONE, 'yyyy-MM-dd')
}

export function km(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(digits)} km`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** 0803 *** 4412 — passenger phone numbers are masked outside the rider's own views. */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return phone
  return `${digits.slice(0, 4)} *** ${digits.slice(-4)}`
}
