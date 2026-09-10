-- Damov — server-side business functions.
--
-- Every write that money, capacity or boarding depends on lives here as a
-- SECURITY DEFINER function, so the client never computes a fare, a seat count
-- or a boarding decision. The prototype's src/server/* modules implement the
-- same contracts against the in-browser store.

-- ---------------------------------------------------------------- role helpers
create or replace function current_roles() returns setof damov_role language sql stable security definer as $$
  select role from user_roles where user_id = auth.uid() and active
$$;
create or replace function has_role(variadic wanted damov_role[]) returns boolean language sql stable security definer as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and active and role = any(wanted))
$$;
create or replace function current_organization() returns uuid language sql stable security definer as $$
  select organization_id from profiles where id = auth.uid()
$$;
create or replace function current_hubs() returns setof uuid language sql stable security definer as $$
  select hub_id from user_roles where user_id = auth.uid() and active and hub_id is not null
$$;

-- ---------------------------------------------------------------- capacity engine
-- Segment ids a journey traverses, in order.
create or replace function journey_segments(p_trip uuid, p_origin_route_stop uuid, p_destination_route_stop uuid)
returns table (trip_segment_inventory_id uuid, route_segment_id uuid, sequence int)
language plpgsql stable as $$
declare
  v_direction uuid; v_origin_seq int; v_dest_seq int;
begin
  select route_direction_id into v_direction from trips where id = p_trip;
  select sequence into v_origin_seq from route_stops where id = p_origin_route_stop and route_direction_id = v_direction;
  select sequence into v_dest_seq from route_stops where id = p_destination_route_stop and route_direction_id = v_direction;
  if v_origin_seq is null or v_dest_seq is null then raise exception 'stop_not_on_route'; end if;
  if v_dest_seq <= v_origin_seq then raise exception 'invalid_journey'; end if;
  return query
    select tsi.id, rs.id, rs.sequence
    from route_segments rs
    join route_stops f on f.id = rs.from_route_stop_id
    join trip_segment_inventory tsi on tsi.route_segment_id = rs.id and tsi.trip_id = p_trip
    where rs.route_direction_id = v_direction and f.sequence >= v_origin_seq and f.sequence < v_dest_seq
    order by rs.sequence;
end $$;

create or replace function check_journey_availability(p_trip uuid, p_origin_route_stop uuid, p_destination_route_stop uuid)
returns jsonb language plpgsql stable security definer as $$
declare v_min int; v_limit uuid; v_count int;
begin
  select min(capacity - reserved_count - boarded_adjustment), count(*)
    into v_min, v_count
  from trip_segment_inventory tsi
  join journey_segments(p_trip, p_origin_route_stop, p_destination_route_stop) js on js.trip_segment_inventory_id = tsi.id;
  select tsi.route_segment_id into v_limit
  from trip_segment_inventory tsi
  join journey_segments(p_trip, p_origin_route_stop, p_destination_route_stop) js on js.trip_segment_inventory_id = tsi.id
  order by (capacity - reserved_count - boarded_adjustment) asc limit 1;
  return jsonb_build_object('available', coalesce(v_min,0) > 0, 'seats_available', greatest(coalesce(v_min,0),0), 'limiting_segment_id', v_limit, 'segments_checked', v_count);
end $$;

-- ---------------------------------------------------------------- fare + subsidy
create or replace function quote_booking(p_trip uuid, p_origin_route_stop uuid, p_destination_route_stop uuid, p_rider uuid)
returns jsonb language plpgsql stable security definer as $$
declare
  v_trip trips%rowtype; v_dir route_directions%rowtype; v_fare fare_policies%rowtype; v_policy subsidy_policies%rowtype;
  v_rider rider_profiles%rowtype; v_org organizations%rowtype;
  v_distance numeric; v_gross int; v_subsidy int := 0; v_explain text; v_segments int;
  v_dep_time time; v_dow int; v_taken int;
