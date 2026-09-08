# Cirkus

Reservation, logbook and billing system for **KML Aviation Oy** — one aircraft
(OH-KML, Cirrus SR20) co-owned by eight pilots.

- **Live:** the Container App's URL (see *Operations → Find the URL*)
- **Stack:** SvelteKit (TypeScript) + Kysely over `pg`, Postgres on Azure Database
  for PostgreSQL Flexible Server, Docker image on ghcr.io, running on Azure
  Container Apps (consumption plan, scales to zero).
- **Design references:** the data model, build plan and UI mock-up live as
  Claude artifacts (links in the project chat).

## What it does

| Area | Who | Where |
|---|---|---|
| Register, log in, approval of new accounts | everyone / admins | `/register`, `/login`, `/manage/approvals` |
| Accounts: edit name/email/role/status, set passwords | admins | `/manage/accounts` |
| Fleet: aircraft, seats, rates, billing basis (Tacho / airborne time), co-owners | admins | `/manage/fleet` |
| Book the aircraft (Helsinki local time, no double-booking) | pilots | `/book` |
| Log a flight (UTC; Tacho or take-off/landing, per aircraft), personal logbook in block hours | pilots | `/log`, `/logbook` |
| See, correct or delete any unbilled flight | admins | `/manage/flights` |
| Create invoices on demand, mark paid, cancel | admins | `/manage/invoices` |
| See own invoices, print one | pilots | `/invoices` |
| Post a receipt (photo, total split by category) to be paid back | pilots | `/expenses` |
| Pay back receipts by bank transfer, mark paid or reject | admins | `/manage/expenses`, `/manage/expense-categories` |

The process is reservation → flight log entry → invoice. There is no
approval step (it existed in the MVP and was dropped in Phase 07 after trial
use): a flight is *submitted* when the pilot saves it and *billed* once it is
on an invoice. Until billed, the pilot who logged it or an admin can edit or
delete it; cancelling the invoice unfreezes its flights.

Out of scope for this MVP, on purpose: third-party customers and the guest
rate, scheduled/automatic invoicing, VAT lines, fuel credits, email (password
resets are done by an admin by hand), owner-tier permissions.

## Time zones

Everything is stored in UTC. **Reservations** are shown and entered in
Helsinki local time (`src/lib/server/time.ts` does the conversion, DST
included). **Logbook and flight log** are UTC everywhere, by design.

## Local development

```powershell
npm install
Copy-Item .env.example .env      # then fill in DATABASE_URL
$env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL=').ToString().Split('=',2)[1]
node db/migrate.js               # applies db/migrations/*.sql not yet applied
npm run dev                      # http://localhost:5173
npm run check                    # type-check (CI runs this too)
```

### End-to-end tests

Four Playwright flows (book → edit → cancel; log → correct; invoice
lifecycle; expense → pay back / reject) in `tests/e2e/`, run against the **built** app on a throwaway
database. They wipe reservations, flights and invoices, and refuse to run
against anything on `azure.com`.

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/cirkus_test'
npx playwright install chromium  # once
npm run build
npm run test:e2e
```

Each flow also saves screenshots of its last screen at 390 px and 1440 px
under `test-results/screens/` — the review step from the handoff, for free.
CI (`ci.yml`) runs the same flows after the migration job and uploads
`test-results/` as an artifact.

To reach the Azure database from your own machine the server firewall needs
your IP (see *Azure gotchas*). The session cookie is only `secure` in
production, so plain `http://localhost` logins work.

## Deploying

Push to `main`. `.github/workflows/deploy.yml` then:

1. `npm ci && npm run check` — a type error stops here. (`ci.yml` runs on
   every branch before that: type-check, and all migrations applied
   twice on a fresh Postgres 16 — the second run must be a no-op.)
2. Builds the Docker image and pushes it to `ghcr.io/<owner>/cirkus:<sha>`
   (the package is public so Container Apps can pull it without a stored token).
