import { Pool } from 'pg';
import { Kysely, PostgresDialect, type Generated, type ColumnType } from 'kysely';

export type UserRole = 'admin' | 'pilot';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UsersTable {
	id: Generated<string>;
	name: string;
	email: string;
	password_hash: string | null;
	role: UserRole;
	status: UserStatus;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export interface SessionsTable {
	token: string;
	user_id: string;
	created_at: ColumnType<Date, string | undefined, never>;
	expires_at: ColumnType<Date, string, string>;
}

export interface AircraftTable {
	id: Generated<string>;
	tail_number: string;
	type: string;
	seats: number;
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

export type FlightLogStatus = 'draft' | 'submitted' | 'approved' | 'billed';
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
	block_off_at: ColumnType<Date, string, string>;
	block_on_at: ColumnType<Date, string, string>;
	hobbs_start: ColumnType<string, number | string, number | string>;
	hobbs_end: ColumnType<string, number | string, number | string>;
	flight_hours: ColumnType<string, never, never>;
	departure_airport_code: string;
	arrival_airport_code: string;
	day_landings: Generated<number>;
	night_landings: Generated<number>;
	refuel_liters: ColumnType<string | null, number | string | null, number | string | null>;
	oil_added_liters: ColumnType<string | null, number | string | null, number | string | null>;
	flight_type_id: string;
	remarks: string | null;
	status: Generated<FlightLogStatus>;
	approved_by: string | null;
	approved_at: ColumnType<Date | null, string | null, string | null>;
	created_at: ColumnType<Date, string | undefined, never>;
	updated_at: ColumnType<Date, string | undefined, string>;
}

export type InvoiceStatus = 'issued' | 'paid' | 'cancelled';

export interface InvoicesTable {
	id: Generated<string>;
	invoice_year: number;
	invoice_seq: number;
	invoice_number: ColumnType<string, never, never>;
	pilot_id: string;
	period_start: ColumnType<Date, string, string>;
	period_end: ColumnType<Date, string, string>;
	status: Generated<InvoiceStatus>;
	subtotal: ColumnType<string, number | string | undefined, number | string>;
	total_amount: ColumnType<string, number | string | undefined, number | string>;
	currency: Generated<string>;
	issued_at: ColumnType<Date, string | undefined, string>;
	due_date: ColumnType<Date, string, string>;
	paid_at: ColumnType<Date | null, string | null | undefined, string | null>;
	paid_reference: string | null;
	cancelled_at: ColumnType<Date | null, string | null | undefined, string | null>;
	notes: string | null;
	created_by: string;
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
