import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';

/**
 * What one request did, for the activity log. The hook in
 * src/hooks.server.ts writes one row per POST: derived from the route
 * and action name unless the action called audit() to say it better.
 */
export interface AuditEntry {
	action: string;
	entity?: [type: string, id: string | null | undefined];
	details?: Record<string, unknown>;
	/** Override the acting user (login: the session is not set yet; failed login: null). */
	userId?: string | null;
	/** Override the outcome (a failed login is a 400 either way; this makes it explicit). */
	ok?: boolean;
}

/** Mark the current request's activity row. Call from an action; the hook writes it. */
export function audit(event: Pick<RequestEvent, 'locals'>, entry: AuditEntry): void {
	event.locals.audit = { ...event.locals.audit, ...entry, details: { ...event.locals.audit?.details, ...entry.details } };
}

/** Route id → entity type, for the automatic entries. */
const ENTITY_BY_ROUTE: Record<string, string> = {
	'/login': 'auth',
	'/logout': 'auth',
	'/register': 'auth',
	'/(app)/password': 'auth',
	'/(app)/book': 'reservation',
	'/(app)/log': 'flight',
	'/(app)/log/[id]': 'flight',
	'/(app)/logbook': 'flight',
	'/(app)/expenses/new': 'expense',
	'/(app)/expenses/[id]': 'expense',
	'/(app)/expenses/[id]/edit': 'expense',
	'/(app)/(admin)/manage/flights': 'flight',
	'/(app)/(admin)/manage/invoices': 'invoice',
	'/(app)/(admin)/manage/expenses': 'expense',
	'/(app)/(admin)/manage/expense-categories': 'expense_category',
	'/(app)/(admin)/manage/flight-types': 'flight_type',
	'/(app)/(admin)/manage/fleet': 'aircraft',
	'/(app)/(admin)/manage/accounts': 'user',
	'/(app)/(admin)/manage/approvals': 'user'
};
/** Default-action pages: what their one action does. */
const DEFAULT_VERB: Record<string, string> = {
	'/login': 'login',
	'/logout': 'logout',
	'/register': 'register',
	'/(app)/password': 'password_change',
	'/(app)/log': 'create',
	'/(app)/log/[id]': 'update',
	'/(app)/expenses/new': 'create',
	'/(app)/expenses/[id]/edit': 'update'
};

/** "reservation.create" from route + ?/create, when the action said nothing itself. */
export function deriveAction(routeId: string | null, url: URL): string {
	const entity = (routeId && ENTITY_BY_ROUTE[routeId]) ?? routeId ?? 'unknown';
	let verb = '';
	for (const key of url.searchParams.keys()) if (key.startsWith('/')) verb = key.slice(1);
	if (!verb) verb = (routeId && DEFAULT_VERB[routeId]) ?? 'submit';
	// action names are camelCase in the routes; the log uses snake_case
	return `${entity}.${verb.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())}`;
}

/** Write the row. Never throws — a logging failure must not break the request. */
export async function writeAction(row: {
	user_id: string | null;
	action: string;
	route: string | null;
	ok: boolean;
	entity_type: string | null;
	entity_id: string | null;
	details: Record<string, unknown> | null;
	ip: string | null;
	user_agent: string | null;
}): Promise<void> {
	try {
		await db
			.insertInto('user_actions')
			.values({ ...row, details: row.details ? JSON.stringify(row.details) : null })
			.execute();
	} catch (err) {
		console.error('activity log:', err);
	}
}
