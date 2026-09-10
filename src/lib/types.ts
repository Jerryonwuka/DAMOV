/**
 * Damov domain model.
 *
 * These types mirror the Supabase schema in `supabase/migrations/` one-for-one.
 * Every screen, metric and action in the product resolves to one of these records —
 * there is no display-only data anywhere in the application.
 *
 * Timestamps are ISO-8601 strings in UTC. They are rendered in Africa/Lagos by
 * `lib/format.ts`. Money is stored in whole Naira (NGN has no practical subunit
 * in fare collection) as an integer.
 */

export type UUID = string
export type ISODateTime = string
export type ISODate = string
export type Naira = number

/* ------------------------------------------------------------------ */
/* Identity and access                                                  */
/* ------------------------------------------------------------------ */

export const ROLES = [
  'rider',
  'hub_agent',
  'driver',
  'dispatcher',
  'operations_manager',
  'finance_officer',
  'supervisor',
  'institution_admin',
  'executive_viewer',
  'super_admin',
] as const
export type Role = (typeof ROLES)[number]

export type OrganizationType = 'damov' | 'government' | 'ministry' | 'company' | 'school' | 'operator'

export interface Organization {
  id: UUID
  name: string
  short_name: string
  type: OrganizationType
  code: string
  status: 'active' | 'suspended' | 'archived'
  primary_contact_name: string | null
  primary_contact_phone: string | null
  primary_contact_email: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface Profile {
  id: UUID
  full_name: string
  phone: string
  email: string | null
  avatar_url: string | null
  status: 'active' | 'suspended' | 'invited'
  default_role: Role
  organization_id: UUID | null
  employment_id: string | null
  last_login_at: ISODateTime | null
  mfa_enrolled: boolean
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface UserRole {
  id: UUID
  user_id: UUID
  role: Role
  organization_id: UUID | null
  hub_id: UUID | null
  active: boolean
  created_at: ISODateTime
}

export interface RiderProfile {
  id: UUID
  profile_id: UUID
  organization_id: UUID | null
  staff_id: string | null
  eligibility_state: 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired'
  verification_method: 'staff_list_import' | 'agent_verified' | 'self_declared' | 'none'
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  created_at: ISODateTime
}

export interface DriverProfile {
  id: UUID
  profile_id: UUID
  operator_id: UUID
  licence_number: string
  licence_expiry: ISODate
  home_hub_id: UUID | null
  approval_state: 'pending' | 'approved' | 'training' | 'suspended'
  active: boolean
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  created_at: ISODateTime
}

/* ------------------------------------------------------------------ */
/* GIS and network                                                      */
/* ------------------------------------------------------------------ */

export interface Hub {
  id: UUID
  name: string
  code: string
  type: 'terminal' | 'interchange' | 'depot' | 'proposed_transit_hub'
  latitude: number
  longitude: number
  address: string | null
  status: 'reference' | 'draft' | 'active' | 'suspended' | 'archived'
  external_source_id: string | null
  operating_hours: string | null
  created_at: ISODateTime
}

export interface Stop {
  id: UUID
  name: string
  code: string
  latitude: number
  longitude: number
  hub_id: UUID | null
  status: 'reference' | 'draft' | 'active' | 'suspended' | 'archived'
  step_free_access: boolean
  shelter: boolean
  external_source_id: string | null
  created_at: ISODateTime
}

export type RouteStatus = 'reference' | 'draft' | 'pending_approval' | 'published' | 'suspended' | 'archived'

export interface Route {
  id: UUID
  name: string
  public_name: string
  code: string
  route_type: 'primary_trunk' | 'secondary_feeder'
  service_class: 'express' | 'standard' | 'shuttle'
  status: RouteStatus
  color: string
  current_geometry_version_id: UUID | null
  external_source_id: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface RouteGeometryVersion {
  id: UUID
  route_id: UUID
  version_number: number
  geometry: GeoJSON.LineString
  distance_km: number
  source: 'gis_import' | 'drawn' | 'operator_survey'
  approval_state: 'draft' | 'pending_approval' | 'approved' | 'superseded'
  effective_from: ISODateTime | null
  effective_to: ISODateTime | null
  created_by: UUID | null
  approved_by: UUID | null
  created_at: ISODateTime
}

export interface RouteDirection {
  id: UUID
  route_id: UUID
  name: string
  direction_code: 'inbound' | 'outbound'
  origin_stop_id: UUID | null
  destination_stop_id: UUID | null
  active: boolean
}

export interface RouteStop {
  id: UUID
  route_direction_id: UUID
  stop_id: UUID
  sequence: number
  distance_from_start_km: number
  scheduled_offset_minutes: number
  boarding_allowed: boolean
  alighting_allowed: boolean
}

export interface RouteSegment {
  id: UUID
  route_direction_id: UUID
  from_route_stop_id: UUID
  to_route_stop_id: UUID
  sequence: number
  distance_km: number
  planned_duration_minutes: number
}

/* ------------------------------------------------------------------ */
/* Scheduling and operations                                            */
/* ------------------------------------------------------------------ */

export interface ServiceCalendar {
  id: UUID
  name: string
  days_of_week: number[] // 0 = Sunday
  start_date: ISODate
  end_date: ISODate | null
  excluded_dates: ISODate[]
  added_dates: ISODate[]
}

export interface ScheduleTemplate {
  id: UUID
  route_direction_id: UUID
  service_calendar_id: UUID
  name: string
  start_time: string // HH:mm, Africa/Lagos
  end_time: string
  headway_minutes: number | null
  explicit_departure_times: string[] | null
  default_vehicle_type_id: UUID
  active: boolean
}

export type TripStatus =
  | 'scheduled'
  | 'assigned'
  | 'boarding'
  | 'departed'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'held'

export interface Trip {
  id: UUID
  trip_code: string
  route_direction_id: UUID
  route_geometry_version_id: UUID | null
  service_date: ISODate
  scheduled_departure_at: ISODateTime
  scheduled_arrival_at: ISODateTime
  actual_departure_at: ISODateTime | null
  actual_arrival_at: ISODateTime | null
  origin_hub_id: UUID | null
  destination_hub_id: UUID | null
  vehicle_id: UUID | null
  driver_id: UUID | null
  status: TripStatus
  legal_capacity_snapshot: number
  bookable_capacity_snapshot: number
  cancellation_reason: string | null
  current_route_stop_id: UUID | null
  created_at: ISODateTime
}

export interface TripSegmentInventory {
  id: UUID
  trip_id: UUID
  route_segment_id: UUID
  capacity: number
  reserved_count: number
  boarded_adjustment: number
  version: number
}

export interface VehicleType {
  id: UUID
  name: string
  legal_capacity: number
  default_bookable_capacity: number
  propulsion: 'ev' | 'cng' | 'diesel' | 'hybrid'
  energy_cost_per_km: Naira
}

export type VehicleStatus =
  | 'available'
  | 'assigned'
  | 'operating'
  | 'charging'
  | 'maintenance'
  | 'out_of_service'

export interface Vehicle {
  id: UUID
  fleet_number: string
  registration_number: string
  vehicle_type_id: UUID
  operator_id: UUID
  status: VehicleStatus
  current_hub_id: UUID | null
  odometer_km: number
  in_service_since: ISODate | null
  next_service_due_km: number | null
  created_at: ISODateTime
}

export interface VehicleInspectionItem {
  key: string
  label: string
  passed: boolean
  note?: string
}

export interface VehicleInspection {
  id: UUID
  vehicle_id: UUID
  driver_id: UUID
  trip_id: UUID | null
  checklist: VehicleInspectionItem[]
  passed: boolean
  defects: string | null
  odometer_km: number
  submitted_at: ISODateTime
  supervisor_decision: 'not_required' | 'pending' | 'cleared' | 'grounded'
  supervisor_id: UUID | null
}

export interface VehicleLocation {
  id: UUID
  vehicle_id: UUID
  trip_id: UUID | null
  latitude: number
  longitude: number
  heading: number
  speed_kph: number
  accuracy_m: number
  recorded_at: ISODateTime
  received_at: ISODateTime
  source: 'simulator' | 'driver_app' | 'telematics'
}

export type TripEventType =
  | 'assigned'
  | 'inspection_passed'
  | 'arrived_hub'
  | 'boarding_opened'
  | 'dispatched'
  | 'departed'
  | 'stop_arrived'
  | 'stop_departed'
  | 'delayed'
  | 'completed'
  | 'cancelled'
  | 'held'
  | 'override'

export interface TripEvent {
  id: UUID
  trip_id: UUID
  type: TripEventType
  stop_id: UUID | null
  actor_id: UUID | null
  occurred_at: ISODateTime
  metadata: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Fares, subsidy, booking, boarding                                    */
/* ------------------------------------------------------------------ */

export interface FarePolicy {
  id: UUID
  name: string
  route_id: UUID | null
  route_direction_id: UUID | null
  calculation_type: 'flat' | 'origin_destination' | 'segment' | 'distance'
  flat_amount: Naira | null
  per_km_amount: Naira | null
  minimum_amount: Naira | null
  effective_from: ISODate
  effective_to: ISODate | null
  status: 'draft' | 'published' | 'archived'
  version: number
}

export interface SubsidyPolicy {
  id: UUID
  name: string
  organization_id: UUID
  route_ids: UUID[] | null
  direction_codes: ('inbound' | 'outbound')[] | null
  days_of_week: number[] | null
  time_bands: { start: string; end: string }[] | null
  max_trips_per_day: number | null
  max_trips_per_week: number | null
  max_trips_per_month: number | null
  subsidy_type: 'fixed' | 'percentage'
  fixed_amount: Naira | null
  percentage: number | null
  max_subsidy_per_trip: Naira | null
  valid_from: ISODate
  valid_to: ISODate | null
  programme_budget: Naira | null
  budget_consumed: Naira
  status: 'draft' | 'pending_approval' | 'published' | 'suspended' | 'archived'
  version: number
  created_at: ISODateTime
}

export interface EligibilityRecord {
  id: UUID
  rider_id: UUID | null
  organization_id: UUID
  staff_id: string
  full_name: string
  phone: string | null
  status: 'pending' | 'active' | 'revoked' | 'expired'
  valid_from: ISODate
  valid_to: ISODate | null
  import_batch: string | null
  verified_at: ISODateTime | null
  verified_by: UUID | null
}

export type BookingStatus =
  | 'pending'
  | 'held'
  | 'confirmed'
  | 'checked_in'
  | 'boarded'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show'
  | 'refunded'

export type BookingChannel = 'rider_web' | 'whatsapp' | 'hub' | 'qr' | 'agent' | 'admin'

export interface Booking {
  id: UUID
  booking_reference: string
  rider_id: UUID
  trip_id: UUID
  origin_route_stop_id: UUID
  destination_route_stop_id: UUID
  booking_channel: BookingChannel
  status: BookingStatus
  gross_fare: Naira
  passenger_contribution: Naira
  sponsor_contribution: Naira
  sponsor_id: UUID | null
  fare_policy_snapshot: { id: UUID; name: string; version: number; amount: Naira } | null
  subsidy_policy_snapshot: { id: UUID; name: string; version: number; explanation: string } | null
  currency: 'NGN'
  expires_at: ISODateTime | null
  idempotency_key: string
  created_by: UUID | null
  created_at: ISODateTime
  cancelled_at: ISODateTime | null
  cancellation_reason: string | null
}

export interface BookingSegment {
  id: UUID
  booking_id: UUID
  trip_segment_inventory_id: UUID
}

export interface Ticket {
  id: UUID
  booking_id: UUID
  ticket_code: string
  qr_token: string // opaque server-resolved token — never carries passenger data
  issued_at: ISODateTime
  status: 'issued' | 'used' | 'void' | 'expired'
}

export interface BoardingEvent {
  id: UUID
  booking_id: UUID | null
  ticket_id: UUID | null
  trip_id: UUID
  stop_id: UUID | null
  boarded_at: ISODateTime
  validation_method: 'qr_scan' | 'booking_code' | 'phone_lookup' | 'staff_id' | 'supervisor_override'
  validator_user_id: UUID | null
  device_id: string | null
  result: 'valid' | 'rejected' | 'override'
  rejection_reason: string | null
  override_reason: string | null
  duration_ms: number | null
  reversed_at: ISODateTime | null
  reversed_by: UUID | null
  reversal_reason: string | null
}

/* ------------------------------------------------------------------ */
/* Payments, reconciliation, cost                                       */
/* ------------------------------------------------------------------ */

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'sponsor_only' | 'complimentary'

export interface Payment {
  id: UUID
  booking_id: UUID
  payer_type: 'passenger' | 'sponsor' | 'operator'
  method: PaymentMethod
  provider: 'cash_desk' | 'mock_provider' | 'paystack' | 'flutterwave' | 'sponsor_ledger'
  provider_reference: string | null
  amount: Naira
  currency: 'NGN'
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'reversed'
  idempotency_key: string
  paid_at: ISODateTime | null
  cash_session_id: UUID | null
  created_at: ISODateTime
}

export interface SponsorAuthorization {
  id: UUID
  booking_id: UUID
  organization_id: UUID
  subsidy_policy_id: UUID
  amount_reserved: Naira
  amount_recognized: Naira
  status: 'reserved' | 'recognized' | 'released' | 'rejected'
  recognized_at: ISODateTime | null
  created_at: ISODateTime
}

export interface CashSession {
  id: UUID
  hub_id: UUID
  agent_id: UUID
  opened_at: ISODateTime
  closed_at: ISODateTime | null
  opening_float: Naira
  expected_cash: Naira
  declared_cash: Naira | null
  variance: Naira | null
  variance_explanation: string | null
  status: 'open' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned'
  supervisor_id: UUID | null
  reviewed_at: ISODateTime | null
  supervisor_note: string | null
}

export interface CashTransaction {
  id: UUID
  cash_session_id: UUID
  booking_id: UUID | null
  payment_id: UUID | null
  amount: Naira
  type: 'ticket_sale' | 'refund' | 'float_in' | 'float_out' | 'reversal'
  occurred_at: ISODateTime
  reversal_of: UUID | null
}

export type CostCategory =
  | 'energy'
  | 'driver'
  | 'support_staff'
  | 'maintenance_reserve'
  | 'tyre_reserve'
  | 'cleaning'
  | 'payment_processing'
  | 'terminal'
  | 'toll'
  | 'lease_allocation'
  | 'other_direct'

export interface CostEntry {
  id: UUID
  service_date: ISODate
  trip_id: UUID | null
  vehicle_id: UUID | null
  route_id: UUID | null
  category: CostCategory
  amount: Naira
  quantity: number | null
  unit: string | null
  evidence_url: string | null
  source: 'manual' | 'derived' | 'import'
  approval_status: 'draft' | 'submitted' | 'approved' | 'rejected'
  created_by: UUID | null
  created_at: ISODateTime
}

/* ------------------------------------------------------------------ */
/* Support and governance                                               */
/* ------------------------------------------------------------------ */

export type IncidentCategory =
  | 'delay'
  | 'breakdown'
  | 'congestion'
  | 'passenger_issue'
  | 'safety'
  | 'route_obstruction'
  | 'security'
  | 'other'

export interface Incident {
  id: UUID
  reference: string
  category: IncidentCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  trip_id: UUID | null
  vehicle_id: UUID | null
  route_id: UUID | null
  hub_id: UUID | null
  description: string
  latitude: number | null
  longitude: number | null
  evidence_urls: string[]
  reported_by: UUID
  assigned_to: UUID | null
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'
  resolution: string | null
  operational_effect: 'none' | 'delay' | 'trip_cancelled' | 'vehicle_withdrawn' | 'route_diverted'
  passenger_notification_required: boolean
  reported_at: ISODateTime
  resolved_at: ISODateTime | null
}

export interface Notification {
  id: UUID
  recipient_id: UUID
  booking_id: UUID | null
  trip_id: UUID | null
  channel: 'in_app' | 'sms' | 'whatsapp' | 'email' | 'push'
  template:
    | 'booking_confirmed'
    | 'payment_confirmed'
    | 'payment_failed'
    | 'ticket_issued'
    | 'departure_reminder'
    | 'boarding_opened'
    | 'trip_delayed'
    | 'trip_cancelled'
    | 'vehicle_changed'
    | 'refund_processed'
    | 'eligibility_changed'
  title: string
  body: string
  payload: Record<string, unknown>
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read'
  sent_at: ISODateTime | null
  read_at: ISODateTime | null
  created_at: ISODateTime
}

export interface AuditLog {
  id: UUID
  actor_id: UUID | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: string | null
  summary: string
  diff: Record<string, { before: unknown; after: unknown }> | null
  severity: 'info' | 'notice' | 'sensitive'
  occurred_at: ISODateTime
}

export interface ConfigurationValue {
  key: string
  label: string
  value: number | string | boolean
  unit: string | null
  description: string
  group: 'boarding' | 'cash' | 'telemetry' | 'service' | 'capacity' | 'targets'
  editable_by: Role[]
}

/* ------------------------------------------------------------------ */
/* Derived / read models                                                */
/* ------------------------------------------------------------------ */

export interface JourneyAvailability {
  available: boolean
  seats_available: number
  limiting_segment_id: UUID | null
  limiting_segment_label: string | null
  segments_checked: number
}

export interface FareQuote {
  gross_fare: Naira
  passenger_contribution: Naira
  sponsor_contribution: Naira
  sponsor_id: UUID | null
  sponsor_name: string | null
  fare_policy: { id: UUID; name: string; version: number }
  subsidy_policy: { id: UUID; name: string; version: number } | null
  eligible: boolean
  explanation: string
  distance_km: number
}

export interface TripEconomics {
  trip_id: UUID
  passenger_count: number
  booked_count: number
  capacity: number
  occupancy_pct: number
  gross_fare_value: Naira
  passenger_revenue: Naira
  sponsor_revenue_recognized: Naira
  sponsor_revenue_reserved: Naira
  gross_trip_revenue: Naira
  direct_trip_cost: Naira
  cost_breakdown: Record<CostCategory, Naira>
  contribution_margin: Naira
  distance_km: number
  cost_per_passenger: Naira
  revenue_per_passenger: Naira
  revenue_per_km: Naira
  cost_per_km: Naira
  subsidy_per_boarded_passenger: Naira
}

export interface DataQualityFlag {
  entity_type: 'route' | 'stop' | 'hub'
  entity_id: UUID
  entity_label: string
  issue:
    | 'missing_stable_id'
    | 'missing_route_code'
    | 'placeholder_name'
    | 'unnamed_hub'
    | 'duplicate_coordinates'
    | 'stop_not_snapped'
    | 'missing_direction'
    | 'missing_ordered_stops'
    | 'missing_service_status'
  detail: string
  severity: 'warning' | 'blocking'
}
