-- Damov — production schema.
--
-- Mirrors src/lib/types.ts one-for-one. The client-side data layer in the
-- prototype implements exactly these tables and the business rules in
-- 0002_functions.sql, so moving to Supabase is a transport change, not a
-- remodel. All timestamps are timestamptz stored in UTC; the UI renders them
-- in Africa/Lagos. Money is whole Naira (integer).

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ---------------------------------------------------------------- enums
create type damov_role as enum ('rider','hub_agent','driver','dispatcher','operations_manager','finance_officer','supervisor','institution_admin','executive_viewer','super_admin');
create type organization_type as enum ('damov','government','ministry','company','school','operator');
create type record_status as enum ('active','suspended','archived');
create type network_status as enum ('reference','draft','active','suspended','archived');
create type route_status as enum ('reference','draft','pending_approval','published','suspended','archived');
create type direction_code as enum ('inbound','outbound');
create type trip_status as enum ('scheduled','assigned','boarding','departed','in_service','completed','cancelled','held');
create type vehicle_status as enum ('available','assigned','operating','charging','maintenance','out_of_service');
create type propulsion as enum ('ev','cng','diesel','hybrid');
create type trip_event_type as enum ('assigned','inspection_passed','arrived_hub','boarding_opened','dispatched','departed','stop_arrived','stop_departed','delayed','completed','cancelled','held','override');
create type booking_status as enum ('pending','held','confirmed','checked_in','boarded','completed','cancelled','expired','no_show','refunded');
create type booking_channel as enum ('rider_web','whatsapp','hub','qr','agent','admin');
create type payment_method as enum ('cash','transfer','card','sponsor_only','complimentary');
create type payment_status as enum ('pending','succeeded','failed','refunded','reversed');
create type validation_method as enum ('qr_scan','booking_code','phone_lookup','staff_id','supervisor_override');
create type boarding_result as enum ('valid','rejected','override');
create type cash_session_status as enum ('open','submitted','under_review','approved','rejected','returned');
create type cost_category as enum ('energy','driver','support_staff','maintenance_reserve','tyre_reserve','cleaning','payment_processing','terminal','toll','lease_allocation','other_direct');
create type approval_status as enum ('draft','submitted','approved','rejected');
create type incident_category as enum ('delay','breakdown','congestion','passenger_issue','safety','route_obstruction','security','other');
create type incident_severity as enum ('low','medium','high','critical');
create type incident_status as enum ('open','acknowledged','in_progress','resolved','closed');
create type operational_effect as enum ('none','delay','trip_cancelled','vehicle_withdrawn','route_diverted');
create type notification_channel as enum ('in_app','sms','whatsapp','email','push');
create type notification_status as enum ('queued','sent','delivered','failed','read');
create type eligibility_status as enum ('pending','active','revoked','expired');
create type audit_severity as enum ('info','notice','sensitive');

-- ---------------------------------------------------------------- identity
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  type organization_type not null,
  code text not null unique,
  status record_status not null default 'active',
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  billing_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null unique,
  email text,
  avatar_url text,
  status text not null default 'active' check (status in ('active','suspended','invited')),
  default_role damov_role not null default 'rider',
  organization_id uuid references organizations(id),
  employment_id text,
  last_login_at timestamptz,
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('terminal','interchange','depot','proposed_transit_hub')),
  location geography(point, 4326) not null,
  address text,
  status network_status not null default 'reference',
  external_source_id text,
  operating_hours text,
  created_at timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role damov_role not null,
  organization_id uuid references organizations(id),
  hub_id uuid references hubs(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role, organization_id, hub_id)
);
create index user_roles_user_idx on user_roles(user_id) where active;

create table rider_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  organization_id uuid references organizations(id),
  staff_id text,
  eligibility_state text not null default 'unverified' check (eligibility_state in ('unverified','pending','verified','rejected','expired')),
  verification_method text not null default 'none',
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now()
);

create table driver_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  operator_id uuid not null references organizations(id),
  licence_number text not null,
  licence_expiry date not null,
  home_hub_id uuid references hubs(id),
  approval_state text not null default 'pending' check (approval_state in ('pending','approved','training','suspended')),
  active boolean not null default true,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- network
