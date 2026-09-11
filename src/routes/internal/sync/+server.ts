import { json } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { syncInvoiceStatuses } from '$lib/server/invoicing';
import { isConfigured } from '$lib/server/procountor';
import type { RequestHandler } from './$types';

/**
 * POST /internal/sync — pull invoice statuses from Procountor. Called by
 * the hourly GitHub Actions workflow (.github/workflows/sync.yml) with the
 * shared secret in `Authorization: Bearer <PROCOUNTOR_SYNC_SECRET>`. No
 * session, no user: the activity log gets a row with user null.
 */
export const POST: RequestHandler = async (event) => {
	const secret = process.env.PROCOUNTOR_SYNC_SECRET ?? '';
	const given = event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	if (!secret || given !== secret) {
		audit(event, { action: 'invoice.sync', userId: null, ok: false, details: { reason: 'unauthorized' } });
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	if (!isConfigured()) {
		audit(event, { action: 'invoice.sync', userId: null, details: { skipped: 'not configured' } });
		return json({ skipped: 'Procountor is not configured' });
	}
	const result = await syncInvoiceStatuses();
	audit(event, { action: 'invoice.sync', userId: null, details: { ...result, by: 'scheduled sync' } });
	return json(result);
};
