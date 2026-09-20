# Cirkus — Phase 15 plan: Airworthiness (M1) — programme, counters, what's due

*Drafted 20 September 2026. For approval before code. First of four
airworthiness phases; the programme-level plan is `docs/MAINTENANCE_PLAN.md`,
the data-model sketch `docs/part-ml-amp-tracker-design.md`. The UI mock-up
is the Claude artifact "Cirkus Airworthiness Mock-up" (seven boards,
1440 px; board numbers below refer to it).*

M1 puts OH-KML's maintenance programme into Cirkus, sums airframe hours
and landings from the flight log, and shows what is due and when. It is
useful on its own and under either regime — while the CAO still holds the
programme it is a mirror; from the handover date it is the record.

## Decisions settled on 20 September

| Question | Answer | Effect on M1 |
|---|---|---|
| May the club self-declare? | Yes, confirmed with Traficom | Profile carries the declaration date; no CAO/CAMO contract fields |
| Who does maintenance? | Shareholders do Appendix II day-to-day items (oil etc.); everything else a Part-145 shop | `pilot_owner_allowed` only on those tasks; Part-145 releases are M2 |
| Which figure drives intervals? | Hours; the Tacho readings are hours | `hours_source = 'tacho'` on OH-KML; baseline read in hours |
| Where is the programme today? | With a CAO; heavy hand-entry expected | Baseline = the CAO's final status list at handover; CSV import is in M1, not later |
| Unit tests | Vitest | one new dev dependency, `npm run test:unit`, CI step |
| Name | "Airworthiness" | nav label, route prefix `/airworthiness`; tables keep the `mx_` prefix |
| Technical managers | Antti and Kari (to confirm) | seed marks the test admin as one; the flow promotes the test pilot |

Inputs still wanted, none blocking the code: the CAO's current status list
(shapes the CSV sample and the first real baseline); the baseline figures
(airframe hours, landings, date) from the logbooks.

## What M1 delivers

- A per-aircraft **profile**: hours source, baseline, AMP basis and
  reference, declaration date, warning thresholds.
- **Tasks** (the programme): add, edit, deactivate, import from CSV.
- **Counters**: baseline + flights since + adjustments → hours and
  landings today, utilisation from the trailing year.
- The **due calculation** as a pure, unit-tested module; every page
  computes from records, nothing stores "next due".
- The **baseline work order**: the day-one "last done" for every task,
  released once, frozen by a trigger.
- Pages: overview, aircraft dashboard, programme, task form, usage,
  baseline (boards 1–6); the technical-manager flag and licence field on
  Accounts (board 7).

Not in M1: work orders beyond the baseline, components, defects, ADs/SBs
as a register (an AD can be entered as a task with `source = ad`),
documents, ARC, the pilot-facing status chip. Those are M2–M4.

## Roles

| | pilot | admin | technical manager |
|---|---|---|---|
| See `/airworthiness/*` | — (M4 adds the chip on Home/Book) | yes | yes |
| Edit profile, tasks, adjustments, baseline | — | yes | yes |
| Set the technical-manager flag, licence no. | — | yes | — |

`technical_manager` is a boolean on `users`, set on *Accounts*. The
`(airworthiness)` route group's `+layout.server.ts` admits
`role = 'admin' or technical_manager`, 403 otherwise — the same shape as
`(admin)`. The sidebar shows the *Airworthiness* group to those users,
dark like the admin pages.

## Pages (mock-up boards)

**1 · `/airworthiness` — overview.** One card per aircraft: state chip
(*Airworthy* / *n items need attention* / *Grounded*), hours, landings,
h/day, the next five due items with their status pill, links to the
dashboard and programme. An untracked aircraft shows *Set up tracking*,
which creates the profile with defaults and opens the programme page.

**2 · `/airworthiness/[tail]` — dashboard.** Sub-nav (Dashboard ·
Programme · Usage · Baseline). Status card with the reasons list;
stats row; the full due list sorted by projected date (code, task,
interval, tolerance, last done, due at, remaining on the controlling
limit, projected date, status). Read-only.

**3 · `…/programme`.** Profile form (one `?/saveProfile` action); tasks
table with *Edit* per row, *Add task*, *Import CSV* with template
download and the all-or-nothing rule.

