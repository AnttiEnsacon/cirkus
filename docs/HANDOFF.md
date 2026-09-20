# Cirkus — handoff

*Rewritten 20 September 2026, after Phase 11 (Procountor invoicing);
Phase 15 (airworthiness) added the same day. The first version of this
file (8 September, end of MVP) is in git history.
Read `README.md` first for what the system is, how to run, test and deploy
it, and the Azure and Procountor gotchas; this document is about where
development stands, how the work has been done, and what to do next.*

## 1. Where things stand

KML Aviation Oy's flying-club app: book the aircraft, log flights, get
invoiced, get paid back for expenses. In daily use by the club. SvelteKit 5
+ Kysely over Postgres 16, one container on Azure Container Apps, deployed
by GitHub Actions on every push to `main`. 14 migrations. Five Playwright
flows and a migration check run in CI.

Phases since the MVP, all merged and deployed unless noted:

| Phase | What | Notes |
|---|---|---|
| 07 | Approval step removed; edit flight (`/log/[id]`) and edit reservation (`/book?edit=`); CI; web manifest | process is reservation → log entry → invoice |
| 08 | Expenses with receipt photos (`/expenses`, `/manage/expenses`, categories) | photos stored in Postgres (`receipt_images`), 15 MB body limit |
| 09 | Per-aircraft billing basis: Tacho or airborne (take-off → landing); block hours in the logbook | basis copied onto each flight; generated columns |
| 10 | Activity log (`user_actions`, `/manage/activity`) | every POST, sign-ins incl. failed, IP + browser; admin-only |
| — | Pilot and admin manuals (`docs/cirkus-*-manual.pdf`), running-cost sheet (`docs/cirkus-running-costs.pdf`) | manuals built from `/home/claude/manual/build.py` in the Claude session — source not in repo, see §6 |
| 11 | **Procountor invoicing** — invoices pushed to Procountor, which numbers, emails and collects them; status polled back; pilots linked to Procountor customers | branch `phase-11`; built against a fake Procountor, **not yet run against the real API** (credentials pending) |
| 15 | **Airworthiness M1** — Part-ML owner-declared programme: profile, tasks (+ CSV import), counters from the flight log, the due calculator, the baseline work order; technical-manager role | branch `phase-15`; first of the M1–M5 programme in `docs/MAINTENANCE_PLAN.md`; plan `docs/PHASE_15_PLAN.md` |

What exists, by route:

| Route | Who | Notes |
|---|---|---|
| `/login`, `/register`, `/password` | all | email + password; self-registration lands as *pending* |
| `/home` | all | dashboard; admins get a "needs your attention" box |
| `/book` | all | week grid / day strip, Helsinki time, 15-min steps, DB-level overlap constraint; `?edit=id` edits |
| `/log`, `/log/[id]`, `/logbook` | all | UTC; Tacho or take-off/landing per aircraft; POB; second pilot |
| `/invoices`, `/invoices/[id]` | all | own invoices with Procountor number and bank reference; printable |
| `/expenses`, `/expenses/new`, `/expenses/[id]`, `…/edit` | all | receipts with photo, lines by category |
| `/more` | all | phone menu |
| `/manage/approvals` | admin | approve/reject registrations |
| `/manage/accounts` | admin | add member, edit, set password, **Procountor customer link (Find / Link)** |
| `/manage/fleet` | admin | aircraft, rates (VAT-inclusive), billing basis, records-Tacho flag |
| `/manage/flight-types` | admin | code, label, bookkeeping account, VAT flag |
| `/manage/flights` | admin | all flights; edit/delete anything unbilled |
| `/manage/invoices` | admin | Ready-to-invoice per pilot; Create / Create all (pushes to Procountor); Send (retry) and Cancel for draft/error; Sync with Procountor |
| `/manage/expenses`, `/manage/expense-categories` | admin | pay back / reject; categories with accounts |
| `/manage/activity` | admin | the log, filterable (an *Airworthiness* chip since Phase 15) |
| `/airworthiness` | admin, technical manager | overview per aircraft; *Set up tracking* |
| `/airworthiness/[tail]` | admin, technical manager | dashboard: state with reasons, counters, the due list |
| `/airworthiness/[tail]/programme`, `…/programme/tasks/[id]` | admin, technical manager | profile, tasks, CSV import (+ `…/programme/template` download); the task form with its "computed now" card |
| `/airworthiness/[tail]/usage` | admin, technical manager | how the counters add up, adjustments (supersede, never edit), flights since the baseline |
| `/airworthiness/[tail]/baseline` | admin, technical manager | the baseline work order: draft any number of times, release once |
| `/internal/sync` (POST) | GitHub Actions | hourly Procountor poll, `Authorization: Bearer $PROCOUNTOR_SYNC_SECRET` |
| `/healthz` | anyone | DB check |

