import { useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { sum } from '@/lib/utils'

/**
 * Programme read model, scoped to the signed-in institution.
 *
 * Aggregated by design: the institution sees eligible staff, adoption, spend
 * and corridor usage — never a named passenger's movement history. Row-level
 * security enforces the same boundary on the server.
 */
export function useProgramme() {
  const { organizationId } = useAuth()
  const today = useServiceDate()
  return useDb(
    useCallback(
      (db) => {
        const organization = db.organizations.find((o) => o.id === organizationId) ?? null
        const policy = db.subsidy_policies.find((p) => p.organization_id === organizationId && p.status === 'published') ?? null
        const policies = db.subsidy_policies.filter((p) => p.organization_id === organizationId).sort((a, b) => b.version - a.version)
        const eligibility = db.eligibility_records.filter((e) => e.organization_id === organizationId)
        const riderIds = new Set(eligibility.filter((e) => e.rider_id).map((e) => e.rider_id!))
        const month = today.slice(0, 7)
        const bookings = db.bookings.filter((b) => b.sponsor_id === organizationId && !['cancelled', 'expired', 'refunded'].includes(b.status))
        const monthBookings = bookings.filter((b) => db.trips.find((t) => t.id === b.trip_id)?.service_date.startsWith(month))
        const auths = db.sponsor_authorizations.filter((s) => s.organization_id === organizationId)
        const monthAuths = auths.filter((a) => monthBookings.some((b) => b.id === a.booking_id))
        const activeRiders = new Set(monthBookings.map((b) => b.rider_id)).size
        const rejected = db.bookings.filter((b) => b.subsidy_policy_snapshot && b.subsidy_policy_snapshot.explanation.startsWith('Not eligible') && riderIds.has(b.rider_id))

        // Corridor usage, aggregated to route level.
        const corridors = new Map<string, { code: string; name: string; trips: number; subsidy: number }>()
        const timeBands = new Map<string, number>()
        for (const booking of monthBookings) {
          const trip = db.trips.find((t) => t.id === booking.trip_id)
          const direction = db.route_directions.find((d) => d.id === trip?.route_direction_id)
          const route = db.routes.find((r) => r.id === direction?.route_id)
          if (route) {
            const entry = corridors.get(route.id) ?? { code: route.code, name: route.public_name, trips: 0, subsidy: 0 }
            entry.trips++
            entry.subsidy += booking.sponsor_contribution
            corridors.set(route.id, entry)
          }
          if (trip) {
            const hour = new Date(trip.scheduled_departure_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false })
            timeBands.set(`${hour}:00`, (timeBands.get(`${hour}:00`) ?? 0) + 1)
          }
        }

        return {
          organization, policy, policies, eligibility, today,
          eligibleStaff: eligibility.filter((e) => e.status === 'active').length,
          registered: eligibility.filter((e) => e.rider_id && e.status === 'active').length,
          activeRiders,
          tripsThisMonth: monthBookings.length,
          grossTransportValue: sum(monthBookings.map((b) => b.gross_fare)),
          passengerContribution: sum(monthBookings.map((b) => b.passenger_contribution)),
          subsidyReserved: sum(monthAuths.filter((a) => a.status === 'reserved').map((a) => a.amount_reserved)),
          subsidyRecognized: sum(monthAuths.filter((a) => a.status === 'recognized').map((a) => a.amount_recognized)),
          subsidyReleased: sum(auths.filter((a) => a.status === 'released').map((a) => a.amount_reserved)),
          rejections: rejected.length,
          corridors: [...corridors.values()].sort((a, b) => b.trips - a.trips),
          timeBands: [...timeBands.entries()].map(([band, trips]) => ({ band, trips })).sort((a, b) => a.band.localeCompare(b.band)),
          bookings: monthBookings,
        }
      },
      [organizationId, today],
    ),
  )
}