**4 · `…/programme/tasks/[id]` (and `…/tasks/new`).** The task form as a
component (`TaskForm.svelte`, every input `bind:value`); the *Computed
now* card on the right runs `computeDue` on the saved values. Actions:
`?/save`, `?/deactivate`. Validation mirrors the check constraints:
at least one interval unless one-time; fixed anchor needs a value;
tolerance forced to zero for ALS and AD sources (saved that way and
shown as a hint, not an error).

**5 · `…/usage`.** The reconciliation table (baseline + flights +
adjustments = today), the last-Tacho check with a 1.0 h warning
threshold, adjustments list and add form (`?/addAdjustment`), and the
flights since baseline (read-only, from `flight_log_entries`).

**6 · `…/baseline`.** The baseline work order: date, hours, landings,
source-of-figures text, one row per active task with last-done
date/hours/landings and an evidence reference. `?/saveDraft` any number
of times; `?/release` once — validation: a date on every row, hours on
every hour-based task, landings on every landings-based task. After
release the page is read-only and says who released it and when.

**7 · `/manage/accounts`.** Two fields on the existing edit form:
*Technical manager* checkbox, *Licence no.* text.

Phone: the pages render below 900 px (tables scroll in `.table-wrap`)
but are not tuned, and `/more` does not list them. The screenshot review
is at 1440; the overview alone also at 390.

## Migration `0015_airworthiness_core.sql`

```sql
-- Phase 15: airworthiness — programme, counters, baseline.

alter table users
	add column technical_manager boolean not null default false,
	add column licence_no text;

create type mx_hours_source as enum ('tacho', 'block', 'airborne');
create type mx_amp_basis as enum ('ica', 'mip');

create table mx_aircraft (
	aircraft_id uuid primary key references aircraft (id) on delete cascade,
	msn text,
	year_built integer,
	mtow_kg integer,
	hours_source mx_hours_source not null default 'tacho',
	baseline_at date not null,
	baseline_hours numeric(8, 1) not null,
	baseline_landings integer not null default 0,
	amp_basis mx_amp_basis not null default 'ica',
	amp_reference text,
	amp_declared_at date,
	amp_declared_by uuid references users (id),
	amp_reviewed_at date,
	warn_hours numeric(5, 1) not null default 10,
	warn_days integer not null default 30,
	warn_landings integer not null default 25,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
	-- 'tacho' on an aircraft with records_tacho = false is refused by the
	-- profile action; a cross-table check is not expressible here.
);

create table mx_usage_adjustments (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	on_date date not null,
	hours_delta numeric(7, 1) not null default 0,
	landings_delta integer not null default 0,
	reason text not null,
	entered_by uuid not null references users (id),
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
	code text not null,
	title text not null,
	source mx_task_source not null,
	source_ref text,
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
	reset_rule mx_reset_rule not null default 'from_original',
	pilot_owner_allowed boolean not null default false,
	active boolean not null default true,
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint mx_tasks_code_unique unique (aircraft_id, code),
	constraint mx_tasks_code_shape check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
	constraint mx_tasks_has_interval check (
		one_time or interval_hours is not null or interval_months is not null or interval_landings is not null),
	constraint mx_tasks_intervals_positive check (
		coalesce(interval_hours, 1) > 0 and coalesce(interval_months, 1) > 0 and coalesce(interval_landings, 1) > 0),
	constraint mx_tasks_fixed_anchor check (
		anchor_kind <> 'fixed' or anchor_date is not null or anchor_hours is not null or anchor_landings is not null),
	constraint mx_tasks_no_tolerance_on_limits check (
		source not in ('als', 'ad') or (tolerance_hours = 0 and tolerance_days = 0 and tolerance_landings = 0))
);
create index mx_tasks_aircraft_idx on mx_tasks (aircraft_id) where active;

create type mx_work_order_kind as enum ('setup_baseline', 'scheduled', 'unscheduled', 'pilot_owner', 'defect');
create type mx_work_order_status as enum ('open', 'released');

create table mx_work_orders (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	kind mx_work_order_kind not null,
	status mx_work_order_status not null default 'open',
	title text not null,
	opened_at date not null,
	opened_by uuid not null references users (id),
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
		status <> 'released' or (released_at is not null and released_hours is not null
		                          and released_landings is not null and crs_name is not null))
);
create index mx_work_orders_aircraft_idx on mx_work_orders (aircraft_id, released_at desc);
-- one baseline per aircraft
create unique index mx_work_orders_one_baseline on mx_work_orders (aircraft_id) where kind = 'setup_baseline';

create table mx_work_order_items (
	id uuid primary key default gen_random_uuid(),
	work_order_id uuid not null references mx_work_orders (id) on delete cascade,
	task_id uuid references mx_tasks (id),
	description text not null,
	reference_data text,
	done_on date,
	done_hours numeric(8, 1),
	done_landings integer,
	position integer not null default 0
);
create index mx_work_order_items_wo_idx on mx_work_order_items (work_order_id);
create index mx_work_order_items_task_idx on mx_work_order_items (task_id);

-- A released work order and its items cannot change (MAINTENANCE_PLAN, decision 5).
create function mx_refuse_released() returns trigger language plpgsql as $$
begin
	raise exception 'work order is released and cannot be changed';
end $$;
create trigger mx_work_orders_immutable
	before update or delete on mx_work_orders for each row
	when (old.status = 'released') execute function mx_refuse_released();
create function mx_refuse_released_item() returns trigger language plpgsql as $$
declare wo uuid := coalesce(new.work_order_id, old.work_order_id);
begin
	if exists (select 1 from mx_work_orders w where w.id = wo and w.status = 'released') then
		raise exception 'work order % is released and cannot be changed', wo;
	end if;
	return coalesce(new, old);
end $$;
create trigger mx_work_order_items_immutable
	before insert or update or delete on mx_work_order_items for each row
	execute function mx_refuse_released_item();

-- Compliance is derived: an item on a released order that names a task.
-- The baseline carries its own "done at"; a real release (M2) uses the
-- order's release readings.
create view mx_task_compliance as
	select i.task_id, w.aircraft_id, w.id as work_order_id, w.kind,
	       case when w.kind = 'setup_baseline' then i.done_on else w.released_at end as done_on,
	       case when w.kind = 'setup_baseline' then i.done_hours else w.released_hours end as done_hours,
	       case when w.kind = 'setup_baseline' then i.done_landings else w.released_landings end as done_landings
	  from mx_work_order_items i
	  join mx_work_orders w on w.id = i.work_order_id
	 where w.status = 'released' and i.task_id is not null;
```