begin
  select * into v_trip from trips where id = p_trip;
  select * into v_dir from route_directions where id = v_trip.route_direction_id;
  select greatest(0.5, d.distance_from_start_km - o.distance_from_start_km), count(*) over ()
    into v_distance, v_segments
  from route_stops o, route_stops d where o.id = p_origin_route_stop and d.id = p_destination_route_stop;

  select * into v_fare from fare_policies
   where status = 'published' and effective_from <= v_trip.service_date and (effective_to is null or effective_to >= v_trip.service_date)
     and (route_id = v_dir.route_id or route_id is null)
   order by (route_id is not null) desc limit 1;
  if v_fare.id is null then raise exception 'no_fare_policy'; end if;

  v_gross := case v_fare.calculation_type
    when 'flat' then v_fare.flat_amount
    when 'segment' then greatest(coalesce(v_fare.minimum_amount,0), v_fare.flat_amount * (select count(*) from journey_segments(p_trip, p_origin_route_stop, p_destination_route_stop)))
    else greatest(coalesce(v_fare.minimum_amount,0), round((v_fare.per_km_amount * v_distance) / 50.0) * 50) end;

  select * into v_rider from rider_profiles where profile_id = p_rider;
  v_explain := 'Standard fare — no sponsoring organisation on this profile.';
  if v_rider.organization_id is not null and v_rider.eligibility_state = 'verified' then
    select * into v_org from organizations where id = v_rider.organization_id;
    select * into v_policy from subsidy_policies
     where organization_id = v_rider.organization_id and status = 'published'
       and valid_from <= v_trip.service_date and (valid_to is null or valid_to >= v_trip.service_date) limit 1;
    if v_policy.id is null then
      v_explain := format('Standard fare — %s has no active programme.', v_org.short_name);
    else
      v_dep_time := (v_trip.scheduled_departure_at at time zone 'Africa/Lagos')::time;
      v_dow := extract(dow from v_trip.service_date);
      if v_policy.route_ids is not null and not (v_dir.route_id = any(v_policy.route_ids)) then v_explain := 'Not eligible: this route is not in the sponsored programme.';
      elsif v_policy.direction_codes is not null and not (v_dir.direction_code = any(v_policy.direction_codes)) then v_explain := format('Not eligible: the %s direction is not sponsored.', v_dir.direction_code);
      elsif v_policy.days_of_week is not null and not (v_dow = any(v_policy.days_of_week)) then v_explain := 'Not eligible: travel day is outside the programme calendar.';
      elsif v_policy.time_bands is not null and not exists (select 1 from jsonb_array_elements(v_policy.time_bands) b where v_dep_time between (b->>'start')::time and (b->>'end')::time) then v_explain := 'Not eligible: departure is outside programme hours.';
      else
        select count(*) into v_taken from bookings b join trips t on t.id = b.trip_id
          where b.rider_id = p_rider and b.subsidy_policy_snapshot->>'id' = v_policy.id::text and t.service_date = v_trip.service_date and b.status not in ('cancelled','expired','refunded');
        if v_policy.max_trips_per_day is not null and v_taken >= v_policy.max_trips_per_day then
          v_explain := 'Not eligible: daily sponsored-trip limit reached.';
        else
          v_subsidy := case v_policy.subsidy_type when 'fixed' then v_policy.fixed_amount else round(v_gross * v_policy.percentage / 100.0) end;
          if v_policy.max_subsidy_per_trip is not null then v_subsidy := least(v_subsidy, v_policy.max_subsidy_per_trip); end if;
          v_subsidy := least(v_subsidy, v_gross);
          if v_policy.programme_budget is not null and v_policy.budget_consumed + v_subsidy > v_policy.programme_budget then
            v_subsidy := 0; v_explain := 'Not eligible: the programme budget ceiling has been reached for this period.';
          else
            v_explain := format('Eligible: %s covers ₦%s; passenger pays ₦%s.', v_org.short_name, v_subsidy, v_gross - v_subsidy);
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'gross_fare', v_gross, 'passenger_contribution', v_gross - v_subsidy, 'sponsor_contribution', v_subsidy,
    'sponsor_id', case when v_subsidy > 0 then v_policy.organization_id end, 'sponsor_name', v_org.short_name,
    'fare_policy', jsonb_build_object('id', v_fare.id, 'name', v_fare.name, 'version', v_fare.version),
    'subsidy_policy', case when v_policy.id is not null then jsonb_build_object('id', v_policy.id, 'name', v_policy.name, 'version', v_policy.version) end,
    'eligible', v_subsidy > 0, 'explanation', v_explain, 'distance_km', round(v_distance, 1));
