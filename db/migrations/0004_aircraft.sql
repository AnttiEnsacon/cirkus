-- Phase 02: plane registry.
create table aircraft (
	id uuid primary key default gen_random_uuid(),
	tail_number text not null unique,
	type text not null,
	seats integer not null check (seats > 0),
	member_rate_per_hour numeric(8, 2) not null,
	guest_rate_per_hour numeric(8, 2) not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Ownership is many-to-many: an aircraft can have several owners, and an
-- owner could co-own more than one aircraft down the line. Owner-tier
-- permissions beyond "is an owner" are out of scope for MVP — fleet
-- management is admin-only regardless of ownership (see the build plan).
create table aircraft_owners (
	aircraft_id uuid not null references aircraft (id) on delete cascade,
	user_id uuid not null references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (aircraft_id, user_id)
);
