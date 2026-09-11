# Cirkus — Phase 11 plan: Procountor invoicing

*Drafted 11 September 2026. For approval before code.*

Procountor becomes the system of record for invoices. Cirkus decides
what to bill (flights that were actually flown and logged), creates the
invoice in Procountor, and Procountor numbers it, sends it to the pilot,
and keeps the receivable. Cirkus polls Procountor for status so pilots
and admins see *sent* and *paid* without anyone clicking.

Decisions already made: Procountor is the system of record and sends the
invoices; pilots are customers (business partners) in Procountor; flights
always carry normal Finnish VAT; status comes back by polling; expenses
stay outside; API access is enabled and credentials follow.

## The process

Book → fly → log the flight → (admin) *Create invoices* → Cirkus pushes
each invoice to Procountor → Procountor sends it and records payment →
Cirkus polls and shows the status.

## What changes in Cirkus

**Invoice lifecycle.** Today: `issued → paid | cancelled`, with *Mark
paid* and *Cancel* buttons. After: Cirkus keeps a local row per invoice
(for the flights on it and for the pilot's view) but the status mirrors
Procountor:

| Cirkus status | Meaning | Set by |
|---|---|---|
| `draft` | created in Cirkus, not yet in Procountor | Create invoices |
| `sent` | in Procountor and sent to the pilot | push + Procountor's send |
| `paid` | Procountor reports it paid | polling |
| `error` | push or send failed; flights stay billed, admin retries | push |

*Mark paid* goes. *Cancel* goes for anything that reached Procountor (an
invoice in the books is reversed with a credit note in Procountor itself,
by the bookkeeper); it remains only for `draft`/`error` invoices that never
got there, where it releases the flights as today. Since only logged
flights are billed, the normal case never needs it.

**Numbers.** Procountor's invoice number and bank reference number
(viitenumero) are what the pilot sees and pays with. Cirkus's own
`2026-0001` number stays as an internal id shown small.

**Customers.** Each user gets a Procountor business-partner id. On
*Accounts*, a *Procountor customer* field with a *Find* button that
searches Procountor by the person's email and name and offers the
matches to link. Creating a customer from Cirkus is deliberately not
done: an unlinked pilot's invoice stays `draft` with the message "link
this pilot to a Procountor customer first", so nothing reaches the books
under the wrong name.

**VAT.** Every invoice row carries the normal Finnish VAT rate (25.5 %,
configurable in one place in case it changes). The `taxable` flag on
flight types stops affecting invoices (it stays as information for the
bookkeeper). Each row posts to the flight type's bookkeeping account
(3210, 3220, …) — Procountor validates the account exists.

**Rows.** One invoice row per flight, as now: "2026-09-05 OH-KML
EFHK→EFTU · 1.20 h Tacho", quantity = hours, unit = h, unit price = the
member rate, VAT 25.5 %. Payment terms 14 days, EUR, the club's bank
account from Procountor's settings.

## Integration — `src/lib/server/procountor.ts`

A small client over `fetch`, nothing else: token handling (client
credentials against the club's API user; the access token cached for
its hour), `findPartners(query)`, `createInvoice(payload)`,
`sendInvoice(id)`, `getInvoice(id)`. Base URL and credentials from env:
`PROCOUNTOR_BASE_URL` (`https://pts-api.procountor.com/api` for the
test environment, `https://api.procountor.com/api` in production),
`PROCOUNTOR_CLIENT_ID`, `PROCOUNTOR_CLIENT_SECRET`, plus the API user's
credentials if client-credentials needs them — all Container App
secrets like `DATABASE_URL`. Requests stay well under Procountor's rate
limits (90/min on the test server). Every call is logged to the activity
log with its outcome.

The exact request shapes (`counterParty`, `paymentInfo`, `invoiceRows`,
`invoiceChannel`, the send endpoint, the status values a paid invoice
reports) are confirmed against the test environment before anything is
wired to production — the documentation describes them, the test
environment settles them.

**Push.** *Create invoices* works as today, then immediately pushes each
new invoice: `POST /invoices` with `status UNFINISHED`, then the send
call with the channel Procountor is configured for (email or e-invoice,
whatever the club set up). Success stores Procountor's id, number and
reference and sets `sent`. Failure sets `error` with the message shown
on the Billing page next to a *Retry* button; the flights stay `billed`
so they can't be invoiced twice.

**Poll.** `syncInvoiceStatuses()` fetches every `sent` invoice from
Procountor and sets `paid` (with the payment date) when Procountor says
so. It runs when an admin opens *Billing* or a pilot opens *Invoices*
(throttled to once per 15 minutes), and on a schedule: a GitHub Actions
workflow on an hourly cron that calls `POST /internal/sync` with a shared
secret — no new Azure resource, and the app scaling to zero is not a
problem because the call wakes it. (An Azure Container Apps Job would do
the same if you'd rather keep it inside Azure.)

## Pages

- **Billing (admin)**: unchanged *Ready to invoice* section. The
  invoices table gains Procountor number and reference, the status pill
  (`draft` / `sent` / `paid` / `error`), *Retry* on errors, *Cancel* only
  on drafts and errors, and a *Sync now* button. A banner when Procountor
  is not configured.
- **Invoices (pilot)**: Procountor number, reference number to pay with,
  due date, status. The printable page stays (it's the same content).
- **Accounts (admin)**: the *Procountor customer* link field.
- **Home**: unchanged.

## Migration 0014

```sql
alter table users add column procountor_partner_id integer unique;
alter type invoice_status rename to invoice_status_old;
create type invoice_status as enum ('draft', 'sent', 'paid', 'error', 'cancelled');
-- existing rows: issued -> sent (they were handed out already), paid/cancelled as is
alter table invoices
	alter column status drop default,
	alter column status type invoice_status using (case status::text when 'issued' then 'sent' else status::text end)::invoice_status,
	alter column status set default 'draft',
	add column procountor_id integer unique,
	add column procountor_number text,
	add column procountor_reference text,
	add column procountor_status text,
	add column sent_at timestamptz,
	add column synced_at timestamptz,
	add column last_error text;
drop type invoice_status_old;
```

Invoices created before this phase keep working as history; they never
existed in Procountor and show without a Procountor number.

## Tests

The flows must not depend on Procountor being reachable. A tiny fake
Procountor (`tests/e2e/fake-procountor.mjs`, ~80 lines of Node `http`)
implements the five calls with an in-memory store and a
"mark this invoice paid" test hook; `playwright.config.ts` starts it as a
second web server and points the app at it. Flow 03 becomes: create →
`sent` with a number and reference → fake marks it paid → *Sync now* →
`paid` on both pages; plus an unlinked pilot leaving a `draft` with the
right message, and an error → *Retry* path. CI unchanged otherwise.

Against the real test environment, before merging: one invoice for a test
customer end to end, checked in Procountor's UI.

## Docs

README: the process, the env vars, the hourly sync workflow, and a new
gotcha section for Procountor (rate limits, validation errors, token
expiry). Admin manual: section 4 rewritten. Pilot manual: section 4, one
paragraph (pay with the reference number).

## Files

```
db/migrations/0014_procountor.sql
src/lib/server/db.ts, src/lib/server/procountor.ts, src/lib/server/invoicing.ts
src/routes/internal/sync/+server.ts
src/routes/(app)/(admin)/manage/invoices/{+page.server.ts,+page.svelte}
src/routes/(app)/(admin)/manage/accounts/{+page.server.ts,+page.svelte}
src/routes/(app)/invoices/{+page.server.ts,+page.svelte}, src/routes/(app)/invoices/[id]/…
.github/workflows/sync.yml, .github/workflows/deploy.yml (secrets → env)
tests/e2e/fake-procountor.mjs, playwright.config.ts, tests/e2e/03-invoice.spec.ts
README.md, docs manuals
```

About two days, plus the end-to-end check in the test environment once
credentials arrive. One migration, one branch.

## Open questions

1. **Are the hourly rates VAT-inclusive or exclusive?** €240/h today —
   is that what the pilot pays (Procountor row: net 191.24 + VAT), or the
   net price (pilot pays 301.20)? This decides how the row's unit price is
   sent and how the Fleet page labels the rate. Nothing else in the plan
   depends on it, but the first real invoice does.
2. **Sending channel** is taken from the club's Procountor settings
   (email to the customer's address). Confirm the pilots' emails in
   Procountor are the ones they'd expect invoices at.
3. **Old invoices**: the ones already created in Cirkus and paid by hand
   stay as they are. Fine?

## Not in this phase

Expenses to Procountor; credit notes from Cirkus; fetching the invoice
PDF from Procountor into Cirkus (the printable page stays); customer
creation from Cirkus; guest customers.
