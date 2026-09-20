-- Phase 15: airworthiness — the owner-declared maintenance programme
-- (Part-ML), counters from the flight log, and the baseline.
--
-- Design (docs/MAINTENANCE_PLAN.md, docs/PHASE_15_PLAN.md):
--  * nothing stores "next due" — it is computed from an anchor, an
--    interval and today's counters (src/lib/server/airworthiness/due.ts);
--  * a task is done only because a released work order says so; in this
--    phase the only work order is the baseline (kind setup_baseline);
--  * a released work order is frozen by a trigger, not by convention;
--  * ALS items and ADs never carry a tolerance (check constraint here,
--    and again in due.ts).
-- Tables are prefixed mx_ so they read as one group.

-- Roles: the technical manager edits the programme; the licence number is
-- what a pilot-owner release (M2) records.
alter table users
	add column technical_manager boolean not null default false,
	add column licence_no text;

create type mx_hours_source as enum ('tacho', 'block', 'airborne');
create type mx_amp_basis as enum ('ica', 'mip');

-- One row per tracked aircraft; Fleet is untouched.
create table mx_aircraft (
	aircraft_id uuid primary key references aircraft (id) on delete cascade,
	msn text,
	year_built integer,
	mtow_kg integer,
	-- which figure on a flight feeds airframe hours: Tacho end - start
	-- (OH-KML: the readings are hours), block time, or airborne time
	hours_source mx_hours_source not null default 'tacho',
	-- airframe totals at the end of the baseline day; every flight after it is summed
	baseline_at date not null,
	baseline_hours numeric(8, 1) not null,
	baseline_landings integer not null default 0,
	amp_basis mx_amp_basis not null default 'ica',
	amp_reference text,
	amp_declared_at date,
	amp_declared_by uuid references users (id),
	amp_reviewed_at date,
	-- "due soon" thresholds
	warn_hours numeric(5, 1) not null default 10,
	warn_days integer not null default 30,
	warn_landings integer not null default 25,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
	-- 'tacho' on an aircraft with records_tacho = false is refused by the
	-- profile action; a cross-table check is not expressible here.
);

-- Hours and landings the flight log does not have: a ferry flight by the
-- shop, hours before Cirkus, a meter replacement. Corrections supersede,
-- nothing is edited in place.
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

-- The programme: one row per recurring or one-off requirement.
create table mx_tasks (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	code text not null,
	title text not null,
	source mx_task_source not null,
	source_ref text,
	-- intervals: any set; two or more = whichever comes first
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
	constraint mx_tasks_tolerances_nonnegative check (
		tolerance_hours >= 0 and tolerance_days >= 0 and tolerance_landings >= 0),
	constraint mx_tasks_fixed_anchor check (
		anchor_kind <> 'fixed' or anchor_date is not null or anchor_hours is not null or anchor_landings is not null),
	-- airworthiness limitations and ADs: no tolerance, ever
	constraint mx_tasks_no_tolerance_on_limits check (
		source not in ('als', 'ad') or (tolerance_hours = 0 and tolerance_days = 0 and tolerance_landings = 0))
);
create index mx_tasks_aircraft_idx on mx_tasks (aircraft_id) where active;

create type mx_work_order_kind as enum ('setup_baseline', 'scheduled', 'unscheduled', 'pilot_owner', 'defect');
create type mx_work_order_status as enum ('open', 'released');

-- Phase 15 uses this only for the baseline; M2 makes it the maintenance record.
create table mx_work_orders (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	kind mx_work_order_kind not null,
	status mx_work_order_status not null default 'open',
	title text not null,
	opened_at date not null,
	opened_by uuid not null references users (id),
	-- set at release, frozen by the trigger below
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
	-- the baseline's "last done": when and at what readings, from the logbook
	done_on date,
	done_hours numeric(8, 1),
	done_landings integer,
	position integer not null default 0
);
create index mx_work_order_items_wo_idx on mx_work_order_items (work_order_id);
create index mx_work_order_items_task_idx on mx_work_order_items (task_id);

-- A released work order and its items cannot change. The order's trigger
-- fires only when the row is already released, so the release itself
-- (open -> released) passes; the items' trigger reads the order's current
-- status, so a release inserts its items first and flips the status last.
create function mx_refuse_released() returns trigger language plpgsql as $$
begin
	raise exception 'work order % is released and cannot be changed', old.id;
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

-- Compliance is derived, never stored: an item on a released order that
-- names a task. The baseline carries its own "done at"; a real release
-- (M2) uses the order's readings.
create view mx_task_compliance as
	select i.task_id, w.aircraft_id, w.id as work_order_id, w.kind,
	       case when w.kind = 'setup_baseline' then i.done_on else w.released_at end as done_on,
	       case when w.kind = 'setup_baseline' then i.done_hours else w.released_hours end as done_hours,
	       case when w.kind = 'setup_baseline' then i.done_landings else w.released_landings end as done_landings
	  from mx_work_order_items i
	  join mx_work_orders w on w.id = i.work_order_id
	 where w.status = 'released' and i.task_id is not null;
