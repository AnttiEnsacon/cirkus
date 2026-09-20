# Cirkus — Phase 16 plan: Airworthiness (M2) — work orders, releases, components, defects

*Drafted 20 September 2026. For approval before code. Second of the
airworthiness phases (`docs/MAINTENANCE_PLAN.md`); builds on Phase 15.
Mock-up: boards 8–13 on the "Cirkus Airworthiness Mock-up" canvas.*

M1 answered "what is due when". M2 makes Cirkus the maintenance record:
work done is a **work order** released with a CRS, which is what moves the
due list; **components** carry their own hours and history; **defects**
are reported by any pilot from the phone, assessed by the technical
manager, and rectified on a work order or deferred with a limit. A
co-owner with a licence can release Appendix II work (oil, tyres …) from
the phone as a **pilot-owner**.

## Decisions (proposed)

1. **A work order is the only way to record work.** Adding items while it
   is open, releasing it once; the Phase 15 trigger then freezes it. An
   open order can be **cancelled** (new status) but never deleted.
2. **The release readings are what the mechanic wrote**, stored as
   entered; the counters keep coming from the flight log. The release
   form shows Cirkus's computed hours *at the release date* and warns
   (never blocks) when they differ by more than 1.0 h.
3. **Compliance for a task comes from the order's release readings**
   (the Phase 15 view already says so); the baseline row's own figures
   are the one exception, as before.
4. **Components are club-level things** (part number + serial) that an
   **installation** binds to an aircraft for a period. Hours follow the
   aircraft while installed and freeze at removal; TSN/TSO/CSN at fitting
   are entered. Limits on a component are *tasks* with `component_id` —
   no separate life-limit columns, one calculator for everything.
5. **Component tasks count in the component's own hours and landings**
   (TSN/CSN), with the calendar unchanged. Anchors `install` and
   `manufacture` become real: the installation point and the
   manufacture date. Compliance points are converted from aircraft
   readings to component readings through the installation that was
   current at that date.
