-- Phase 10: activity log.
--
-- Every sign-in, sign-out and write in the app is recorded: who, when,
-- from where, what it touched. Written automatically for every POST by
-- src/hooks.server.ts, enriched by audit() at the important actions.
-- Append-only: nothing in the app updates or deletes rows. IP address and
-- user agent are kept (admins only; see README).

create table user_actions (
	id bigserial primary key,
	at timestamptz not null default now(),
	-- Null for a failed sign-in (no user) and after a user is deleted; the
	-- name is kept in details at write time so the page still reads.
	user_id uuid references users (id) on delete set null,
	action text not null,
	route text,
	ok boolean not null default true,
	entity_type text,
	entity_id text,
	details jsonb,
	ip inet,
	user_agent text
);

create index user_actions_at_idx on user_actions (at desc);
create index user_actions_user_idx on user_actions (user_id, at desc);
create index user_actions_action_idx on user_actions (action, at desc);
