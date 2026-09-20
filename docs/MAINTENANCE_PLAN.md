# Cirkus — Maintenance plan: Part-ML owner-declared AMP tracker

*Drafted 20 September 2026. For approval before code. A programme of four
phases (M1–M4); M1 is planned to the migration and file level here, M2–M4
to the page level and get their own `PHASE_NN_PLAN.md` when they start.
Numbering is left to scheduling — these can be interleaved with 12–14 in
the handoff.*

Cirkus already knows the aircraft, every flight, the Tacho readings and
the landings. The tracker sits on top of that: it holds the aircraft
maintenance programme (AMP) the owner declares under Part-ML, computes
what is due from the flight log, records maintenance releases, defects,
ADs/SBs and airworthiness reviews, and produces the package the ARC
reviewer asks for. It is a laptop/desktop tool for the technical
manager; the two pilot-facing pieces (airworthiness status, report a
defect) are the exception and work on the phone.

The data-model sketch (`part-ml-amp-tracker-design.md`, 20 Sept) is the
basis; this document adapts it to Cirkus and cuts what Cirkus already
provides.

## What Cirkus gives us, and what it doesn't

| Need | Cirkus today | Consequence |
|---|---|---|
| Aircraft identity | `aircraft` (tail, type, seats, billing basis, `records_tacho`) | Add a 1:1 profile table; no change to Fleet |
| Airframe hours | `flight_log_entries.tacho_start/end` (required on OH-KML), `block_hours`, `takeoff_at/landing_at` | Per aircraft choose which figure feeds the AMP; sum from a baseline |
| Landings | `day_landings + night_landings` on every flight | Cycles for free |
| Co-owners | `aircraft_owners` | Pilot-owner maintenance eligibility (see open question 2) |
| Roles | `admin`, `pilot` | Add a technical-manager flag on users |
| Audit | `user_actions`, append-only, every POST | Reuse via `audit()` — no separate hash-chained log |
| Documents | `receipt_images` (bytea, downscaled) | Same pattern for maintenance documents, PDFs stored as-is |
| Time | `time.ts`; reservations Helsinki, logbook UTC | Maintenance uses calendar **dates**; one new helper `helsinkiToday()` |
| Unit tests | none (Playwright only) | The due calculator is a pure function and needs unit tests — add Vitest |

Flights are editable until billed, so hours can change retroactively.
That is fine because nothing stores "next due": it is always computed.
Release counters on a work order are what the mechanic read off the
meter and are stored as entered, never derived.

## Decisions (proposed)

1. **Table prefix `mx_`** for the fourteen maintenance tables, so they
   read as one group in `db.ts` and in `psql`. Everything else follows the
   existing conventions (uuid ids, `created_at`/`updated_at`, enums by
   migration, generated columns where Postgres can own the arithmetic).
2. **Hours source per aircraft**: `tacho` (OH-KML), `block` or `airborne`.
   Airframe total = `baseline_hours` + Σ over flights after
   `baseline_at` of the chosen figure + Σ `mx_usage_adjustments`.
   Landings the same way. The adjustment table covers ferry flights by a
   mechanic, hours before Cirkus existed, and meter replacements.
3. **Next due is computed, never stored.** One pure module
   `src/lib/server/maintenance/due.ts` with no database imports, unit
   tested. Pages call it with rows they loaded.
4. **A task is done only because a released work order says so.** Day-one
   history goes in through a `baseline` work order (kind
   `setup_baseline`) released by the technical manager with the logbook
   scan attached, visibly different from a real release.
5. **Released work orders are immutable**, enforced by a Postgres trigger
   (the first trigger in the schema — a deliberate choice, because the
   app's promise to the ARC reviewer should not depend on application
   code alone). Corrections are a new work order that references the old.
6. **Tolerance is never available on ALS items or ADs.** Enforced by a
   check constraint on `mx_tasks` *and* in `due.ts`.