6. **Defects** have a running number (#1, #2 …), a reporter, an optional
   photo (the receipt-image pipeline, downscaled, in Postgres), and go
   `open → rectified | deferred | closed`. Until assessed they put the
   aircraft in *attention*; assessed as affecting airworthiness they
   **ground** it; deferred past their limit they ground it too.
7. **Pilot-owner release** is one phone-first form: pick the aircraft,
   tick the Appendix II tasks done, enter the readings, sign with the
   licence number on file. It creates and releases a `pilot_owner` order
   in one transaction. Eligible: a user in `aircraft_owners` for that
   aircraft with a `licence_no`. Nothing else about work orders reaches
   pilots.
8. **Pilots see open defects** for every aircraft (`/defects`) — a pilot
   should know before flight — and report new ones (`/defects/new`).
   *Report a defect* is linked from Home, from the "flight saved" banner
   and from `/more`.
9. **The release hash** covers the order, its items, parts and component
   swaps (canonical JSON, SHA-256), shown on the page and in the activity
   log, as for the baseline.

## Roles

| | pilot | co-owner with licence | admin / technical manager |
|---|---|---|---|
| See open defects, report one | yes | yes | yes |
| Pilot-owner release (Appendix II tasks) | — | yes | yes if also an owner |
| Work orders, components, assess/defer/close defects | — | — | yes |

## Pages

**Sub-nav on the aircraft pages** grows to: Dashboard · Programme ·
Work orders · Components · Defects · Usage · Baseline.

**8 · `/airworthiness/[tail]/work-orders`.** Open orders first (kind,
title, opened, item count), then released ones by date with hash and
CRS name, then cancelled. *Open a work order*: kind (scheduled /
unscheduled / defect), title, opened-on date, notes, and checkboxes for
the tasks due soon, in tolerance or overdue so the order starts with
its items.

**9 · `…/work-orders/[id]` — open.** Header (kind, status, opened by/at).
Items table with *remove* per row; *Add item* form: task (any active
task, or none for unscheduled work), description, reference data,
defect (open defects), component removed (installed components),
component installed (a spare, or *new component* with PN / SN /
description / ATA / manufacture date / TSN / TSO / CSN), parts used
(one per line: `part number · serial · qty · traceability`). Release
form: date, hours, landings, performed by (organisation, approval),
CRS name, licence/authorisation, CRS text, with the computed-hours hint
and the >1.0 h warning. *Cancel order* with a reason. **Released:** the
same page read-only, with the CRS block, the hash and the installations
it opened or closed. Refused edits show the trigger's message in plain
words.

**10 · `…/components` and `…/components/[id]`.** Installed components
(position, PN/SN, TSN/TSO/CSN today, age, tasks and their status), then
spares (not installed). *Add component* form. Detail: identity, the
installation history, the component's tasks with due states, the work
orders that touched it.

**11 · `…/defects` and `…/defects/[id]`.** Table: number, reported,
by, title, status, airworthiness, limit. Detail: the report with photo,
the assessment form (*affects airworthiness* yes/no + text), *Defer*
(by whom, basis, limit date and/or hours), *Close* (reason, for "no
fault found"), and the link to the work order that rectifies it.

**12 · `/defects` and `/defects/new` (pilot, phone-first).** The open
defects per aircraft with their status, and the form: aircraft, title,
description, photo, optional link to the pilot's last flight.

**13 · `/pilot-owner/new` (co-owner, phone-first).** Aircraft, the
Appendix II tasks (with their due state), date, Tacho/hours and landings
readings, notes, the CRS statement pre-filled with the ML.A.803 wording,
name and licence number from the account, *Release*. `/pilot-owner`
lists the person's own releases.

**Dashboard** gains two cards: open defects (with the grounding ones
first) and open work orders. **Overview** shows a defects count.

## Migration `0016_airworthiness_work.sql`

```sql
-- components: identity; an installation binds one to an aircraft for a period
create table mx_components (
	id uuid primary key default gen_random_uuid(),
	part_number text not null,
	serial_number text not null,
	description text not null,
	ata_chapter text,
	parent_component_id uuid references mx_components (id),
	manufacture_date date,
	traceability_ref text,            -- Form 1 / 8130-3 number; the document itself is M3
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint mx_components_identity unique (part_number, serial_number)
);

create table mx_component_installations (
	id uuid primary key default gen_random_uuid(),
	component_id uuid not null references mx_components (id),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	position text,
	installed_on date not null,
	installed_at_hours numeric(8, 1) not null,      -- aircraft readings at fitting
	installed_at_landings integer not null,
	tsn_at_install numeric(8, 1) not null default 0, -- component readings at fitting
	tso_at_install numeric(8, 1) not null default 0,
	csn_at_install integer not null default 0,
	removed_on date,
	removed_at_hours numeric(8, 1),
	removed_at_landings integer,
	removed_reason text,
	install_work_order_id uuid references mx_work_orders (id),
	remove_work_order_id uuid references mx_work_orders (id),
	created_at timestamptz not null default now(),
	constraint mx_installations_removal_complete check (
		(removed_on is null) = (removed_at_hours is null) and (removed_on is null) = (removed_at_landings is null)),
	constraint mx_installations_order check (removed_on is null or removed_on >= installed_on)
);
create unique index mx_installations_one_open on mx_component_installations (component_id) where removed_on is null;
create index mx_installations_aircraft_idx on mx_component_installations (aircraft_id, installed_on desc);

-- a task may belong to a component: its hours and landings are the component's
alter table mx_tasks add column component_id uuid references mx_components (id);
create index mx_tasks_component_idx on mx_tasks (component_id) where component_id is not null;

-- work orders: cancellable while open; items carry swaps, parts and the defect they fix
alter type mx_work_order_status add value 'cancelled';
alter table mx_work_orders
	add column cancelled_at date,
	add column cancelled_reason text,
	add column performed_by_ref text;             -- approval / licence reference of the organisation
alter table mx_work_order_items
	add column removed_component_id uuid references mx_components (id),
	add column installed_component_id uuid references mx_components (id),
	add column installed_tsn numeric(8, 1),
	add column installed_tso numeric(8, 1),
	add column installed_csn integer,
	add column defect_id uuid,
	add column parts_used jsonb not null default '[]';

create type mx_defect_status as enum ('open', 'deferred', 'rectified', 'closed');
create table mx_defects (
	id uuid primary key default gen_random_uuid(),
	number integer generated by default as identity unique,
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	reported_by uuid not null references users (id),
	reported_at timestamptz not null default now(),
	flight_log_id uuid references flight_log_entries (id) on delete set null,
	title text not null,
	description text,
	status mx_defect_status not null default 'open',
	affects_airworthiness boolean,                -- null until assessed
	assessed_by uuid references users (id),
	assessed_at timestamptz,
	assessment text,
	deferred_by text,                             -- the certifying staff / pilot-owner who assessed it as not hazardous (ML.A.403)
	deferred_on date,
	deferral_basis text,
	deferral_limit_date date,
	deferral_limit_hours numeric(8, 1),
	rectified_work_order_id uuid references mx_work_orders (id),
	rectified_on date,
	closed_at timestamptz,
	closed_reason text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint mx_defects_deferral_complete check (
		status <> 'deferred' or (deferred_by is not null and deferral_basis is not null
		                          and (deferral_limit_date is not null or deferral_limit_hours is not null))),
	constraint mx_defects_rectified_complete check (status <> 'rectified' or rectified_work_order_id is not null),
	constraint mx_defects_closed_complete check (status <> 'closed' or closed_reason is not null)
);
create index mx_defects_aircraft_idx on mx_defects (aircraft_id, status);
alter table mx_work_order_items add constraint mx_work_order_items_defect_fk foreign key (defect_id) references mx_defects (id);

create table mx_defect_images (
	id uuid primary key default gen_random_uuid(),
	defect_id uuid not null references mx_defects (id) on delete cascade,
	content_type text not null,
	bytes bytea not null,
	width integer not null,
	height integer not null,
	created_at timestamptz not null default now()
);
create index mx_defect_images_defect_idx on mx_defect_images (defect_id);
```

`alter type … add value` runs inside the migration's transaction on
Postgres 16 as long as the new value is not used in the same file — it
is not. The Phase 15 items trigger is `before insert or update or delete`
on the row, so the new columns are covered without change.

## Rules

**Release (`workorders.ts › release`)** — one transaction:
1. Order is `open`; readings and CRS name given; date not in the future.
2. Every item's component swap is consistent: the removed component is
   installed on this aircraft now; the installed component is not
   installed anywhere (or is being removed in the same order).
3. Hash = SHA-256 of canonical JSON {order fields, items with parts and
   swaps}. Update the order: status, readings, CRS, hash, released_by —
   the trigger passes because the old row was open.
4. Close installations of removed components at the release date and
   readings; open installations for installed ones (TSN/TSO/CSN from the
   item, default 0 for new parts).
5. Defects named by items → `rectified` with the order and date.
6. Audit `airworthiness.work_order_release` with the hash.

**Pilot-owner release (`/pilot-owner/new`)**: the same, plus: user is in
`aircraft_owners` and has `licence_no`; every ticked task has
`pilot_owner_allowed`; kind `pilot_owner`; `crs_name` = the user,
`crs_licence` = their licence; CRS text defaults to the ML.A.803
statement and can be edited; no component swaps or defects on this form.

**Component counters (`components.ts`)**: while installed,
`tsn = tsn_at_install + (aircraft hours now − installed_at_hours)`, `tso`
and `csn` likewise; after removal, the same with the removal readings.
Age from `manufacture_date`. A compliance point at aircraft hours *H* on
date *D* for a component task maps to component hours through the
installation current on *D*; if none was (the task predates the record),
the point is kept as is and the task shows *undefined*, never a wrong
number.

**Status (`aircraftStatus`) gains defects**: grounded on any open defect
assessed as affecting airworthiness and any deferred defect past its
limit (date, or hours against the counters); attention on an unassessed
open defect or a deferred one inside its limit. Reasons name the defect
number and title.

## Step-by-step build

| # | Step | Done when |
|---|---|---|
| 0 | Branch `phase-16`; unit-test files for components, defects status, parts parsing written first | tests exist and fail |
| 1 | Migration 0016; `db.ts` interfaces (`MxComponentsTable`, `MxComponentInstallationsTable`, `MxDefectsTable`, `MxDefectImagesTable`, the new columns and status) | migrations twice on fresh Postgres 16; a psql smoke test of the constraints |
| 2 | `components.ts`: counters, the installation-current-on-date lookup, the aircraft→component point conversion; `programme.ts` runs component tasks in component terms with `install`/`manufacture` anchors | unit tests green; the M1 flow still passes |
| 3 | `due.ts › aircraftStatus` takes defects; `programme.ts` loads them | unit tests green |
| 4 | `workorders.ts`: open, add/remove item, cancel, release (transaction, hash, installations, defects), `countersAt(date)`, parts-line parser | unit tests for parts and canonical hash; a scratch release against the test DB moves INSP-100H |
| 5 | Pages: work-orders list + detail (open and released views), sub-nav | screenshots match boards 8–9 |
| 6 | Pages: components list + detail, *Add component* | screenshots match board 10 |
| 7 | Pages: TM defects list + detail (assess / defer / close); pilot `/defects`, `/defects/new` with photo; links on Home, the flight-saved banner and `/more`; image endpoint | screenshots match boards 11–12 (390 for the pilot pages) |
| 8 | `/pilot-owner/new` and `/pilot-owner`; eligibility; the ML.A.803 default text | screenshot matches board 13 at 390 |
| 9 | Dashboard and overview cards; Activity descriptions; `seed-test.js` wipes; `ENTITY_BY_ROUTE` | — |
| 10 | Flow 07; docs (README, HANDOFF, MAINTENANCE_PLAN); full verification (check, unit, migrations twice, build, seven flows); sync and commit on `phase-16` | all green, PR open |

### Flow 07 (`tests/e2e/07-maintenance.spec.ts`)

Runs after 06, so it starts from OH-KML tracked with the imported
programme and a released baseline. Admin makes the pilot a co-owner on
Fleet → technical manager opens a work order from the due list with
INSP-100H → adds an item swapping a magneto (new component, TSN 0) with
two parts → releases with readings 1010.0 h and a CRS → the dashboard
shows INSP-100H due at 1110.0 h; the released page refuses a new item;
Components shows the magneto installed with TSN 0.0 growing after a
flight → pilot (390 px) reports a defect with the fixture photo →
`/defects` lists it → TM assesses it as affecting airworthiness → the
dashboard is *Grounded* naming #1 → a defect work order rectifies it →
*Airworthy* → a second defect is deferred with a limit date → *attention*
→ pilot-owner release of OIL-50H from the phone → OIL-50H's due moves →
a pilot who is not an owner sees the explanation, not the form → Activity
describes the release with its hash.

## Files

```
db/migrations/0016_airworthiness_work.sql
db/seed-test.js
src/lib/server/db.ts, audit.ts, images.ts (shared normaliser name)
src/lib/server/airworthiness/{components,workorders,defects}.ts (+ .test.ts), due.ts, programme.ts, present.ts
src/lib/components/AirworthinessHead.svelte, Icon.svelte (tool, flag)
src/routes/(app)/(airworthiness)/airworthiness/[tail]/work-orders/{+page.*, [id]/+page.*}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/components/{+page.*, [id]/+page.*}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/defects/{+page.*, [id]/+page.*}
src/routes/(app)/(airworthiness)/airworthiness/[tail]/+page.* (dashboard cards), airworthiness/+page.* (overview)
src/routes/(app)/defects/{+page.*, new/+page.*, [id]/image/[imageId]/+server.ts}
src/routes/(app)/pilot-owner/{+page.*, new/+page.*}
src/routes/(app)/home/+page.svelte, logbook/+page.svelte, more/+page.svelte
src/routes/(app)/(admin)/manage/activity/+page.server.ts, +page.svelte
tests/e2e/07-maintenance.spec.ts
README.md, docs/HANDOFF.md, docs/MAINTENANCE_PLAN.md
```

About three days.

## As built

Everything in the steps above, plus what the building decided:

- **Tasks follow the swap.** At release, a task whose `component_id` is
  the removed component is re-pointed at the installed one — the 500 h
  magneto inspection belongs to whatever magneto is fitted.
- **Counters never go below the fitting readings.** The log can lag the
  mechanic's reading (the release says 1010.0 h, Cirkus sums 1002.8 h);
  a component fitted "at 1010.0 h" reads its TSN at fitting until the log
  catches up, not a negative number. The Δ chip on the released order
  shows the gap.
- **"Already fitted"** on the Components page records an installation
  without a work order — the setup record for the engine, propeller,
  parachute and the rest, with the aircraft readings from the logbook.
- **A deferral needs the assessment first** (affects airworthiness = no);
  closed defects can be reopened, rectified ones cannot.
- **Task page history** lists every compliance (baseline or work order)
  with a link; the *applies to* select lists every component, installed
  ones first.
- **The release date has no browser `max`** so the server's message shows
  and nothing typed is lost; the CRS name is `required` in the browser.
- **e2e:** `hydrated(page)` in `helpers.ts` before touching a select or
  radio after a navigation.

## Open points

1. **Non-serialised parts** (hoses, filters, spark plugs) are *parts
   used* on an item, not components. A component needs a serial number;
   an unserialised life-limited item can be given a lot number as its
   serial. Fine?
2. **Who is "deferred by"** on a deferral: free text (the certifying
   staff's name and licence, or the pilot-owner within Appendix II
   scope). Cirkus records it; it does not check it.
3. **Photos on defects** cap at 10 MB per upload, downscaled to ~300 KB,
   one or more per defect, like receipts. Same 15 MB body limit.
4. **Shop-released orders are recorded by the technical manager**
   after the fact, from the work report. The CRS lives on paper until M3
   attaches the PDF. Fine for now?

## Not in this phase

Documents (M3); ADs/SBs as a register (M3); the ARC (M3); the
airworthiness chip on Home and Book (M4); parts inventory; e-mail.
