# Cirkus — Phase 09 plan: a second aircraft, billed by airborne time

*Drafted 8 September 2026. For approval before code. (The handoff's
"Phase 09 — invoicing second pass" moves to Phase 10, customers to 11.)*

A new aircraft joins the fleet and is billed by take-off-to-landing time,
not Tacho. OH-KML stays Tacho-billed. Which basis applies is a property of
the aircraft, set on the Fleet page; every logged flight remembers the
basis it was logged under.

Decisions already made: airborne time is billed to the exact minute
(47 min = 0.78 h). The pilot's logbook shows block hours (off-block to
on-block) for every aircraft; billed hours appear on the billing pages and
invoices only. Recording the Tacho/Hobbs meter on the new plane is
optional, switched on or off per aircraft on the Fleet page.

## Data model — migration 0012

```sql
create type billing_basis as enum ('tacho', 'airborne');

alter table aircraft
	add column billing_basis billing_basis not null default 'tacho',
	-- Whether the log form asks for meter readings. Always true for a
	-- tacho-billed aircraft; optional otherwise (maintenance record only).
	add column records_tacho boolean not null default true,
	add constraint aircraft_tacho_billing_records_tacho
		check (billing_basis <> 'tacho' or records_tacho);

alter table flight_log_entries
	-- Copied from the aircraft when the flight is saved, like the invoice
	-- line freezes the rate: changing a plane's basis never rewrites history.
	add column billing_basis billing_basis not null default 'tacho',
	add column takeoff_at timestamptz,
	add column landing_at timestamptz,
	alter column tacho_start drop not null,
	alter column tacho_end drop not null,
	-- block_hours: what the pilot's logbook shows, every aircraft.
	add column block_hours numeric(6, 2) generated always as
		(round(extract(epoch from (block_on_at - block_off_at)) / 3600.0, 2)) stored;

alter table flight_log_entries drop constraint flight_log_tacho_valid;
alter table flight_log_entries
	add constraint flight_log_tacho_valid
		check (tacho_end is null or tacho_start is null or tacho_end > tacho_start),
	add constraint flight_log_tacho_pair
		check ((tacho_start is null) = (tacho_end is null)),
	add constraint flight_log_airborne_pair
		check ((takeoff_at is null) = (landing_at is null)),
	add constraint flight_log_airborne_valid
		check (takeoff_at is null or (takeoff_at >= block_off_at and landing_at > takeoff_at and landing_at <= block_on_at)),
	add constraint flight_log_basis_complete
		check ((billing_basis = 'tacho' and tacho_start is not null)
		    or (billing_basis = 'airborne' and takeoff_at is not null));

-- flight_hours stays the billed figure and stays generated, so invoicing,
-- the billing page and the home stats keep reading the same column.
alter table flight_log_entries drop column flight_hours;
alter table flight_log_entries
	add column flight_hours numeric(6, 2) generated always as (
		case billing_basis
			when 'tacho' then tacho_end - tacho_start
			else round(extract(epoch from (landing_at - takeoff_at)) / 3600.0, 2)
		end) stored;
```

Existing rows: all OH-KML, basis `tacho`, tacho readings present — every
constraint holds without a data change. `invoice_line_items.hours_billed`
is a plain copy taken at invoice time and is untouched.

`db.ts`: `BillingBasis` type, the new columns on both tables,
`flight_hours` still `never`-typed for writes, `block_hours` likewise.

## Fleet page

Two fields per aircraft: *Billing* (Tacho / Airborne time) and *Record
Tacho readings* (checkbox; forced on and greyed for Tacho billing). Adding
the new aircraft is then a Fleet-page task on the day it arrives: tail
number, type, seats, rates, basis. No code involved.

## The flight form

The aircraft select drives the *Times* card, with the selected aircraft as
one piece of client state in `FlightForm`:

- **Tacho-billed aircraft** — exactly as today: off/on-block, Tacho start
  (prefilled from the last flight) and end, both required.
- **Airborne-billed aircraft** — off/on-block as today, plus two more UTC
  date/time pairs, *Take-off* and *Landing*, required. They default to the
  off-block and on-block values, and their dates follow the block dates
  the way the on-block date follows the off-block date today. If the
  aircraft records Tacho, the two Tacho fields are shown below, optional,
  labelled *Tacho (for maintenance)*; otherwise they are hidden.

`parseFlightForm` validates by the aircraft's basis: the required pair for
the basis; take-off within the block window and landing after take-off;
Tacho end after start whenever both are given. Error messages name the
field. The basis is copied onto the entry at save; editing a flight keeps
the entry's own basis even if the plane's setting has changed since (the
form reads the basis from the entry when editing, from the aircraft when
creating).

## Everywhere a flight is shown

- **Logbook**: the *Hrs* column and the three totals (total, PIC, this
  month) switch to `block_hours`. The detail under the hours shows the
  billing figure per basis — "Tacho 1234.5 → 1235.7" or
  "T/O 10:12Z → LDG 10:59Z" — so the pilot can still see what will be
  billed.
- **Admin Flights**, **Billing** (the per-flight rows under each pilot),
  **invoice line description**: same two renderings of the billing detail;
  hours are `flight_hours` (billed) as now.
- **Invoice page** and **print**: unchanged in structure; the line
  description already carries the date, tail and route, and gains
  "1.20 h Tacho" / "0.78 h airborne".
- **Home**: the recent-flight card and the pilot's hour stats use
  `block_hours`; the admin's "€ not yet invoiced" keeps `flight_hours`.

## Tests and docs

`seed-test.js` adds a second aircraft, airborne-billed, Tacho not
recorded (a placeholder tail such as `OH-TST`, type "Test plane", 4
seats, €200/h). Flow 02 gains a second half: log a flight on it with
take-off 10:12Z and landing 10:59Z, expect 0.78 h billed and the block
hours in the logbook; edit it and move landing outside the block window
to see the refusal. Flow 03 checks the invoice bills that flight at
0.78 × 200 = €156.00 next to the Tacho flight's line. The pilot manual's
section 3 gets one paragraph on the second aircraft; the admin manual's
section 6 mentions the two Fleet fields. README table row for logging
updated.

## Files

```
db/migrations/0012_billing_basis.sql
src/lib/server/db.ts, src/lib/server/flightLog.ts
src/lib/components/FlightForm.svelte
src/routes/(app)/log/{+page.server.ts}, src/routes/(app)/log/[id]/+page.server.ts
src/routes/(app)/logbook/{+page.server.ts,+page.svelte}
src/routes/(app)/home/+page.server.ts
src/routes/(app)/(admin)/manage/fleet/{+page.server.ts,+page.svelte}
src/routes/(app)/(admin)/manage/flights/{+page.server.ts,+page.svelte}
src/routes/(app)/(admin)/manage/invoices/+page.svelte, src/lib/server/invoicing.ts
src/routes/(app)/invoices/[id]/… (line description only)
db/seed-test.js, tests/e2e/02-log.spec.ts, tests/e2e/03-invoice.spec.ts
README.md, docs manuals
```

About a day. One migration (no extension), one branch, the usual
screenshot review.

## Not in this phase

Different rates per flight type or per pilot; a guest rate in use
(Phase 11); recording engine cycles or landings-based maintenance counts;
changing how OH-KML is billed.