The trigger on `mx_work_orders` fires only when `old.status = 'released'`,
so the release itself (open → released) goes through; the items trigger
checks the order's current status, so the release transaction inserts
items *before* flipping the status. `mx_refuse_released_item` returns
`coalesce(new, old)` so inserts and updates on open orders pass.

## Counters

```
hours(aircraft)    = baseline_hours
                   + Σ flights with block_off_at::date > baseline_at, by hours_source:
                       tacho    → tacho_end − tacho_start
                       block    → block_hours
                       airborne → extract(epoch from landing_at − takeoff_at) / 3600
                   + Σ non-superseded adjustments.hours_delta with on_date > baseline_at
landings(aircraft) = baseline_landings + Σ (day_landings + night_landings) + Σ landings_delta
hoursPerDay        = hours flown in the trailing 365 days / 365   (90 days if the log is shorter)
landingsPerHour    = landings / hours over the same window (0 if no hours)
```

Flights on the baseline date itself are *inside* the baseline (the CAO's
figure is end-of-day); the comparison is strict. A flight with no Tacho
readings on a `tacho`-source aircraft contributes 0 h and is listed on
the usage page with a warning — OH-KML requires Tacho, so this only
matters for a mis-set profile.

## Due calculation — `src/lib/server/airworthiness/due.ts`

Pure TypeScript, no `$lib/server/db` import. Inputs are plain numbers and
`YYYY-MM-DD` strings (the loader converts Postgres `numeric` strings).

```ts
computeDue(task, anchor, counters, policy): Due
  task     = { oneTime, intervalHours?, intervalMonths?, intervalLandings?,
               toleranceHours, toleranceDays, toleranceLandings, resetRule, source }
  anchor   = { date?, hours?, landings? } | null      // resolved by the caller (§ below)
  counters = { today, hours, landings, hoursPerDay, landingsPerHour }
  policy   = { warnHours, warnDays, warnLandings }
  Due      = { status: 'ok'|'due_soon'|'in_tolerance'|'overdue'|'complete'|'undefined',
               limits: Limit[], controlling: Limit | null, projectedDate: string | null }
  Limit    = { kind: 'hours'|'calendar'|'landings', dueAt: number|string,
               remaining: number, remainingDays: number|null, tolerance: number }
```

