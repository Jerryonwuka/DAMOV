<p align="center">
  <img src="public/brand/damov-mark.svg" width="72" alt="Damov" />
</p>

<h1 align="center">Damov</h1>

<p align="center"><strong>A controlled transport operating system for scheduled bus-shuttle networks.</strong><br/>
Guaranteed capacity · predictable scheduled services · every passenger and naira reconciled · route economics proven.</p>

---

## The operating loop

```
Configure → Register → Ticket → Board → Move → Reconcile → Measure
```

One shared platform, six role-specific surfaces, one source of truth:

| Surface | For | Entry |
| --- | --- | --- |
| **Rider Lite** | Passengers and eligible civil servants | `/rider` |
| **Hub** | Terminal and ticketing officers | `/hub` |
| **Driver** | Drivers (mobile-first) | `/driver` |
| **Control** | Dispatch, operations, finance, supervisors, leadership | `/control` |
| **Institutional** | Sponsoring ministries, companies, schools | `/institution` |
| **Super Admin** | System configuration and support | `/admin` |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run typecheck  # strict TypeScript across the whole app
```

Open the app and pick a seeded account from the **Staff** tab, or sign in as a passenger with any listed number and the demo OTP `000000`. The **Demo role switcher** at the bottom of the navigation rail jumps between every role without signing out. **Reset demo data** (↻ in the top bar) reseeds a fresh operating day.

### Seeded accounts

| Role | Name | Surface | What to try |
| --- | --- | --- | --- |
| Passenger (FMoT-sponsored) | Grace Adeyinka · 0807 100 0000 | Rider Lite | Book Mararaba → CBD, see the ₦300 ministry co-pay, open the QR ticket |
| Hub agent | Chiamaka Nwosu | Hub · Mararaba | Sell a cash ticket, validate boarding, close the cash session |
| Hub agent | Yakubu Idris | Hub · CBD | — |
| Driver | Samuel Ojo | Driver | Inspect DMV-001, start the trip, advance stops, complete |
| Dispatcher | Ibrahim Sani | Control | Assign vehicles and drivers on the dispatch board |
| Operations manager | Ngozi Eze | Control | Publish a route, generate trips, edit configuration |
| Finance officer | Blessing Okafor | Control | Revenue, cash variance review, cost entry |
| Supervisor | Musa Danjuma | Hub + Control | Boarding overrides, cash-session approval |
| Institution admin | Amina Bello | Institutional | FMoT programme, eligibility import, subsidy policy |
| Executive viewer | Dr. Femi Adeyemi | Control | Aggregate performance only |
| Super admin | Tunde Alabi | Super Admin | Organisations, users, access matrix, audit |

## What is real in this build

Everything on screen is computed from the same records the write paths produce. There are no display-only numbers.

- **Segment inventory engine** — `src/server/capacity.ts`. A trip holds one inventory row per consecutive stop pair. A journey reserves a seat on every segment it traverses, atomically; if any is full the whole booking rolls back and the UI recommends the next departure. A Mararaba → Nyanya passenger frees their seat for Nyanya → CBD.
- **Fare and subsidy evaluation** — `src/server/fares.ts`. Server-side, versioned policies, snapshotted onto the booking, with a human-readable explanation (`Eligible: FMoT covers ₦300; passenger pays ₦250.` / `Not eligible: daily sponsored-trip limit reached.`).
- **Atomic booking** — `src/server/bookings.ts`. Quote → reserve segments → booking → payment/sponsor liability → ticket, in one transaction with an idempotency key.
- **Boarding validation** — `src/server/boarding.ts`. Ticket, trip, origin stop, time window, payment, subsidy, cancellation and prior-boarding checks; every attempt recorded; supervisor override and reversal with reason and audit.
- **Cash reconciliation** — `src/server/cash.ts`. Expected cash is computed from the session's own transactions; a variance requires an explanation; above tolerance it escalates to a supervisor; a session can never close silently.
- **Trip lifecycle** — `src/server/trips.ts`. Legal state machine, inspection gate before departure, licence-expiry guard on assignment with visible policy exception, idempotent trip generation from schedule templates.
- **Economics** — `src/server/economics.ts`. `contribution_margin = gross_trip_revenue − direct_trip_cost`, per trip, bus and route, with cost/revenue per passenger and per km. Never labelled net profit.
- **GIS import and data-quality gate** — `src/server/gis.ts`. Imported corridors land as `reference`; placeholder names, missing codes, duplicate coordinates, unsnapped stops are flagged, not normalised away. Publication is blocked until directions, ordered stops, segments, geometry and a fare policy exist.
- **Audit trail** — every override, reversal, cash decision, policy, role and configuration change is written inside the same transaction as the action.

## Architecture

```
src/
  lib/types.ts            Domain model — mirrors supabase/migrations one-for-one
  db/                     Transactional in-browser store (IndexedDB) with the same shape as Postgres
  server/                 Business functions — the Edge Function / RPC contracts
  data/seed.ts            Coherent demo operating day; data/geo/ reference GIS dataset
  auth/                   Capability-based permissions; navigation rendered from them
  components/ui           Design system (Radix + Tailwind + Framer Motion)
  components/map          MapLibre shell shared by operations, hub, rider and planning views
  features/<surface>/     Screens per surface
