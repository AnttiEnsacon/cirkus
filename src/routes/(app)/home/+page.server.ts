import { sql } from 'kysely';
import { db } from '$lib/server/db';
import { helsinkiRange, formatUtcDate } from '$lib/server/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const now = new Date();
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	const [nextRes, upcoming, hours, openInvoices, lastFlight] = await Promise.all([
		db
			.selectFrom('reservations')
			.innerJoin('aircraft', 'aircraft.id', 'reservations.aircraft_id')
			.select(['reservations.starts_at', 'reservations.ends_at', 'aircraft.tail_number'])
			.where('reservations.user_id', '=', me.id)
			.where('reservations.ends_at', '>', now)
			.orderBy('reservations.starts_at', 'asc')
			.executeTakeFirst(),
		db
			.selectFrom('reservations')
			.innerJoin('aircraft', 'aircraft.id', 'reservations.aircraft_id')
			.innerJoin('users', 'users.id', 'reservations.user_id')
			.select(['reservations.id', 'reservations.starts_at', 'reservations.ends_at', 'aircraft.tail_number', 'users.name'])
			.where('reservations.ends_at', '>', now)
			.where('reservations.starts_at', '<', weekAhead)
			.orderBy('reservations.starts_at', 'asc')
			.limit(6)
			.execute(),
		db
			.selectFrom('flight_log_entries')
			.select([
				sql<string>`coalesce(sum(flight_hours), 0)`.as('total'),
				sql<string>`coalesce(sum(flight_hours) filter (where block_off_at >= ${monthStart.toISOString()}::timestamptz), 0)`.as('month')
			])
			.where('pilot_id', '=', me.id)
			.executeTakeFirstOrThrow(),
		db
			.selectFrom('invoices')
			.select([sql<string>`coalesce(sum(total_amount), 0)`.as('open'), sql<number>`count(*)::int`.as('count')])
			.where('pilot_id', '=', me.id)
			.where('status', '=', 'issued')
			.executeTakeFirstOrThrow(),
		db
			.selectFrom('flight_log_entries')
			.innerJoin('aircraft', 'aircraft.id', 'flight_log_entries.aircraft_id')
			.select(['block_off_at', 'departure_airport_code', 'arrival_airport_code', 'flight_hours', 'aircraft.tail_number', 'status'])
			.where('pilot_id', '=', me.id)
			.orderBy('block_off_at', 'desc')
			.executeTakeFirst()
	]);

	let admin: { pendingAccounts: number; unbilled: string; expenses: string } | null = null;
	if (me.role === 'admin') {
		const [accounts, unbilled, expenses] = await Promise.all([
			db.selectFrom('users').select(sql<number>`count(*)::int`.as('n')).where('status', '=', 'pending').executeTakeFirstOrThrow(),
			db
				.selectFrom('flight_log_entries as f')
				.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
				.select(sql<string>`coalesce(sum(round(f.flight_hours * aircraft.member_rate_per_hour, 2)), 0)`.as('amount'))
				.where('f.status', '=', 'submitted')
				.executeTakeFirstOrThrow(),
			db
				.selectFrom('expenses')
				.select(sql<string>`coalesce(sum(total_amount), 0)`.as('amount'))
				.where('status', '=', 'submitted')
				.executeTakeFirstOrThrow()
		]);
		admin = { pendingAccounts: accounts.n, unbilled: Number(unbilled.amount).toFixed(2), expenses: Number(expenses.amount).toFixed(2) };
	}

	const fmtRange = helsinkiRange;

	return {
		firstName: me.name.split(' ')[0],
		nextReservation: nextRes
			? { tail_number: nextRes.tail_number, when: fmtRange(new Date(nextRes.starts_at), new Date(nextRes.ends_at)) }
			: null,
		upcoming: upcoming.map((r) => ({
			id: r.id,
			tail_number: r.tail_number,
			name: r.name,
			when: fmtRange(new Date(r.starts_at), new Date(r.ends_at))
		})),
		hours: { total: Number(hours.total).toFixed(1), month: Number(hours.month).toFixed(1) },
		open: { amount: Number(openInvoices.open).toFixed(2), count: openInvoices.count },
		lastFlight: lastFlight
			? {
					date: formatUtcDate(new Date(lastFlight.block_off_at)),
					route: `${lastFlight.departure_airport_code} → ${lastFlight.arrival_airport_code}`,
					tail_number: lastFlight.tail_number,
					hours: Number(lastFlight.flight_hours).toFixed(2),
					status: lastFlight.status
				}
			: null,
		admin
	};
};
