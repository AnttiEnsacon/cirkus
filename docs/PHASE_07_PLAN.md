# Cirkus — Phase 07 plan: corrections and confidence

*Drafted 8 September 2026 from `HANDOFF_1.md` and the code on `main`
(f7a48c3); revised the same day after the decision to drop flight approval.
For approval before any code is written.*

## Scope

Six pieces, each on its own branch, each reviewed the way section 5 of the
handoff describes (build → throwaway Postgres → screenshots at 390 px and
1440 px → review → merge). No new colours, no new hints, no API layer, no
client-side fetching. In the order I would do them:

| # | Piece | Migration? | Size |
|---|---|---|---|
| 1 | Web app manifest | no | ~½ h |
| 2 | Migration test in CI | no | ~1 h |
| 3 | Remove flight approval | **0010** | ~½ day |
| 4 | Edit a logged flight | no | ~½ day |
| 5 | Edit a reservation | no | ~½ day |
| 6 | Three Playwright flows | no | ~1 day |

The manifest and the CI job go first because they are cheap and the CI job
then guards everything after it — in particular the one migration in this
phase. Removing approval comes before the edit features because it sets the
rule they follow. Playwright goes last so the flows cover the final process.

## The process after this phase

Reservation → flight log entry → invoice. A flight is *submitted* when the
pilot saves it and *billed* when an admin puts it on an invoice. Until it is
billed, the pilot who logged it (or an admin) can edit or delete it. Once
billed it is frozen; cancelling the invoice unfreezes it. Nobody approves
anything in between.

## 1. Web app manifest

New `static/manifest.webmanifest`: name *Cirkus*, short name *Cirkus*,
`start_url` `/home`, `display` `standalone`, `background_color` `#f4f4f5`
(the `--paper` token) and `theme_color` `#ffffff` as `app.html` already
declares. Icons at 192 and 512 px plus a 180 px `apple-touch-icon`, all
derived from `static/cirkus-icon.png`. That file is 239 × 239, so the 512
version will be an upscale — acceptable for a home-screen tile, but if the
icon exists as a vector or at a larger size, I would rather use that.
(`src/lib/assets/favicon.svg` is still the SvelteKit default Svelte logo and
is unused; it can go.)

`src/routes/+layout.svelte` gets `<link rel="manifest">` and the
`apple-touch-icon` pointed at the 180 px file. Nothing else changes.
iPhone Safari ignores manifest icons and uses the apple-touch-icon; Android
Chrome uses the manifest. In standalone mode there is no browser back button,
which is fine because the phone shell already has bottom tabs everywhere.

## 2. Migration test in CI

New workflow `.github/workflows/ci.yml`, triggered on every push and pull
request (not just `main`). One job, Ubuntu, with a `postgres:16` service
container. Steps: `npm ci`, `npm run check`, `npm run lint`, then
`node db/migrate.js` against the fresh database, then `node db/migrate.js` a
second time and assert the output is `Already up to date.` — the second run
proves idempotency, which is what the container-start `CMD` depends on.

`deploy.yml` stays as it is. Main is reached through reviewed branches, and
those branches will already have run `ci.yml`; I would rather not duplicate
the job inside the deploy workflow. The type-check step in `deploy.yml`
remains as the fail-fast on `main`.

What this does not catch, and the README should keep saying so: the Azure
extension allow-list (`btree_gist` is in the stock `postgres:16` image, so
CI will happily pass a migration that would fail on Azure for a new
extension). I will add a one-line note about that next to the existing
*Azure gotchas* entry.

Once Playwright exists (piece 6) the same workflow gets a second job that
builds the app, runs it against the migrated database and runs the flows.

## 3. Remove flight approval

**Migration `0010_drop_flight_approval.sql`.** In one transaction:

- `update flight_log_entries set status = 'submitted' where status = 'approved'`
  (any approved-but-unbilled flight simply becomes billable again).
- Drop `approved_by` and `approved_at`, and the `flight_log_status_idx`
  index is kept as is.
- Recreate the enum as `submitted | billed`. Postgres cannot remove a
  value from an enum in place, so: rename the old type, create the new
  one, `alter column status type … using status::text::flight_log_status`,
  restore the default, drop the old type. `draft` goes with it; nothing
  ever used it. No extension is involved, so no Azure allow-list step.
- The migration's comment records the decision: after trial use, the club
  found the approval step unnecessary; the process is reservation → log
  entry → invoice.

**`db.ts`.** `FlightLogStatus = 'submitted' | 'billed'`; remove
`approved_by` and `approved_at` from `FlightLogEntriesTable`. `npm run
check` then points at every remaining reference.

**Invoicing (`src/lib/server/invoicing.ts`).** `unbilledByPilot()` and
`createInvoiceForPilot()` filter on `status = 'submitted'` instead of
`'approved'`. `cancelInvoice()` already returns flights to a pre-billing
state; it now sets `submitted`. The `for update` lock inside the
create-invoice transaction is unchanged and still guarantees that a flight
being edited at the moment an invoice is created is either in the invoice
as read, and frozen, or not in it at all. Doc comments updated to match.

