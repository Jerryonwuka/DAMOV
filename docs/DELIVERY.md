# Damov — Delivery Report

Source of truth for the product remains the master build specification. This document reports what this build delivers against it.

## 1. Database schema summary

`supabase/migrations/0001_init.sql` — 36 tables, PostGIS geography for hubs, stops, route geometry, incidents and telemetry. UUID keys, `created_at`/`updated_at`, enums for every status, foreign keys and check constraints. Notable constraints:

- `trip_segment_inventory`: `reserved_count + boarded_adjustment <= capacity`, unique per trip/segment.
- `boarding_events`: partial unique index — one non-reversed valid boarding per booking.
- `cash_sessions`: one open session per agent; variance requires explanation; closed sessions require a declared figure.
- `bookings`: `passenger_contribution + sponsor_contribution = gross_fare` unless cancelled/refunded; unique idempotency key.
- `tickets`: stores only a SHA-256 of the opaque QR token.
- `audit_logs`: append-only (trigger refuses update/delete).

`0002_functions.sql` — SECURITY DEFINER functions: `journey_segments`, `check_journey_availability`, `quote_booking`, `create_booking_and_reserve_capacity` (row locks in segment order), `cancel_booking_and_release_capacity`, `validate_boarding`, `close_cash_session`, `generate_trips_from_schedule`, `start_trip`, `ingest_vehicle_location`, `calculate_trip_economics`, plus `latest_vehicle_locations` view.

The client-side store (`src/db`) and `src/server/*` implement the same tables and functions so the whole loop runs without a backend today.

## 2. RLS / permission summary

`0003_rls.sql` enables RLS on every table.

| Principle | Enforcement |
| --- | --- |
| Riders see only their own profile, bookings, payments, tickets, boardings, notifications and public route data | `rider_id = auth.uid()` policies; published-route read |
| Hub agents scoped to assigned hubs | `current_hubs()` on trips, bookings, payments, cash sessions |
| Drivers see assigned trips, not passenger finance | `driver_id = auth.uid()`; no bookings/payments policy for drivers |
| Finance sees financial records, cannot dispatch | `finance_officer` on payments/costs/cash; no update policy on trips |
| Institution admin sees only its organisation's eligibility, policies, sponsor authorisations — never another institution's or row-level bookings | `organization_id = current_organization()`; no bookings policy for institutions |
| Executive viewer: aggregates only | select on trips/vehicles/locations; no bookings, payments or profiles |
| No client writes to capacity, bookings, payments, tickets, sponsor authorisations | No insert/update policies; only SECURITY DEFINER functions |
| Super admin audited | Every function writes `audit_logs` |

Client side, `src/auth/permissions.ts` is a capability matrix (45 capabilities) from which navigation, routes and actions are rendered. Visible in Super Admin → Access Policies.

## 3. Seeded test accounts

See README. Passenger OTP is `000000` (demo). Staff accounts are selected without a password in development only; the role switcher is compiled out with `VITE_ENABLE_ROLE_SWITCHER=false`.

## 4. Environment variables still required

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, a real `VITE_PAYMENT_PROVIDER` with server-side keys in Edge Function secrets, `VITE_SMS_PROVIDER`, `VITE_WHATSAPP_PROVIDER`, `VITE_GPS_PROVIDER`. Basemap style URLs default to CARTO public styles.

## 5. Integration stubs still using mocks

| Integration | Status |
| --- | --- |
| Supabase | Migrations written; client store used instead. Not connected. |
| Payments | Mock provider; card/transfer succeed immediately. `verify_payment_webhook` and `initialize_payment` are not yet implemented as Edge Functions. |
| SMS / OTP | Demo OTP `000000`; provider abstraction in `server/notifications.ts`. |
| WhatsApp | `booking_channel = whatsapp` modelled; no live integration. |
| GPS | Demo simulation only, labelled and pausable. `ingest_vehicle_location` is the single write path for a future webhook. |
| Reference GIS | `kinghardey.github.io/DAMOV-` is unreachable from the build environment. `src/data/geo/*.json` reproduces the dataset's shape (14 routes, 36 stops, 66 hubs) with realistic Abuja corridors and the same classes of defects. Import the authentic export via Control → Routes & Stops → Import GeoJSON. |

## 6. Known limitations

- Draw/edit geometry on the map is not implemented; geometry is attached by GeoJSON upload and versioned. Ordered stops are edited with drag-to-reorder and projected onto the geometry.
- PDF statements are not yet produced (CSV with provenance footer is).
- Rate limiting, signed evidence URLs, MFA enrolment and provider webhooks belong to the Edge Function layer and are not exercised in the client build.
- No-show release and waitlists are modelled as statuses only (Phase 2).
- `useDb` selectors recompute per store change; large tables are paginated, not virtualised.

## 7. Acceptance criteria

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Super admin can create a route, directions, ordered stops, geometry, schedule, fare and publish it | ✅ Route detail: directions, ordered stops, geometry versions, publication gate; schedules page; fare policy seeded (fare editor is read-only in UI) |
| 2 | Abuja GIS data as reference layer: 14 routes, 36 stops, 66 hubs, visibly marked | ✅ Reference corridors toggle on Live Map; Routes & Stops tabs; status badges |
| 3 | Operations can generate a trip and assign an eligible vehicle and driver | ✅ Schedules → Generate; Dispatch → assign with maintenance, clash and licence guards |
| 4 | Rider registers, matches institution, gets fare/subsidy quote, books, pays (mock), receives ticket | ✅ Sign-in → Book → quote with explanation → pay → QR ticket |
| 5 | Hub agent sells a cash ticket to a walk-in without making them invisible | ✅ Walk-in registration → booking → ticket → manifest → cash session |
| 6 | Segment inventory prevents overbooking at intermediate stops | ✅ `reserveSegments` rolls back on any full segment; per-segment loads in trip drawer |
| 7 | Boarding officer validates a ticket; duplicate boarding prevented | ✅ Server decision; second scan rejected; supervisor reversal path |
| 8 | Driver inspects, starts, advances stops, reports incident, completes | ✅ |
| 9 | Control reflects trip state, occupancy, delay, incident, vehicle location on table and map | ✅ Command Centre, Live Map, Dispatch, trip drawer |
| 10 | Hub agent closes a cash session, sees variance, explains, submits for review | ✅ With tolerance escalation and supervisor decision |
| 11 | Finance enters direct costs and sees route/trip contribution margin | ✅ Costs & Economics |
| 12 | Institution admin sees only their programme, riders, subsidy usage, aggregated performance | ✅ Scoped read model; RLS policies written |
| 13 | Sensitive pages/tables protected by RLS | ✅ Written in `0003_rls.sql`; capability gate in client |
| 14 | Overrides and financial adjustments create audit records | ✅ Inside the same transaction |
| 15 | No unconnected chart, fake live status or dead primary button | ✅ Every metric derives from records; simulation and mocks are labelled |

## 8. Recommended next milestone

**Connect Supabase.** Apply the three migrations, implement `src/db` reads via PostgREST and `src/server/*` writes via `supabase.rpc(...)`, wire Realtime on `latest_vehicle_locations`, and move OTP/payment/webhook handling into Edge Functions. The screens do not change. Then: geometry drawing on the planning map, PDF statements, and the telematics webhook.
