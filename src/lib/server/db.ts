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
