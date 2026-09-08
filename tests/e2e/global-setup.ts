import { execFileSync } from 'node:child_process';

// Fresh, known data before every run: migrations + two accounts with
// passwords + empty reservations/flights/invoices (db/seed-test.js).
export default function globalSetup() {
	execFileSync(process.execPath, ['db/seed-test.js'], { stdio: 'inherit', env: process.env });
}
