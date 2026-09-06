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

// Table interfaces are added here as migrations introduce them.
export interface Database {
	schema_info: {
		key: string;
		value: string;
	};
	users: UsersTable;
	sessions: SessionsTable;
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
