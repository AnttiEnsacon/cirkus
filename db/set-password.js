// One-off CLI helper for bootstrapping: sets a user's password directly
// against the database. Needed because the very first admin has no one
// logged in yet to use Manage -> Accounts -> Set password for them.
// After the first admin can log in, prefer the web UI — this script
// stays around only as a break-glass fallback.
//
// Usage:
//   DATABASE_URL=postgres://... node db/set-password.js someone@kmlaviation.fi 'NewPassword123'
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

async function main() {
	const [, , email, password] = process.argv;
	if (!email || !password) {
		console.error('Usage: node db/set-password.js <email> <new-password>');
		process.exit(1);
	}
	if (password.length < 8) {
		console.error('Password must be at least 8 characters.');
		process.exit(1);
	}
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL is not set.');
		process.exit(1);
	}

	const client = new Client({ connectionString });
	await client.connect();
	try {
		const hash = await bcrypt.hash(password, 12);
		const result = await client.query(
			'update users set password_hash = $1, updated_at = now() where email = $2',
			[hash, email.toLowerCase()]
		);
		if (result.rowCount === 0) {
			console.error(`No user found with email ${email}`);
			process.exit(1);
		}
		console.log(`Password set for ${email}.`);
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