## 2. Phase 11 — what is done and what is still open

Done and verified with the fake Procountor (`tests/e2e/fake-procountor.mjs`,
flow 03): draft for an unlinked pilot → link under Accounts → Send →
`sent` with number and reference → paid via sync → error → retry →
cancel; the sync endpoint's secret check. Docs, manuals and README updated.
`deploy.yml` wires the Procountor secrets only when they exist, and sets
the Container App's scale-to-zero cooldown to 10 minutes.

**Still to do, in order:**

1. **If not yet done:** move `_workflows-to-move\deploy.yml` and
   `sync.yml` into `.github\workflows\`, delete that folder, commit on
   `phase-11`, merge to `main`. (The Claude session could not write under
   `.github`.) Deploying before the credentials exist is safe: the
   integration is off and Billing says so.
2. **Credentials.** Add GitHub secrets `PROCOUNTOR_CLIENT_ID`,
   `PROCOUNTOR_CLIENT_SECRET`, `PROCOUNTOR_API_KEY` (if the API user needs
   one), `PROCOUNTOR_SYNC_SECRET` (any long random string), `CIRKUS_URL`
   (the app's public URL) and the repository *variable*
   `PROCOUNTOR_BASE_URL=https://pts-api.procountor.com/api` (test
   environment). Push anything to `main` to deploy.
3. **First real invoice, in the test environment.** Link one pilot (Accounts
   → Find → Link), log one flight, Create invoice, then check in
   Procountor's UI: customer, rows, net price + 25.5 % VAT, channel EMAIL,
   the bank reference. Watch the activity log for the exact error text if
   anything fails. The request shapes came from dev.procountor.com without
   live access, so expect to adjust one or more of these in
   `src/lib/server/procountor.ts`: the token request body (`api_key`), the
   `/businesspartners` search parameter, the send endpoint
   (`POST /invoices/{id}/send`), and which statuses count as paid
   (`isPaidStatus`). Also confirm whether Procountor's `unitPrice` accepts
   four decimals (`net()` in `invoicing.ts` rounds to 4 so totals land on
   the cent) — if it rounds to 2 the pilot may pay a cent more or less than
   the rate × hours, which is fine but worth knowing.
4. **Switch to production**: change the variable to
   `https://api.procountor.com/api` and the secrets to the production API
   user. Enable the `sync.yml` workflow (it is on by default once merged).
5. **Link every existing pilot** to their Procountor customer before the
   next billing run; unlinked pilots' invoices stay `draft` with the reason
   on the row.

Not in scope and deliberately so: credit notes from Cirkus (done in
Procountor), expenses to Procountor, customer creation from Cirkus, fetching
the invoice PDF from Procountor, guest customers.

## 3. Deliberately not built, and gaps worth doing

- **Customers and the guest rate.** `aircraft.guest_rate_per_hour` exists
  but nothing uses it. Needs a `customers` table (or Procountor business
  partners of type customer, now that the link exists) and "billed party"
  instead of pilot in `invoicing.ts`.
- **Email from Cirkus.** None. Procountor now emails invoices, which was the
  most wanted one. Password resets are still done by an admin.
- **Scheduled invoicing.** Admin-triggered on demand was the decision. A
  monthly run would be a second `internal/` endpoint calling
  `createInvoiceForPilot` + `pushInvoice` for `unbilledByPilot()`, hit by a
  cron workflow like `sync.yml`.
- **Owner-tier permissions.** `aircraft_owners` records co-ownership;
  permissions are admin / pilot.
- **Finnish UI.** English throughout; the club is Finnish. Text volume is
  small; Paraglide or plain string tables.
- **Rate history** lives only on invoice lines (`rate_applied`).
- **Partial payments**: not modelled; Procountor handles receivables now,
  so probably never needed in Cirkus.
- **Old invoices** created before Phase 11 (Cirkus-numbered, marked paid by
  hand) stay as they are; they show without a Procountor number.
- **Procountor status beyond paid**: Cirkus stores `procountor_status`
  verbatim but only acts on paid. Overdue/dunning states could be surfaced
  later from the same field.
- **Flight-types page on the phone** scrolls sideways; accepted.
- **Test data**: delete the test flights and the inactive placeholder flight
  types from production once real use is established (may be done already).

## 2b. Phase 15 — airworthiness, what is done and what is next

Done and verified (flow 06 plus 23 unit tests): technical-manager role;
profile with baseline and declaration; tasks by form and by CSV; the
baseline draft → release with the trigger freezing it; counters from the
flight log by Tacho/block/airborne; the due list with hours, calendar and
landings limits, tolerances, `from_original` resets; adjustments with
supersede/cancel; audit entries described on *Activity*.