end $$;

-- ---------------------------------------------------------------- booking (atomic)
create or replace function create_booking_and_reserve_capacity(
  p_trip uuid, p_rider uuid, p_origin_route_stop uuid, p_destination_route_stop uuid,
  p_channel booking_channel, p_method payment_method, p_cash_session uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer as $$
declare
  v_existing bookings%rowtype; v_quote jsonb; v_booking bookings%rowtype; v_ticket tickets%rowtype;
  v_token text; v_seg record; v_free int; v_trip trips%rowtype;
begin
  -- Idempotent: a replay returns the original booking.
  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then
    select * into v_ticket from tickets where booking_id = v_existing.id;
    return jsonb_build_object('booking_id', v_existing.id, 'booking_reference', v_existing.booking_reference, 'ticket_code', v_ticket.ticket_code, 'replayed', true);
  end if;

  select * into v_trip from trips where id = p_trip for update;
  if v_trip.status in ('cancelled','completed') then raise exception 'trip_closed'; end if;

  v_quote := quote_booking(p_trip, p_origin_route_stop, p_destination_route_stop, p_rider);
  if p_method = 'sponsor_only' and (v_quote->>'passenger_contribution')::int > 0 then raise exception 'sponsor_cannot_cover'; end if;
  if p_method = 'cash' and (p_cash_session is null or not exists (select 1 from cash_sessions where id = p_cash_session and status = 'open')) then raise exception 'no_cash_session'; end if;

  -- Lock every required segment row in order, then verify each has a seat.
  for v_seg in select * from journey_segments(p_trip, p_origin_route_stop, p_destination_route_stop) loop
    select capacity - reserved_count - boarded_adjustment into v_free from trip_segment_inventory where id = v_seg.trip_segment_inventory_id for update;
    if v_free <= 0 then raise exception 'segment_full: %', v_seg.route_segment_id; end if;
  end loop;

  insert into bookings (booking_reference, rider_id, trip_id, origin_route_stop_id, destination_route_stop_id, booking_channel, status,
    gross_fare, passenger_contribution, sponsor_contribution, sponsor_id, fare_policy_snapshot, subsidy_policy_snapshot, idempotency_key, created_by)
  values ('DMV-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,6)), p_rider, p_trip, p_origin_route_stop, p_destination_route_stop, p_channel, 'confirmed',
    (v_quote->>'gross_fare')::int, case when p_method = 'complimentary' then 0 else (v_quote->>'passenger_contribution')::int end,
    (v_quote->>'sponsor_contribution')::int, (v_quote->>'sponsor_id')::uuid, v_quote->'fare_policy', v_quote->'subsidy_policy' || jsonb_build_object('explanation', v_quote->>'explanation'), p_idempotency_key, auth.uid())
  returning * into v_booking;

  -- Reserve one seat per segment and record the link.
  for v_seg in select * from journey_segments(p_trip, p_origin_route_stop, p_destination_route_stop) loop
    update trip_segment_inventory set reserved_count = reserved_count + 1, version = version + 1 where id = v_seg.trip_segment_inventory_id;
    insert into booking_segments (booking_id, trip_segment_inventory_id) values (v_booking.id, v_seg.trip_segment_inventory_id);
  end loop;

  if v_booking.passenger_contribution > 0 then
    insert into payments (booking_id, payer_type, method, provider, amount, status, idempotency_key, paid_at, cash_session_id)
    values (v_booking.id, 'passenger', p_method, case when p_method = 'cash' then 'cash_desk' else 'provider' end, v_booking.passenger_contribution,
      case when p_method = 'cash' then 'succeeded' else 'pending' end, 'pay_' || p_idempotency_key, case when p_method = 'cash' then now() end, p_cash_session);
    if p_method = 'cash' then
      insert into cash_transactions (cash_session_id, booking_id, amount, type) values (p_cash_session, v_booking.id, v_booking.passenger_contribution, 'ticket_sale');
      update cash_sessions set expected_cash = expected_cash + v_booking.passenger_contribution where id = p_cash_session;
    end if;
  end if;

  if v_booking.sponsor_contribution > 0 then
    insert into sponsor_authorizations (booking_id, organization_id, subsidy_policy_id, amount_reserved)
    values (v_booking.id, v_booking.sponsor_id, (v_quote->'subsidy_policy'->>'id')::uuid, v_booking.sponsor_contribution);
    update subsidy_policies set budget_consumed = budget_consumed + v_booking.sponsor_contribution where id = (v_quote->'subsidy_policy'->>'id')::uuid;
  end if;

  v_token := 'dmv_t_' || encode(gen_random_bytes(18), 'hex');
  insert into tickets (booking_id, ticket_code, qr_token_hash)
  values (v_booking.id, 'TKT-' || upper(substr(encode(gen_random_bytes(8),'hex'),1,8)), encode(digest(v_token, 'sha256'), 'hex'))
  returning * into v_ticket;

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, summary, severity)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()), 'system'), 'booking.created', 'booking', v_booking.id::text,
    format('%s · gross %s, passenger %s, sponsor %s', v_booking.booking_reference, v_booking.gross_fare, v_booking.passenger_contribution, v_booking.sponsor_contribution),
    case when v_booking.sponsor_contribution > 0 then 'sensitive' else 'info' end);

  -- The raw token is returned exactly once, to the caller that created the booking.
  return jsonb_build_object('booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference, 'ticket_code', v_ticket.ticket_code, 'qr_token', v_token, 'quote', v_quote);
end $$;

create or replace function cancel_booking_and_release_capacity(p_booking uuid, p_reason text)
returns void language plpgsql security definer as $$
declare v_booking bookings%rowtype; v_auth sponsor_authorizations%rowtype;
begin
  select * into v_booking from bookings where id = p_booking for update;
  if v_booking.status in ('cancelled','refunded') then raise exception 'already_cancelled'; end if;
  if v_booking.status in ('boarded','completed') then raise exception 'already_travelled'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required'; end if;
  update trip_segment_inventory tsi set reserved_count = greatest(0, reserved_count - 1), version = version + 1
    from booking_segments bs where bs.trip_segment_inventory_id = tsi.id and bs.booking_id = p_booking;
  delete from booking_segments where booking_id = p_booking;
  update bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason where id = p_booking;
  update tickets set status = 'void' where booking_id = p_booking;
  update payments set status = 'refunded' where booking_id = p_booking and status = 'succeeded';
  select * into v_auth from sponsor_authorizations where booking_id = p_booking and status = 'reserved';
  if found then
    update sponsor_authorizations set status = 'released' where id = v_auth.id;
    update subsidy_policies set budget_consumed = greatest(0, budget_consumed - v_auth.amount_reserved) where id = v_auth.subsidy_policy_id;
  end if;
  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, summary, severity)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()),'system'), 'booking.cancelled', 'booking', p_booking::text, v_booking.booking_reference || ' cancelled — ' || p_reason, 'sensitive');