create table stops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  location geography(point, 4326) not null,
  hub_id uuid references hubs(id),
  status network_status not null default 'reference',
  step_free_access boolean not null default false,
  shelter boolean not null default false,
  external_source_id text,
  created_at timestamptz not null default now()
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public_name text not null,
  code text not null unique,
  route_type text not null check (route_type in ('primary_trunk','secondary_feeder')),
  service_class text not null default 'standard' check (service_class in ('express','standard','shuttle')),
  status route_status not null default 'reference',
  color text not null default '#6FBF48',
  current_geometry_version_id uuid,
  external_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table route_geometry_versions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  version_number int not null,
  geometry geography(linestring, 4326) not null,
  geojson jsonb not null,
  distance_km numeric(8,2) not null,
  source text not null check (source in ('gis_import','drawn','operator_survey')),
  approval_state text not null default 'draft' check (approval_state in ('draft','pending_approval','approved','superseded')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (route_id, version_number)
);
alter table routes add constraint routes_current_geometry_fk foreign key (current_geometry_version_id) references route_geometry_versions(id);

create table route_directions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  name text not null,
  direction_code direction_code not null,
  origin_stop_id uuid references stops(id),
  destination_stop_id uuid references stops(id),
  active boolean not null default true,
  unique (route_id, direction_code)
);

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_direction_id uuid not null references route_directions(id) on delete cascade,
  stop_id uuid not null references stops(id),
  sequence int not null,
  distance_from_start_km numeric(8,2) not null default 0,
  scheduled_offset_minutes int not null default 0,
  boarding_allowed boolean not null default true,
  alighting_allowed boolean not null default true,
  unique (route_direction_id, sequence),
  unique (route_direction_id, stop_id)
);

create table route_segments (
  id uuid primary key default gen_random_uuid(),
  route_direction_id uuid not null references route_directions(id) on delete cascade,
  from_route_stop_id uuid not null references route_stops(id) on delete cascade,
  to_route_stop_id uuid not null references route_stops(id) on delete cascade,
  sequence int not null,
  distance_km numeric(8,2) not null default 0,
  planned_duration_minutes int not null default 0,
  unique (route_direction_id, sequence)
);

-- ---------------------------------------------------------------- scheduling
create table service_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  days_of_week int[] not null,
  start_date date not null,
  end_date date,
  excluded_dates date[] not null default '{}',
  added_dates date[] not null default '{}'
);

create table vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_capacity int not null check (legal_capacity > 0),
  default_bookable_capacity int not null check (default_bookable_capacity > 0 and default_bookable_capacity <= legal_capacity),
  propulsion propulsion not null,
  energy_cost_per_km int not null default 0
);

create table schedule_templates (
  id uuid primary key default gen_random_uuid(),
  route_direction_id uuid not null references route_directions(id) on delete cascade,
  service_calendar_id uuid not null references service_calendars(id),
  name text not null,
  start_time time not null,
  end_time time not null,
  headway_minutes int,
  explicit_departure_times time[],
  default_vehicle_type_id uuid not null references vehicle_types(id),
  active boolean not null default true,
  check (headway_minutes is not null or explicit_departure_times is not null)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  fleet_number text not null unique,
  registration_number text not null unique,
  vehicle_type_id uuid not null references vehicle_types(id),
  operator_id uuid not null references organizations(id),
  status vehicle_status not null default 'available',
  current_hub_id uuid references hubs(id),
  odometer_km int not null default 0,
  in_service_since date,
  next_service_due_km int,
  acquisition_metadata jsonb not null default '{}'::jsonb, -- finance-only, see RLS
  created_at timestamptz not null default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  trip_code text not null unique,
  route_direction_id uuid not null references route_directions(id),
  route_geometry_version_id uuid references route_geometry_versions(id),
  service_date date not null,
  scheduled_departure_at timestamptz not null,
  scheduled_arrival_at timestamptz not null,
  actual_departure_at timestamptz,
  actual_arrival_at timestamptz,
  origin_hub_id uuid references hubs(id),
  destination_hub_id uuid references hubs(id),
  vehicle_id uuid references vehicles(id),
  driver_id uuid references profiles(id),
  status trip_status not null default 'scheduled',
  legal_capacity_snapshot int not null,
  bookable_capacity_snapshot int not null,
  cancellation_reason text,
  current_route_stop_id uuid references route_stops(id),
  created_at timestamptz not null default now(),
  unique (route_direction_id, scheduled_departure_at)
);
create index trips_service_date_idx on trips(service_date, status);
create index trips_vehicle_idx on trips(vehicle_id, service_date);
create index trips_driver_idx on trips(driver_id, service_date);

