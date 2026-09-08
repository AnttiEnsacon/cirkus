import { db } from '$lib/server/db';
import { toHelsinkiInputValue } from '$lib/server/time';
import type { PageServerLoad } from './$types';

const PAGE = 200;

/** Filter chips → the action prefixes they cover. */
const KINDS: Record<string, string[]> = {
	auth: ['auth.'],
	flights: ['flight.'],
	bookings: ['reservation.'],
	billing: ['invoice.'],
	expenses: ['expense.'],
	accounts: ['user.'],
	lists: ['aircraft.', 'flight_type.', 'expense_category.']
};

/** Short names for refused attempts, where the details are usually empty. */
const ATTEMPT: Record<string, string> = {
	'reservation.create': 'Booking',
	'reservation.update': 'Moving a booking',
	'reservation.cancel': 'Cancelling a booking',
	'flight.create': 'Logging a flight',
	'flight.update': 'Editing a flight',
	'flight.delete': 'Deleting a flight',
	'expense.create': 'Sending a receipt',
	'expense.update': 'Editing a receipt',
	'expense.delete': 'Deleting a receipt',
	'auth.password_change': 'Password change',
	'auth.register': 'Registration'
};

/** One plain-language line per row, from action + details. */
function describe(action: string, d: Record<string, unknown>, ok: boolean): string {
	const s = (k: string) => (d[k] == null ? '' : String(d[k]));
	const forWhom = s('for') ? ` for ${s('for')}` : '';
	if (!ok && action !== 'auth.login_failed') {
		const [entity, verb] = action.split('.');
		return `${ATTEMPT[action] ?? `${verb ?? action} ${entity ?? ''}`.replace(/_/g, ' ')} refused`;
	}
	switch (action) {
		case 'auth.login':
			return `Signed in`;
		case 'auth.login_failed':
			return `Failed sign-in for ${s('email')}${s('reason') ? ` (${s('reason')})` : ''}`;
		case 'auth.logout':
			return `Signed out`;
		case 'auth.password_change':
			return ok ? `Changed their password` : `Password change refused`;
		case 'auth.register':
			return `Registered (waiting for approval)`;
		case 'user.approve':
			return `Approved ${s('target')}`;
		case 'user.reject':
			return `Rejected ${s('target')}`;
		case 'user.add':
			return `Added member ${s('target')} (${s('role')})`;
		case 'user.update':
			return `Edited an account`;
		case 'user.set_password':
			return `Set a password for an account`;
		case 'flight.create':
			return `Logged a flight ${s('date')} ${s('route')} · ${s('billing')}`;
		case 'flight.update':
			return `Edited a flight${forWhom} ${s('date')} ${s('route')} · ${s('billing')}`;
		case 'flight.delete':
			return `Deleted a flight${forWhom}`;
		case 'reservation.create':
			return `Booked ${s('when')}`;
		case 'reservation.update':
			return `Moved a booking${forWhom} to ${s('when')}`;
		case 'reservation.cancel':
			return `Cancelled a booking`;
		case 'invoice.create':
			return `Created invoice ${s('number')} for ${s('pilot')}, €${s('total')}`;
		case 'invoice.create_all':
			return `Created ${s('created')} invoice${s('created') === '1' ? '' : 's'}${Array.isArray(d.numbers) && d.numbers.length ? ` (${(d.numbers as string[]).join(', ')})` : ''}`;
		case 'invoice.mark_paid':
			return `Marked invoice ${s('number')} paid${s('reference') ? ` (${s('reference')})` : ''}`;
		case 'invoice.cancel':
			return `Cancelled invoice ${s('number')} (${s('pilot')}, €${s('total')})`;
		case 'expense.create':
			return `Sent a receipt: ${s('vendor')}, €${s('total')}`;
		case 'expense.update':
			return `Edited a receipt${forWhom}: ${s('vendor')}, €${s('total')}`;
		case 'expense.delete':
			return `Deleted a receipt${forWhom}: ${s('vendor')}, €${s('total')}`;
		case 'expense.mark_paid':
			return `Paid back ${s('for')}: ${s('vendor')}, €${s('total')}${s('reference') ? ` (${s('reference')})` : ''}`;
		case 'expense.reject':
			return `Rejected ${s('for')}'s receipt: ${s('vendor')}, €${s('total')} — ${s('reason')}`;
		case 'aircraft.add':
			return `Added aircraft ${s('tail')} (${s('billing_basis')} billing)`;
		case 'aircraft.update':
			return `Updated an aircraft (€${s('member_rate_per_hour')}/h, ${s('billing_basis')} billing)`;
		case 'aircraft.owners':
			return `Changed co-owners`;
		default: {
			const [entity, verb] = action.split('.');
			return `${verb ?? action} ${entity ?? ''}`.replace(/_/g, ' ').trim();
		}
	}
}

export const load: PageServerLoad = async ({ url }) => {
	const kind = url.searchParams.get('kind') ?? '';
	const person = url.searchParams.get('person') ?? '';
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);

	let q = db
		.selectFrom('user_actions as a')
		.leftJoin('users', 'users.id', 'a.user_id')
		.select(['a.id', 'a.at', 'a.action', 'a.ok', 'a.details', 'a.ip', 'a.user_agent', 'users.name'])
		.orderBy('a.at', 'desc')
		.orderBy('a.id', 'desc')
		.limit(PAGE + 1)
		.offset((page - 1) * PAGE);

	const prefixes = KINDS[kind];
	if (prefixes) q = q.where((eb) => eb.or(prefixes.map((p) => eb('a.action', 'like', `${p}%`))));
	if (person) q = q.where('a.user_id', '=', person);
	if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.where('a.at', '>=', new Date(`${from}T00:00:00+03:00`));
	if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.where('a.at', '<', new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 24 * 3600 * 1000));

	const rows = await q.execute();
	const hasMore = rows.length > PAGE;

	const people = await db.selectFrom('users').select(['id', 'name']).orderBy('name', 'asc').execute();

	return {
		entries: rows.slice(0, PAGE).map((r) => {
			const d = (r.details ?? {}) as Record<string, unknown>;
			return {
				id: r.id,
				when: toHelsinkiInputValue(new Date(r.at)).replace('T', ' '),
				who: r.name ?? (typeof d.by === 'string' ? d.by : '') ?? '',
				text: describe(r.action, d, r.ok),
				action: r.action,
				ok: r.ok,
				ip: r.ip ?? '',
				agent: r.user_agent ?? ''
			};
		}),
		people,
		filters: { kind, person, from, to, page },
		hasMore,
		kinds: Object.keys(KINDS)
	};
};