end $$;

-- ---------------------------------------------------------------- boarding
create or replace function validate_boarding(p_credential text, p_trip uuid, p_stop uuid, p_device text, p_override_reason text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_ticket tickets%rowtype; v_booking bookings%rowtype; v_trip trips%rowtype; v_started timestamptz := clock_timestamp();
  v_open int; v_close int; v_reason text; v_origin_stop uuid; v_event_id uuid; v_passenger text;
begin
  select * into v_trip from trips where id = p_trip;
  select (value)::int into v_open from configuration where key = 'boarding.window_open_minutes';
  select (value)::int into v_close from configuration where key = 'boarding.window_close_minutes';

  select t.* into v_ticket from tickets t
   where t.qr_token_hash = encode(digest(p_credential, 'sha256'), 'hex') or upper(t.ticket_code) = upper(p_credential)
      or t.booking_id = (select id from bookings where upper(booking_reference) = upper(p_credential))
      or t.booking_id = (select b.id from bookings b join profiles p on p.id = b.rider_id where b.trip_id = p_trip and b.status = 'confirmed' and right(regexp_replace(p.phone,'\D','','g'), 9) = right(regexp_replace(p_credential,'\D','','g'), 9) and length(regexp_replace(p_credential,'\D','','g')) >= 7 limit 1)
   limit 1;

  if v_ticket.id is null then v_reason := 'No valid ticket found for this credential on this departure.';
  else
    select * into v_booking from bookings where id = v_ticket.booking_id for update;
    select rs.stop_id into v_origin_stop from route_stops rs where rs.id = v_booking.origin_route_stop_id;
    if v_trip.status in ('cancelled','completed') then v_reason := format('This trip has %s.', v_trip.status);
    elsif v_ticket.status = 'void' then v_reason := 'This ticket has been cancelled.';
    elsif v_booking.trip_id <> p_trip then v_reason := 'Ticket is for a different departure.';
    elsif v_booking.status in ('cancelled','expired','refunded') then v_reason := 'This booking is no longer valid.';
    elsif exists (select 1 from boarding_events where booking_id = v_booking.id and result <> 'rejected' and reversed_at is null) and p_override_reason is null then v_reason := 'Already boarded. A supervisor must reverse the first scan before re-boarding.';
    elsif v_booking.passenger_contribution > 0 and not exists (select 1 from payments where booking_id = v_booking.id and status = 'succeeded') then v_reason := 'Payment is not confirmed for this ticket.';
    elsif v_booking.sponsor_contribution > 0 and not exists (select 1 from sponsor_authorizations where booking_id = v_booking.id and status in ('reserved','recognized')) then v_reason := 'Sponsor authorisation is not valid for this ticket.';
    elsif now() < v_trip.scheduled_departure_at - make_interval(mins => v_open) and p_override_reason is null then v_reason := format('Boarding opens %s minutes before departure.', v_open);
    elsif now() > v_trip.scheduled_departure_at + make_interval(mins => v_close) and p_override_reason is null then v_reason := format('Boarding closed %s minutes after the scheduled departure.', v_close);
    elsif p_stop is not null and v_origin_stop <> p_stop and p_override_reason is null then v_reason := 'This ticket boards at a different stop.';
    end if;
  end if;

  if v_reason is not null then
    insert into boarding_events (trip_id, stop_id, validation_method, validator_user_id, device_id, result, rejection_reason, duration_ms)
    values (p_trip, p_stop, 'qr_scan', auth.uid(), p_device, 'rejected', v_reason, extract(milliseconds from clock_timestamp() - v_started)::int);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  insert into boarding_events (booking_id, ticket_id, trip_id, stop_id, validation_method, validator_user_id, device_id, result, override_reason, duration_ms)
  values (v_booking.id, v_ticket.id, p_trip, p_stop, case when p_override_reason is not null then 'supervisor_override' else 'qr_scan' end, auth.uid(), p_device,
    case when p_override_reason is not null then 'override' else 'valid' end, p_override_reason, extract(milliseconds from clock_timestamp() - v_started)::int)
  returning id into v_event_id;
  update bookings set status = 'boarded' where id = v_booking.id;
  update tickets set status = 'used' where id = v_ticket.id;
  update sponsor_authorizations set status = 'recognized', amount_recognized = amount_reserved, recognized_at = now() where booking_id = v_booking.id and status = 'reserved';
  if p_override_reason is not null then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, summary, severity)
    values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()),'system'), 'boarding.override', 'booking', v_booking.id::text, 'Override boarding — ' || p_override_reason, 'sensitive');
  end if;
  select full_name into v_passenger from profiles where id = v_booking.rider_id;
  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'passenger_name', v_passenger, 'booking_reference', v_booking.booking_reference, 'override', p_override_reason is not null);
