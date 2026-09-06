-- Phase 00 smoke-test migration.
-- Confirms the migration runner works end to end against Azure Postgres.
-- Real tables (users, aircraft, reservations, flight_log, invoices, ...)
-- start with 0002 in Phase 01.

create table if not exists schema_info (
	key text primary key,
	value text not null
);

insert into schema_info (key, value)
values ('project', 'cirkus')
on conflict (key) do nothing;
