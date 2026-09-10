import { store } from '@/db/store'
import { incidentReference, uuid } from '@/lib/ids'
import type { Incident, UUID } from '@/lib/types'
import { writeAudit } from './audit'
import { DomainError, guard, type Result } from './result'

export interface CreateIncidentInput {
  category: Incident['category']
  severity: Incident['severity']
  description: string
  trip_id?: UUID | null
  vehicle_id?: UUID | null
  route_id?: UUID | null
  hub_id?: UUID | null
  latitude?: number | null
  longitude?: number | null
  operational_effect: Incident['operational_effect']
  passenger_notification_required: boolean
}

export function createIncident(
  input: CreateIncidentInput,
  actor: { id: UUID | null; name: string },
): Result<Incident> {
  return guard(() =>
    store.transact((draft) => {
      if (!input.description.trim()) throw new DomainError('description_required', 'Describe what happened.')
      const incident: Incident = {
        id: uuid(),
        reference: incidentReference(draft.incidents.length + 1),
        category: input.category,
        severity: input.severity,
        trip_id: input.trip_id ?? null,
        vehicle_id: input.vehicle_id ?? null,
        route_id: input.route_id ?? null,
        hub_id: input.hub_id ?? null,
        description: input.description.trim(),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        evidence_urls: [],
        reported_by: actor.id ?? '',
        assigned_to: null,
        status: 'open',
        resolution: null,
        operational_effect: input.operational_effect,
        passenger_notification_required: input.passenger_notification_required,
        reported_at: new Date().toISOString(),
        resolved_at: null,
      }
      draft.incidents = [incident, ...draft.incidents]
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: 'incident.created',
        entity_type: 'incident', entity_id: incident.id,
        summary: `${incident.reference} · ${incident.severity} ${incident.category.replace('_', ' ')}`,
        severity: incident.severity === 'critical' ? 'sensitive' : 'notice',
      })
      return incident
    }),
  )
}

export function updateIncident(
  input: { id: UUID; status: Incident['status']; resolution?: string; assigned_to?: UUID | null },
  actor: { id: UUID | null; name: string },
): Result<Incident> {
  return guard(() =>
    store.transact((draft) => {
      const incident = draft.incidents.find((i) => i.id === input.id)
      if (!incident) throw new DomainError('incident_not_found', 'Incident not found.')
      if (['resolved', 'closed'].includes(input.status) && !input.resolution?.trim())
        throw new DomainError('resolution_required', 'Record how this was resolved before closing it.')

      const updated: Incident = {
        ...incident,
        status: input.status,
        resolution: input.resolution?.trim() ?? incident.resolution,
        assigned_to: input.assigned_to !== undefined ? input.assigned_to : incident.assigned_to,
        resolved_at: ['resolved', 'closed'].includes(input.status) ? new Date().toISOString() : incident.resolved_at,
      }
      draft.incidents = draft.incidents.map((i) => (i.id === input.id ? updated : i))
      writeAudit(draft, {
        actor_id: actor.id, actor_name: actor.name, action: `incident.${input.status}`,
        entity_type: 'incident', entity_id: incident.id,
        summary: `${incident.reference} → ${input.status}`, severity: 'notice',
      })
      return updated
    }),
  )
}