Rules:
1. `oneTime` with a compliance → `complete`. No anchor at all → `undefined`
   (shown as a data problem, never hidden).
2. One limit per interval set; `remaining` = due − now; `remainingDays` =
   remaining / rate (hours: `hoursPerDay`; landings: `hoursPerDay ×
   landingsPerHour`; calendar: exact). Rate 0 → `remainingDays = null`
   for that limit.
3. Controlling limit = smallest `remainingDays`, nulls last; calendar wins
   ties. `projectedDate = today + controlling.remainingDays`.
4. `overdue` if any limit is past due beyond its tolerance;
   `in_tolerance` if past due within tolerance; `due_soon` if any limit is
   within the warn threshold; else `ok`.
5. Tolerance is taken from the task but forced to 0 when `source` is
   `als` or `ad` (belt and braces with the check constraint).
6. `addMonthsClamped('2028-02-29', 12) = '2029-02-28'`; day-of-month
   clamps to the target month's length.
7. Anchor resolution (in `programme.ts`, not in `due.ts`): `last_compliance`
   → latest row of `mx_task_compliance`; `install` / `manufacture` → M2
   (components); `fixed` → the task's anchor fields. With `reset_rule =
   from_original` and a previous compliance later than its own original
   due point, the anchor is that original due point.

`aircraftStatus(dues, extras)` → `{ state: 'airworthy'|'attention'|'grounded',
reasons: string[] }`. M1: grounded if any `overdue`; attention if any
`in_tolerance` or `due_soon`, or the profile has no released baseline, or
`amp_reviewed_at` (or `amp_declared_at`) is older than 12 months. M2–M4
add defects, ARC, directives, life limits.

## CSV import

Header row required; columns, in any order, matching `mx_tasks`:

```
code,title,source,source_ref,interval_hours,interval_months,interval_landings,one_time,
anchor_kind,anchor_date,anchor_hours,anchor_landings,tolerance_hours,tolerance_days,
tolerance_landings,reset_rule,pilot_owner_allowed,notes
```

UTF-8, comma-separated, quotes per RFC 4180 (a ~40-line parser in
`csv.ts`; no dependency). Enum columns take the enum values; booleans
`true/false/yes/no/1/0`; empty = null. Validation per row with the same
rules as the form; the first error aborts with "row 7: tolerance is not
allowed on an ALS task". Existing codes are updated, new ones inserted,
nothing deactivated. The template download is the header row plus three
example rows. `tests/e2e/fixtures/tasks-sr20-sample.csv` carries the
ten sample tasks from the mock-up.

## Step-by-step build

Each step ends with a check that must pass before the next. Branch
`phase-15`, one migration, one PR.

| # | Step | Files | Done when |
|---|---|---|---|
| 0 | **Branch and tooling.** `phase-15` from `main`. Add Vitest (`vitest` dev dep, `test` block in `vite.config.ts` with `include: ['src/**/*.test.ts']`), `"test:unit": "vitest run"`. CI: a `npm run test:unit` step in `ci.yml`'s *check* job, written to `_workflows-to-move/ci.yml` for Antti to move. | `package.json`, `vite.config.ts`, `_workflows-to-move/ci.yml` | `npm run test:unit` runs (0 tests) and `npm run check` is still clean |
| 1 | **Due calculator, tests first.** Write `due.test.ts` with the cases below, then `due.ts` until green. No database. | `src/lib/server/airworthiness/due.ts`, `due.test.ts` | all unit tests green |
| 2 | **Migration and types.** `0015_airworthiness_core.sql` as above; `db.ts` gains `MxAircraftTable`, `MxUsageAdjustmentsTable`, `MxTasksTable`, `MxWorkOrdersTable`, `MxWorkOrderItemsTable`, `MxTaskComplianceView` and the two `users` columns. | `db/migrations/0015_…sql`, `src/lib/server/db.ts` | migrations run twice on a fresh Postgres 16, second run "Already up to date."; `npm run check` clean |
| 3 | **Counters and programme loader.** `helsinkiToday()` in `time.ts`; `counters.ts` (one query); `programme.ts` (tasks + latest compliance → `computeDue` each, sorted; `aircraftStatus`). | `time.ts`, `airworthiness/{counters,programme}.ts` | a scratch script against the test DB prints OH-KML's counters and due list |
| 4 | **Roles and navigation.** Accounts: technical-manager checkbox and licence field (`?/update`), audit details. `(airworthiness)/+layout.server.ts` gate. Sidebar group. `SessionUser` gains `technicalManager`. Icons `gauge`, `upload`, `download`. | `manage/accounts/*`, `auth.ts`, `(app)/+layout.svelte`, `(airworthiness)/+layout.server.ts`, `Icon.svelte` | admin sees the group; a pilot gets 403 on `/airworthiness`; a promoted pilot gets in |
| 5 | **Overview** (board 1) with *Set up tracking* (`?/setup`: inserts `mx_aircraft` with baseline date = today, hours/landings 0, redirects to the programme page). | `airworthiness/+page.{server.ts,svelte}` | screenshot 1440 + 390 matches board 1 |
| 6 | **Dashboard** (board 2), read-only. | `airworthiness/[tail]/+page.*` | screenshot matches board 2; the due list order matches the unit-tested calculator on seeded data |
| 7 | **Programme and task form** (boards 3, 4). `TaskForm.svelte`; `?/saveProfile`, `?/save`, `?/deactivate`; the *Computed now* card. Profile refuses `hours_source = tacho` on an aircraft with `records_tacho = false`. | `…/programme/+page.*`, `…/programme/tasks/[id]/+page.*`, `…/programme/tasks/new/+page.*`, `TaskForm.svelte` | add / edit / deactivate round-trip; ALS task with a tolerance saves as 0 with the hint |
| 8 | **CSV import** (board 3, lower card) and template download (`+server.ts` returning `text/csv`). | `airworthiness/csv.ts`, `…/programme/+page.server.ts` (`?/import`), `…/programme/template/+server.ts` | the sample CSV imports; a broken row aborts with the row number and nothing is written |
| 9 | **Usage** (board 5): reconciliation, last-Tacho check, adjustments (`?/addAdjustment`, `?/supersede`), flights since baseline. | `…/usage/+page.*` | an adjustment moves the dashboard counters; superseding restores them |
| 10 | **Baseline** (board 6): `?/saveDraft`, `?/release` in one transaction (items first, then status). After release the page is read-only. | `…/baseline/+page.*`, `airworthiness/baseline.ts` | release succeeds; a second `?/release` and any later edit are refused by the trigger and shown as a plain message |
| 11 | **Audit and seed.** `ENTITY_BY_ROUTE` entries; `audit()` in every action with the tail and code; `seed-test.js` wipes `mx_*` and resets `technical_manager` / `licence_no`. | `audit.ts`, `db/seed-test.js` | Activity shows `airworthiness.task_save` etc. with details |
| 12 | **E2E flow 06** and screenshots. | `tests/e2e/06-airworthiness.spec.ts`, `fixtures/tasks-sr20-sample.csv` | flow green against the built app; screens under `test-results/screens/` looked at and fixed |
| 13 | **Docs.** README (table row, role, Vitest in *Local development*, the `mx_` prefix and trigger in *Repo layout*); HANDOFF §1 table, §4 conventions, §7; MAINTENANCE_PLAN answers recorded. | `README.md`, `docs/HANDOFF.md`, `docs/MAINTENANCE_PLAN.md` | — |
| 14 | **Verify.** `npm run check` · `npm run test:unit` · migrations twice on fresh Postgres 16 · `npm run build` · all six Playwright flows · screenshots reviewed. | — | all green |
| 15 | **Sync and commit.** Files to `C:\work\ensacon\cirkus`, commit on `phase-15` with the trailers; Antti pushes, opens the PR, CI, merges. Workflow file moved by hand. | — | PR open |

Steps 1–3 are back-end only and can be reviewed before any page exists;
steps 5–10 each end with a screenshot you can compare with the board.

### Unit test cases (step 1)

1. 100 h / 12 mo, done at 1234.5 h on 2026-03-15; now 1301.2 h on
   2026-09-20 at 0.4 h/day → hours controls (33.3 h ≈ 83 d), `ok`; at
   1325.0 h → `due_soon`.
2. 120 months from 2017-03-10, no hours → calendar only, due 2027-03-10,
   `remainingDays` exact.
3. One-time task with `anchor_kind = fixed` (AD effective 2026-01-01,
   50 h / 3 mo) → `overdue` on 2026-04-02 with no compliance; `complete`
   with one.
4. Recurring AD 100 h, tolerance in the task = 10 (ignored for `ad`) →
   `overdue` at 100.1 h past.
5. ICA task, tolerance 10 h, released 5 h late, `from_original` → next
   due = original + 100, not actual + 100.
6. `hoursPerDay = 0` → hours limit has `remainingDays = null`; calendar
   controls.
7. `addMonthsClamped('2028-02-29', 12)` → `'2029-02-28'`;
   `('2026-01-31', 1)` → `'2026-02-28'`.
8. Task with no intervals and not one-time → `undefined`.
9. Landings limit: 500 landings, 3 landings/h, 0.4 h/day → 1.2/day.
10. `aircraftStatus`: one `overdue` → grounded with the reason naming the
    code; only `due_soon` → attention; all `ok` with baseline → airworthy.
11. Tie: hours and calendar both 30 days → calendar is controlling.

### E2E flow 06 (step 12)

Admin marks the test pilot as technical manager (Accounts) → pilot logs
in, `/airworthiness` shows OH-KML untracked → *Set up tracking* → profile
saved (Tacho, baseline 2026-09-01, 1000.0 h, 800 landings) → CSV import
of the sample tasks → baseline filled for three tasks and released →
dashboard shows INSP-100H due at 1100.0 h → pilot logs a flight Tacho
1000.0 → 1001.5 with 2 landings → dashboard shows 98.5 h remaining and a
projected date → adjustment +2.0 h → 96.5 h → an attempt to edit the
released baseline shows the refusal message. Screenshots at 1440 of every
page, 390 of the overview.

## Files

```
db/migrations/0015_airworthiness_core.sql
db/seed-test.js
package.json, vite.config.ts                         (vitest)
src/lib/server/db.ts, auth.ts, audit.ts, time.ts
src/lib/server/airworthiness/{due,counters,programme,csv,baseline}.ts
src/lib/server/airworthiness/due.test.ts
src/lib/components/Icon.svelte, TaskForm.svelte
src/routes/(app)/+layout.svelte
src/routes/(app)/(airworthiness)/+layout.server.ts
src/routes/(app)/(airworthiness)/airworthiness/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/programme/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/programme/template/+server.ts
src/routes/(app)/(airworthiness)/airworthiness/[tail]/programme/tasks/[id]/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/programme/tasks/new/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/usage/+page.{server.ts,svelte}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/baseline/+page.{server.ts,svelte}
src/routes/(app)/(admin)/manage/accounts/+page.{server.ts,svelte}
tests/e2e/06-airworthiness.spec.ts, tests/e2e/fixtures/tasks-sr20-sample.csv
_workflows-to-move/ci.yml
README.md, docs/HANDOFF.md, docs/MAINTENANCE_PLAN.md
```

About three days. Steps 0–3 the first, 4–8 the second, 9–15 the third.

## Found on the way (built into the phase)

- **`date` columns.** `pg` returned Postgres `date` as a local-midnight
  `Date`; every page formatted it in UTC, so on a Helsinki machine the
  expenses flow showed the previous day (CI is UTC and never saw it). The
  new tables are full of dates, so `db.ts` now sets a type parser that
  returns `'YYYY-MM-DD'` strings; the existing `new Date(x)` calls keep
  working and flow 04 passes locally.
- **Forms echo their values.** Cirkus posts plain forms; a `fail()`
  re-renders the page from the database and loses what was typed. Every
  airworthiness action returns the posted values on failure and the page
  seeds its state from them (the pattern `ExpenseForm` already used).
- **The seed and the trigger.** `db/seed-test.js` must disable the two
  immutability triggers to wipe released work orders — the one place that
  is right, and it says so.
- **Flow 06 asserts deltas**, not absolute counters: earlier flows log
  OH-KML flights that land after the baseline date.

## Open points for this phase

1. **Route parameter** — `[tail]` (`/airworthiness/OH-KML`, readable in
   the activity log and the ARC package) rather than the uuid. Tail
   numbers are unique in `aircraft`; fine unless you'd rather keep ids
   out of habit.
2. **`reset_rule` default `from_original`** — the conservative choice;
   the CAO may have used `from_actual`. Per task, so either is a click.
3. **Baseline for calendar-only tasks** — the CAPS pack date is the
   anchor, not a compliance; M1 stores it as the baseline row's date with
   `anchor_kind = manufacture` deferred to M2's components. Acceptable
   for six months?

## Not in this phase

Work orders other than the baseline; components and their counters;
defects and the phone-first report; directives register; documents; ARC;
the pilot-facing chip; Finnish strings; e-mail.