end $$;

-- ---------------------------------------------------------------- cash sessions
create or replace function close_cash_session(p_session uuid, p_declared int, p_explanation text)
returns cash_sessions language plpgsql security definer as $$
declare v_s cash_sessions%rowtype; v_variance int; v_tolerance int;
begin
  select * into v_s from cash_sessions where id = p_session and agent_id = auth.uid() for update;
  if v_s.id is null or v_s.status not in ('open','returned') then raise exception 'session_not_open'; end if;
  v_variance := p_declared - (v_s.opening_float + v_s.expected_cash);
  if v_variance <> 0 and coalesce(trim(p_explanation),'') = '' then raise exception 'explanation_required'; end if;
  select (value)::int into v_tolerance from configuration where key = 'cash.variance_tolerance_naira';
  update cash_sessions set closed_at = now(), declared_cash = p_declared, variance = v_variance, variance_explanation = nullif(trim(p_explanation),''),
    status = case when abs(v_variance) > v_tolerance then 'under_review' else 'submitted' end where id = p_session returning * into v_s;
  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, summary, severity)
  values (auth.uid(), coalesce((select full_name from profiles where id = auth.uid()),'system'), 'cash_session.closed', 'cash_session', p_session::text,
    format('Declared %s against %s expected — variance %s', p_declared, v_s.opening_float + v_s.expected_cash, v_variance), case when v_variance = 0 then 'info' else 'sensitive' end);
  return v_s;
