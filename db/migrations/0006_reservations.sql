-- Phase 03: reservations.
-- btree_gist adds GiST index support for plain equality (uuid here),
-- needed so the exclusion constraint below can combine "same aircraft"
-- with "overlapping time range" in a single index. Unlike pgcrypto,
-- btree_gist is a plain index-support extension with no special
-- permissions implications, and is listed as supported on every Postgres
-- version Azure Flexible Server offers — if this line ever fails the
-- same way pgcrypto did, allow-list it first:
--   az postgres flexible-server parameter set --resource-group <rg> \
--     --server-name <server> --name azure.extensions --value btree_gist
create extension if not exists btree_gist;

create table reservations (
	id uuid primary key default gen_random_uuid(),
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	user_id uuid not null references users (id) on delete cascade,
	starts_at timestamptz not null,
	ends_at timestamptz not null,
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint reservations_time_valid check (ends_at > starts_at),
	-- '[)' = start inclusive, end exclusive, so one reservation can start
	-- the instant another ends without being treated as an overlap.
	exclude using gist (
		aircraft_id with =,
		tstzrange(starts_at, ends_at, '[)') with &&
	)
);

create index reservations_aircraft_starts_idx on reservations (aircraft_id, starts_at);
create index reservations_user_idx on reservations (user_id);