**Before the first real use:**

1. Take OH-KML's programme and last-done figures from the CAO's final
   status list; type them into the CSV template (Programme page) and the
   baseline page. The `docs/part-ml-amp-tracker-design.md` §4 note on the
   baseline applies: date it to the handover, keep the status list as the
   evidence reference.
2. Set the baseline date to the handover day and its hours/landings to the
   end-of-day airframe totals in **hours** (the Tacho readings are hours on
   OH-KML). Every flight logged after that day counts.
3. Mark the technical managers on *Accounts*.

**Next phases** (`docs/MAINTENANCE_PLAN.md`): M2 work orders with CRS
release, components, defects (phone-first report); M3 directives, mods,
W&B, ARC, documents; M4 the ARC package and the airworthiness chip on
Home/Book; M5 the publications inbox (FAA ADs via the Federal Register
API, EASA biweekly CSV, Cirrus SB page) with Claude extracting the fields.

## 4. How the code is organised, and the conventions to keep

- **SvelteKit, server-rendered, forms with actions.** No client-side data
  fetching, no API layer (the one `+server.ts` under `internal/` is for the
  cron, not the UI). Pages are `+page.server.ts` (load + actions) and
  `+page.svelte`. Client state is Svelte 5 `$state` for form interactions.
- **Svelte 5 gotcha (cost an afternoon):** an unbound `value={…}` input is
  re-synced from its expression whenever a sibling update runs in the same
  fragment, wiping what the user typed. Every form input that the user
  edits is `bind:value` to `$state` (see `FlightForm`, `ExpenseForm`).
- **Database access is Kysely over `pg`**, typed by hand in
  `src/lib/server/db.ts`. When a migration adds or renames a column, update
  the interface there; `npm run check` then points at every place to change.
- **Migrations** are numbered SQL in `db/migrations/`, applied by
  `db/migrate.js` on container start, tracked in `schema_migrations`, each
  in a transaction. Never edit an applied file; add the next number
  (`0015_…`). Changing an enum that has check constraints or indexes on it:
  drop those first, retype, re-add (see `0014_procountor.sql`).
- **Time.** `src/lib/server/time.ts` holds every conversion. Reservations:
  Helsinki wall-clock. Logbook: UTC only. Airworthiness: calendar dates in
  the club's own calendar (`helsinkiToday()`), never times.
- **`date` columns are strings.** Since Phase 15 `db.ts` tells `pg` to
  return Postgres `date` as `'YYYY-MM-DD'` (`DateString` in the table
  interfaces). Before that they came back as local-midnight `Date`s and
  `formatUtcDate(new Date(x))` showed the previous day on any server east
  of UTC — the expenses flow failed on a Helsinki laptop and passed in CI.
  `new Date('2026-09-05')` is UTC midnight, so the existing calls still work.
- **Airworthiness.** Tables are `mx_*`. Nothing stores "next due":
  `programme.ts` loads rows, `due.ts` computes (pure, unit-tested — add a
  case there before changing a rule). Compliance is the view
  `mx_task_compliance` over released work orders, never a table. A released
  work order is frozen by triggers; `db/seed-test.js` is the one place that
  disables them, for a throwaway database. ALS/AD tasks get zero tolerance
  at three levels: form hint, validator, check constraint. Every form
  returns the posted values on `fail()` and the page seeds its `$state`
  from `form.values ?? data` — plain POSTs re-render from scratch.
- **Billing basis.** `aircraft.billing_basis` (tacho | airborne) is copied
  onto each flight; `flight_hours` (billed) and `block_hours` (logbook) are
  generated columns. Never compute either in application code.
- **Money and VAT.** `numeric` in Postgres, strings from `pg`; format with
  `Number(x).toFixed(2)` at the edge. Hourly rates on *Fleet* are what the
  pilot pays, VAT included; `VAT_PERCENT` (25.5) and `net()` in
  `invoicing.ts` turn them into Procountor rows. Invoice line `amount` is a
  generated column.
- **Procountor.** All HTTP in `src/lib/server/procountor.ts`; all business
  logic (push, sync, throttle) in `invoicing.ts`. `isConfigured()` gates
  everything — with empty env the app behaves as before Phase 11 except
  invoices are `draft`. Never call Procountor from a page load except via
  `syncIfStale()` (15-min throttle).
- **Activity log.** The hook logs every POST; call `audit(event, …)` in an
  action to name what it did. Never log reads. Procountor calls are logged
  with their outcome; `userId: null` for the scheduled sync.
