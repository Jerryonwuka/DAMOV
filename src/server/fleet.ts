import { store } from '@/db/store'
import type { UUID, Vehicle, VehicleStatus } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

export function setVehicleStatus(
  input: { vehicle_id: UUID; status: VehicleStatus },
  actor: { id: UUID | null; name: string },
): Result<Vehicle> {
  return guard(() =>
    store.transact((draft) => {
      const vehicle = draft.vehicles.find((v) => v.id === input.vehicle_id)
      if (!vehicle) throw new DomainError('vehicle_not_found', 'Vehicle not found.')
      const onTrip = draft.trips.some((t) => t.vehicle_id === vehicle.id && ['departed', 'in_service'].includes(t.status))
      if (onTrip && input.status !== 'operating')
        throw new DomainError('vehicle_in_service', `${vehicle.fleet_number} is on a live trip. Complete or cancel the trip first.`)
      const updated = { ...vehicle, status: input.status }
      draft.vehicles = draft.vehicles.map((v) => (v.id === vehicle.id ? updated : v))
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'vehicle.status_changed', entity_type: 'vehicle', entity_id: vehicle.id, summary: `${vehicle.fleet_number}: ${vehicle.status} → ${input.status}`, diff: { status: { before: vehicle.status, after: input.status } }, severity: 'notice' })
      return updated
    }),
  )
}

export function setDriverState(
  input: { driver_profile_id: UUID; approval_state?: 'pending' | 'approved' | 'training' | 'suspended'; active?: boolean },
  actor: { id: UUID | null; name: string },
): Result<void> {
  return guard(() =>
    store.transact((draft) => {
      const driver = draft.driver_profiles.find((d) => d.id === input.driver_profile_id)
      if (!driver) throw new DomainError('driver_not_found', 'Driver not found.')
      const updated = { ...driver, approval_state: input.approval_state ?? driver.approval_state, active: input.active ?? driver.active }
      draft.driver_profiles = draft.driver_profiles.map((d) => (d.id === driver.id ? updated : d))
      const name = draft.profiles.find((p) => p.id === driver.profile_id)?.full_name ?? 'Driver'
      writeAudit(draft, { actor_id: actor.id, actor_name: actor.name, action: 'driver.state_changed', entity_type: 'driver_profile', entity_id: driver.id, summary: `${name}: ${updated.approval_state}${updated.active ? '' : ' (inactive)'}`, severity: 'sensitive' })
    }),
  )
}
