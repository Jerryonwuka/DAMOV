import type { DamovDatabase } from '@/db/schema'
import { lagosToday } from '@/lib/format'
import { sum } from '@/lib/utils'

export interface DayPoint {
  date: string
  label: string
  trips: number
  completed: number
  cancelled: number
  bookings: number
  boarded: number
  passenger_revenue: number
  sponsor_revenue: number
  revenue: number
  direct_cost: number
  margin: number
  on_time_rate: number
  incidents: number
}

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * One row per service day, newest last. Everything is recomputed from the
 * operational tables so the trend lines move when the day moves.
 */
export function dailyHistory(db: DamovDatabase, days: number, onTimeTolerance = 5): DayPoint[] {
  const today = lagosToday()
  const dates = Array.from({ length: days }, (_, i) => shift(today, i - (days - 1)))

  const tripsByDate = new Map<string, typeof db.trips>()
  for (const trip of db.trips) {
    if (!tripsByDate.has(trip.service_date)) tripsByDate.set(trip.service_date, [])
    tripsByDate.get(trip.service_date)!.push(trip)
  }
  const bookingsByTrip = new Map<string, typeof db.bookings>()
  for (const b of db.bookings) {
    if (['cancelled', 'expired', 'refunded'].includes(b.status)) continue
    if (!bookingsByTrip.has(b.trip_id)) bookingsByTrip.set(b.trip_id, [])
    bookingsByTrip.get(b.trip_id)!.push(b)
  }
  const boardedByTrip = new Map<string, number>()
  for (const e of db.boarding_events) {
    if (e.result === 'rejected' || e.reversed_at) continue
    boardedByTrip.set(e.trip_id, (boardedByTrip.get(e.trip_id) ?? 0) + 1)
  }
  const paymentsByBooking = new Map<string, number>()
  for (const p of db.payments) if (p.status === 'succeeded') paymentsByBooking.set(p.booking_id, (paymentsByBooking.get(p.booking_id) ?? 0) + p.amount)
  const sponsorByBooking = new Map<string, number>()
  for (const s of db.sponsor_authorizations) if (s.status === 'recognized') sponsorByBooking.set(s.booking_id, (sponsorByBooking.get(s.booking_id) ?? 0) + s.amount_recognized)
  const costByTrip = new Map<string, number>()
  for (const c of db.cost_entries) if (c.trip_id && c.approval_status === 'approved') costByTrip.set(c.trip_id, (costByTrip.get(c.trip_id) ?? 0) + c.amount)

  return dates.map((date) => {
    const trips = tripsByDate.get(date) ?? []
    let bookings = 0, boarded = 0, passengerRevenue = 0, sponsorRevenue = 0, cost = 0
    for (const trip of trips) {
      const bs = bookingsByTrip.get(trip.id) ?? []
      bookings += bs.length
      boarded += boardedByTrip.get(trip.id) ?? 0
      for (const b of bs) {
        passengerRevenue += paymentsByBooking.get(b.id) ?? 0
        sponsorRevenue += sponsorByBooking.get(b.id) ?? 0
      }
      cost += costByTrip.get(trip.id) ?? 0
    }
    const departed = trips.filter((t) => t.actual_departure_at)
    const onTime = departed.filter((t) => (new Date(t.actual_departure_at!).getTime() - new Date(t.scheduled_departure_at).getTime()) / 60_000 <= onTimeTolerance)
    const d = new Date(`${date}T12:00:00Z`)
    return {
      date,
      label: `${DAY[d.getUTCDay()]} ${d.getUTCDate()}`,
      trips: trips.length,
      completed: trips.filter((t) => t.status === 'completed').length,
      cancelled: trips.filter((t) => t.status === 'cancelled').length,
      bookings,
      boarded,
      passenger_revenue: passengerRevenue,
      sponsor_revenue: sponsorRevenue,
      revenue: passengerRevenue + sponsorRevenue,
      direct_cost: cost,
      margin: passengerRevenue + sponsorRevenue - cost,
      on_time_rate: departed.length ? Math.round((onTime.length / departed.length) * 100) : 0,
      incidents: db.incidents.filter((i) => i.reported_at.slice(0, 10) === date).length,
    }
  })
}

/** Percentage change of the latest full window against the one before it. */
export function windowDelta(points: number[], window: number) {
  // Compare equal windows; with a short history both shrink together.
  const size = Math.max(1, Math.min(window, Math.floor(points.length / 2)))
  if (points.length < 2) return { value: 0, absolute: 0 }
  const recent = sum(points.slice(-size))
  const prior = sum(points.slice(-size * 2, -size))
  if (!prior) return { value: 0, absolute: recent }
  return { value: Math.round(((recent - prior) / prior) * 1000) / 10, absolute: recent - prior }
}

/** Hourly buckets for one service day — the shape of a day in the network. */
export function hourlyProfile(db: DamovDatabase, date: string) {
  const trips = db.trips.filter((t) => t.service_date === date)
  const hours = Array.from({ length: 18 }, (_, i) => i + 5) // 05:00 – 22:00
  return hours.map((hour) => {
    const inHour = trips.filter((t) => Number(new Date(t.scheduled_departure_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false })) === hour)
    const ids = new Set(inHour.map((t) => t.id))
    const bookings = db.bookings.filter((b) => ids.has(b.trip_id) && !['cancelled', 'expired', 'refunded'].includes(b.status))
    const revenue = sum(db.payments.filter((p) => p.status === 'succeeded' && bookings.some((b) => b.id === p.booking_id)).map((p) => p.amount)) +
      sum(db.sponsor_authorizations.filter((s) => s.status === 'recognized' && bookings.some((b) => b.id === s.booking_id)).map((s) => s.amount_recognized))
    return { hour, label: `${String(hour).padStart(2, '0')}:00`, departures: inHour.length, passengers: bookings.length, revenue }
  })
}
