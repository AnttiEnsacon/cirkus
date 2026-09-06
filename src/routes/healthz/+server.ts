import { json } from '@sveltejs/kit';
import { healthCheck } from '$lib/server/db';

export async function GET() {
	try {
		await healthCheck();
		return json({ status: 'ok', db: 'connected' });
	} catch (err) {
		console.error('healthz: database check failed', err);
		return json({ status: 'degraded', db: 'unreachable' }, { status: 503 });
	}
}
