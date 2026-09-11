// Test fixture for the Playwright flows (and for a local throwaway database).
// Applies migrations, then gives two seeded accounts known passwords and
// clears reservations, flights and invoices so a run always starts from the
// same state. Refuses to touch anything that looks like the real database.
//
//   DATABASE_URL=postgresql://.../cirkus_test node db/seed-test.js
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
if (/azure\.com/i.test(url)) {
	console.error('Refusing to seed test data into an Azure database.');
	process.exit(1);
}

export const TEST_ADMIN = { email: 'antti.hanninen@kmlaviation.fi', password: 'test-admin-pw', name: 'Antti Hänninen' };
export const TEST_PILOT = { email: 'juha.valkonen@kmlaviation.fi', password: 'test-pilot-pw', name: 'Juha Valkonen' };

execFileSync(process.execPath, [new URL('./migrate.js', import.meta.url).pathname], { stdio: 'inherit' });

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
	await client.query('begin');
	await client.query('delete from receipt_images');
	await client.query('delete from expense_lines');
	await client.query('delete from expenses');
	await client.query('delete from invoice_line_items');
	await client.query('delete from invoices');
	await client.query('delete from flight_log_entries');
	await client.query('delete from reservations');
	await client.query('delete from sessions');
	await client.query('delete from user_actions');
	// Flow 03 links the pilot to a (fake) Procountor customer itself.
	await client.query('update users set procountor_partner_id = null');
	// A second aircraft, billed by airborne time, no Tacho recorded — so the
	// flows cover both bases. (Not in a migration: test data only.)
	await client.query(
		`insert into aircraft (tail_number, type, seats, member_rate_per_hour, guest_rate_per_hour, billing_basis, records_tacho)
		   values ('OH-TST', 'Test plane', 4, 200.00, 320.00, 'airborne', false)
		   on conflict (tail_number) do update set billing_basis = 'airborne', records_tacho = false, member_rate_per_hour = 200.00`.replace(/\s+/g, ' ')
	);
	for (const u of [TEST_ADMIN, TEST_PILOT]) {
		const hash = await bcrypt.hash(u.password, 4);
		const r = await client.query(
			"update users set password_hash = $1, status = 'approved', updated_at = now() where email = $2",
			[hash, u.email]
		);
		if (r.rowCount !== 1) throw new Error(`Seeded user ${u.email} not found — did 0003 run?`);
	}
	await client.query('commit');
	console.log('Test data ready.');
} catch (err) {
	await client.query('rollback');
	throw err;
} finally {
	await client.end();
}
