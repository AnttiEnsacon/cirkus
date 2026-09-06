// Minimal migration runner: applies db/migrations/*.sql in filename order,
// tracking what has already run in a schema_migrations table. No framework,
// on purpose (see the build plan) — plain numbered SQL files.
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL is not set.');
		process.exit(1);
	}

	const client = new Client({ connectionString });
	await client.connect();

	try {
		await client.query(`
			create table if not exists schema_migrations (
				filename text primary key,
				applied_at timestamptz not null default now()
			)
		`);

		const alreadyApplied = new Set(
			(await client.query('select filename from schema_migrations')).rows.map((r) => r.filename)
		);

		const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

		let ran = 0;
		for (const file of files) {
			if (alreadyApplied.has(file)) continue;

			const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
			console.log(`Applying ${file} ...`);

			await client.query('begin');
			try {
				await client.query(sql);
				await client.query('insert into schema_migrations (filename) values ($1)', [file]);
				await client.query('commit');
				ran++;
			} catch (err) {
				await client.query('rollback');
				throw err;
			}
		}

		console.log(ran === 0 ? 'Already up to date.' : `Applied ${ran} migration(s).`);
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
