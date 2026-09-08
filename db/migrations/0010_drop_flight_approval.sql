-- Phase 07: no more flight approval.
--
-- After trial use the club found the approval step unnecessary. The process
-- is reservation -> flight log entry -> invoice, nothing in between. A flight
-- is 'submitted' from the moment the pilot saves it until an admin puts it on
-- an invoice, when it becomes 'billed' and is frozen. Cancelling the invoice
-- returns it to 'submitted'. Until billed, the pilot (or an admin) can edit
-- or delete it.
--
-- Any flight that was approved but not yet billed simply becomes billable
-- again. The approver name and time are dropped; nothing else refers to them.

update flight_log_entries set status = 'submitted' where status = 'approved';

alter table flight_log_entries
	drop column approved_by,
	drop column approved_at;

-- Postgres cannot remove a value from an enum in place, so the type is
-- recreated with just the two values that remain ('draft' was never used).
alter type flight_log_status rename to flight_log_status_old;
create type flight_log_status as enum ('submitted', 'billed');

alter table flight_log_entries
	alter column status drop default,
	alter column status type flight_log_status using status::text::flight_log_status,
	alter column status set default 'submitted';

drop type flight_log_status_old;
