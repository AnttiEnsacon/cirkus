# Cirkus — Phase 08 plan: expenses

*Drafted 8 September 2026, after Phase 07. For approval before code.*

Pilots sometimes buy things for the aircraft — oil, consumables — and the
club pays them back. A pilot posts a receipt with a photo and splits its
total across categories; an admin pays it by bank transfer and marks it
paid. That is the whole feature.

Decisions already made: reimbursement is by bank transfer, marked paid by
an admin (not netted against invoices). VAT is not captured; Phase 09.
Categories: Öljy, Tarvikkeet, Muut.

## The process

Pilot buys → posts receipt (photo + total + lines by category) → admin
sees it under *Expenses*, looks at the photo, pays by bank transfer, marks
paid with the reference → the pilot sees it as *paid*. Or the admin rejects
it with a reason, and the pilot sees that instead.

Status: `submitted → paid`, or `submitted → rejected`. Until paid, the
pilot (or an admin) can edit or delete the receipt, the same rule as
flights until billed. A rejected receipt can be edited and resubmitted
(editing a rejected one sets it back to *submitted*).

## Data model — migration 0011

```sql
create table expense_categories (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	label text not null,
	account text,                       -- bookkeeping account, admin fills in
	is_active boolean not null default true,
	sort_order integer not null default 0
);
insert into expense_categories (code, label, sort_order) values
	('OLJ', 'Öljy', 1), ('TAR', 'Tarvikkeet', 2), ('MUU', 'Muut', 3);

create type expense_status as enum ('submitted', 'paid', 'rejected');

create table expenses (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references users (id),
	receipt_date date not null,
	vendor text not null,
	total_amount numeric(10, 2) not null check (total_amount > 0),
	notes text,
	status expense_status not null default 'submitted',
	paid_at timestamptz,
	paid_reference text,
	paid_by uuid references users (id),
	rejected_reason text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint expenses_paid_consistent check ((status = 'paid') = (paid_at is not null))
);

create table expense_lines (
	id uuid primary key default gen_random_uuid(),
	expense_id uuid not null references expenses (id) on delete cascade,
	category_id uuid not null references expense_categories (id),
	amount numeric(10, 2) not null check (amount > 0),
	description text
);

-- Photos in their own table so lists never drag bytes along. One row per
-- image; a receipt may have two sides or two pages.
create table receipt_images (
	id uuid primary key default gen_random_uuid(),
	expense_id uuid not null references expenses (id) on delete cascade,
	content_type text not null,
	bytes bytea not null,
	width integer not null,
	height integer not null,
	created_at timestamptz not null default now()
);
```

The receipt total must equal the sum of its lines. That cannot be a
generated column across tables, so the form action checks it inside the
transaction that writes the expense and its lines. Money stays `numeric`,
strings from `pg`, `toFixed(2)` at the edge, as everywhere else.

`db.ts` gains the four table interfaces and the two types.

## Photos

Stored in Postgres, downscaled on upload with `sharp` to a longest side of
1600 px, JPEG quality 80, EXIF orientation applied (phones rotate). A 4 MB
phone photo becomes 200–400 KB and stays legible. At club volume this is
tens of megabytes a year, included in the existing daily backups, with no
new Azure resource. If volume ever outgrew that, `receipt_images` is
already a separate table and could move to Blob Storage without touching
anything else.

`sharp` is a native dependency; it installs cleanly on `node:22-alpine`
(prebuilt binaries for musl) and in GitHub Actions. Nothing else in the
Dockerfile changes.

**Deployment gotcha, new.** adapter-node limits request bodies to 512 KB
by default, so uploads fail on Azure until `BODY_SIZE_LIMIT` is set as an
env var on the Container App — `az containerapp update --set-env-vars
BODY_SIZE_LIMIT=15M`, once, by hand, plus a line in `deploy.yml` so a
fresh deploy carries it, and a README gotcha entry. The form also rejects
files over 10 MB with a plain message before touching them.

## Routes

| Route | Who | What |
|---|---|---|
| `/expenses` | all | own receipts: date, vendor, total, status; *New receipt* button |
| `/expenses/new` | all | the form |
| `/expenses/[id]` | all (own) / admin | the receipt: photo(s), lines, status; *Edit* and *Delete* while not paid |
| `/expenses/[id]/edit` | all (own) / admin | the form, prefilled |
| `/expenses/[id]/image/[imageId]` | all (own) / admin | `+server.ts` streaming the image bytes after checking the session and ownership; `Cache-Control: private` |
| `/manage/expenses` | admin | unpaid receipts with photos inline, *Mark paid* (reference) and *Reject* (reason); amount owed per pilot; paid/rejected history below |
| `/manage/expense-categories` | admin | the category list, a copy of the flight-types page |

