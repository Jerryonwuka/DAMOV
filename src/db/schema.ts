import type {
  AuditLog, Booking, BookingSegment, BoardingEvent, CashSession, CashTransaction, ConfigurationValue,
  CostEntry, DriverProfile, EligibilityRecord, FarePolicy, Hub, Incident, Notification, Organization,
  Payment, Profile, RiderProfile, Route, RouteDirection, RouteGeometryVersion, RouteSegment, RouteStop,
  ScheduleTemplate, ServiceCalendar, SponsorAuthorization, Stop, SubsidyPolicy, Ticket, Trip, TripEvent,
  TripSegmentInventory, UserRole, Vehicle, VehicleInspection, VehicleLocation, VehicleType,
} from '@/lib/types'

/**
 * The complete Damov dataset held by the client-side data layer.
 *
 * Each key maps to a table in `supabase/migrations/0001_init.sql`. Swapping the
 * prototype store for Supabase means replacing the read/write functions in
 * `db/store.ts` and `server/*` with PostgREST/RPC calls — the shape below and
 * every consumer stay unchanged.
 */
export interface DamovDatabase {
  organizations: Organization[]
  profiles: Profile[]
  user_roles: UserRole[]
  rider_profiles: RiderProfile[]
  driver_profiles: DriverProfile[]

  hubs: Hub[]
  stops: Stop[]
  routes: Route[]
  route_geometry_versions: RouteGeometryVersion[]
  route_directions: RouteDirection[]
  route_stops: RouteStop[]
  route_segments: RouteSegment[]

  service_calendars: ServiceCalendar[]
  schedule_templates: ScheduleTemplate[]
  trips: Trip[]
  trip_segment_inventory: TripSegmentInventory[]
  trip_events: TripEvent[]

  vehicle_types: VehicleType[]
  vehicles: Vehicle[]
  vehicle_inspections: VehicleInspection[]
  vehicle_locations: VehicleLocation[]

  fare_policies: FarePolicy[]
  subsidy_policies: SubsidyPolicy[]
  eligibility_records: EligibilityRecord[]
  bookings: Booking[]
  booking_segments: BookingSegment[]
  tickets: Ticket[]
  boarding_events: BoardingEvent[]

  payments: Payment[]
  sponsor_authorizations: SponsorAuthorization[]
  cash_sessions: CashSession[]
  cash_transactions: CashTransaction[]
  cost_entries: CostEntry[]

  incidents: Incident[]
  notifications: Notification[]
  audit_logs: AuditLog[]
  configuration: ConfigurationValue[]
}

export type TableName = keyof DamovDatabase

export const EMPTY_DB: DamovDatabase = {
  organizations: [], profiles: [], user_roles: [], rider_profiles: [], driver_profiles: [],
  hubs: [], stops: [], routes: [], route_geometry_versions: [], route_directions: [],
  route_stops: [], route_segments: [], service_calendars: [], schedule_templates: [], trips: [],
  trip_segment_inventory: [], trip_events: [], vehicle_types: [], vehicles: [],
  vehicle_inspections: [], vehicle_locations: [], fare_policies: [], subsidy_policies: [],
  eligibility_records: [], bookings: [], booking_segments: [], tickets: [], boarding_events: [],
  payments: [], sponsor_authorizations: [], cash_sessions: [], cash_transactions: [],
  cost_entries: [], incidents: [], notifications: [], audit_logs: [], configuration: [],
}