end $$;

-- ---------------------------------------------------------------- trips
create or replace function generate_trips_from_schedule(p_template uuid, p_date date)
returns jsonb language plpgsql security definer as $$
declare v_t schedule_templates%rowtype; v_cal service_calendars%rowtype; v_dir route_directions%rowtype; v_route routes%rowtype; v_type vehicle_types%rowtype;
        v_time time; v_created int := 0; v_skipped int := 0; v_trip uuid; v_last int; v_idx int := 0;
begin
  select * into v_t from schedule_templates where id = p_template and active;
  if v_t.id is null then raise exception 'template_not_found'; end if;
  select * into v_cal from service_calendars where id = v_t.service_calendar_id;
  if not ((extract(dow from p_date)::int = any(v_cal.days_of_week) and not (p_date = any(v_cal.excluded_dates))) or p_date = any(v_cal.added_dates)) then raise exception 'no_service'; end if;
  select * into v_dir from route_directions where id = v_t.route_direction_id;
  select * into v_route from routes where id = v_dir.route_id;
  if v_route.status <> 'published' then raise exception 'route_not_published'; end if;
  select * into v_type from vehicle_types where id = v_t.default_vehicle_type_id;
  select max(scheduled_offset_minutes) into v_last from route_stops where route_direction_id = v_dir.id;

  for v_time in
    select unnest(coalesce(v_t.explicit_departure_times, array(select (v_t.start_time + make_interval(mins => g))::time from generate_series(0, extract(epoch from (v_t.end_time - v_t.start_time))::int / 60, v_t.headway_minutes) g)))
  loop
    v_idx := v_idx + 1;
    if exists (select 1 from trips where route_direction_id = v_dir.id and scheduled_departure_at = (p_date + v_time) at time zone 'Africa/Lagos') then v_skipped := v_skipped + 1; continue; end if;
    insert into trips (trip_code, route_direction_id, route_geometry_version_id, service_date, scheduled_departure_at, scheduled_arrival_at, origin_hub_id, destination_hub_id, legal_capacity_snapshot, bookable_capacity_snapshot)
    values (format('%s-%s-%s', v_route.code, to_char(p_date,'MMDD'), lpad(v_idx::text,2,'0')), v_dir.id, v_route.current_geometry_version_id, p_date,
      (p_date + v_time) at time zone 'Africa/Lagos', (p_date + v_time) at time zone 'Africa/Lagos' + make_interval(mins => coalesce(v_last,60)),
      (select hub_id from stops where id = v_dir.origin_stop_id), (select hub_id from stops where id = v_dir.destination_stop_id), v_type.legal_capacity, v_type.default_bookable_capacity)
    returning id into v_trip;
    insert into trip_segment_inventory (trip_id, route_segment_id, capacity)
      select v_trip, rs.id, v_type.default_bookable_capacity from route_segments rs where rs.route_direction_id = v_dir.id;
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end $$;

