import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

// Table interfaces are added here as migrations introduce them.
// Phase 00 has no tables of its own yet — this just proves the
// connection and query-builder wiring works end to end.
export interface Database {
	schema_info: {
		key: string;
		value: string;
	};
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
