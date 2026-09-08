import { redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { invalidateSession, SESSION_COOKIE } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { cookies } = event;
	audit(event, { action: 'auth.logout' });
	const token = cookies.get(SESSION_COOKIE);
	if (token) await invalidateSession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	throw redirect(303, '/login');
};
