import { useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useDb } from '@/db/store'
import { useServiceDate } from '@/hooks/use-damov'
import { tripSummaries, type TripSummary } from '@/lib/selectors'

/** Everything a driver's shift is made of: today's assigned trips, in order. */
export function useDriverShift() {
  const { profile } = useAuth()
  const today = useServiceDate()
  return useDb(
    useCallback(
      (db) => {
        const trips = tripSummaries(db, { serviceDate: today }).filter((s) => s.trip.driver_id === profile?.id)
        const current =
          trips.find((s) => ['departed', 'in_service'].includes(s.trip.status)) ??
          trips.find((s) => ['assigned', 'boarding', 'held'].includes(s.trip.status)) ??
          null
        const vehicle = current?.trip.vehicle_id ? db.vehicles.find((v) => v.id === current.trip.vehicle_id) : undefined
        const vehicleType = vehicle ? db.vehicle_types.find((t) => t.id === vehicle.vehicle_type_id) : undefined
        const inspection = vehicle
          ? db.vehicle_inspections.find(
              (i) => i.vehicle_id === vehicle.id && i.driver_id === profile?.id && i.submitted_at >= `${today}T00:00:00.000Z`,
            )
          : undefined
        const driver = db.driver_profiles.find((d) => d.profile_id === profile?.id)
        return { trips, current, vehicle: vehicle ?? null, vehicleType: vehicleType ?? null, inspection: inspection ?? null, driver: driver ?? null }
      },
      [profile?.id, today],
    ),
  )
}

export type DriverShift = ReturnType<typeof useDriverShift>
export type { TripSummary }
