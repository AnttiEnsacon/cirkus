-- Phase 04: flight log entries and logbook.

-- Club-maintained reference list. Rows are created on first use from the
-- log-a-flight form (any valid 4-letter ICAO code), and can be given a
-- proper name later. XXXX is the placeholder for "no fixed aerodrome"
-- (seaplane ops on open water, off-field landings).
create table airports (
	icao_code text primary key check (icao_code ~ '^[A-Z]{4}$'),
	name text,
	is_generic boolean not null default false,
	created_at timestamptz not null default now()
);

insert into airports (icao_code, name, is_generic) values
	('XXXX', 'No fixed aerodrome', true),
	('EFHK', 'Helsinki-Vantaa', false)
on conflict (icao_code) do nothing;

-- Club-maintained list rather than a hardcoded enum, so the club can add
-- kinds of flight without a code change.
create table flight_types (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	label text not null,
	is_active boolean not null default true,
	sort_order integer not null default 0
);

insert into flight_types (code, label, sort_order) values
	('local', 'Local', 1),
	('training', 'Training', 2),
	('cross_country', 'Cross-country', 3)
on conflict (code) do nothing;

create type flight_log_status as enum ('draft', 'submitted', 'approved', 'billed');
create type second_pilot_role as enum ('instructor', 'backup_pilot');

create table flight_log_entries (
	id uuid primary key default gen_random_uuid(),
	reservation_id uuid references reservations (id) on delete set null,
	aircraft_id uuid not null references aircraft (id),
	pilot_id uuid not null references users (id),
	second_pilot_id uuid references users (id),
	second_pilot_role second_pilot_role,
	-- Logbook times are UTC, always (see the build plan).
	block_off_at timestamptz not null,
	block_on_at timestamptz not null,
	-- Hobbs is the billing basis; flight_hours derives from it.
	hobbs_start numeric(7, 1) not null,
	hobbs_end numeric(7, 1) not null,
	flight_hours numeric(6, 2) generated always as (hobbs_end - hobbs_start) stored,
	departure_airport_code text not null references airports (icao_code),
	arrival_airport_code text not null references airports (icao_code),
	day_landings integer not null default 0 check (day_landings >= 0),
	night_landings integer not null default 0 check (night_landings >= 0),
	refuel_liters numeric(6, 2) check (refuel_liters is null or refuel_liters >= 0),
	oil_added_liters numeric(4, 2) check (oil_added_liters is null or oil_added_liters >= 0),
	flight_type_id uuid not null references flight_types (id),
	remarks text,
	status flight_log_status not null default 'submitted',
	approved_by uuid references users (id),
	approved_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint flight_log_hobbs_valid check (hobbs_end > hobbs_start),
	constraint flight_log_block_valid check (block_on_at > block_off_at),
	constraint flight_log_second_pilot_distinct check (second_pilot_id is null or second_pilot_id <> pilot_id),
	constraint flight_log_second_pilot_role check ((second_pilot_id is null) = (second_pilot_role is null))
);

create index flight_log_aircraft_idx on flight_log_entries (aircraft_id, block_off_at desc);
create index flight_log_pilot_idx on flight_log_entries (pilot_id, block_off_at desc);
create index flight_log_second_pilot_idx on flight_log_entries (second_pilot_id) where second_pilot_id is not null;
create index flight_log_status_idx on flight_log_entries (status);
