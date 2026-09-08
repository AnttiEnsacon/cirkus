# Cirkus — handoff for the next development phases

*Written 8 September 2026, at the end of the MVP build. Read `README.md`
first for what the system is and how to run and deploy it; this document
is about where development stands and where it should go next.*

## 1. Where things stand

The MVP from the build plan is complete and in use: accounts, reservations
with a calendar, flight log and logbook, invoicing, plane registry, plus the
additions made after launch review (flight types as the club keeps them,
persons on board, tacho instead of Hobbs, add-member and change-password,
the styling pass, the login photo). 21 commits on `main`, 9 migrations,
deployed on Azure Container Apps from GitHub Actions.

What exists, by route:

| Route | Who | Notes |
|---|---|---|
| `/login`, `/register`, `/password` | all | email + password; self-registration lands as *pending* |
| `/home` | all | dashboard; admins get a "needs your attention" box |
| `/book` | all | week grid (laptop) / day strip (phone), Helsinki time, 15-min steps, DB-level overlap constraint |
| `/log`, `/logbook` | all | UTC; tacho start prefilled from the aircraft's last flight; POB; second pilot as instructor/backup |
| `/invoices`, `/invoices/[id]` | all | own invoices; printable |
| `/more` | all | phone menu |
| `/manage/approvals` | admin | approve/reject registrations |
| `/manage/accounts` | admin | add member, edit, set password |
| `/manage/fleet` | admin | aircraft, rates, co-owners |
| `/manage/flight-types` | admin | the club's list with account + VAT flag |
| `/manage/flights` | admin | approve flights (what invoicing picks up) |
| `/manage/invoices` | admin | create per pilot or all; mark paid; cancel (releases flights) |

## 2. Deliberately not built (from the plan)

These were scoped out of the MVP on purpose. The data model
(`flight_club_model/schema.sql`, the earlier T-SQL draft) already sketches
most of them.

1. **Customers and the guest rate.** `aircraft.guest_rate_per_hour` exists
   but nothing uses it. Needs a `customers` table, `customer_id` on flight
   log entries and invoices, and per-customer rates. The invoicing module
   groups by pilot today; it would group by "billed party".
2. **VAT on invoices.** `flight_types.taxable` is stored and correct; the
   invoice has no VAT line. Decide the rate and whether invoices are shown
   inclusive or exclusive before touching `invoicing.ts`.
3. **Email.** No mail is sent at all: password resets are done by an admin,
   there are no reminders or invoice notifications. Azure Communication
   Services or any SMTP relay would do; the first use should be
   "your invoice is ready".
4. **Scheduled invoicing.** Admin-triggered on demand was the decision.
   A monthly run would be a small scheduled job calling
   `createInvoiceForPilot` for everyone in `unbilledByPilot()`.
5. **Owner-tier permissions.** `aircraft_owners` records who co-owns what,
   but permissions are just admin / pilot.
6. **Fuel credits** on invoices — explicitly not wanted.

## 3. Gaps found along the way (worth doing soon)

Roughly in the order I would do them.

- **Editing a logged flight.** Today a pilot deletes and re-enters (while
  still *submitted*); admins can only approve/un-approve/delete. A typo in
  a tacho reading is the most likely correction — an edit form on
  `/log/[id]` reusing the Log page would cover it.
- **Editing a reservation.** Same story: cancel and rebook.
- **Automated tests.** There are none. Everything was verified by hand
  against a local Postgres 16 (migrations, the overlap constraint, the
  invoicing lifecycle) and by screenshots at 390px and 1440px. The two
  most valuable additions: a CI job that runs all migrations on a fresh
  Postgres (catches the Azure-style failures early), and a handful of
  Playwright flows (login → book → log → approve → invoice).
- **Home-screen install.** The product sheet tells people to add the site
  to their phone's home screen; there is no web app manifest yet, so it
  gets a generic icon. A `manifest.webmanifest` with the icon in `static/`
  is fifteen minutes' work.
- **Finnish.** The UI is English. The club is Finnish. Paraglide (already
  offered by `sv create`) or plain string tables — the text volume is
  small.
- **Rate history.** The rate lives on `aircraft`; an invoice freezes the
  rate on its lines, so history is preserved on invoices but not as a
  table. Fine until someone needs "what was the rate in March".