**`/manage/flights`.** Becomes a plain admin list of all flights, newest
first, with *Edit* (arrives in piece 4) and *Delete* on unbilled rows and
nothing on billed ones. The *Approve*/*Un-approve* actions, the
pending/others split and the approver column go. It stays in the admin
menu as *Flights* — it is where an admin fixes someone else's entry before
billing.

**`/manage/invoices`.** The empty-state text ("approve flights under
Flights first") becomes "No unbilled flights." Since approval was the only
place an admin saw each flight before money was attached, the unbilled
summary here gains the detail: under each pilot's row, the individual
flights that would go on the invoice (date, aircraft, route, Tacho,
hours, amount at today's rate). Same `list-item` component as elsewhere,
no new styling. This is the sanity check before *Create*.

**Home.** The admin "needs your attention" box loses the "N flights to
approve" row; "€X of approved flying not yet invoiced" becomes "€X of
flying not yet invoiced". `pendingFlights` leaves the load function.

**Logbook.** `canDelete` becomes `status !== 'billed'` (owner or admin);
the delete-refusal message becomes "This flight has been invoiced and can
no longer be changed."

**README and product sheet.** The *Billing run* paragraph under *Day-to-day
admin* drops "approve what's been logged"; the status-flow line in
`HANDOFF_1.md` §4 is updated. The PDF product sheet mentions approval only
if it describes the admin flow — to check; if it does, a one-line note in
the README is enough until the sheet is next regenerated.

**Live data.** The flights on Azure are test data per the handoff, so
losing the approver name/date history costs nothing. This is also the
natural moment to do the clean-up the handoff asks for: delete the test
flights and the three inactive placeholder flight types. I would do that by
hand on the live database after this piece is deployed, not in the
migration (a migration that deletes rows would also run on every future
fresh database, where it has nothing to delete — harmless, but wrong in
spirit).

## 4. Edit a logged flight

**Rule.** A flight can be edited while it is not *billed* — by the pilot
who logged it, or by an admin. Billed flights are frozen; cancelling the
invoice unfreezes them. This is the same predicate as delete.

**Route.** `/log/[id]` — same page as `/log`, prefilled. Implementation:

- The form markup moves from `src/routes/(app)/log/+page.svelte` into
  `src/lib/components/FlightForm.svelte`, taking `data` and `form` and an
  optional `entry` to prefill. `/log/+page.svelte` and `/log/[id]/+page.svelte`
  both render it; the page files keep only the heading and layout CSS,
  as the styling convention asks.
- The parsing and validation block in `/log/+page.server.ts` (everything
  from `str`/`num` through the seat check) moves to
  `src/lib/server/flightLog.ts` as `parseFlightForm(form, me)` returning
  either a typed values object or the error string. `/log` calls it then
  inserts; `/log/[id]` calls it then updates. The airports-on-first-use
  insert moves with it.
- `/log/[id]/+page.server.ts` `load`: 404 if the entry does not exist,
  403 if it is not mine and I am not admin, and a plain message if it is
  billed. Prefills every field from the row (block times via
  `toUtcInputValue`, split into date and time like the create page already
  does). The linked-reservation list is the same query as `/log`, plus the
  currently linked reservation if it is older than two weeks, so the
  existing link is never silently dropped.
- The `update` action re-checks ownership and status inside the same
  transaction as the update, so a race with an invoice being created at the
  same moment loses rather than overwriting a billed flight. Sets
  `updated_at`. Redirects to `/logbook?saved=1` like create does.
- The pilot is never changed by an edit. An admin editing someone else's
  flight edits it *as that pilot's flight*; the pilot's name is shown
  read-only in that case. The "last Tacho" hint on the aircraft option is
  computed excluding the entry being edited, so it does not point at
  itself.

**Entry points.** `/logbook` gets an *Edit* button beside *Delete* under
the same condition (`canEdit`, same predicate as `canDelete`).
`/manage/flights` gets *Edit* on unbilled rows. Both are plain links,
`btn xs`.

**Not in scope.** Editing billed flights, an audit trail of edits
(`updated_at` is enough for now).

## 5. Edit a reservation

**Rule.** Own reservations, or any as admin, as long as the reservation has
not ended (`ends_at` in the future — the same `!r.past` condition that
gates *Cancel* today). Start, end, notes and aircraft can all change.

**Route.** No new page. `/book?edit=<id>` loads the reservation into the
form that is already on the page, the calendar jumps to the week that
contains it, and the form's button reads *Save changes* with a *Cancel
edit* link back to `/book`. The block being edited is highlighted in the
grid so the person sees what they are moving. On the phone, the day strip
does the same.

- `load`: when `?edit` is present, fetch the reservation, apply the
  ownership/admin/not-past checks (redirect to `/book` with an error if
  they fail), and return it as `editing` with Helsinki input values from
  `toHelsinkiInputValue`. The `week` default becomes the reservation's
  week.
- New action `update`: same parsing as `create`, then `UPDATE … WHERE id`
  with the ownership check in the `WHERE`. The exclusion constraint does
  the overlap check for free — an `UPDATE` of a row does not conflict with
  that row's own old range, only with other reservations, so the existing
  `23P01` handling gives the same "That overlaps…" message.
- `/book/+page.svelte`: the *Edit* button next to *Cancel* in the
  this-week list; the form's action and button switch on `data.editing`;
  the `$state` initialisers take `data.editing` over the defaults.

**Not in scope.** Recurring reservations, drag-to-move in the calendar,
telling the owner when an admin moves their booking (no email until
Phase 09).

## 6. Three Playwright flows

`@playwright/test` as a dev dependency, tests in `tests/e2e/`, config
`playwright.config.ts`. The tests run against the **built** app
(`node build`) exactly as the container does, with `DATABASE_URL` pointing
at a throwaway database. A guard in the config refuses to start if the host
contains `azure.com` so the flows can never touch the real data.

**Fixtures.** `db/seed-test.js`: applies migrations (by calling
`migrate.js`), then sets known passwords for two of the seeded accounts
(Antti's as admin, one pilot) using the same bcrypt call as
`db/set-password.js`, and clears reservations, flights and invoices so runs
are repeatable. Nothing in it is reachable from the production image.

**The three flows.**

1. *Book.* Pilot logs in → `/book` → picks a slot → sees it in this
   week's list marked *(you)* → edits it to one hour later (piece 5) →
   a second booking in the same slot fails with the overlap message →
   cancels.
2. *Log and correct.* Pilot → `/log` → saves a flight with Tacho
   1234.5 → 1235.7 → `/logbook` shows 1.20 h → edits the Tacho end to
   1235.8 (piece 4) → logbook shows 1.30 h → admin logs in →
   `/manage/flights` sees the flight with *Edit* and *Delete* available.
3. *Invoice.* With that flight in place, admin → `/manage/invoices` sees
   the pilot's row with the flight listed under it → *Create all* → pilot →
   `/invoices` sees one invoice with one line at the member rate → pilot's
   *Edit* and *Delete* are gone from `/logbook` → admin marks it paid →
   admin cancels a second, fresh invoice and the flight's buttons come back.

Each flow also takes a screenshot at 390 px and 1440 px at its last step,
into `test-results/`, so the review step from section 5 of the handoff
becomes a by-product of running the tests rather than a separate chore.

**CI.** Second job in `ci.yml`, after the migration job passes: build,
start the app with the service Postgres, run the flows, upload
`test-results/` as an artifact on failure. Chromium only. Roughly three
minutes per run.

**Locally.** `npm run test:e2e` with `DATABASE_URL` set to a local
`cirkus_test` database. Works on Windows; Playwright installs its own
Chromium on first run.

## Files touched, by piece

```
1  static/manifest.webmanifest, static/icon-192.png, icon-512.png,
   apple-touch-icon.png, src/routes/+layout.svelte, (rm) src/lib/assets/favicon.svg
2  .github/workflows/ci.yml, README.md
3  db/migrations/0010_drop_flight_approval.sql, src/lib/server/db.ts,
   src/lib/server/invoicing.ts,
   src/routes/(app)/(admin)/manage/flights/{+page.server.ts,+page.svelte},
   src/routes/(app)/(admin)/manage/invoices/{+page.server.ts,+page.svelte},
   src/routes/(app)/home/{+page.server.ts,+page.svelte},
   src/routes/(app)/logbook/{+page.server.ts,+page.svelte},
   README.md, HANDOFF_1.md
4  src/lib/components/FlightForm.svelte, src/lib/server/flightLog.ts,
   src/routes/(app)/log/{+page.server.ts,+page.svelte},
   src/routes/(app)/log/[id]/{+page.server.ts,+page.svelte},
   src/routes/(app)/logbook/+page.svelte,
   src/routes/(app)/(admin)/manage/flights/+page.svelte
5  src/routes/(app)/book/{+page.server.ts,+page.svelte}
6  package.json, playwright.config.ts, tests/e2e/*.spec.ts, db/seed-test.js,
   .github/workflows/ci.yml, README.md
```

## Open questions

1. **Status name.** With the enum being recreated anyway, `submitted` could
   become `logged`, which reads better now that it is the only pre-billing
   state. Cosmetic; costs nothing extra in piece 3, costs a migration later.
   Plan assumes it stays `submitted` unless you say otherwise.
2. **Icon source.** Is there a vector or ≥ 512 px version of the Cirkus
   icon? If not, I upscale the 239 px PNG.
3. **Local Postgres.** The handoff mentions a local Postgres 16 used for
   verification. If it is on your machine, the Playwright flows can run
   there before they run in CI; otherwise CI is the only place they run and
   I verify pieces 3–5 with the throwaway-database method first.
4. **Test-data clean-up on the live database** — done by hand after piece 3
   is deployed, as described there. Say if you would rather do it yourself.

## Not in this phase (unchanged from the handoff)

Finnish UI (Phase 08), VAT and email (Phase 09), customers and the guest
rate (Phase 10), rate history, partial payments, owner-tier permissions.
