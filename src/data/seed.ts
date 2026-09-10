import { EMPTY_DB, type DamovDatabase } from '@/db/schema'
import { bookingReference, qrToken, ticketCode, uuid } from '@/lib/ids'
import { lagosToday } from '@/lib/format'
import { distanceAlongLineKm, lineLengthKm } from '@/lib/geo'
import { mulberry32 } from '@/lib/utils'
import type {
  Booking, ConfigurationValue, CostCategory, Hub, Organization, Profile, Role, Route,
  RouteGeometryVersion, Stop, Ticket, Trip, UUID, VehicleStatus,
} from '@/lib/types'
import { materialiseTrips } from '@/server/trips'
import { reserveSegments } from '@/server/capacity'
import { quoteBookingUnsafe } from '@/server/fares'
import referenceRoutes from './geo/routes.json'
import referenceStops from './geo/stops.json'
import referenceHubs from './geo/hubs.json'

const rand = mulberry32(19_770_101)
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]
const chance = (p: number) => rand() < p

function isoAt(date: string, time: string) {
  // Africa/Lagos is UTC+1 with no daylight saving, so wall clock maps directly.
  return new Date(`${date}T${time}:00.000+01:00`).toISOString()
}
function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */

export function buildSeed(): DamovDatabase {
  const db: DamovDatabase = structuredClone(EMPTY_DB)
  const today = lagosToday()
  const yesterday = shiftDays(today, -1)
  const now = new Date().toISOString()

  /* --- Organisations ------------------------------------------------ */
  const org = (name: string, short: string, type: Organization['type'], code: string): Organization => ({
    id: uuid(), name, short_name: short, type, code, status: 'active',
    primary_contact_name: null, primary_contact_phone: null, primary_contact_email: null,
    created_at: now, updated_at: now,
  })
  const damov = org('Damov Mobility Limited', 'Damov', 'damov', 'DAMOV')
  const ministry = org('Federal Ministry of Transportation', 'FMoT', 'ministry', 'FMOT')
  const operator = org('Damov Fleet Operations', 'Damov Fleet', 'operator', 'DFO')
  const school = org('Veritas Group of Schools', 'Veritas', 'school', 'VGS')
  ministry.primary_contact_name = 'Hajiya Amina Bello'
  ministry.primary_contact_phone = '08034451207'
  ministry.primary_contact_email = 'transport.programme@fmot.gov.ng'
  db.organizations = [damov, ministry, operator, school]

  /* --- Reference GIS import ----------------------------------------- */
  const hubBySource = new Map<string, Hub>()
  for (const feature of (referenceHubs as GeoJSON.FeatureCollection).features) {
    const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates
    const sourceId = String(feature.id)
    const name = (feature.properties?.hub_name as string | null) ?? null
    const hub: Hub = {
      id: uuid(),
      name: name ?? `Unnamed hub ${String(feature.properties?.source_index)}`,
      code: (feature.properties?.hub_code as string) ?? `H-${feature.properties?.source_index}`,
      type: 'proposed_transit_hub',
      latitude: lat, longitude: lon, address: null, status: 'reference',
      external_source_id: sourceId, operating_hours: null, created_at: now,
    }
    hubBySource.set(sourceId, hub)
    db.hubs.push(hub)
  }

  const stopByName = new Map<string, Stop>()
  for (const feature of (referenceStops as GeoJSON.FeatureCollection).features) {
    const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates
    const stop: Stop = {
      id: uuid(),
      name: (feature.properties?.stop_name as string) ?? `Unnamed stop`,
      code: (feature.properties?.stop_code as string) ?? `S-${feature.properties?.source_index}`,
      latitude: lat, longitude: lon, hub_id: null, status: 'reference',
      step_free_access: Boolean(feature.properties?.step_free),
      shelter: Boolean(feature.properties?.shelter),
      external_source_id: String(feature.id), created_at: now,
    }
    stopByName.set(stop.name, stop)
    db.stops.push(stop)
  }

  const routeBySource = new Map<number, Route>()
  for (const feature of (referenceRoutes as GeoJSON.FeatureCollection).features) {
    const props = feature.properties ?? {}
    const geometry = feature.geometry as GeoJSON.LineString
    const routeId = uuid()
    const versionId = uuid()
    const version: RouteGeometryVersion = {
      id: versionId, route_id: routeId, version_number: 1, geometry,
      distance_km: lineLengthKm(geometry), source: 'gis_import', approval_state: 'draft',
      effective_from: null, effective_to: null, created_by: null, approved_by: null, created_at: now,
    }
    const index = props.source_index as number
    const route: Route = {
      id: routeId,
      name: (props.route_name as string) ?? `Reference corridor ${index}`,
      public_name: (props.public_name as string) ?? `Corridor ${index}`,
      code: (props.route_code as string) ?? `REF-${String(index).padStart(2, '0')}`,
      route_type: props.category === 'Secondary / Feeder' ? 'secondary_feeder' : 'primary_trunk',
      service_class: 'standard',
      // Everything from the source dataset starts as a planning reference.
      status: 'reference',
      color: (props.color as string) ?? '#94A3B8',
      current_geometry_version_id: versionId,
      external_source_id: String(feature.id),
      created_at: now, updated_at: now,
    }
    routeBySource.set(index, route)
    db.routes.push(route)
    db.route_geometry_versions.push(version)
  }

  /* --- Operational hubs --------------------------------------------- */
  function promoteHub(sourceIndex: number, name: string, type: Hub['type'], hours: string) {
    const hub = hubBySource.get(`hub-${sourceIndex}`)!
    hub.name = name
    hub.type = type
    hub.status = 'active'
    hub.operating_hours = hours
    return hub
  }
  const mararabaHub = promoteHub(0, 'Mararaba Transit Hub', 'terminal', '05:00 – 21:30')
  const cbdHub = promoteHub(3, 'CBD Central Interchange', 'terminal', '05:00 – 22:00')
  promoteHub(2, 'Karu Interchange', 'interchange', '05:30 – 21:00')
  const kubwaHub = promoteHub(9, 'Kubwa Interchange', 'terminal', '05:00 – 21:30')
  const depot = promoteHub(1, 'Nyanya Operations Depot', 'depot', '24 hours')

  /* --- Vehicle types and fleet -------------------------------------- */
  const evType = {
    id: uuid(), name: 'Damov City EV 50', legal_capacity: 50, default_bookable_capacity: 45,
    propulsion: 'ev' as const, energy_cost_per_km: 92,
  }
  const cngType = {
    id: uuid(), name: 'Damov Shuttle CNG 35', legal_capacity: 35, default_bookable_capacity: 30,
    propulsion: 'cng' as const, energy_cost_per_km: 140,
  }
  db.vehicle_types = [evType, cngType]

  const fleetPlan: { fleet: string; reg: string; type: string; status: VehicleStatus; hub: string }[] = [
    { fleet: 'DMV-001', reg: 'ABJ-114-KU', type: evType.id, status: 'available', hub: mararabaHub.id },
    { fleet: 'DMV-002', reg: 'ABJ-227-KU', type: evType.id, status: 'available', hub: mararabaHub.id },
    { fleet: 'DMV-003', reg: 'ABJ-338-KU', type: evType.id, status: 'available', hub: cbdHub.id },
    { fleet: 'DMV-004', reg: 'ABJ-449-KU', type: evType.id, status: 'available', hub: cbdHub.id },
    { fleet: 'DMV-005', reg: 'ABJ-551-KU', type: cngType.id, status: 'available', hub: kubwaHub.id },
    { fleet: 'DMV-006', reg: 'ABJ-662-KU', type: cngType.id, status: 'charging', hub: depot.id },
    { fleet: 'DMV-007', reg: 'ABJ-773-KU', type: evType.id, status: 'maintenance', hub: depot.id },
    { fleet: 'DMV-008', reg: 'ABJ-884-KU', type: cngType.id, status: 'out_of_service', hub: depot.id },
  ]
  db.vehicles = fleetPlan.map((v, i) => ({
    id: uuid(), fleet_number: v.fleet, registration_number: v.reg, vehicle_type_id: v.type,
    operator_id: operator.id, status: v.status, current_hub_id: v.hub,
    odometer_km: 18_400 + i * 2_130, in_service_since: '2025-11-03',
    next_service_due_km: 30_000 + i * 2_000, created_at: now,
  }))

  /* --- People -------------------------------------------------------- */
  function addProfile(
    full_name: string, phone: string, role: Role, organization_id: UUID | null,
    opts: { hub_id?: UUID | null; email?: string; employment_id?: string } = {},
  ): Profile {
    const profile: Profile = {
      id: uuid(), full_name, phone, email: opts.email ?? null, avatar_url: null, status: 'active',
      default_role: role, organization_id, employment_id: opts.employment_id ?? null,
      last_login_at: now, mfa_enrolled: role === 'super_admin', created_at: now, updated_at: now,
    }
    db.profiles.push(profile)
    db.user_roles.push({
      id: uuid(), user_id: profile.id, role, organization_id,
      hub_id: opts.hub_id ?? null, active: true, created_at: now,
    })
    return profile
  }

  const superAdmin = addProfile('Tunde Alabi', '08030000001', 'super_admin', damov.id, { email: 'tunde.alabi@damov.ng', employment_id: 'DMV-SA-01' })
  const opsManager = addProfile('Ngozi Eze', '08030000002', 'operations_manager', damov.id, { email: 'ngozi.eze@damov.ng', employment_id: 'DMV-OM-04' })
  const dispatcher = addProfile('Ibrahim Sani', '08030000003', 'dispatcher', damov.id, { email: 'ibrahim.sani@damov.ng', employment_id: 'DMV-DP-11' })
  const finance = addProfile('Blessing Okafor', '08030000004', 'finance_officer', damov.id, { email: 'blessing.okafor@damov.ng', employment_id: 'DMV-FN-02' })
  addProfile('Musa Danjuma', '08030000005', 'supervisor', damov.id, { email: 'musa.danjuma@damov.ng', hub_id: mararabaHub.id, employment_id: 'DMV-SV-07' })
  const agentMararaba = addProfile('Chiamaka Nwosu', '08030000006', 'hub_agent', damov.id, { hub_id: mararabaHub.id, employment_id: 'DMV-HA-21' })
  const agentCbd = addProfile('Yakubu Idris', '08030000007', 'hub_agent', damov.id, { hub_id: cbdHub.id, employment_id: 'DMV-HA-22' })
  const institutionAdmin = addProfile('Amina Bello', '08030000008', 'institution_admin', ministry.id, { email: 'amina.bello@fmot.gov.ng', employment_id: 'FMOT-ADM-3' })
  addProfile('Dr. Femi Adeyemi', '08030000009', 'executive_viewer', damov.id, { email: 'femi.adeyemi@damov.ng' })

  const driverNames = ['Samuel Ojo', 'Aliyu Garba', 'Peter Uche', 'Hauwa Lawal', 'Emeka Obi', 'Joseph Terver']
  const drivers = driverNames.map((name, i) => {
    const profile = addProfile(name, `0805000000${i + 1}`, 'driver', operator.id, { hub_id: i % 2 ? cbdHub.id : mararabaHub.id, employment_id: `DFO-DR-${10 + i}` })
    db.driver_profiles.push({
      id: uuid(), profile_id: profile.id, operator_id: operator.id,
      licence_number: `FCT-${420_000 + i * 137}`,
      // One expired licence so the assignment guard has something real to refuse.
      licence_expiry: i === 5 ? shiftDays(today, -21) : shiftDays(today, 200 + i * 40),
      home_hub_id: i % 2 ? cbdHub.id : mararabaHub.id,
      approval_state: i === 4 ? 'training' : 'approved',
      active: i !== 4,
      emergency_contact_name: 'Next of kin', emergency_contact_phone: '08099887766',
      created_at: now,
    })
    return profile
  })

  /* --- Riders and institutional eligibility -------------------------- */
  const riderNames = [
    'Grace Adeyinka', 'Suleiman Yusuf', 'Chidinma Okeke', 'Bala Mohammed', 'Funke Adebayo',
    'Nnamdi Eze', 'Zainab Abubakar', 'Tobi Salami', 'Rita Danladi', 'Kelechi Obiora',
    'Halima Usman', 'Victor Aigbe', 'Esther Bassey', 'Umar Farouk', 'Oluwaseun Cole',
    'Patience John', 'Ahmed Lawal', 'Chika Nwankwo',
  ]
  const riders = riderNames.map((name, i) => {
    const sponsored = i < 12
    const profile = addProfile(name, `0807${String(1_000_000 + i * 13_577).slice(0, 7)}`, 'rider', sponsored ? ministry.id : null)
    const staffId = sponsored ? `FMOT/${2020 + (i % 5)}/${String(1400 + i)}` : null
    db.rider_profiles.push({
      id: uuid(), profile_id: profile.id, organization_id: sponsored ? ministry.id : null,
      staff_id: staffId,
      eligibility_state: sponsored ? (i === 11 ? 'pending' : 'verified') : 'unverified',
      verification_method: sponsored ? 'staff_list_import' : 'none',
      emergency_contact_name: null, emergency_contact_phone: null, created_at: now,
    })
    if (sponsored) {
      db.eligibility_records.push({
        id: uuid(), rider_id: profile.id, organization_id: ministry.id, staff_id: staffId!,
        full_name: name, phone: profile.phone,
        status: i === 11 ? 'pending' : 'active',
        valid_from: '2026-01-01', valid_to: '2026-12-31',
        import_batch: 'FMOT-2026-Q1', verified_at: i === 11 ? null : now,
        verified_by: i === 11 ? null : institutionAdmin.id,
      })
    }
    return profile
  })

  // Eligible staff who have not yet registered — the adoption gap the ministry tracks.
  for (let i = 0; i < 28; i++) {
    db.eligibility_records.push({
      id: uuid(), rider_id: null, organization_id: ministry.id,
      staff_id: `FMOT/${2018 + (i % 6)}/${String(2200 + i)}`,
      full_name: `FMoT Staff ${String(i + 1).padStart(2, '0')}`,
      phone: null, status: 'active', valid_from: '2026-01-01', valid_to: '2026-12-31',
      import_batch: 'FMOT-2026-Q1', verified_at: now, verified_by: institutionAdmin.id,
    })
  }

  /* --- Operational routes ------------------------------------------- */
  function buildOperationalRoute(config: {
    sourceIndex: number
    code: string
    name: string
    publicName: string
    color: string
    stopNames: string[]
    inboundName: string
    outboundName: string
    runMinutes: number
    originHub: Hub
    destinationHub: Hub
  }) {
    const route = routeBySource.get(config.sourceIndex)!
    route.code = config.code
    route.name = config.name
    route.public_name = config.publicName
    route.color = config.color
    route.route_type = 'primary_trunk'
    route.service_class = 'express'
    route.status = 'published'

    const version = db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)!
    version.approval_state = 'approved'
    version.effective_from = now
    version.approved_by = opsManager.id
    const totalKm = version.distance_km

    const orderedStops = config.stopNames.map((name) => stopByName.get(name)!)
    orderedStops[0].hub_id = config.originHub.id
    orderedStops[orderedStops.length - 1].hub_id = config.destinationHub.id
    for (const stop of orderedStops) stop.status = 'active'

    const alongKm = orderedStops.map((stop) => distanceAlongLineKm(version.geometry, [stop.longitude, stop.latitude]))

    const directions: { id: UUID; code: 'inbound' | 'outbound' }[] = []
    for (const dir of ['inbound', 'outbound'] as const) {
      const sequence = dir === 'inbound' ? orderedStops : [...orderedStops].reverse()
      const distances =
        dir === 'inbound' ? alongKm : [...alongKm].reverse().map((d) => Math.max(0, totalKm - d))
      const directionId = uuid()
      db.route_directions.push({
        id: directionId, route_id: route.id,
        name: dir === 'inbound' ? config.inboundName : config.outboundName,
        direction_code: dir,
        origin_stop_id: sequence[0].id,
        destination_stop_id: sequence[sequence.length - 1].id,
        active: true,
      })

      const routeStopIds: UUID[] = []
      sequence.forEach((stop, index) => {
        const id = uuid()
        routeStopIds.push(id)
        const distance = Math.round((distances[index] ?? 0) * 100) / 100
        db.route_stops.push({
          id, route_direction_id: directionId, stop_id: stop.id, sequence: index + 1,
          distance_from_start_km: distance,
          scheduled_offset_minutes: Math.round((distance / (totalKm || 1)) * config.runMinutes),
          boarding_allowed: index < sequence.length - 1,
          alighting_allowed: index > 0,
        })
      })
      for (let i = 0; i < routeStopIds.length - 1; i++) {
        const from = db.route_stops.find((rs) => rs.id === routeStopIds[i])!
        const to = db.route_stops.find((rs) => rs.id === routeStopIds[i + 1])!
        db.route_segments.push({
          id: uuid(), route_direction_id: directionId,
          from_route_stop_id: from.id, to_route_stop_id: to.id, sequence: i + 1,
          distance_km: Math.round((to.distance_from_start_km - from.distance_from_start_km) * 100) / 100,
          planned_duration_minutes: Math.max(3, to.scheduled_offset_minutes - from.scheduled_offset_minutes),
        })
      }
      directions.push({ id: directionId, code: dir })
    }
    return { route, directions, totalKm }
  }

  const pilot = buildOperationalRoute({
    sourceIndex: 0, code: 'AB-01', name: 'Mararaba — CBD Pilot Corridor',
    publicName: 'Mararaba ↔ CBD', color: '#6FBF48',
    stopNames: ['Mararaba Park', 'New Nyanya', 'Nyanya Bridge', 'Karu Junction', 'Kugbo Market', 'Area 1 Junction', 'Berger Roundabout', 'CBD Terminal'],
    inboundName: 'Mararaba → CBD', outboundName: 'CBD → Mararaba',
    runMinutes: 62, originHub: mararabaHub, destinationHub: cbdHub,
  })
  const kubwa = buildOperationalRoute({
    sourceIndex: 1, code: 'AB-02', name: 'Kubwa — CBD Expressway',
    publicName: 'Kubwa ↔ CBD', color: '#38BDF8',
    stopNames: ['Kubwa Village', 'Dei-Dei Timber', 'Gwarinpa 3rd Avenue', 'Life Camp Gate', 'Jabi Motor Park', 'Utako Market', 'Wuse Market', 'Wuse Zone 4', 'CBD Terminal'],
    inboundName: 'Kubwa → CBD', outboundName: 'CBD → Kubwa',
    runMinutes: 55, originHub: kubwaHub, destinationHub: cbdHub,
  })

  // A third corridor waiting on approval, so the publication gate is visible.
  const airport = routeBySource.get(2)!
  airport.status = 'pending_approval'
  airport.name = 'Airport Road Trunk'
  airport.public_name = 'Airport ↔ CBD'

  /* --- Fares and subsidy --------------------------------------------- */
  const farePolicy = {
    id: uuid(), name: 'Abuja Pilot Distance Fare 2026', route_id: null, route_direction_id: null,
    calculation_type: 'distance' as const, flat_amount: null, per_km_amount: 25,
    minimum_amount: 200, effective_from: '2026-01-01', effective_to: null,
    status: 'published' as const, version: 3,
  }
  const feederFare = {
    id: uuid(), name: 'Feeder Flat Fare', route_id: null, route_direction_id: null,
    calculation_type: 'flat' as const, flat_amount: 250, per_km_amount: null, minimum_amount: 250,
    effective_from: '2026-01-01', effective_to: null, status: 'draft' as const, version: 1,
  }
  db.fare_policies = [farePolicy, feederFare]

  const subsidy = {
    id: uuid(), name: 'FMoT Staff Commute Co-pay 2026', organization_id: ministry.id,
    route_ids: [pilot.route.id, kubwa.route.id],
    direction_codes: null,
    days_of_week: [1, 2, 3, 4, 5],
    time_bands: [{ start: '05:30', end: '09:30' }, { start: '15:30', end: '20:00' }],
    max_trips_per_day: 2, max_trips_per_week: null, max_trips_per_month: 44,
    subsidy_type: 'fixed' as const, fixed_amount: 300, percentage: null, max_subsidy_per_trip: 300,
    valid_from: '2026-01-01', valid_to: '2026-12-31',
    programme_budget: 14_000_000, budget_consumed: 0,
    status: 'published' as const, version: 2, created_at: now,
  }
  db.subsidy_policies = [subsidy]

  /* --- Calendars, schedules and trips -------------------------------- */
  const weekdays = {
    id: uuid(), name: 'Weekday service', days_of_week: [1, 2, 3, 4, 5],
    start_date: '2026-01-01', end_date: '2026-12-31', excluded_dates: ['2026-10-01'], added_dates: [],
  }
  const everyday = {
    id: uuid(), name: 'Seven-day service', days_of_week: [0, 1, 2, 3, 4, 5, 6],
    start_date: '2026-01-01', end_date: '2026-12-31', excluded_dates: [], added_dates: [],
  }
  db.service_calendars = [weekdays, everyday]

  const templates = [
    { dir: pilot.directions[0].id, name: 'AM peak · Mararaba → CBD', start: '05:40', end: '09:20', headway: 20, cal: everyday.id },
    { dir: pilot.directions[0].id, name: 'Midday · Mararaba → CBD', start: '10:30', end: '14:30', headway: 60, cal: everyday.id },
    { dir: pilot.directions[1].id, name: 'PM peak · CBD → Mararaba', start: '15:40', end: '19:40', headway: 20, cal: everyday.id },
    { dir: pilot.directions[1].id, name: 'Midday · CBD → Mararaba', start: '11:00', end: '14:00', headway: 60, cal: everyday.id },
    { dir: kubwa.directions[0].id, name: 'AM peak · Kubwa → CBD', start: '06:00', end: '08:40', headway: 40, cal: weekdays.id },
    { dir: kubwa.directions[1].id, name: 'PM peak · CBD → Kubwa', start: '16:00', end: '18:40', headway: 40, cal: weekdays.id },
  ]
  for (const t of templates) {
    db.schedule_templates.push({
      id: uuid(), route_direction_id: t.dir, service_calendar_id: t.cal, name: t.name,
      start_time: t.start, end_time: t.end, headway_minutes: t.headway,
      explicit_departure_times: null, default_vehicle_type_id: evType.id, active: true,
    })
  }
  for (const date of [yesterday, today]) {
    for (const template of db.schedule_templates) {
      const calendar = db.service_calendars.find((c) => c.id === template.service_calendar_id)!
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
      if (!calendar.days_of_week.includes(dow)) continue
      materialiseTrips(db, template.id, date)
    }
  }

  /* --- Operating the day --------------------------------------------- */
  const activeDrivers = drivers.filter((_, i) => i !== 4 && i !== 5)
  const usableVehicles = db.vehicles.filter((v) => ['available', 'assigned'].includes(v.status))
  const nowMs = Date.now()

  const sortedTrips = [...db.trips].sort(
    (a, b) => new Date(a.scheduled_departure_at).getTime() - new Date(b.scheduled_departure_at).getTime(),
  )

  sortedTrips.forEach((trip, index) => {
    const vehicle = usableVehicles[index % usableVehicles.length]
    const driver = activeDrivers[index % activeDrivers.length]
    const departureMs = new Date(trip.scheduled_departure_at).getTime()
    const arrivalMs = new Date(trip.scheduled_arrival_at).getTime()

    // Trips more than a few hours out stay unassigned so the dispatch board has work.
    if (departureMs > nowMs + 3 * 3_600_000) return

    trip.vehicle_id = vehicle.id
    trip.driver_id = driver.id
    trip.status = 'assigned'
    db.trip_events.push({
      id: uuid(), trip_id: trip.id, type: 'assigned', stop_id: null, actor_id: dispatcher.id,
      occurred_at: new Date(departureMs - 90 * 60_000).toISOString(),
      metadata: { vehicle: vehicle.fleet_number },
    })

    if (departureMs < nowMs) {
      // Most departures leave within tolerance; a few slip, and one is a real delay.
      // Roughly one departure in seven slips past tolerance, so the on-time
      // rate lands just under the 90% pilot target rather than at a flat 100%.
      const lateness = index % 7 === 3 ? Math.round(7 + rand() * 15) : Math.round(rand() * 4)
      const actualDeparture = new Date(departureMs + lateness * 60_000).toISOString()
      trip.actual_departure_at = actualDeparture
      trip.status = 'departed'
      db.trip_events.push({
        id: uuid(), trip_id: trip.id, type: 'departed', stop_id: null, actor_id: driver.id,
        occurred_at: actualDeparture, metadata: { minutes_late: lateness },
      })
      if (lateness > 5) {
        db.trip_events.push({
          id: uuid(), trip_id: trip.id, type: 'delayed', stop_id: null, actor_id: driver.id,
          occurred_at: actualDeparture, metadata: { minutes: lateness },
        })
      }
      if (arrivalMs < nowMs - 10 * 60_000) {
        trip.status = 'completed'
        trip.actual_arrival_at = new Date(arrivalMs + lateness * 60_000 + Math.round(rand() * 6) * 60_000).toISOString()
        db.trip_events.push({
          id: uuid(), trip_id: trip.id, type: 'completed', stop_id: null, actor_id: driver.id,
          occurred_at: trip.actual_arrival_at, metadata: {},
        })
      } else {
        trip.status = 'in_service'
        const stops = db.route_stops
          .filter((rs) => rs.route_direction_id === trip.route_direction_id)
          .sort((a, b) => a.sequence - b.sequence)
        const progress = Math.min(0.95, (nowMs - departureMs) / Math.max(1, arrivalMs - departureMs))
        trip.current_route_stop_id = stops[Math.floor(progress * (stops.length - 1))]?.id ?? stops[0].id
      }
    } else if (departureMs < nowMs + 45 * 60_000) {
      trip.status = 'boarding'
    }
  })

  // Vehicle status follows the trips actually running now.
  const operatingVehicleIds = new Set(
    db.trips.filter((t) => ['departed', 'in_service'].includes(t.status)).map((t) => t.vehicle_id),
  )
  db.vehicles = db.vehicles.map((v) =>
    operatingVehicleIds.has(v.id)
      ? { ...v, status: 'operating' }
      : v.status === 'assigned'
        ? { ...v, status: 'available' }
        : v,
  )

  /* --- Cash sessions -------------------------------------------------- */
  const closedSession = {
    id: uuid(), hub_id: cbdHub.id, agent_id: agentCbd.id,
    opened_at: isoAt(yesterday, '06:00'), closed_at: isoAt(yesterday, '20:15'),
    opening_float: 20_000, expected_cash: 0, declared_cash: null as number | null,
    variance: null as number | null, variance_explanation: null as string | null,
    status: 'open' as const, supervisor_id: null, reviewed_at: null as string | null,
    supervisor_note: null as string | null,
  }
  const openSession = {
    id: uuid(), hub_id: mararabaHub.id, agent_id: agentMararaba.id,
    opened_at: isoAt(today, '05:20'), closed_at: null,
    opening_float: 25_000, expected_cash: 0, declared_cash: null,
    variance: null, variance_explanation: null, status: 'open' as const,
    supervisor_id: null, reviewed_at: null, supervisor_note: null,
  }
  db.cash_sessions = [openSession, closedSession]
  db.cash_transactions = [
    { id: uuid(), cash_session_id: openSession.id, booking_id: null, payment_id: null, amount: openSession.opening_float, type: 'float_in', occurred_at: openSession.opened_at, reversal_of: null },
    { id: uuid(), cash_session_id: closedSession.id, booking_id: null, payment_id: null, amount: closedSession.opening_float, type: 'float_in', occurred_at: closedSession.opened_at, reversal_of: null },
  ]

  /* --- Bookings, payments, boardings ---------------------------------- */
  function seedBooking(trip: Trip, riderProfile: Profile, options: { channel: Booking['booking_channel']; method: 'cash' | 'card'; sessionId?: UUID }) {
    const routeStops = db.route_stops
      .filter((rs) => rs.route_direction_id === trip.route_direction_id)
      .sort((a, b) => a.sequence - b.sequence)
    // Two-thirds ride the full corridor; the rest hop off midway, which is what
    // makes intermediate-segment capacity matter.
    const originIndex = chance(0.72) ? 0 : Math.floor(rand() * (routeStops.length - 2))
    const remaining = routeStops.length - 1 - originIndex
    const destinationIndex = chance(0.66)
      ? routeStops.length - 1
      : originIndex + 1 + Math.floor(rand() * Math.max(1, remaining - 1))
    const origin = routeStops[originIndex]
    const destination = routeStops[destinationIndex]

    let quote
    try {
      quote = quoteBookingUnsafe(db, {
        trip_id: trip.id, origin_route_stop_id: origin.id,
        destination_route_stop_id: destination.id, rider_id: riderProfile.id,
      })
    } catch {
      return null
    }

    let heldIds: string[]
    try {
      heldIds = reserveSegments(db, trip.id, origin.id, destination.id)
    } catch {
      return null // segment full — exactly what the engine is meant to do
    }

    const createdAt = new Date(new Date(trip.scheduled_departure_at).getTime() - (30 + rand() * 600) * 60_000).toISOString()
    const booking: Booking = {
      id: uuid(), booking_reference: bookingReference(), rider_id: riderProfile.id, trip_id: trip.id,
      origin_route_stop_id: origin.id, destination_route_stop_id: destination.id,
      booking_channel: options.channel, status: 'confirmed',
      gross_fare: quote.gross_fare,
      passenger_contribution: quote.passenger_contribution,
      sponsor_contribution: quote.sponsor_contribution,
      sponsor_id: quote.sponsor_id,
      fare_policy_snapshot: { ...quote.fare_policy, amount: quote.gross_fare },
      subsidy_policy_snapshot: quote.subsidy_policy ? { ...quote.subsidy_policy, explanation: quote.explanation } : null,
      currency: 'NGN', expires_at: null, idempotency_key: `seed_${uuid()}`,
      created_by: options.channel === 'hub' ? agentMararaba.id : riderProfile.id,
      created_at: createdAt, cancelled_at: null, cancellation_reason: null,
    }
    db.bookings.push(booking)
    for (const id of heldIds) db.booking_segments.push({ id: uuid(), booking_id: booking.id, trip_segment_inventory_id: id })

    if (booking.passenger_contribution > 0) {
      const payment = {
        id: uuid(), booking_id: booking.id, payer_type: 'passenger' as const,
        method: options.method, provider: options.method === 'cash' ? ('cash_desk' as const) : ('mock_provider' as const),
        provider_reference: options.method === 'cash' ? null : `MOCK-${uuid().slice(0, 8).toUpperCase()}`,
        amount: booking.passenger_contribution, currency: 'NGN' as const,
        status: 'succeeded' as const, idempotency_key: `seedpay_${uuid()}`, paid_at: createdAt,
        cash_session_id: options.method === 'cash' ? (options.sessionId ?? null) : null, created_at: createdAt,
      }
      db.payments.push(payment)
      if (options.method === 'cash' && options.sessionId) {
        const session = db.cash_sessions.find((s) => s.id === options.sessionId)!
        session.expected_cash += booking.passenger_contribution
        db.cash_transactions.push({
          id: uuid(), cash_session_id: session.id, booking_id: booking.id, payment_id: payment.id,
          amount: booking.passenger_contribution, type: 'ticket_sale', occurred_at: createdAt, reversal_of: null,
        })
      }
    }

    const ticket: Ticket = { id: uuid(), booking_id: booking.id, ticket_code: ticketCode(), qr_token: qrToken(), issued_at: createdAt, status: 'issued' }
    db.tickets.push(ticket)

    if (booking.sponsor_contribution > 0 && quote.subsidy_policy && quote.sponsor_id) {
      db.sponsor_authorizations.push({
        id: uuid(), booking_id: booking.id, organization_id: quote.sponsor_id,
        subsidy_policy_id: quote.subsidy_policy.id, amount_reserved: booking.sponsor_contribution,
        amount_recognized: 0, status: 'reserved', recognized_at: null, created_at: createdAt,
      })
      const policy = db.subsidy_policies.find((p) => p.id === quote.subsidy_policy!.id)!
      policy.budget_consumed += booking.sponsor_contribution
    }

    // Passengers on a departed trip were validated at the gate.
    if (['departed', 'in_service', 'completed'].includes(trip.status) && chance(0.93)) {
      const boardedAt = new Date(new Date(trip.actual_departure_at ?? trip.scheduled_departure_at).getTime() - Math.round(rand() * 12 + 2) * 60_000).toISOString()
      db.boarding_events.push({
        id: uuid(), booking_id: booking.id, ticket_id: ticket.id, trip_id: trip.id,
        stop_id: db.route_stops.find((rs) => rs.id === origin.id)!.stop_id,
        boarded_at: boardedAt,
        validation_method: chance(0.88) ? 'qr_scan' : chance(0.5) ? 'booking_code' : 'phone_lookup',
        validator_user_id: chance(0.5) ? agentMararaba.id : agentCbd.id,
        device_id: 'HUB-SCANNER-01', result: 'valid', rejection_reason: null, override_reason: null,
        duration_ms: 2600 + Math.round(rand() * 5200), reversed_at: null, reversed_by: null, reversal_reason: null,
      })
      booking.status = trip.status === 'completed' ? 'completed' : 'boarded'
      ticket.status = 'used'
      const auth = db.sponsor_authorizations.find((s) => s.booking_id === booking.id)
      if (auth) {
        auth.status = 'recognized'
        auth.amount_recognized = auth.amount_reserved
        auth.recognized_at = boardedAt
      }
    } else if (trip.status === 'completed') {
      booking.status = 'no_show'
    }
    return booking
  }

  for (const trip of sortedTrips) {
    const departureMs = new Date(trip.scheduled_departure_at).getTime()
    const isPeak = (() => {
      const hour = Number(new Date(trip.scheduled_departure_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }))
      return (hour >= 6 && hour <= 8) || (hour >= 16 && hour <= 18)
    })()
    if (departureMs > nowMs + 6 * 3_600_000) continue

    const historic = trip.service_date !== today
    const base = isPeak ? 22 + Math.floor(rand() * 14) : 7 + Math.floor(rand() * 10)
    const load = historic ? Math.round(base * 0.55) : base
    for (let i = 0; i < load; i++) {
      const rider = pick(riders)
      const cash = chance(0.38)
      seedBooking(trip, rider, {
        channel: cash ? 'hub' : chance(0.15) ? 'whatsapp' : 'rider_web',
        method: cash ? 'cash' : 'card',
        sessionId: cash ? (trip.service_date === today ? openSession.id : closedSession.id) : undefined,
      })
    }
  }

  // Close yesterday's session with a small, explained variance awaiting review.
  const expectedClosed = closedSession.opening_float + closedSession.expected_cash
  closedSession.declared_cash = expectedClosed - 1_450
  closedSession.variance = -1_450
  closedSession.variance_explanation = 'Two ₦500 notes rejected by the bank as damaged and one ₦450 fare short-paid at the 18:20 departure; both logged with the supervisor at close.'
  ;(closedSession as { status: string }).status = 'under_review'

  /* --- Direct costs ---------------------------------------------------- */
  const costTemplate: { category: CostCategory; perKm?: number; flat?: number; unit?: string }[] = [
    { category: 'energy', perKm: 92, unit: 'km' },
    { category: 'driver', flat: 4_000 },
    { category: 'support_staff', flat: 1_200 },
    { category: 'maintenance_reserve', perKm: 38 },
    { category: 'tyre_reserve', perKm: 14 },
    { category: 'cleaning', flat: 700 },
    { category: 'terminal', flat: 900 },
    { category: 'toll', flat: 400 },
    { category: 'lease_allocation', flat: 5_000 },
  ]
  for (const trip of db.trips.filter((t) => ['completed', 'in_service', 'departed'].includes(t.status))) {
    const stops = db.route_stops
      .filter((rs) => rs.route_direction_id === trip.route_direction_id)
      .sort((a, b) => a.sequence - b.sequence)
    const distance = stops[stops.length - 1]?.distance_from_start_km ?? 20
    const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
    for (const entry of costTemplate) {
      const amount = entry.perKm ? Math.round(entry.perKm * distance) : (entry.flat ?? 0)
      db.cost_entries.push({
        id: uuid(), service_date: trip.service_date, trip_id: trip.id, vehicle_id: trip.vehicle_id,
        route_id: direction.route_id, category: entry.category, amount,
        quantity: entry.perKm ? Math.round(distance * 10) / 10 : null, unit: entry.perKm ? 'km' : null,
        evidence_url: null, source: entry.perKm ? 'derived' : 'manual',
        approval_status: 'approved', created_by: finance.id, created_at: now,
      })
    }
    // Card fees follow actual digital collections.
    const digital = db.payments.filter(
      (p) => p.method === 'card' && p.status === 'succeeded' && db.bookings.some((b) => b.id === p.booking_id && b.trip_id === trip.id),
    )
    const fees = Math.round(digital.reduce((a, p) => a + p.amount, 0) * 0.015)
    if (fees > 0) {
      db.cost_entries.push({
        id: uuid(), service_date: trip.service_date, trip_id: trip.id, vehicle_id: trip.vehicle_id,
        route_id: direction.route_id, category: 'payment_processing', amount: fees, quantity: digital.length,
        unit: 'transactions', evidence_url: null, source: 'derived', approval_status: 'approved',
        created_by: finance.id, created_at: now,
      })
    }
  }

  /* --- Incidents ------------------------------------------------------- */
  const liveTrip = db.trips.find((t) => t.status === 'in_service')
  db.incidents = [
    {
      id: uuid(), reference: 'INC-00001', category: 'congestion', severity: 'medium',
      trip_id: liveTrip?.id ?? null, vehicle_id: liveTrip?.vehicle_id ?? null,
      route_id: pilot.route.id, hub_id: null,
      description: 'Heavy build-up approaching Nyanya Bridge after a truck breakdown on the inbound carriageway. Running 14 minutes behind schedule.',
      latitude: 9.006, longitude: 7.575, evidence_urls: [],
      reported_by: drivers[0].id, assigned_to: dispatcher.id, status: 'in_progress',
      resolution: null, operational_effect: 'delay', passenger_notification_required: true,
      reported_at: new Date(nowMs - 26 * 60_000).toISOString(), resolved_at: null,
    },
    {
      id: uuid(), reference: 'INC-00002', category: 'breakdown', severity: 'high',
      trip_id: null, vehicle_id: db.vehicles.find((v) => v.status === 'maintenance')?.id ?? null,
      route_id: pilot.route.id, hub_id: depot.id,
      description: 'DMV-007 reported repeated traction inverter fault during pre-trip inspection. Vehicle grounded pending workshop diagnosis.',
      latitude: null, longitude: null, evidence_urls: [],
      reported_by: drivers[1].id, assigned_to: opsManager.id, status: 'resolved',
      resolution: 'Vehicle withdrawn from service and moved to the depot. Replacement bus assigned to the affected departures.',
      operational_effect: 'vehicle_withdrawn', passenger_notification_required: false,
      reported_at: new Date(nowMs - 20 * 3_600_000).toISOString(),
      resolved_at: new Date(nowMs - 17 * 3_600_000).toISOString(),
    },
  ]

  /* --- Notifications for the demo rider -------------------------------- */
  const demoRider = riders[0]
  const demoBooking = db.bookings.find((b) => b.rider_id === demoRider.id)
  if (demoBooking) {
    const trip = db.trips.find((t) => t.id === demoBooking.trip_id)!
    db.notifications.push(
      {
        id: uuid(), recipient_id: demoRider.id, booking_id: demoBooking.id, trip_id: trip.id,
        channel: 'in_app', template: 'booking_confirmed',
        title: `Booking confirmed · ${demoBooking.booking_reference}`,
        body: 'Your seat is reserved for the whole journey. Show your QR at the gate.',
        payload: {}, status: 'delivered', sent_at: demoBooking.created_at, read_at: null, created_at: demoBooking.created_at,
      },
      {
        id: uuid(), recipient_id: demoRider.id, booking_id: demoBooking.id, trip_id: trip.id,
        channel: 'sms', template: 'departure_reminder',
        title: 'Departure reminder',
        body: `${trip.trip_code} departs soon from your boarding point.`,
        payload: {}, status: 'sent', sent_at: now, read_at: null, created_at: now,
      },
    )
  }

  /* --- Vehicle telemetry (demo simulation) ----------------------------- */
  for (const trip of db.trips.filter((t) => ['departed', 'in_service'].includes(t.status))) {
    if (!trip.vehicle_id) continue
    const direction = db.route_directions.find((d) => d.id === trip.route_direction_id)!
    const route = db.routes.find((r) => r.id === direction.route_id)!
    const version = db.route_geometry_versions.find((v) => v.id === route.current_geometry_version_id)!
    const departureMs = new Date(trip.actual_departure_at ?? trip.scheduled_departure_at).getTime()
    const arrivalMs = new Date(trip.scheduled_arrival_at).getTime()
    const progress = Math.max(0.02, Math.min(0.97, (nowMs - departureMs) / Math.max(1, arrivalMs - departureMs)))
    const coords = version.geometry.coordinates
    const at = coords[Math.floor(progress * (coords.length - 1))] ?? coords[0]
    const flip = direction.direction_code === 'outbound'
    const position = flip ? (coords[Math.floor((1 - progress) * (coords.length - 1))] ?? coords[0]) : at
    db.vehicle_locations.push({
      id: uuid(), vehicle_id: trip.vehicle_id, trip_id: trip.id,
      latitude: position[1], longitude: position[0],
      heading: flip ? 220 : 40, speed_kph: Math.round(14 + rand() * 34), accuracy_m: 8,
      recorded_at: new Date(nowMs - Math.round(rand() * 90_000)).toISOString(),
      received_at: now, source: 'simulator',
    })
  }

  /* --- Configuration ---------------------------------------------------- */
  const config: ConfigurationValue[] = [
    { key: 'boarding.window_open_minutes', label: 'Boarding opens before departure', value: 45, unit: 'minutes', description: 'How early a ticket may be validated at the gate.', group: 'boarding', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'boarding.window_close_minutes', label: 'Boarding closes after departure', value: 5, unit: 'minutes', description: 'Grace period after the scheduled departure before validation is refused.', group: 'boarding', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'cash.variance_tolerance_naira', label: 'Cash variance tolerance', value: 500, unit: '₦', description: 'Variance above this amount escalates the session to a supervisor.', group: 'cash', editable_by: ['finance_officer', 'super_admin'] },
    { key: 'telemetry.stale_after_seconds', label: 'Location considered stale after', value: 120, unit: 'seconds', description: 'Vehicle positions older than this are labelled stale rather than live.', group: 'telemetry', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'service.on_time_tolerance_minutes', label: 'On-time departure tolerance', value: 5, unit: 'minutes', description: 'A departure within this window of schedule counts as on time.', group: 'service', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'capacity.operational_buffer', label: 'Default operational buffer', value: 5, unit: 'seats', description: 'Seats withheld from sale between legal and bookable capacity.', group: 'capacity', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.trip_completion_pct', label: 'Target · trip completion', value: 97, unit: '%', description: 'Pilot target for completed against scheduled trips.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.on_time_departure_pct', label: 'Target · on-time departure', value: 90, unit: '%', description: 'Pilot target for departures within tolerance.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.headway_adherence_pct', label: 'Target · headway adherence', value: 85, unit: '%', description: 'Pilot target for gaps within 25% of plan.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.digital_boarding_pct', label: 'Target · digitally validated boardings', value: 95, unit: '%', description: 'Share of boardings validated by scan or code.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.cash_variance_pct', label: 'Target · cash variance ceiling', value: 1, unit: '%', description: 'Maximum acceptable cash variance against expected.', group: 'targets', editable_by: ['finance_officer', 'super_admin'] },
    { key: 'targets.payment_success_pct', label: 'Target · digital payment success', value: 98, unit: '%', description: 'Valid digital payment attempts that succeed.', group: 'targets', editable_by: ['finance_officer', 'super_admin'] },
    { key: 'targets.peak_occupancy_pct', label: 'Target · peak occupancy', value: 82, unit: '%', description: 'Midpoint of the 75–90% peak occupancy band.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.offpeak_occupancy_pct', label: 'Target · off-peak occupancy', value: 50, unit: '%', description: 'Off-peak occupancy target after stabilisation.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
    { key: 'targets.validation_seconds', label: 'Target · validation duration', value: 10, unit: 'seconds', description: 'Average passenger validation time at the gate.', group: 'targets', editable_by: ['operations_manager', 'super_admin'] },
  ]
  db.configuration = config

  /* --- Audit trail ------------------------------------------------------ */
  const auditSeed = [
    { actor: superAdmin, action: 'gis.imported', entity: 'route', summary: 'Imported 14 corridors, 36 stops and 66 transit hubs from the Abuja reference dataset.', severity: 'notice' as const },
    { actor: opsManager, action: 'route.published', entity: 'route', summary: 'AB-01 · Mararaba ↔ CBD published with 8 ordered stops and 7 segments per direction.', severity: 'sensitive' as const },
    { actor: opsManager, action: 'route.published', entity: 'route', summary: 'AB-02 · Kubwa ↔ CBD published to riders.', severity: 'sensitive' as const },
    { actor: finance, action: 'fare_policy.published', entity: 'fare_policy', summary: 'Abuja Pilot Distance Fare 2026 v3 published — ₦25/km, ₦200 minimum.', severity: 'sensitive' as const },
    { actor: institutionAdmin, action: 'subsidy_policy.published', entity: 'subsidy_policy', summary: 'FMoT Staff Commute Co-pay 2026 v2 published — ₦300 per trip, 2 trips/day, ₦14m ceiling.', severity: 'sensitive' as const },
    { actor: institutionAdmin, action: 'eligibility.imported', entity: 'eligibility_record', summary: 'Imported 40 eligible staff records in batch FMOT-2026-Q1.', severity: 'sensitive' as const },
    { actor: dispatcher, action: 'trips.generated', entity: 'schedule_template', summary: `Generated the ${today} service day across 6 schedule templates.`, severity: 'info' as const },
  ]
  db.audit_logs = auditSeed.map((entry, i) => ({
    id: uuid(), actor_id: entry.actor.id, actor_name: entry.actor.full_name, action: entry.action,
    entity_type: entry.entity, entity_id: null, summary: entry.summary, diff: null,
    severity: entry.severity, occurred_at: new Date(nowMs - (auditSeed.length - i) * 47 * 60_000).toISOString(),
  }))

  return db
}

/** Accounts offered by the development role switcher. */
export interface DemoAccount {
  role: Role
  label: string
  surface: string
}

export const DEMO_ACCOUNT_ORDER: { role: Role; surface: string; description: string }[] = [
  { role: 'rider', surface: 'Rider Lite', description: 'Book, pay, and carry a ticket' },
  { role: 'hub_agent', surface: 'Hub', description: 'Sell, board, and reconcile cash' },
  { role: 'driver', surface: 'Driver', description: 'Inspect, run, and close a trip' },
  { role: 'dispatcher', surface: 'Control', description: 'Assign vehicles and watch the network' },
  { role: 'operations_manager', surface: 'Control', description: 'Full operational configuration' },
  { role: 'finance_officer', surface: 'Control', description: 'Revenue, cash, and cost economics' },
  { role: 'supervisor', surface: 'Control', description: 'Overrides and cash variance review' },
  { role: 'institution_admin', surface: 'Institutional', description: 'Programme, riders, and budget' },
  { role: 'executive_viewer', surface: 'Control', description: 'Aggregate performance only' },
  { role: 'super_admin', surface: 'Super Admin', description: 'System configuration and audit' },
]
