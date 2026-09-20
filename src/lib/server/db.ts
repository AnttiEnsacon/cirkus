import pg, { Pool } from 'pg';
import { Kysely, PostgresDialect, type Generated, type ColumnType } from 'kysely';

// Postgres `date` columns come back as 'YYYY-MM-DD' strings, not as JS
// Dates. pg's default turns a date into a Date at *local* midnight, which
// every page then formatted in UTC — on a server east of UTC (a Helsinki
// laptop) that showed the previous day. Production runs in UTC and never
// saw it; the Playwright expenses flow did. A string is unambiguous, and
// `new Date('2026-09-05')` is UTC midnight, so the existing
// formatUtcDate(new Date(x)) calls keep working everywhere. (Phase 15)
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/** A `date` column: 'YYYY-MM-DD' in and out. */
export type DateString = ColumnType<string, string, string>;

export type UserRole = 'admin' | 'pilot';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UsersTable {
	id: Generated<string>;
	name: string;
	email: string;
	password_hash: string | null;
	role: UserRole;
	status: UserStatus;
	/** Business-partner id in Procountor; invoices need it. */
	procountor_partner_id: number | null;
	/** May edit the airworthiness programme, adjustments and the baseline (Phase 15). */
	technical_manager: Generated<boolean>;
	/** Recorded on a pilot-owner release (M2); not validated against any register. */
	licence_no: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface SessionsTable {
	token: string;
	user_id: string;
	created_at: ColumnType<Date, string | undefined, never>;
	expires_at: ColumnType<Date, string, string>;
}

/** What a flight is billed on: tacho difference, or take-off to landing. */
export type BillingBasis = 'tacho' | 'airborne';

export interface AircraftTable {
	id: Generated<string>;
	tail_number: string;
	type: string;
	seats: number;
	billing_basis: Generated<BillingBasis>;
	/** Whether the log form asks for meter readings (always true for tacho billing). */
	records_tacho: Generated<boolean>;
	member_rate_per_hour: ColumnType<string, number | string, number | string>;
	guest_rate_per_hour: ColumnType<string, number | string, number | string>;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface AircraftOwnersTable {
	aircraft_id: string;
	user_id: string;
	created_at: ColumnType<Date, string | undefined, never>;
}

export interface ReservationsTable {
	id: Generated<string>;
	aircraft_id: string;
	user_id: string;
	starts_at: ColumnType<Date, string, string>;
	ends_at: ColumnType<Date, string, string>;
	notes: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

/** submitted = logged, editable, not yet invoiced; billed = on an invoice, frozen. */
export type FlightLogStatus = 'submitted' | 'billed';
export type SecondPilotRole = 'instructor' | 'backup_pilot';

export interface AirportsTable {
	icao_code: string;
	name: string | null;
	is_generic: Generated<boolean>;
	created_at: ColumnType<Date, string | undefined, never>;
}

export interface FlightTypesTable {
	id: Generated<string>;
	code: string;
	label: string;
	account: string | null;
	taxable: Generated<boolean>;
	is_active: Generated<boolean>;
	sort_order: Generated<number>;
}

export interface FlightLogEntriesTable {
	id: Generated<string>;
	reservation_id: string | null;
	aircraft_id: string;
	pilot_id: string;
	second_pilot_id: string | null;
	second_pilot_role: SecondPilotRole | null;
	billing_basis: Generated<BillingBasis>;
	block_off_at: ColumnType<Date, string, string>;
	block_on_at: ColumnType<Date, string, string>;
	takeoff_at: ColumnType<Date | null, string | null, string | null>;
	landing_at: ColumnType<Date | null, string | null, string | null>;
	tacho_start: ColumnType<string | null, number | string | null, number | string | null>;
	tacho_end: ColumnType<string | null, number | string | null, number | string | null>;
	/** Billed hours, by billing_basis. Generated. */
	flight_hours: ColumnType<string, never, never>;
	/** Off-block to on-block, what the pilot's logbook shows. Generated. */
	block_hours: ColumnType<string, never, never>;
	departure_airport_code: string;
	arrival_airport_code: string;
	persons_on_board: Generated<number>;
	day_landings: Generated<number>;
	night_landings: Generated<number>;
	refuel_liters: ColumnType<string | null, number | string | null, number | string | null>;
	oil_added_liters: ColumnType<string | null, number | string | null, number | string | null>;
	flight_type_id: string;
	remarks: string | null;
	status: Generated<FlightLogStatus>;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

/** Mirrors Procountor: draft = not there yet, sent = there and sent, paid = reported paid, error = push failed. */
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'error' | 'cancelled';

export interface InvoicesTable {
	id: Generated<string>;
	invoice_year: number;
	invoice_seq: number;
	invoice_number: ColumnType<string, never, never>;
	pilot_id: string;
	period_start: DateString;
	period_end: DateString;
	status: Generated<InvoiceStatus>;
	subtotal: ColumnType<string, number | string | undefined, number | string>;
	total_amount: ColumnType<string, number | string | undefined, number | string>;
	currency: Generated<string>;
	issued_at: ColumnType<Date, string | undefined, string>;
	due_date: DateString;
	paid_at: ColumnType<Date | null, string | null | undefined, string | null>;
	paid_reference: string | null;
	cancelled_at: ColumnType<Date | null, string | null | undefined, string | null>;
	notes: string | null;
	created_by: string;
	procountor_id: number | null;
	procountor_number: string | null;
	procountor_reference: string | null;
	procountor_status: string | null;
	sent_at: ColumnType<Date | null, string | null | undefined, string | null>;
	synced_at: ColumnType<Date | null, string | null | undefined, string | null>;
	last_error: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
}

export interface InvoiceLineItemsTable {
	id: Generated<string>;
	invoice_id: string;
	flight_log_id: string;
	aircraft_id: string;
	hours_billed: ColumnType<string, number | string, number | string>;
	rate_applied: ColumnType<string, number | string, number | string>;
	amount: ColumnType<string, never, never>;
	description: string | null;
}

export type ExpenseStatus = 'submitted' | 'paid' | 'rejected';

export interface ExpenseCategoriesTable {
	id: Generated<string>;
	code: string;
	label: string;
	account: string | null;
	is_active: Generated<boolean>;
	sort_order: Generated<number>;
}

export interface ExpensesTable {
	id: Generated<string>;
	user_id: string;
	receipt_date: DateString;
	vendor: string;
	total_amount: ColumnType<string, number | string, number | string>;
	notes: string | null;
	status: Generated<ExpenseStatus>;
	paid_at: ColumnType<Date | null, string | null | undefined, string | null>;
	paid_by: string | null;
	paid_reference: string | null;
	rejected_reason: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface ExpenseLinesTable {
	id: Generated<string>;
	expense_id: string;
	category_id: string;
	amount: ColumnType<string, number | string, number | string>;
	description: string | null;
	position: Generated<number>;
}

export interface ReceiptImagesTable {
	id: Generated<string>;
	expense_id: string;
	content_type: string;
	bytes: Buffer;
	width: number;
	height: number;
	created_at: ColumnType<Date, string | undefined, never>;
}

export interface UserActionsTable {
	id: Generated<number>;
	at: ColumnType<Date, string | undefined, never>;
	user_id: string | null;
	action: string;
	route: string | null;
	ok: Generated<boolean>;
	entity_type: string | null;
	entity_id: string | null;
	details: ColumnType<Record<string, unknown> | null, string | null, string | null>;
	ip: string | null;
	user_agent: string | null;
}


/* ---------- airworthiness (Phase 15) — see db/migrations/0015_airworthiness_core.sql ---------- */

export type MxHoursSource = 'tacho' | 'block' | 'airborne';
export type MxAmpBasis = 'ica' | 'mip';
export type MxTaskSource = 'ica' | 'mip' | 'als' | 'ad' | 'sb' | 'owner';
export type MxAnchorKind = 'last_compliance' | 'install' | 'manufacture' | 'fixed';
export type MxResetRule = 'from_actual' | 'from_original';
export type MxWorkOrderKind = 'setup_baseline' | 'scheduled' | 'unscheduled' | 'pilot_owner' | 'defect';
export type MxWorkOrderStatus = 'open' | 'released';

/** numeric(…) columns: strings out of pg, numbers or strings in. */
type Numeric = ColumnType<string, number | string, number | string>;
type NumericNullable = ColumnType<string | null, number | string | null, number | string | null>;
/** numeric(…) with a default. */
type NumericDefault = ColumnType<string, number | string | undefined, number | string>;

/** One row per tracked aircraft. */
export interface MxAircraftTable {
	aircraft_id: string;
	msn: string | null;
	year_built: number | null;
	mtow_kg: number | null;
	hours_source: Generated<MxHoursSource>;
	baseline_at: DateString;
	baseline_hours: Numeric;
	baseline_landings: Generated<number>;
	amp_basis: Generated<MxAmpBasis>;
	amp_reference: string | null;
	amp_declared_at: ColumnType<string | null, string | null, string | null>;
	amp_declared_by: string | null;
	amp_reviewed_at: ColumnType<string | null, string | null, string | null>;
	warn_hours: NumericDefault;
	warn_days: Generated<number>;
	warn_landings: Generated<number>;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface MxUsageAdjustmentsTable {
	id: Generated<string>;
	aircraft_id: string;
	on_date: DateString;
	hours_delta: NumericDefault;
	landings_delta: Generated<number>;
	reason: string;
	entered_by: string;
	supersedes_id: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
}

export interface MxTasksTable {
	id: Generated<string>;
	aircraft_id: string;
	code: string;
	title: string;
	source: MxTaskSource;
	source_ref: string | null;
	interval_hours: NumericNullable;
	interval_months: number | null;
	interval_landings: number | null;
	one_time: Generated<boolean>;
	anchor_kind: Generated<MxAnchorKind>;
	anchor_date: ColumnType<string | null, string | null, string | null>;
	anchor_hours: NumericNullable;
	anchor_landings: number | null;
	tolerance_hours: NumericDefault;
	tolerance_days: Generated<number>;
	tolerance_landings: Generated<number>;
	reset_rule: Generated<MxResetRule>;
	pilot_owner_allowed: Generated<boolean>;
	active: Generated<boolean>;
	notes: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface MxWorkOrdersTable {
	id: Generated<string>;
	aircraft_id: string;
	kind: MxWorkOrderKind;
	status: Generated<MxWorkOrderStatus>;
	title: string;
	opened_at: DateString;
	opened_by: string;
	released_at: ColumnType<string | null, string | null, string | null>;
	released_hours: NumericNullable;
	released_landings: number | null;
	performed_by_org: string | null;
	crs_name: string | null;
	crs_licence: string | null;
	crs_text: string | null;
	release_hash: string | null;
	released_by: string | null;
	notes: string | null;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface MxWorkOrderItemsTable {
	id: Generated<string>;
	work_order_id: string;
	task_id: string | null;
	description: string;
	reference_data: string | null;
	done_on: ColumnType<string | null, string | null, string | null>;
	done_hours: NumericNullable;
	done_landings: number | null;
	position: Generated<number>;
}

/** The view: items of released orders that name a task. Read-only. */
export interface MxTaskComplianceView {
	task_id: string;
	aircraft_id: string;
	work_order_id: string;
	kind: MxWorkOrderKind;
	done_on: ColumnType<string | null, never, never>;
	done_hours: ColumnType<string | null, never, never>;
	done_landings: ColumnType<number | null, never, never>;
}

// Table interfaces are added here as migrations introduce them.
export interface Database {
	schema_info: {
		key: string;
		value: string;
	};
	users: UsersTable;
	sessions: SessionsTable;
	aircraft: AircraftTable;
	aircraft_owners: AircraftOwnersTable;
	reservations: ReservationsTable;
	airports: AirportsTable;
	flight_types: FlightTypesTable;
	flight_log_entries: FlightLogEntriesTable;
	invoices: InvoicesTable;
	invoice_line_items: InvoiceLineItemsTable;
	expense_categories: ExpenseCategoriesTable;
	expenses: ExpensesTable;
	expense_lines: ExpenseLinesTable;
	receipt_images: ReceiptImagesTable;
	user_actions: UserActionsTable;
	mx_aircraft: MxAircraftTable;
	mx_usage_adjustments: MxUsageAdjustmentsTable;
	mx_tasks: MxTasksTable;
	mx_work_orders: MxWorkOrdersTable;
	mx_work_order_items: MxWorkOrderItemsTable;
	mx_task_compliance: MxTaskComplianceView;
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 10
});

export const db = new Kysely<Database>({
	dialect: new PostgresDialect({ pool })
});

export async function healthCheck(): Promise<void> {
	await pool.query('select 1');
}