7. **Technical manager** is a boolean on `users`, set by admins on
   *Accounts*. Admins and technical managers write maintenance data; every
   approved pilot reads the status and can report a defect; a pilot-owner
   release is possible for users in `aircraft_owners` who have a licence
   number on file (open question 2 is whether that is legally enough).
8. **Documents live in Postgres** as `bytea`, like receipts, 10 MB cap,
   SHA-256 stored, images normalised with `sharp`, PDFs stored as-is.
   Azure Blob is the migration path if the table ever outgrows the
   server; for one aircraft it will not.
9. **Desktop first.** Maintenance pages use `.table-wrap` tables and
   multi-column forms sized for 1440 px; below 900 px they still render
   but are not tuned, and the phone tab bar does not link to them. The
   status card and the defect form are phone-first.
10. **No AD/SB feed.** EASA and FAA publish by e-mail/RSS; the technical
    manager enters a directive by hand into the register. Automating this
    is out of scope for all four phases.

## The process (after M2)

Fly → log the flight (as today) → counters move → *Maintenance* shows
what is due and when → technical manager opens a work order → shop or
pilot-owner does the work → work order released with the meter readings,
CRS and Form 1s attached → compliance recorded, next due recomputed →
yearly: ARC package printed, review done, ARC recorded.

Pilots see one thing: an airworthiness chip on *Home* and *Book*
("Airworthy · 100 h in 14.2 h", or "Grounded — see Maintenance"), and a
*Report a defect* button.

---

## Phase M1 — programme, counters, what's due

The valuable slice on its own: OH-KML's programme in the system, hours
and landings from the flight log, and a page that says what is due
when. No work orders yet beyond the baseline.

### Migration `00NN_maintenance_core.sql`