-- One row per trip per segment. Capacity is checked and decremented here, atomically.
create table trip_segment_inventory (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  route_segment_id uuid not null references route_segments(id),
  capacity int not null check (capacity >= 0),
  reserved_count int not null default 0 check (reserved_count >= 0),
  boarded_adjustment int not null default 0,
  version int not null default 1,
  unique (trip_id, route_segment_id),
  check (reserved_count + boarded_adjustment <= capacity)
);

create table vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references profiles(id),
  trip_id uuid references trips(id),
  checklist jsonb not null,
  passed boolean not null,
  defects text,
  odometer_km int not null,
  submitted_at timestamptz not null default now(),
  supervisor_decision text not null default 'not_required' check (supervisor_decision in ('not_required','pending','cleared','grounded')),
  supervisor_id uuid references profiles(id)
);

-- Append-only telemetry. Latest-by-vehicle is served by the index below.
create table vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  trip_id uuid references trips(id),
  location geography(point, 4326) not null,
  heading smallint,
  speed_kph numeric(5,1),
  accuracy_m numeric(6,1),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null check (source in ('simulator','driver_app','telematics'))
);
create index vehicle_locations_latest_idx on vehicle_locations(vehicle_id, recorded_at desc);
create index vehicle_locations_trip_idx on vehicle_locations(trip_id, recorded_at);

create table trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  type trip_event_type not null,
  stop_id uuid references stops(id),
  actor_id uuid references profiles(id),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index trip_events_trip_idx on trip_events(trip_id, occurred_at);

-- ---------------------------------------------------------------- fares, subsidy, booking
create table fare_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  route_id uuid references routes(id),
  route_direction_id uuid references route_directions(id),
  calculation_type text not null check (calculation_type in ('flat','origin_destination','segment','distance')),
  flat_amount int,
  per_km_amount int,
  minimum_amount int,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version int not null default 1
);

create table subsidy_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_id uuid not null references organizations(id),
  route_ids uuid[],
  direction_codes direction_code[],
  days_of_week int[],
  time_bands jsonb,
  max_trips_per_day int,
  max_trips_per_week int,
  max_trips_per_month int,
  subsidy_type text not null check (subsidy_type in ('fixed','percentage')),
  fixed_amount int,
  percentage numeric(5,2),
  max_subsidy_per_trip int,
  valid_from date not null,
  valid_to date,
  programme_budget bigint,
  budget_consumed bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','pending_approval','published','suspended','archived')),
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index subsidy_policies_org_idx on subsidy_policies(organization_id) where status = 'published';

create table eligibility_records (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references profiles(id),
  organization_id uuid not null references organizations(id),
  staff_id text not null,
  full_name text not null,
  phone text,
  status eligibility_status not null default 'pending',
  valid_from date not null,
  valid_to date,
  import_batch text,
  verified_at timestamptz,
  verified_by uuid references profiles(id),
  unique (organization_id, staff_id)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  rider_id uuid not null references profiles(id),
  trip_id uuid not null references trips(id),
  origin_route_stop_id uuid not null references route_stops(id),
  destination_route_stop_id uuid not null references route_stops(id),
  booking_channel booking_channel not null,
  status booking_status not null default 'pending',
  gross_fare int not null check (gross_fare >= 0),
  passenger_contribution int not null check (passenger_contribution >= 0),
  sponsor_contribution int not null default 0 check (sponsor_contribution >= 0),
  sponsor_id uuid references organizations(id),
  fare_policy_snapshot jsonb,
  subsidy_policy_snapshot jsonb,
  currency char(3) not null default 'NGN',
  expires_at timestamptz,
  idempotency_key text not null unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  check (passenger_contribution + sponsor_contribution = gross_fare or status in ('cancelled','refunded'))
);
create index bookings_trip_idx on bookings(trip_id, status);
create index bookings_rider_idx on bookings(rider_id, created_at desc);
create index bookings_sponsor_idx on bookings(sponsor_id) where sponsor_id is not null;

create table booking_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  trip_segment_inventory_id uuid not null references trip_segment_inventory(id),
  unique (booking_id, trip_segment_inventory_id)
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  ticket_code text not null unique,
  qr_token_hash text not null unique, -- sha256 of the opaque token; the raw token is only ever shown to the passenger
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check (status in ('issued','used','void','expired'))
);

