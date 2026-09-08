import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, getSessionUser } from '$lib/server/auth';
import { deriveAction, writeAction } from '$lib/server/audit';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = await getSessionUser(token);
	// Read now: logout invalidates the session during the request.
	const userBefore = event.locals.user;

	const response = await resolve(event);

	// Activity log: one row per POST (every form action and /logout). What
	// the action said via audit() wins; otherwise the row is derived from
	// the route and the ?/action name. A fail() comes back as 4xx.
	if (event.request.method === 'POST') {
		const a = event.locals.audit;
		const user = a && 'userId' in a ? (a.userId ?? null) : (userBefore?.id ?? null);
		let ip: string | null = null;
		try {
			ip = event.getClientAddress();
		} catch {
			ip = null;
		}
		void writeAction({
			user_id: user,
			action: a?.action ?? deriveAction(event.route.id, event.url),
			route: event.route.id,
			ok: a?.ok ?? response.status < 400,
			entity_type: a?.entity?.[0] ?? null,
			entity_id: a?.entity?.[1] ?? null,
			details: {
				...(userBefore ? { by: userBefore.name } : {}),
				...(a?.details ?? {})
			},
			ip,
			user_agent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null
		});
	}

	return response;
};