- **Status flows.** users: pending → approved/rejected. Flights: submitted
  → billed (cancelling a draft/error invoice returns them). Invoices: draft
  → sent → paid | error (retry) | cancelled (draft/error only). Expenses:
  submitted → paid | rejected. Postgres enums; extend by migration.
- **Styling.** Tokens and shared components in `src/app.css`; pages carry
  only layout CSS. Breakpoint 900px. Icons in `Icon.svelte` (add a path
  there, e.g. `refresh` was added in Phase 11). No new colours.
- **Copy.** No eyebrows or hints unless the information changes what the
  user should do.
- **Formatting.** The code base was never Prettier-formatted; `npm run
  lint` is not enforced and would fail on every file. Match the surrounding
  style (tabs, single quotes, long lines allowed).
- **Unit tests.** Vitest, `src/**/*.test.ts`, `npm run test:unit`, in CI's
  *check* job (Phase 15). Only for pure modules; pages and queries stay
  with Playwright.

## 5. How changes have been made and reviewed

The working pattern with Claude, which has held up across five phases:

1. **Plan first** — `docs/PHASE_NN_PLAN.md` for approval before code
   (decisions, migration, pages, tests, open questions).
2. **Mock-up on a design canvas** when the UI changes materially (Phase 09,
   the manual covers); approve, then build to it.
3. **Build in a cloud copy** of the repo, then verify: `npm run check`;
   all migrations twice on a fresh Postgres 16 (second run must say
   "Already up to date"); `npm run build` + all Playwright flows
   (`PW_CHROMIUM=… npx playwright test` against a throwaway DB — the fake
   Procountor is started by `playwright.config.ts`); screenshots at 390 and
   1440 px of every changed page, looked at, fixed.
4. **Sync files** to `C:\work\ensacon\cirkus`, **commit on a branch**
   (`phase-NN`) with the `Co-Authored-By` / `Claude-Session` trailers;
   Antti pushes, opens the PR, waits for CI, merges, deploys by merging.
5. **Docs with the code:** README (process, env, gotchas), this file, the
   manuals when the user-facing flow changes.

Practicalities learned: `git` from the cloud session runs through the
folder mount and can leave `.git/index.lock` — a Windows-side `del` fixes
it; `.gitattributes` `* text=auto eol=lf` stopped CRLF noise; paths under
`.github` cannot be written from the session (workflow files are dropped in
a sibling folder for Antti to move); Playwright date/time inputs race —
assert on derived values, not on the input.

Azure lessons are in `README.md` under *Azure gotchas*: extension
allow-list, firewall, "identical image tag = no new revision"
(`--revision-suffix`), `BODY_SIZE_LIMIT`, the scale-to-zero cold start and
the cooldown patch.

## 6. Manuals and other documents

- `docs/cirkus-pilot-manual.pdf`, `docs/cirkus-admin-manual.pdf` — built
  from a Python + HTML script (`build.py`) with the OH-KML cover photo and
  screenshots from the Playwright runs, rendered to PDF with Playwright. The
  script lived only in the Claude session; to change the manuals, either
  recreate it (the PDFs are the spec) or ask for the source to be added to
  `docs/manual/` — recommended next time they are touched.
- `docs/cirkus-running-costs.pdf` — architecture and cost by club size
  (also a Claude artifact "Cirkus Running Costs").
- `docs/cirkus-product-sheet.pdf` — the one-pager from the MVP.
- `docs/PHASE_07_PLAN.md`, `PHASE_08_PLAN.md`, `PHASE_11_PLAN.md` — the
  approved plans (09 and 10 were planned in chat).

## 7. Suggested next phases

**Phase 12 — Procountor go-live.** §2 above. Half a day once credentials
exist, plus whatever the real API disagrees with.

**Phase 13 — Finnish UI.** Small, high value for the members.

**Phase 14 — monthly billing run.** Cron-triggered Create all + push, with
an email or Procountor's own notification; makes the admin's job
"check the list" rather than "press the button".

**Airworthiness M2–M5** — `docs/MAINTENANCE_PLAN.md`; M2 (work orders,
components, defects) is the next useful slice.

**Later — customers / guest rate**, only if the club rents to non-owners.

## 8. People and access

- Admins: Kari Häkkinen, Antti Hänninen.
- Azure: resource group `rg-cirkus` (Container App `cirkus`, environment
  `cae-cirkus`), Postgres Flexible Server `ensacon-ts-pg` in
  `ensacon-ts-rg`. GitHub: `AnttiEnsacon/cirkus`, deploy on push to `main`
  via OIDC — no stored Azure credential. Procountor: API user and
  credentials with Antti (pending at the time of writing).
- Local: `C:\work\ensacon\cirkus`; `.env` with `DATABASE_URL`; tests need a
  local Postgres (`cirkus_test`).
