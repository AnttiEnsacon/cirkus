-- Phase 03: reservations.
-- btree_gist adds GiST index support for plain equality (uuid here),
-- needed so the exclusion constraint below can combine "same aircraft"
-- with "overlapping time range" in a single index.
--
-- AZURE NOTE: Azure Database for PostgreSQL Flexible Server ships with an
-- empty extension allow-list, so this line fails with "extension
-- "btree_gist" is not allow-listed" on a fresh server. It is a one-time
-- server setting (done for KML Aviation's server on 2026-09-06):
--   az postgres flexible-server parameter set --resource-group <rg> \
--     --server-name <server> --name azure.extensions --value btree_gist
-- (the value replaces the whole list — include any extensions already
-- listed, comma-separated). Any future migration that reaches for an
-- extension needs the same step first.
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
