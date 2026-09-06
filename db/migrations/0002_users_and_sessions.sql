-- Phase 01: accounts.
-- gen_random_uuid() is built into Postgres 13+; pgcrypto is enabled too so
-- this also works on older servers.
create extension if not exists pgcrypto;

create type user_role as enum ('admin', 'pilot');
create type user_status as enum ('pending', 'approved', 'rejected');

create table users (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	email text not null unique,
	password_hash text,
	role user_role not null default 'pilot',
	status user_status not null default 'pending',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Plain Postgres-backed sessions (no Redis) per the build plan.
create table sessions (
	token text primary key,
	user_id uuid not null references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);
