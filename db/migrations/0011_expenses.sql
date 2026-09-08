-- Phase 08: expenses.
--
-- Pilots sometimes buy things for the aircraft (oil, consumables) and the
-- club pays them back by bank transfer. A pilot posts the receipt with a
-- photo and splits its total across categories; an admin looks at the
-- photo, pays, and marks it paid with the transfer reference — or rejects
-- it with a reason. Until paid, the pilot (or an admin) can edit or delete
-- it. VAT is not captured here (Phase 09).

-- Club-maintained list, like flight_types. The bookkeeping account is
-- filled in by an admin when the bookkeeper says what it is.
create table expense_categories (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	label text not null,
	account text,
	is_active boolean not null default true,
	sort_order integer not null default 0
);

insert into expense_categories (code, label, sort_order) values
	('OLJ', 'Öljy',        1),
	('TAR', 'Tarvikkeet',  2),
	('MUU', 'Muut',        3)
on conflict (code) do nothing;

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
	paid_by uuid references users (id),
	paid_reference text,
	rejected_reason text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint expenses_paid_consistent check ((status = 'paid') = (paid_at is not null))
);

create index expenses_user_idx on expenses (user_id, receipt_date desc);
create index expenses_status_idx on expenses (status);

-- One receipt, many categories. The lines must add up to total_amount;
-- that is checked by the form action inside the same transaction.
create table expense_lines (
	id uuid primary key default gen_random_uuid(),
	expense_id uuid not null references expenses (id) on delete cascade,
	category_id uuid not null references expense_categories (id),
	amount numeric(10, 2) not null check (amount > 0),
	description text,
	position integer not null default 0
);

create index expense_lines_expense_idx on expense_lines (expense_id);

-- Photos in their own table so lists never drag bytes along. One row per
-- image; a receipt may have two sides or two pages. Downscaled on upload.
create table receipt_images (
	id uuid primary key default gen_random_uuid(),
	expense_id uuid not null references expenses (id) on delete cascade,
	content_type text not null,
	bytes bytea not null,
	width integer not null,
	height integer not null,
	created_at timestamptz not null default now()
);

create index receipt_images_expense_idx on receipt_images (expense_id);