```sql
-- roles
alter table users
	add column technical_manager boolean not null default false,
	add column licence_no text;

create type mx_hours_source as enum ('tacho', 'block', 'airborne');
create type mx_amp_basis as enum ('ica', 'mip');

-- one row per aircraft that is tracked; Fleet stays as it is
create table mx_aircraft (
	aircraft_id uuid primary key references aircraft (id) on delete cascade,
	msn text,
	year_built integer,
	mtow_kg integer,
	hours_source mx_hours_source not null default 'tacho',
	-- airframe totals on the day tracking starts; everything after is summed from the log
	baseline_at date not null,
	baseline_hours numeric(8, 1) not null,
	baseline_landings integer not null default 0,
	amp_basis mx_amp_basis not null default 'ica',
	-- "Cirrus AMM 12137-001 rev X ch. 4 & 5; Continental M-0; Hartzell 202A"
	amp_reference text,
	amp_declared_at date,
	amp_declared_by uuid references users (id),
	amp_reviewed_at date,
	-- warning thresholds for the due list
	warn_hours numeric(5, 1) not null default 10,
	warn_days integer not null default 30,
	warn_landings integer not null default 25,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- hours/landings not in the flight log: ferry by the shop, pre-Cirkus, meter swap
create table mx_usage_adjustments (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	on_date date not null,
	hours_delta numeric(7, 1) not null default 0,
	landings_delta integer not null default 0,
	reason text not null,
	entered_by uuid not null references users (id),
	-- corrections supersede, never edit
	supersedes_id uuid references mx_usage_adjustments (id),
	created_at timestamptz not null default now()
);
create index mx_usage_adjustments_aircraft_idx on mx_usage_adjustments (aircraft_id, on_date);

create type mx_task_source as enum ('ica', 'mip', 'als', 'ad', 'sb', 'owner');
create type mx_anchor_kind as enum ('last_compliance', 'install', 'manufacture', 'fixed');
create type mx_reset_rule as enum ('from_actual', 'from_original');

create table mx_tasks (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	code text not null,                     -- INSP-100H, CAPS-REPACK, AD-2024-0123
	title text not null,
	source mx_task_source not null,
	source_ref text,                        -- AMM 05-20 item 12
	-- component_id is added in M2; M1 tasks are airframe-level
	interval_hours numeric(7, 1),
	interval_months integer,
	interval_landings integer,
	one_time boolean not null default false,
	anchor_kind mx_anchor_kind not null default 'last_compliance',
	anchor_date date,
	anchor_hours numeric(8, 1),
	anchor_landings integer,
	tolerance_hours numeric(5, 1) not null default 0,
	tolerance_days integer not null default 0,
	tolerance_landings integer not null default 0,
	reset_rule mx_reset_rule not null default 'from_actual',
	pilot_owner_allowed boolean not null default false,  -- Part-ML Appendix II
	active boolean not null default true,
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint mx_tasks_code_unique unique (aircraft_id, code),
	constraint mx_tasks_has_interval check (one_time or interval_hours is not null or interval_months is not null or interval_landings is not null),
	constraint mx_tasks_fixed_anchor check (anchor_kind <> 'fixed' or anchor_date is not null or anchor_hours is not null or anchor_landings is not null),
	-- decision 6: ALS items and ADs get no tolerance, ever
	constraint mx_tasks_no_tolerance_on_limits check (
		source not in ('als', 'ad') or (tolerance_hours = 0 and tolerance_days = 0 and tolerance_landings = 0))
);
create index mx_tasks_aircraft_idx on mx_tasks (aircraft_id) where active;

create type mx_work_order_kind as enum ('setup_baseline', 'scheduled', 'unscheduled', 'pilot_owner', 'defect');
create type mx_work_order_status as enum ('open', 'released');

-- M1 uses this only for the baseline; M2 makes it the real thing
create table mx_work_orders (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	kind mx_work_order_kind not null,
	status mx_work_order_status not null default 'open',
	title text not null,
	opened_at date not null,
	opened_by uuid not null references users (id),
	-- everything below is set at release and frozen by the trigger
	released_at date,
	released_hours numeric(8, 1),
	released_landings integer,
	performed_by_org text,
	crs_name text,
	crs_licence text,
	crs_text text,
	release_hash text,
	released_by uuid references users (id),
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint mx_work_orders_release_complete check (
		status <> 'released' or (released_at is not null and released_hours is not null and released_landings is not null and crs_name is not null))
);
create index mx_work_orders_aircraft_idx on mx_work_orders (aircraft_id, released_at desc);

create table mx_work_order_items (
	id uuid primary key default gen_random_uuid(),
	work_order_id uuid not null references mx_work_orders (id) on delete cascade,
	task_id uuid references mx_tasks (id),
	description text not null,
	reference_data text,
	-- for the baseline: when it was last done, as read from the logbook
	done_on date,
	done_hours numeric(8, 1),
	done_landings integer,
	position integer not null default 0
);
create index mx_work_order_items_wo_idx on mx_work_order_items (work_order_id);
create index mx_work_order_items_task_idx on mx_work_order_items (task_id);

-- decision 5: a released work order and its items cannot change
create function mx_refuse_change_when_released() returns trigger language plpgsql as $$
begin
	raise exception 'work order % is released and cannot be changed', coalesce(old.id, old.work_order_id);
end $$;
create trigger mx_work_orders_immutable
	before update or delete on mx_work_orders for each row
	when (old.status = 'released')
	execute function mx_refuse_change_when_released();
create trigger mx_work_order_items_immutable
	before update or delete on mx_work_order_items for each row
	when (exists (select 1 from mx_work_orders w where w.id = old.work_order_id and w.status = 'released'))
	execute function mx_refuse_change_when_released();
-- (insert into a released order's items is refused by a similar before-insert trigger)
```

Task compliance is *derived*: an item on a released work order with a
`task_id` is a compliance at `(released_at, released_hours,
released_landings)` — or, for the baseline order, at the item's own
`done_on/done_hours/done_landings`. A view `mx_task_compliance` makes
that one query; no separate table to keep in sync.

`aircraft.type` is not touched; Fleet stays admin-only and unchanged.

### `src/lib/server/maintenance/`