create table boarding_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  ticket_id uuid references tickets(id),
  trip_id uuid not null references trips(id),
  stop_id uuid references stops(id),
  boarded_at timestamptz not null default now(),
  validation_method validation_method not null,
  validator_user_id uuid references profiles(id),
  device_id text,
  result boarding_result not null,
  rejection_reason text,
  override_reason text,
  duration_ms int,
  reversed_at timestamptz,
  reversed_by uuid references profiles(id),
  reversal_reason text
);
create index boarding_events_trip_idx on boarding_events(trip_id, boarded_at);
-- A valid ticket boards once unless the first scan is reversed.
create unique index boarding_events_one_valid_per_booking on boarding_events(booking_id) where result <> 'rejected' and reversed_at is null;

-- ---------------------------------------------------------------- money
create table cash_sessions (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references hubs(id),
  agent_id uuid not null references profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_float int not null check (opening_float >= 0),
  expected_cash int not null default 0,
  declared_cash int,
  variance int,
  variance_explanation text,
  status cash_session_status not null default 'open',
  supervisor_id uuid references profiles(id),
  reviewed_at timestamptz,
  supervisor_note text,
  check (status = 'open' or declared_cash is not null),
  check (variance is null or variance = 0 or variance_explanation is not null)
);
create unique index cash_sessions_one_open_per_agent on cash_sessions(agent_id) where status = 'open';

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  payer_type text not null check (payer_type in ('passenger','sponsor','operator')),
  method payment_method not null,
  provider text not null,
  provider_reference text,
  amount int not null check (amount >= 0),
  currency char(3) not null default 'NGN',
  status payment_status not null default 'pending',
  idempotency_key text not null unique,
  paid_at timestamptz,
  cash_session_id uuid references cash_sessions(id),
  raw_provider_metadata jsonb, -- restricted to finance via RLS
  created_at timestamptz not null default now(),
  check (method <> 'cash' or cash_session_id is not null)
);
create index payments_booking_idx on payments(booking_id);

create table sponsor_authorizations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id),
  organization_id uuid not null references organizations(id),
  subsidy_policy_id uuid not null references subsidy_policies(id),
  amount_reserved int not null check (amount_reserved >= 0),
  amount_recognized int not null default 0 check (amount_recognized >= 0),
  status text not null default 'reserved' check (status in ('reserved','recognized','released','rejected')),
  recognized_at timestamptz,
  created_at timestamptz not null default now()
);

create table cash_transactions (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references cash_sessions(id),
  booking_id uuid references bookings(id),
  payment_id uuid references payments(id),
  amount int not null,
  type text not null check (type in ('ticket_sale','refund','float_in','float_out','reversal')),
  occurred_at timestamptz not null default now(),
  reversal_of uuid references cash_transactions(id)
);

create table cost_entries (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  trip_id uuid references trips(id),
  vehicle_id uuid references vehicles(id),
  route_id uuid references routes(id),
  category cost_category not null,
  amount int not null check (amount > 0),
  quantity numeric(10,2),
  unit text,
  evidence_url text,
  source text not null default 'manual' check (source in ('manual','derived','import')),
  approval_status approval_status not null default 'draft',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index cost_entries_trip_idx on cost_entries(trip_id) where approval_status = 'approved';

-- ---------------------------------------------------------------- governance
create table incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  category incident_category not null,
  severity incident_severity not null,
  trip_id uuid references trips(id),
  vehicle_id uuid references vehicles(id),
  route_id uuid references routes(id),
  hub_id uuid references hubs(id),
  description text not null,
  location geography(point, 4326),
  evidence_paths text[] not null default '{}', -- private bucket, signed URLs only
  reported_by uuid not null references profiles(id),
  assigned_to uuid references profiles(id),
  status incident_status not null default 'open',
  resolution text,
  operational_effect operational_effect not null default 'none',
  passenger_notification_required boolean not null default false,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (status not in ('resolved','closed') or resolution is not null)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id),
  booking_id uuid references bookings(id),
  trip_id uuid references trips(id),
  channel notification_channel not null,
  template text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status notification_status not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on notifications(recipient_id, created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  diff jsonb,
  ip inet,
  device text,
  severity audit_severity not null default 'info',
  occurred_at timestamptz not null default now()
);
create index audit_logs_occurred_idx on audit_logs(occurred_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);

create table configuration (
  key text primary key,
  label text not null,
  value jsonb not null,
  unit text,
  description text not null,
  "group" text not null,
  editable_by damov_role[] not null
);

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger organizations_updated before update on organizations for each row execute function set_updated_at();
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger routes_updated before update on routes for each row execute function set_updated_at();

-- Audit rows are append-only.
create or replace function audit_logs_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_no_update before update or delete on audit_logs for each row execute function audit_logs_immutable();
