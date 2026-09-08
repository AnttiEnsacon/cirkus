# Cirkus — Phase 10 plan: activity log

*Drafted 8 September 2026. For approval before code. (Invoicing second
pass moves to Phase 11, customers to 12.)*

Every sign-in, sign-out and write in the app is recorded, with who, when,
from where, and what it touched. Admins read it on a new *Activity* page.
Nobody else sees it.

Decisions already made: the automatic layer (every form action) plus
explicit auth events; IP address and user agent are stored and kept;
admin-only.

## Data model — migration 0013

```sql
create table user_actions (
	id bigserial primary key,
	at timestamptz not null default now(),
	user_id uuid references users (id) on delete set null,
	-- Failed logins have no user; the attempted email goes in details.
	action text not null,            -- 'auth.login', 'flight.create', 'invoice.mark_paid', …
	route text,                      -- SvelteKit route id, e.g. '/(app)/book'
	ok boolean not null default true,-- false when the action was refused (fail()) or threw
	entity_type text,                -- 'flight' | 'reservation' | 'invoice' | 'expense' | 'user' | 'aircraft' | …
	entity_id text,
	details jsonb,                   -- small, human-readable: tail number, invoice number, amounts
	ip inet,
	user_agent text
);
create index user_actions_at_idx on user_actions (at desc);
create index user_actions_user_idx on user_actions (user_id, at desc);
create index user_actions_action_idx on user_actions (action, at desc);
```

Append-only: nothing in the app updates or deletes rows. Deleting a user
keeps their rows (`user_id` becomes null; the name is kept in `details`
at write time so the page still reads sensibly).

## Writing entries

**Automatic — `src/hooks.server.ts`.** The existing `handle` resolves the
session for every request. It gains: for every `POST`, after `resolve`,
insert one row with `action` derived from the route and the action name
(`/(app)/book` + `?/create` → `reservation.create`; a default action →
`<page>.submit`), `ok` from the response status (2xx/3xx = true, a
`fail()` 4xx = false), the user, IP (`event.getClientAddress()`, which
behind Container Apps' ingress reads `x-forwarded-for`) and user agent.
The mapping route → entity name is a small table in
`src/lib/server/audit.ts`; unknown routes fall back to the route id.
The insert is fire-and-forget with its own error handling: a logging
failure never breaks the request.

**Explicit — `audit()` helper in `src/lib/server/audit.ts`.** Actions
whose automatic entry says too little call `audit(event, 'invoice.create',
{ entity: ['invoice', id], details: { number, pilot, total } })`, which
sets a marker on `event.locals` so the hook's automatic entry is
*enriched* rather than duplicated. Call sites:

| Event | Where | Details kept |
|---|---|---|
| `auth.login` / `auth.login_failed` | `/login` action | email; failed: no user, `ok=false` |
| `auth.logout` | `/logout` | — |
| `auth.password_change` | `/password` | — |
| `user.approve`, `user.reject`, `user.add`, `user.update`, `user.set_password` | Approvals, Accounts | target user name |
| `flight.create/update/delete` | log, log/[id], logbook, manage/flights | tail, date, billed hours, "for <pilot>" when an admin edits someone else's |
| `reservation.create/update/cancel` | book | tail, Helsinki range, "for <pilot>" when admin |
| `invoice.create`, `invoice.create_all`, `invoice.mark_paid`, `invoice.cancel` | manage/invoices | invoice number(s), pilot, total, reference |
| `expense.create/update/delete`, `expense.mark_paid`, `expense.reject` | expenses, manage/expenses | vendor, total, reference / reason |
| `aircraft.add/update`, `aircraft.owners`, `flight_type.*`, `expense_category.*` | fleet, flight-types, expense-categories | tail / code |

Session expiry is not an action (nothing is posted); the next login is.
Reads are never logged.

## The Activity page — `/manage/activity`

Admin section, between *Accounts* and nothing (last item). Newest first,
200 per page with *Older* / *Newer*. Filters as chips: *All · Sign-ins ·
Flights · Bookings · Billing · Expenses · Accounts · Fleet & lists*, plus a
person select and a from/to date. Each row: time (Helsinki, since this is
an admin reading a log, with the UTC date in the detail), person (or
"unknown — <email>" for a failed login), a plain-language line built from
`action` + `details` ("Created invoice 2026-014 for Juha Valkonen, €672.00";
"Failed sign-in for antti@…"), and the IP. Refused actions (`ok=false`)
render with the red *rejected*-style pill; failed sign-ins are grouped
visually when several hit the same email within an hour. The user agent
shows in a tooltip on the IP, and in full on a laptop-width column.

Phone: the same list as `list-item`s without the IP column (it is in the
row's detail line).

## Docs and tests

README: what is logged, that IP and user agent are kept indefinitely for
admins only, and that the table is append-only. Admin manual section 7
becomes "Activity" (one paragraph) and the status table moves to 8. Flow
05: pilot logs in, books, logs a flight; a failed login with a wrong
password; admin opens *Activity* and sees all four, the failed one marked;
filter by *Sign-ins* narrows it.

## Files

```
db/migrations/0013_user_actions.sql
src/lib/server/db.ts, src/lib/server/audit.ts, src/hooks.server.ts
src/routes/login/+page.server.ts, src/routes/logout/+server.ts, src/routes/(app)/password/+page.server.ts
src/routes/(app)/(admin)/manage/activity/{+page.server.ts,+page.svelte}
src/routes/(app)/+layout.svelte, src/routes/(app)/more/+page.svelte
audit() calls in the actions listed above (about a dozen files, one line each)
tests/e2e/05-activity.spec.ts, README.md, docs manuals
```

Half a day. One migration, no extension, one branch.

## Not in this phase

Login throttling or lock-out after repeated failures (the log makes it
visible; blocking is a separate decision). Email alerts. Export of the
log. Pilots seeing their own sign-in history.