- **Payments.** `paid_at` + `paid_reference` on the invoice; no partial
  payments. The data model had a `payments` table if that's ever needed.
- **Flight-types page on the phone** scrolls sideways; it's an admin page
  and was accepted as such.
- **Test data.** Once the real accounts are in use, delete the test flights
  and the three inactive placeholder flight types (Local, Training,
  Cross-country) from `/manage/flight-types`.

## 4. How the code is organised, and the conventions to keep

- **SvelteKit, server-rendered, forms with actions.** No client-side data
  fetching, no API layer. Pages are `+page.server.ts` (load + actions) and
  `+page.svelte`. The only client-side state is Svelte 5 `$state` for form
  interactions (calendar selection, date/time pairs).
- **Database access is Kysely over `pg`**, typed by hand in
  `src/lib/server/db.ts`. When a migration adds or renames a column, update
  the interface there — the type-check (`npm run check`, also run in CI)
  will then point at every place that needs changing.
- **Migrations** are numbered SQL files in `db/migrations/`, applied by
  `db/migrate.js` on container start, tracked in `schema_migrations`.
  Never edit an applied file; add the next number. Each file runs in a
  transaction. Comments in a migration are the place to record why.
- **Time.** `src/lib/server/time.ts` holds every conversion. Reservations:
  Helsinki wall-clock in and out (`fromHelsinkiInputValue`,
  `helsinkiDay/Time/Range`). Logbook: UTC only (`toUtcInputValue`,
  `formatUtc`). Nothing else should touch time zones.
- **Money.** `numeric` in Postgres, strings from `pg`; format with
  `Number(x).toFixed(2)` at the edge. Invoice line `amount` and
  `flight_hours` are generated columns — never computed in application code.
- **Status flows.** users: pending → approved/rejected. Flights:
  submitted → approved → billed (cancelling an invoice returns billed →
  approved). Invoices: issued → paid, or issued → cancelled. These are
  Postgres enums; extend by migration.
- **Styling.** Tokens and shared components live in `src/app.css` (card,
  chip, status, btn, field, table, list-item, alert). Pages carry only
  layout-specific CSS. Breakpoint 900px: below it the phone shell (top bar,
  bottom tabs), above it the sidebar. Icons are `Icon.svelte`. The palette
  and components come from the approved mock-up; don't introduce new
  colours.
- **Copy.** After the tidy-up review, pages have no eyebrows or explanatory
  hints unless the information changes what the user should do. Keep it
  that way.

## 5. How changes were reviewed (recommended to continue)

Every UI change after the styling pass went: branch → build → run the
built app against a throwaway Postgres 16 with seeded data → screenshots
at 390px (iPhone) and 1440px (laptop), exercising the interaction under
test → fix what the screenshots showed → review with Antti → merge.
Three real defects were caught that way (truncated times, off-screen
action buttons, a corrupted asset). It costs ten minutes and is worth it.

Azure lessons are in `README.md` under *Azure gotchas*; the short version:
the Postgres extension allow-list, the firewall, "identical image tag means
no new revision", and "no replica when scaled to zero".

## 6. Suggested next phases

**Phase 07 — corrections and confidence.** Edit flight / edit reservation;
migration test in CI; three Playwright flows; web app manifest. Small
pieces, all reduce day-to-day friction.

**Phase 08 — Finnish.** Translate the UI; keep English available for the
one co-owner whose first language it isn't, if any.

**Phase 09 — invoicing, second pass.** VAT line; "invoice is ready" email;
optional monthly run. Needs the club's decision on VAT treatment first.

**Phase 10 — customers.** Only if the club starts renting to non-owners.
The guest rate is already waiting.

## 7. People and access

- Admins: Kari Häkkinen, Antti Hänninen (both can add members and set
  passwords).
- Azure: resource group `rg-cirkus` (app), Postgres `ensacon-ts-pg` in
  `ensacon-ts-rg`. GitHub: `AnttiEnsacon/cirkus`, deploy on push to `main`
  via OIDC — no stored Azure credential.
- Design references (Claude artifacts, linked from the project chat): data
  model, build plan, the mock-up canvas, the tidy-up and flight-log review
  pages. Product sheet: `docs/cirkus-product-sheet.pdf`.