create or replace function start_trip(p_trip uuid, p_override_reason text default null)
returns trips language plpgsql security definer as $$
declare v_trip trips%rowtype;
begin
  select * into v_trip from trips where id = p_trip for update;
  if v_trip.vehicle_id is null or v_trip.driver_id is null then raise exception 'not_assigned'; end if;
  if v_trip.status not in ('assigned','boarding','held') then raise exception 'invalid_transition: % -> departed', v_trip.status; end if;
  if p_override_reason is null and not exists (select 1 from vehicle_inspections where vehicle_id = v_trip.vehicle_id and passed and submitted_at::date = v_trip.service_date) then raise exception 'inspection_required'; end if;
  update trips set status = 'departed', actual_departure_at = now(),
    current_route_stop_id = (select id from route_stops where route_direction_id = v_trip.route_direction_id order by sequence limit 1) where id = p_trip returning * into v_trip;
  update vehicles set status = 'operating' where id = v_trip.vehicle_id;
  insert into trip_events (trip_id, type, actor_id, metadata) values (p_trip, 'departed', auth.uid(), jsonb_build_object('override', p_override_reason));
  return v_trip;
end $$;

-- ---------------------------------------------------------------- telemetry
create or replace function ingest_vehicle_location(p_vehicle uuid, p_trip uuid, p_lat double precision, p_lon double precision, p_heading int, p_speed numeric, p_accuracy numeric, p_recorded_at timestamptz, p_source text)
returns void language sql security definer as $$
  insert into vehicle_locations (vehicle_id, trip_id, location, heading, speed_kph, accuracy_m, recorded_at, source)
  values (p_vehicle, p_trip, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_heading, p_speed, p_accuracy, p_recorded_at, p_source)
$$;

create or replace view latest_vehicle_locations as
  select distinct on (vehicle_id) * from vehicle_locations order by vehicle_id, recorded_at desc;

-- ---------------------------------------------------------------- economics
create or replace function calculate_trip_economics(p_trip uuid) returns jsonb language sql stable security definer as $$
  with b as (select * from bookings where trip_id = p_trip and status not in ('cancelled','expired','refunded')),
       pax as (select count(*) n from boarding_events where trip_id = p_trip and result <> 'rejected' and reversed_at is null),
       rev as (select coalesce(sum(p.amount),0) passenger from payments p join b on b.id = p.booking_id where p.status = 'succeeded'),
       sp as (select coalesce(sum(amount_recognized),0) recognized, coalesce(sum(case when status='reserved' then amount_reserved end),0) reserved from sponsor_authorizations s join b on b.id = s.booking_id),
       cost as (select coalesce(sum(amount),0) total, coalesce(jsonb_object_agg(category, amt),'{}') breakdown from (select category, sum(amount) amt from cost_entries where trip_id = p_trip and approval_status = 'approved' group by category) c),
       t as (select bookable_capacity_snapshot cap from trips where id = p_trip)
  select jsonb_build_object('passenger_count', pax.n, 'capacity', t.cap, 'occupancy_pct', round(100.0 * pax.n / nullif(t.cap,0), 1),
    'passenger_revenue', rev.passenger, 'sponsor_revenue_recognized', sp.recognized, 'sponsor_revenue_reserved', sp.reserved,
    'gross_trip_revenue', rev.passenger + sp.recognized, 'direct_trip_cost', cost.total, 'cost_breakdown', cost.breakdown,
    'contribution_margin', rev.passenger + sp.recognized - cost.total)
  from pax, rev, sp, cost, t
$$;