- `counters.ts` — `aircraftCounters(aircraftId)`: baseline + flights
  after baseline (by `hours_source`) + adjustments → `{ hours, landings,
  asOf, hoursPerDay, landingsPerHour }`. Utilisation from the trailing
  365 days, falling back to 90 if the aircraft has been in Cirkus for
  less than a year. One SQL statement with `sum(...) filter (where ...)`
  in the style of `home/+page.server.ts`.
- `due.ts` — the pure calculator from the design doc, TypeScript, no
  imports from `$lib/server/db`. `computeDue(task, anchor, counters,
  policy)` → `{ status: 'ok' | 'due_soon' | 'in_tolerance' | 'overdue' |
  'complete' | 'undefined', controlling, limits[], projectedDate }`.
  `addMonthsClamped`, `whicheverFirst`. Also `aircraftStatus(dues,
  defects, arc)` → `{ state: 'airworthy' | 'warn' | 'grounded', reasons[]
  }` (defects and ARC arrive in M2/M3; M1 passes empty).
- `programme.ts` — load tasks with their latest compliance (the view),
  run `computeDue` for each, sort by projected date. Used by every page
  that shows a due list.
- `time.ts` gains `helsinkiToday(): string` (YYYY-MM-DD) and
  `addMonthsClamped` lives in `due.ts` because it is date arithmetic, not
  a time-zone conversion.

### Pages

Route group `src/routes/(app)/(maintenance)/maintenance/`, with a
`+layout.server.ts` that admits `admin` or `technical_manager` (403
otherwise, as `(admin)` does). Sidebar: a *Maintenance* label with
*Overview* under it, shown to those users; dark sidebar like admin pages.

| Route | What |
|---|---|
| `/maintenance` | one card per tracked aircraft: state chip, hours and landings as of today, next five due items, *Set up tracking* for an aircraft without a profile |
| `/maintenance/[aircraft]` | dashboard: counters and utilisation, the full due list (code, title, controlling limit, remaining, projected date, status pill), reasons if not airworthy |
| `/maintenance/[aircraft]/programme` | profile (hours source, baseline, AMP basis and reference, declaration date, thresholds); tasks table with add/edit/deactivate; *Import tasks from CSV* |
| `/maintenance/[aircraft]/programme/tasks/[id]` | edit one task (the form has fifteen fields; inline editing in a table would not survive the Svelte 5 `bind:value` rule) |
| `/maintenance/[aircraft]/usage` | counters reconciliation: flights since baseline, adjustments list, add adjustment; the difference between Cirkus hours and the last release reading |
| `/maintenance/[aircraft]/baseline` | the baseline work order: one row per task with "last done on / at hours / at landings", logbook scan attached (M3 adds documents; M1 accepts a free-text reference), *Release baseline* |

Status pills reuse `.status` and `.chip` (`teal` ok, `amber` due soon /
in tolerance, `danger` overdue). Icons: `wrench` exists; add `gauge`
and `clipboard` to `Icon.svelte`.

*Accounts* gains a *Technical manager* checkbox and a *Licence no.*
field. *Home* is unchanged in M1.

### CSV import of tasks

A Cirrus SR20 programme is 50–80 rows. Typing them through a form is
the kind of thing that makes a tool go unused, so M1 includes a CSV
upload on the programme page: columns = the `mx_tasks` fields, header
row required, one error report per row, all-or-nothing in a
transaction. A template CSV is downloadable from the page. No
manufacturer content ships with the code.

### Tests

**Unit (new: Vitest).** `due.test.ts` — the ten cases from the design
doc: hours vs calendar controlling, CAPS 120 months exact, one-time AD
becoming complete, recurring AD zero tolerance overdue at +0.1 h,
`from_original` not drifting, parked aircraft (0 h/day) calendar
controls, 29 Feb + 12 months → 28 Feb, undefined task, tolerance
rejected on ALS. `counters.test.ts` against a throwaway database is
skipped; counters are covered by the e2e flow instead.
`npm run test:unit` added; `ci.yml` runs it in the *check* job
(dropped in `_workflows-to-move` for Antti, as before).

