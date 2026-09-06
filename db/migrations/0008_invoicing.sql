-- Phase 05: invoicing. Admin-triggered, on demand (no scheduling, per the
-- build plan). One invoice bills one pilot for their approved-but-unbilled
-- flights, one line per flight at the aircraft's member rate at the time
-- the invoice is created. Customers (guest rate) are out of MVP scope.

create type invoice_status as enum ('issued', 'paid', 'cancelled');

create table invoices (
	id uuid primary key default gen_random_uuid(),
	-- Human-readable running number per year, e.g. 2026-0007.
	invoice_year integer not null,
	invoice_seq integer not null,
	invoice_number text generated always as (invoice_year::text || '-' || lpad(invoice_seq::text, 4, '0')) stored,
	pilot_id uuid not null references users (id),
	period_start date not null,
	period_end date not null,
	status invoice_status not null default 'issued',
	subtotal numeric(10, 2) not null default 0,
	total_amount numeric(10, 2) not null default 0,
	currency text not null default 'EUR',
	issued_at timestamptz not null default now(),
	due_date date not null,
	paid_at timestamptz,
	paid_reference text,
	cancelled_at timestamptz,
	notes text,
	created_by uuid not null references users (id),
	created_at timestamptz not null default now(),
	unique (invoice_year, invoice_seq),
	constraint invoices_period_valid check (period_end >= period_start),
	constraint invoices_paid_state check ((status = 'paid') = (paid_at is not null)),
	constraint invoices_cancelled_state check ((status = 'cancelled') = (cancelled_at is not null))
);

create index invoices_pilot_idx on invoices (pilot_id, status);

create table invoice_line_items (
	id uuid primary key default gen_random_uuid(),
	invoice_id uuid not null references invoices (id) on delete cascade,
	flight_log_id uuid not null references flight_log_entries (id),
	aircraft_id uuid not null references aircraft (id),
	hours_billed numeric(6, 2) not null check (hours_billed > 0),
	rate_applied numeric(10, 2) not null check (rate_applied >= 0),
	amount numeric(10, 2) generated always as (round(hours_billed * rate_applied, 2)) stored,
	description text
);

-- Not unique on flight_log_id on purpose: a cancelled invoice keeps its
-- lines for the record, and the same flight is then billed again on a new
-- invoice. "Is this flight already billed" is flight_log_entries.status.
create index invoice_line_items_invoice_idx on invoice_line_items (invoice_id);
create index invoice_line_items_flight_idx on invoice_line_items (flight_log_id);
