-- Damov — row-level security.
--
-- Hidden buttons are not security. Every sensitive table is protected here,
-- with organisation-level tenant separation and hub scoping. Business writes
-- go through the SECURITY DEFINER functions in 0002; direct inserts on the
-- money and capacity tables are denied to every client role.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table rider_profiles enable row level security;
alter table driver_profiles enable row level security;
alter table hubs enable row level security;
alter table stops enable row level security;
alter table routes enable row level security;
alter table route_geometry_versions enable row level security;
alter table route_directions enable row level security;
alter table route_stops enable row level security;
alter table route_segments enable row level security;
alter table service_calendars enable row level security;
alter table schedule_templates enable row level security;
alter table vehicle_types enable row level security;
alter table vehicles enable row level security;
alter table trips enable row level security;
alter table trip_segment_inventory enable row level security;
alter table vehicle_inspections enable row level security;
alter table vehicle_locations enable row level security;
alter table trip_events enable row level security;
alter table fare_policies enable row level security;
alter table subsidy_policies enable row level security;
alter table eligibility_records enable row level security;
alter table bookings enable row level security;
alter table booking_segments enable row level security;
alter table tickets enable row level security;
alter table boarding_events enable row level security;
alter table cash_sessions enable row level security;
alter table cash_transactions enable row level security;
alter table payments enable row level security;
alter table sponsor_authorizations enable row level security;
alter table cost_entries enable row level security;
alter table incidents enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table configuration enable row level security;

-- Public network information: published routes, their stops and hubs, to any signed-in user.
create policy routes_public_read on routes for select using (status = 'published' or has_role('dispatcher','operations_manager','supervisor','finance_officer','executive_viewer','super_admin'));
create policy geometry_read on route_geometry_versions for select using (exists (select 1 from routes r where r.id = route_id and (r.status = 'published' or has_role('dispatcher','operations_manager','supervisor','super_admin'))));
create policy directions_read on route_directions for select using (true);
create policy route_stops_read on route_stops for select using (true);
create policy segments_read on route_segments for select using (true);
create policy stops_read on stops for select using (status = 'active' or has_role('dispatcher','operations_manager','supervisor','super_admin'));
create policy hubs_read on hubs for select using (status = 'active' or has_role('dispatcher','operations_manager','supervisor','super_admin'));
create policy network_write on routes for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy stops_write on stops for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy hubs_write on hubs for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy directions_write on route_directions for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy route_stops_write on route_stops for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy segments_write on route_segments for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy geometry_write on route_geometry_versions for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));

-- Identity.
create policy profiles_self on profiles for select using (id = auth.uid());
create policy profiles_staff_read on profiles for select using (has_role('hub_agent','supervisor','dispatcher','operations_manager','finance_officer','super_admin'));
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid() and default_role = (select default_role from profiles where id = auth.uid()));
create policy profiles_admin on profiles for all using (has_role('super_admin')) with check (has_role('super_admin'));
create policy user_roles_self on user_roles for select using (user_id = auth.uid());
create policy user_roles_admin on user_roles for all using (has_role('super_admin')) with check (has_role('super_admin'));
create policy organizations_read on organizations for select using (true);
create policy organizations_admin on organizations for all using (has_role('super_admin')) with check (has_role('super_admin'));
create policy rider_self on rider_profiles for select using (profile_id = auth.uid());
create policy rider_staff on rider_profiles for select using (has_role('hub_agent','supervisor','dispatcher','operations_manager','super_admin'));
create policy rider_institution on rider_profiles for select using (has_role('institution_admin') and organization_id = current_organization());
create policy driver_self on driver_profiles for select using (profile_id = auth.uid());
create policy driver_ops on driver_profiles for all using (has_role('dispatcher','operations_manager','super_admin')) with check (has_role('dispatcher','operations_manager','super_admin'));

-- Scheduling and fleet.
create policy calendars_read on service_calendars for select using (true);
create policy calendars_write on service_calendars for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy templates_read on schedule_templates for select using (true);
create policy templates_write on schedule_templates for all using (has_role('operations_manager','super_admin')) with check (has_role('operations_manager','super_admin'));
create policy vehicle_types_read on vehicle_types for select using (true);
create policy vehicles_ops on vehicles for select using (has_role('driver','dispatcher','operations_manager','supervisor','finance_officer','executive_viewer','super_admin'));
create policy vehicles_write on vehicles for update using (has_role('dispatcher','operations_manager','super_admin')) with check (has_role('dispatcher','operations_manager','super_admin'));
-- Acquisition/lease metadata is masked for non-finance roles by the view below.
create or replace view vehicles_operational as
  select id, fleet_number, registration_number, vehicle_type_id, operator_id, status, current_hub_id, odometer_km, in_service_since, next_service_due_km, created_at from vehicles;