**E2E.** `06-maintenance.spec.ts`: admin sets the pilot as technical
manager → technical manager sets up OH-KML (baseline 1000.0 h / 800
landings) → imports three tasks from CSV (100 h, 12 months, CAPS 120
months) → releases the baseline → dashboard shows the 100 h due at
1100.0 → pilot logs a flight Tacho 1000.0 → 1001.5 → dashboard shows
98.5 h remaining and a projected date → adds an adjustment of 2.0 h →
96.5. Screenshots at 1440 of every page (390 of the overview only).
`seed-test.js` wipes the `mx_*` tables.

### Docs

README: the *Maintenance* row in the table, the technical-manager role,
Vitest in *Local development*. HANDOFF §4: the `mx_` prefix, the
immutability trigger, "never store next due". Admin manual: a new
section once M2 lands (the M1 screens change in M2).

### Files

```
db/migrations/00NN_maintenance_core.sql
db/seed-test.js
src/lib/server/db.ts                                   (+7 interfaces, users columns)
src/lib/server/time.ts                                 (helsinkiToday)
src/lib/server/maintenance/{counters,due,programme,csv}.ts
src/lib/server/maintenance/due.test.ts
src/lib/components/Icon.svelte                         (gauge, clipboard)
src/routes/(app)/+layout.svelte                        (Maintenance nav)
src/routes/(app)/(maintenance)/+layout.server.ts
src/routes/(app)/(maintenance)/maintenance/+page.{server.ts,svelte}
src/routes/(app)/(maintenance)/maintenance/[aircraft]/+page.{server.ts,svelte}
src/routes/(app)/(maintenance)/maintenance/[aircraft]/programme/+page.{server.ts,svelte}
src/routes/(app)/(maintenance)/maintenance/[aircraft]/programme/tasks/[id]/+page.{server.ts,svelte}
src/routes/(app)/(maintenance)/maintenance/[aircraft]/usage/+page.{server.ts,svelte}
src/routes/(app)/(maintenance)/maintenance/[aircraft]/baseline/+page.{server.ts,svelte}
src/routes/(app)/(admin)/manage/accounts/+page.{server.ts,svelte}   (technical manager, licence)
src/lib/server/audit.ts                                (ENTITY_BY_ROUTE entries)
src/app.d.ts, vite.config.ts (vitest), package.json
tests/e2e/06-maintenance.spec.ts, tests/e2e/fixtures/tasks-sr20-sample.csv
_workflows-to-move/ci.yml
README.md, docs/HANDOFF.md
```

About three days. One migration, one branch (`phase-NN`).

---

## Phase M2 — work orders, releases, components, defects

Turns the baseline mechanism into the real maintenance record.