Menus: *Expenses* joins the pilot sidebar and the phone *More* page;
*Expenses* and *Expense categories* join the admin section. Home: the
admin attention box gains "€X of expenses to pay back" (sum of
*submitted*), and the pilot dashboard shows nothing new — the *Expenses*
page is one tap away.

## The form

A normal SvelteKit form action with `enctype="multipart/form-data"` — no
API layer, no client-side fetching, in keeping with the conventions.

- Receipt date (date input, defaults to today), vendor (text), total
  (number, 0.01 step), notes.
- Photo: `<input type="file" name="photos" accept="image/*"
  capture="environment" multiple>` — on a phone this opens the camera
  straight away; on a laptop it's a file picker. When editing, existing
  photos are shown with a *Remove* checkbox each, and more can be added.
- Lines: a repeating row of category (select) + amount + description, an
  *Add line* button, a running "lines total vs receipt total" figure that
  turns red when they differ. One line is prefilled with the full total,
  so the common one-category receipt is zero extra taps. This is the only
  `$state` on the page.
- Validation, all server-side as elsewhere: date not in the future, vendor
  present, total > 0, at least one line, every line > 0 with an active
  category, lines sum to the total, at least one photo on create, each
  file an image under 10 MB.
- Save → `/expenses?saved=1`.

The form and its parsing live in `ExpenseForm.svelte` and
`src/lib/server/expenses.ts`, shared by create and edit exactly as
`FlightForm.svelte` / `flightLog.ts` are.

## Admin actions

- **Mark paid**: reference field + button, as on the invoices page. Sets
  `paid`, `paid_at`, `paid_by`, `paid_reference`. Only from *submitted*.
- **Reject**: reason field + button. Sets `rejected`, `rejected_reason`.
  The pilot sees the reason on `/expenses` and on the receipt page.
- **Delete**: any unpaid receipt, as with flights.
- No *unpay*. A wrongly paid receipt is corrected outside the system, as
  a wrongly paid invoice would be.

## Tests

Flow 4, `04-expenses.spec.ts`: pilot posts a receipt with a fixture image
(`tests/e2e/fixtures/receipt.jpg`, a small generated image) split into two
lines (Öljy 45.00, Tarvikkeet 12.50, total 57.50) → sees it on `/expenses`
→ opens it, the image loads (200 and `image/jpeg`) → admin sees €57.50 owed
under the pilot on `/manage/expenses` → marks paid with a reference →
pilot's *Edit* is gone and the status reads *paid*. A second receipt is
rejected with a reason and the pilot sees the reason. Screenshots at 390
and 1440 px of the form, the receipt page and the admin page, as the
other flows do. Migration 0011 goes through the CI migration job.

## Files

```
db/migrations/0011_expenses.sql
src/lib/server/db.ts, src/lib/server/expenses.ts, src/lib/server/images.ts (sharp)
src/lib/components/ExpenseForm.svelte
src/routes/(app)/expenses/{+page.server.ts,+page.svelte}
src/routes/(app)/expenses/new/{+page.server.ts,+page.svelte}
src/routes/(app)/expenses/[id]/{+page.server.ts,+page.svelte}
src/routes/(app)/expenses/[id]/edit/{+page.server.ts,+page.svelte}
src/routes/(app)/expenses/[id]/image/[imageId]/+server.ts
src/routes/(app)/(admin)/manage/expenses/{+page.server.ts,+page.svelte}
src/routes/(app)/(admin)/manage/expense-categories/{+page.server.ts,+page.svelte}
src/routes/(app)/+layout.svelte (menus), src/routes/(app)/more/+page.svelte
src/routes/(app)/home/{+page.server.ts,+page.svelte}
src/lib/components/Icon.svelte (a receipt/wallet icon if none fits)
tests/e2e/04-expenses.spec.ts, tests/e2e/fixtures/receipt.jpg
.github/workflows/deploy.yml (BODY_SIZE_LIMIT), README.md, package.json (sharp)
```

Two days, one branch, reviewed with the screenshots the flow produces.

## Not in this phase

VAT per line (Phase 09). Netting expenses against invoices (decided
against). Email when a receipt is paid or rejected (Phase 09 email). Blob
Storage (only if volume demands it). Bookkeeping accounts for the three
categories — the `account` column is there, empty, for the admin to fill
in on `/manage/expense-categories` when the bookkeeper says what they are.
