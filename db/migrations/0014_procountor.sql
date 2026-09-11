-- Phase 11: Procountor is the system of record for invoices.
--
-- Cirkus decides what to bill and creates the invoice in Procountor, which
-- numbers it, sends it to the pilot and holds the receivable; Cirkus polls
-- for the status. Statuses mirror that:
--   draft  created in Cirkus, not yet in Procountor (e.g. pilot not linked)
--   sent   in Procountor and sent to the pilot
--   paid   Procountor reports it paid
--   error  push failed; flights stay billed, admin retries
--   cancelled  a draft/error invoice cancelled in Cirkus (flights released)
-- Invoices from before this phase: 'issued' becomes 'sent' — they were
-- handed out already, just never through Procountor.

alter table users add column procountor_partner_id integer unique;

-- The two state checks and the pilot/status index reference the old type;
-- dropped here and re-created below.
alter table invoices
	drop constraint invoices_paid_state,
	drop constraint invoices_cancelled_state;
drop index invoices_pilot_idx;

alter type invoice_status rename to invoice_status_old;
create type invoice_status as enum ('draft', 'sent', 'paid', 'error', 'cancelled');

alter table invoices
	alter column status drop default,
	alter column status type invoice_status
		using (case status::text when 'issued' then 'sent' else status::text end)::invoice_status,
	alter column status set default 'draft',
	add column procountor_id integer unique,
	add column procountor_number text,
	add column procountor_reference text,
	add column procountor_status text,
	add column sent_at timestamptz,
	add column synced_at timestamptz,
	add column last_error text;

drop type invoice_status_old;

alter table invoices
	add constraint invoices_paid_state check ((status = 'paid') = (paid_at is not null)),
	add constraint invoices_cancelled_state check ((status = 'cancelled') = (cancelled_at is not null));
create index invoices_pilot_idx on invoices (pilot_id, status);
create index invoices_status_idx on invoices (status);