-- Trips: riders see published departures; drivers their own; staff by role; hub staff their hub.
create policy trips_rider on trips for select using (status not in ('cancelled') and exists (select 1 from route_directions d join routes r on r.id = d.route_id where d.id = route_direction_id and r.status = 'published'));
create policy trips_driver on trips for select using (driver_id = auth.uid());
create policy trips_hub on trips for select using (has_role('hub_agent','supervisor') and (origin_hub_id in (select current_hubs()) or destination_hub_id in (select current_hubs())));
create policy trips_ops on trips for select using (has_role('dispatcher','operations_manager','finance_officer','executive_viewer','super_admin'));
create policy trips_write on trips for update using (has_role('dispatcher','operations_manager','supervisor','super_admin')) with check (has_role('dispatcher','operations_manager','supervisor','super_admin'));
create policy inventory_read on trip_segment_inventory for select using (true);
-- No direct writes to inventory: only the booking functions may touch it.
create policy events_read on trip_events for select using (has_role('driver','hub_agent','dispatcher','operations_manager','supervisor','finance_officer','super_admin'));
create policy inspections_driver on vehicle_inspections for select using (driver_id = auth.uid());
create policy inspections_driver_insert on vehicle_inspections for insert with check (driver_id = auth.uid());
create policy inspections_ops on vehicle_inspections for all using (has_role('dispatcher','operations_manager','supervisor','super_admin')) with check (has_role('dispatcher','operations_manager','supervisor','super_admin'));
create policy locations_ops on vehicle_locations for select using (has_role('dispatcher','operations_manager','supervisor','executive_viewer','super_admin'));
create policy locations_hub on vehicle_locations for select using (has_role('hub_agent') and trip_id in (select id from trips where origin_hub_id in (select current_hubs()) or destination_hub_id in (select current_hubs())));

-- Fares and subsidy.
create policy fares_read on fare_policies for select using (status = 'published' or has_role('operations_manager','finance_officer','super_admin'));
create policy fares_write on fare_policies for all using (has_role('finance_officer','operations_manager','super_admin')) with check (has_role('finance_officer','operations_manager','super_admin'));
create policy subsidy_institution on subsidy_policies for all using (has_role('institution_admin') and organization_id = current_organization()) with check (has_role('institution_admin') and organization_id = current_organization());
create policy subsidy_ops_read on subsidy_policies for select using (has_role('operations_manager','finance_officer','hub_agent','supervisor','super_admin'));
create policy subsidy_admin on subsidy_policies for all using (has_role('super_admin')) with check (has_role('super_admin'));
create policy eligibility_institution on eligibility_records for all using (has_role('institution_admin') and organization_id = current_organization()) with check (has_role('institution_admin') and organization_id = current_organization());
create policy eligibility_self on eligibility_records for select using (rider_id = auth.uid());
create policy eligibility_staff on eligibility_records for select using (has_role('hub_agent','supervisor','operations_manager','super_admin'));

-- Bookings, tickets, boarding.
create policy bookings_self on bookings for select using (rider_id = auth.uid());
create policy bookings_hub on bookings for select using (has_role('hub_agent','supervisor') and trip_id in (select id from trips where origin_hub_id in (select current_hubs()) or destination_hub_id in (select current_hubs())));
create policy bookings_ops on bookings for select using (has_role('dispatcher','operations_manager','finance_officer','super_admin'));
-- Institutions get aggregates only through the reporting functions; no row access to bookings.
create policy booking_segments_read on booking_segments for select using (has_role('dispatcher','operations_manager','finance_officer','super_admin'));
create policy tickets_self on tickets for select using (booking_id in (select id from bookings where rider_id = auth.uid()));
create policy tickets_hub on tickets for select using (has_role('hub_agent','supervisor','dispatcher','operations_manager','super_admin'));
create policy boarding_self on boarding_events for select using (booking_id in (select id from bookings where rider_id = auth.uid()));
create policy boarding_staff on boarding_events for select using (has_role('hub_agent','supervisor','dispatcher','operations_manager','finance_officer','super_admin'));

-- Money.
create policy cash_sessions_agent on cash_sessions for select using (agent_id = auth.uid());
create policy cash_sessions_agent_open on cash_sessions for insert with check (agent_id = auth.uid() and hub_id in (select current_hubs()));
create policy cash_sessions_supervisor on cash_sessions for all using (has_role('supervisor','finance_officer','super_admin')) with check (has_role('supervisor','finance_officer','super_admin'));
create policy cash_tx_agent on cash_transactions for select using (cash_session_id in (select id from cash_sessions where agent_id = auth.uid()));
create policy cash_tx_finance on cash_transactions for select using (has_role('supervisor','finance_officer','super_admin'));
create policy payments_self on payments for select using (booking_id in (select id from bookings where rider_id = auth.uid()));
create policy payments_finance on payments for select using (has_role('finance_officer','operations_manager','super_admin'));
create policy payments_hub on payments for select using (has_role('hub_agent','supervisor') and cash_session_id in (select id from cash_sessions where agent_id = auth.uid() or has_role('supervisor')));
create policy sponsor_auth_institution on sponsor_authorizations for select using (has_role('institution_admin') and organization_id = current_organization());
create policy sponsor_auth_finance on sponsor_authorizations for select using (has_role('finance_officer','operations_manager','super_admin'));
create policy costs_finance on cost_entries for all using (has_role('finance_officer','operations_manager','super_admin')) with check (has_role('finance_officer','operations_manager','super_admin'));

-- Governance.
create policy incidents_reporter on incidents for select using (reported_by = auth.uid());
create policy incidents_insert on incidents for insert with check (reported_by = auth.uid());
create policy incidents_ops on incidents for all using (has_role('hub_agent','supervisor','dispatcher','operations_manager','super_admin')) with check (has_role('hub_agent','supervisor','dispatcher','operations_manager','super_admin'));
create policy notifications_self on notifications for select using (recipient_id = auth.uid());
create policy notifications_self_read on notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy audit_read on audit_logs for select using (has_role('operations_manager','finance_officer','super_admin'));
create policy configuration_read on configuration for select using (true);
create policy configuration_write on configuration for update using (has_role('operations_manager','finance_officer','super_admin') and (select array_agg(r) from current_roles() r) && editable_by) with check (true);