**Migration.** `mx_components` (part/serial, ATA chapter, life limits,
manufacture date, parent), `mx_component_installations` (history with
TSN/TSO at install, aircraft hours at install/removal, the work order
that did it), `mx_tasks.component_id` (component-level tasks use the
component's counters), `mx_work_order_items.{removed_component_id,
installed_component_id, parts_used jsonb}`, `mx_defects` (reported by
any pilot, `affects_airworthiness` decided by the technical manager,
`open → deferred → rectified`, deferral limit date/hours, rectifying
work order). Component counters while installed follow the aircraft's;
after removal they freeze — a view `mx_component_counters`.

**Release.** `POST ?/release` on a work order: meter readings and CRS
fields mandatory; `release_hash` = SHA-256 of canonical JSON of the
order, its items and (from M3) attached document hashes; in one
transaction: status → released, installations opened/closed, defects →
rectified. Hash shown on the page. The trigger from M1 then freezes it.
A warning (not a block) when `released_hours` differs from Cirkus's
computed hours by more than 1.0 h — the usual sign of an unlogged
flight or a wrong Tacho entry.

**Pilot-owner release.** Kind `pilot_owner`: only tasks with
`pilot_owner_allowed`, released by a user in `aircraft_owners` with a
`licence_no`, CRS text pre-filled with the ML.A.803 wording. Available
on the phone (oil change after a flight).

**Pages.** `/maintenance/[aircraft]/work-orders` (list, open),
`…/work-orders/[id]` (items, add from due list, release form),
`…/components` and `…/components/[id]` (installation history),
`…/defects`; pilot-facing `/defects/new` (phone-first: aircraft, text,
photo via the receipt-image path) and a *Report a defect* link on
*Home* and after saving a flight. The `aircraftStatus()` function gains
defects: an open airworthiness-affecting defect, or a deferred one past
its limit, grounds the aircraft.

**Tests.** Flow 07: open work order from the due list → release with
readings → due list resets → component swap keeps TSN → pilot reports a
defect → grounded chip → rectified on a work order → airworthy.
Immutability: the flow tries to edit a released order and expects the
error.

About three days.

## Phase M3 — directives, records, documents, declaration

**Migration.** `mx_directives` (AD/SB/SIL, issuer, reference, revision,
supersedes), `mx_directive_assessments` (per aircraft/component:
applicable one-time / recurring / not applicable / superseded, rationale,
assessed by/at, the task it spawned, review-due date),
`mx_modifications` (STC / CS-STAN / minor change / repair, approval
basis, embodied on which work order, AFM supplement), `mx_weight_balance`
(supersedes chain, report document), `mx_arc_reviews` (reviewer,
organisation, result, ARC reference, expiry, findings),
`mx_documents` (bytea, sha256, kind, linked entity) — served by a
`+server.ts` like receipt images. Documents attach to work orders,
components (Form 1), directives, mods, W&B, ARC.

**Pages.** `…/directives` (register + assessment form; "not applicable"
needs a rationale and a name, the reviewer asks for exactly that),
`…/records` (mods, W&B, ARC history, documents), `…/programme` gains
*Print declaration* — the Part-ML Appendix I owner declaration generated
from the profile, printable like an invoice. `aircraftStatus()` gains
ARC expiry, unassessed applicable directives past their compliance
time, missing W&B, component life limits.

**Tests.** Flow 08: AD entered → assessed applicable recurring → task
appears in the due list → Form 1 uploaded to a component → ARC recorded
→ status shows expiry.

About three days.

## Phase M4 — the review package and the pilot's view

- `…/arc-package`: one printable page (print CSS exists) with every
  list the reviewer wants — profile and declaration, due list with
  anchors, AD and SB status with rationale, life-limited components,
  component list with Form 1 references, mods, W&B, open/deferred
  defects, hours reconciliation (journey log vs releases), previous ARC
  and findings — with the release hashes on the last page.
- *Home* and *Book*: the airworthiness chip for the aircraft, advisory
  wording ("Maintenance status — the pre-flight check is still yours").
  Admin "needs your attention" box lists overdue and due-soon items.
- Technical manager's *needs attention* on `/maintenance`: due within
  the thresholds, directives to review, defects open more than 7 days.
- Finnish strings if Phase 13 has landed by then.
- Admin manual chapter; a short *Maintenance* chapter in the pilot
  manual (status chip, reporting a defect, pilot-owner release).

About two days.

---

## Phase M5 — the publications inbox

Automates the *fetching* of new publications and the *extraction* of
their fields; the applicability decision stays with a named person.

- **Sources.** FAA ADs from the Federal Register API (official JSON;
  query by agency + "Airworthiness Directives" + the TC holders: Cirrus,
  Continental, Hartzell, the avionics). EASA ADs from the biweekly report
  CSV (`ad.easa.europa.eu/biweekly`, every second Tuesday). Cirrus
  SB/SA/SIL from the public listing at `cirrusaircraft.com/technical-publications`
  (WordPress; the REST endpoint exposes the right fields but returned
  placeholder values when checked — a half-day spike and a look at the
  terms of use before relying on it; e-mail notification as the fallback).
- **Mechanics.** A weekly cron hitting `POST /internal/publications`
  (the Procountor sync pattern); new or revised items land in an inbox on
  M3's directives register with the PDF attached. Claude (API key as a
  Container App secret) extracts number, revision, date, applicability by
  model and serial range, compliance time, recurring interval, supersedes,
  related AD — stored as a *proposal*. A revision reopens the assessment.
- **Guard rails.** Nothing automated creates a compliance or an
  assessment. "Last successful check" is shown; more than 30 days without
  one puts the aircraft in *attention*, so a silently broken fetcher cannot
  go unnoticed.

About two to three days, after M3.

## Cross-cutting

- **Svelte 5.** Every edited input `bind:value` to `$state`; the task
  form and the release form are the two big ones — build them as
  components (`TaskForm.svelte`, `ReleaseForm.svelte`) like `FlightForm`.
- **Kysely.** Hand-typed interfaces in `db.ts`; `numeric` columns come
  back as strings — `Number()` at the edge, never in `due.ts` inputs
  (convert when loading).
- **Audit.** `ENTITY_BY_ROUTE` entries for every new route; `audit()`
  in every action with the aircraft tail and the task/work-order code
  in `details`. A release logs its hash.
- **Migrations twice on fresh Postgres 16** in CI as today. The trigger
  functions are `create or replace`-free (they run once); the CI
  idempotency check covers the "second run is a no-op" contract.
- **Dates.** Postgres `date` columns are read as `YYYY-MM-DD` strings
  (Phase 15 set the `pg` type parser); the calculator works on strings.
- **Performance.** One aircraft, under a hundred tasks, a few hundred
  flights a year: every page can load everything it needs in a handful
  of queries and compute in memory. No caching, no materialised views.
- **Backups.** Nothing new; the Flexible Server's daily backups cover
  the documents because they are in the database (decision 8).

## Open questions

1. **Are you allowed to self-declare?** Owner-declared AMPs are for
   aircraft not operated under an ATO/DTO. KML Aviation Oy's flight
   types include *KOU* (type/additional training). If any training is
   done under a DTO contract, Traficom may require a CAO/CAMO contract
   and the declaration page becomes "record the contract" instead. Worth
   one e-mail to Traficom before M3, not before M1 — M1 and M2 are useful
   under either regime.
2. **Pilot-owner maintenance and the Oy.** ML.A.803 lets the owner or
   co-owner (or a member of a non-profit entity that owns the aircraft)
   release Appendix II tasks. The aircraft is owned by an Oy and the
   pilots are its shareholders; whether that counts as co-ownership is
   a question for Traficom. If not, M2's pilot-owner release stays in
   the code but is switched off per aircraft.
3. **Which figure drives the intervals** on OH-KML: Tacho (what the
   billing uses and what the pilots enter) or flight time? Cirrus's
   programme is written in flight hours; many owners use Hobbs/Tacho
   as a conservative stand-in. The profile's `hours_source` handles
   either; the baseline numbers must be read from the airframe logbook
   in the same unit.
4. **Where is OH-KML's programme today** — a CAMO contract, a previous
   owner declaration, nothing? Its documents are the input to the CSV
   import and the baseline; they decide how much of M1's setup is
   typing and how much is reading.
5. **Vitest** is a new dev dependency (decision: yes, ~1 MB, the
   SvelteKit default). Alternative: Node's built-in `node --test` on the
   compiled output — works, but the `$lib` alias makes it awkward.
6. **Naming in the UI**: "Maintenance" or "Airworthiness" for the nav
   label? The plan says Maintenance; the ARC reviewer will say
   airworthiness.

## Not in this programme

Automatic AD/SB ingestion; MEL/CDL; parts inventory and purchasing;
e-mail notifications (none exist in Cirkus); multi-club tenancy; a
mobile-tuned technical manager UI; a CAMO/CAO-side login. Each is a
later phase if the club wants it.