3. Logs in to Azure with OIDC (no secret stored — a federated credential on
   the `cirkus-gha-deploy` app registration trusts this repo's `main` branch).
4. `az containerapp up` with the new image, sets the `database-url` secret,
   then `az containerapp update --set-env-vars ... --revision-suffix r<run>-<attempt>`
   so **every run provisions a fresh revision**, including re-runs.

Migrations run **on container start** (`Dockerfile` `CMD`), against the same
`DATABASE_URL` the app uses. `db/migrate.js` is idempotent: it records applied
files in `schema_migrations` and skips them next time. A failing migration
makes the container exit → the revision never becomes healthy → Azure keeps
serving the previous healthy revision. Check the logs (below) if a deploy goes
green in Actions but the app doesn't change.

### GitHub secrets

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (OIDC login) and
`DATABASE_URL` (`postgresql://user:pass@ensacon-ts-pg.postgres.database.azure.com:5432/cirkus?sslmode=verify-full`).

## Azure gotchas (each of these cost us an afternoon)

- **Extensions are allow-listed per server.** A fresh Flexible Server has an
  empty `azure.extensions` list, so `create extension` fails for a normal user
  with *"not allow-listed"*. `btree_gist` (needed by the reservation overlap
  constraint) is allow-listed on `ensacon-ts-pg`. Any future migration that
  needs an extension:
  `az postgres flexible-server parameter set --resource-group ensacon-ts-rg --server-name ensacon-ts-pg --name azure.extensions --value btree_gist,<new>`
  (the value *replaces* the list). Verify with `show azure.extensions;`.
  The CI migration job runs on the stock `postgres:16` image, where every
  contrib extension is available, so it will *not* catch a missing
  allow-list entry.
- **Firewall.** "Allow Azure services" (rule `AllowAzureServices`, 0.0.0.0) lets
  the Container App in. Your own machine needs its own rule
  (`AllowMyIP`); GitHub Actions runners are *not* covered, which is why
  migrations run in the container rather than in CI.
- **Request bodies are capped at 512 KB by adapter-node** unless
  `BODY_SIZE_LIMIT` is set. Receipt photos are bigger, so `deploy.yml`
  sets `BODY_SIZE_LIMIT=15M` on the Container App (the form itself refuses
  files over 10 MB, and photos are downscaled to ~300 KB before storage).
- **Identical image tag = no new revision.** Re-running a workflow used to be a
  no-op; the `--revision-suffix` fixes that.
- **Scale-to-zero means no replica to `exec` into or tail** when idle. Load the
  app once first, or read Log Analytics (below).
- **GitHub OIDC subjects for new repos include numeric IDs**
  (`repo:AnttiEnsacon@46528077/cirkus@1359212099:ref:refs/heads/main`); the
  federated credential's subject must match that exact string.

## Operations

```powershell
# Find the URL
az containerapp show --name cirkus --resource-group rg-cirkus --query properties.configuration.ingress.fqdn -o tsv

# Revisions: the newest should be Healthy with a replica
az containerapp revision list --name cirkus --resource-group rg-cirkus -o table

# Live logs (needs a running replica) …
az containerapp logs show --name cirkus --resource-group rg-cirkus --tail 100
# … or historical console logs from Log Analytics
$ws = az containerapp env show --name cae-cirkus --resource-group rg-cirkus --query "properties.appLogsConfiguration.logAnalyticsConfiguration.customerId" -o tsv
az monitor log-analytics query --workspace $ws --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'cirkus' | order by TimeGenerated desc | take 100 | project TimeGenerated, RevisionName_s, Log_s" -o table

# Health (also proves the DB connection)
curl https://<fqdn>/healthz        # {"status":"ok","db":"connected"}

# Backups: Flexible Server takes automatic daily backups; check retention
az postgres flexible-server show --resource-group ensacon-ts-rg --name ensacon-ts-pg --query "backup" -o json
```

### Day-to-day admin

- **New member:** they register → you approve under *Approvals* → they log in.
- **Forgotten password:** *Accounts → Set password*, tell them the temporary
  one. Break-glass if no admin can log in at all:
  `node db/set-password.js someone@kmlaviation.fi 'NewPassword123'`
  (needs `DATABASE_URL` and firewall access from your machine).
- **Billing run:** *Billing* → check the flights listed under each pilot →
  *Create all*. Each pilot gets one invoice for everything logged and
  unbilled, at the member rate in force that day; 14-day terms. Mistake?
  *Cancel* puts the flights back, fix the flight, create again — the number
  advances, never reused.
- **Rate change:** *Fleet*. Affects invoices created from then on only.
- **New aircraft:** *Fleet → Add an aircraft*, choosing how it is billed:
  *Tacho time* (tacho end − start) or *Airborne time* (take-off to landing,
  exact minutes). *Record Tacho readings* decides whether the log form asks
  for the meter; it is always on for Tacho billing and optional otherwise.
  Each flight remembers the basis it was logged under, so changing a
  plane's setting later only affects new flights. The pilot's logbook
  shows block hours for every aircraft; invoices use the billing basis.
- **Expenses:** a pilot posts a receipt under *Expenses* (photo, total,
  lines by category). Under *Admin → Expenses* look at the photo, pay by
  bank transfer, then *Mark paid* with the reference — or *Reject* with a
  reason the pilot sees. Paid receipts are frozen; anything else the pilot
  can still edit. Categories (Öljy, Tarvikkeet, Muut) and their bookkeeping
  accounts live under *Expense categories*.

## Repo layout

```
db/migrations/         numbered SQL, applied in order by db/migrate.js
db/set-password.js     break-glass password set
src/lib/server/        db.ts (Kysely types), auth.ts, time.ts, invoicing.ts
src/routes/            login, register, logout, healthz
src/routes/(app)/      everything behind login: home, book, log, logbook, invoices
src/routes/(app)/(admin)/manage/   approvals, accounts, fleet, flights, invoices
```
