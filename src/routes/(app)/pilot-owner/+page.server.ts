import { db } from '$lib/server/db';
import { eligibility } from '$lib/server/airworthiness/pilotOwner';
import type { PageServerLoad } from './$types';

/** The pilot's own pilot-owner releases, and whether the page can be used at all. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const e = await eligibility(me.id);
	const mine = await db
		.selectFrom('mx_work_orders as o')
		.innerJoin('aircraft as a', 'a.id', 'o.aircraft_id')
		.select(['o.id', 'o.title', 'o.released_at', 'o.released_hours', 'o.released_landings', 'o.release_hash', 'o.notes', 'a.tail_number'])
		.where('o.kind', '=', 'pilot_owner')
		.where('o.status', '=', 'released')
		.where('o.released_by', '=', me.id)
		.orderBy('o.released_at', 'desc')
		.limit(20)
		.execute();
	return {
		released: url.searchParams.get('released'),
		eligible: e.aircraft.map((a) => ({ id: a.aircraft_id, tail: a.tail_number })),
		licence: e.licence,
		ownsAny: e.ownsAny,
		releases: mine.map((o) => ({
			id: o.id,
			tail: o.tail_number,
			title: o.title.replace(/^Pilot-owner: /, ''),
			on: o.released_at,
			readings: o.released_hours === null ? '—' : `${Number(o.released_hours).toFixed(1)} h · ${o.released_landings ?? 0} ldg`,
			notes: o.notes,
			hash: o.release_hash ? o.release_hash.slice(0, 12) + '…' : '—'
		}))
	};
};