supabase/migrations/      Schema, constraints, RPC functions, row-level security
```

**Data layer.** The prototype runs against `src/db/store.ts`, a transactional store with the exact table shapes of `supabase/migrations/0001_init.sql`. Every business rule in `src/server/*` has its Postgres twin in `0002_functions.sql`; RLS lives in `0003_rls.sql`. Moving to Supabase replaces the store's read/write calls with PostgREST and RPC — the screens, types and rules do not change.

**Map.** `DamovMap` is one MapLibre component with five sources (routes, stops, hubs, vehicles, incidents), clustering at low zoom, an accessible legend, brand-green for the selected/active service and distinct colours for comparison, URL-state filters on the Live Map, and a neutral fallback background when the basemap cannot load. Vehicle positions come from a clearly labelled, pausable **Demo simulation**; a stale position is never shown as live.

## Design system

Brand primitives from the brand sheet, as Tailwind tokens (`tailwind.config.ts`):

| Token | Value | Use |
| --- | --- | --- |
| Damov green | `#6FBF48` | Primary action, active service, live |
| Deep operational green | `#0E392C` | Navigation rail, operational chrome |
| Signal amber | `#E9B10A` | Warnings, targets, pending |
| Signal orange | `#D9522A` | Critical attention only |
| Mist | `#CFD4D2` | Dividers, muted surfaces |

Inter throughout; tabular numerals on every compared figure; status carried by colour *and* text; light and dark themes; reduced-motion respected. Micro-interactions are purposeful — rolling metrics, animated nav indicator, spring-in boarding decisions, staggered lists, drag-to-reorder stops — never decorative.

## Environment

Copy `.env.example` to `.env`. No secret ever lives in frontend code.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Production data layer |
| `VITE_MAP_STYLE_DARK`, `VITE_MAP_STYLE_LIGHT` | MapLibre basemap style URLs |
| `VITE_PAYMENT_PROVIDER` | `mock` \| `paystack` \| `flutterwave` |
| `VITE_SMS_PROVIDER`, `VITE_WHATSAPP_PROVIDER` | Messaging providers |
| `VITE_GPS_PROVIDER` | `simulator` \| telematics webhook |
| `VITE_ENABLE_ROLE_SWITCHER`, `VITE_ENABLE_TRIP_SIMULATOR` | **Must be `false` in production** |

See [`docs/DELIVERY.md`](docs/DELIVERY.md) for the schema summary, RLS summary, integration stubs, known limitations, the acceptance-criteria checklist and the recommended next milestone.
