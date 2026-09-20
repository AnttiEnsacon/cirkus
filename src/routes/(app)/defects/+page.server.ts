import { sql } from 'kysely';
import { db } from '$lib/server/db';
import { listDefects } from '$lib/server/airworthiness/defects';
import type { PageServerLoad } from './$types';

/** The open and deferred defects on every aircraft — what a pilot checks before flying — and the pilot's own reports. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const aircraft = await db.selectFrom('aircraft').select(['id', 'tail_number', 'type']).orderBy('tail_number').execute();
	const perAircraft = [];
	for (const a of aircraft) {
		const defects = await listDefects(a.id, { openOnly: true });
		perAircraft.push({ id: a.id, tail: a.tail_number, type: a.type, defects });
	}
	const mine = await db
		.selectFrom('mx_defects as d')
		.innerJoin('aircraft as a', 'a.id', 'd.aircraft_id')
		.select(['d.id', 'd.number', 'd.title', 'd.status', 'a.tail_number', sql<string>`to_char(d.reported_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD')`.as('reported_on')])
		.where('d.reported_by', '=', me.id)
		.orderBy('d.reported_at', 'desc')
		.limit(10)
		.execute();
	return {
		saved: url.searchParams.get('saved'),
		perAircraft,
		mine: mine.map((d) => ({ id: d.id, number: d.number, title: d.title, status: d.status, tail: d.tail_number, reportedOn: d.reported_on }))
	};
};
