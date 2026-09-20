import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'kysely';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { parseDefectPhotos, reportDefect } from '$lib/server/airworthiness/defects';
import type { Actions, PageServerLoad } from './$types';

const UUID = /^[0-9a-f-]{36}$/;

/** The pilot's most recent flight, to link the report to — within the last 14 days. */
async function lastFlight(userId: string) {
	return db
		.selectFrom('flight_log_entries as f')
		.innerJoin('aircraft as a', 'a.id', 'f.aircraft_id')
		.select(['f.id', 'f.aircraft_id', 'a.tail_number', 'f.departure_airport_code', 'f.arrival_airport_code', sql<string>`to_char(f.block_off_at at time zone 'Europe/Helsinki', 'DD Mon')`.as('on')])
		.where('f.pilot_id', '=', userId)
		.where('f.block_off_at', '>=', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
		.orderBy('f.block_off_at', 'desc')
		.executeTakeFirst();
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const aircraft = await db.selectFrom('aircraft').select(['id', 'tail_number', 'type']).orderBy('tail_number').execute();
	const flight = await lastFlight(me.id);
	const preselect = url.searchParams.get('aircraft');
	return {
		aircraft: aircraft.map((a) => ({ id: a.id, label: `${a.tail_number} · ${a.type}` })),
		defaultAircraft: aircraft.find((a) => a.tail_number === preselect?.toUpperCase())?.id ?? flight?.aircraft_id ?? aircraft[0]?.id ?? '',
		flight: flight ? { id: flight.id, aircraftId: flight.aircraft_id, label: `${flight.on} ${flight.departure_airport_code} → ${flight.arrival_airport_code} · ${flight.tail_number}` } : null
	};
};

export const actions: Actions = {
	default: async (event) => {
		const me = event.locals.user!;
		const form = await event.request.formData();
		const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const bad = (error: string) => fail(400, { error, values });
		const s = (k: string) => String(form.get(k) ?? '').trim();

		const aircraft_id = s('aircraft_id');
		if (!UUID.test(aircraft_id)) return bad('Pick the aircraft.');
		const a = await db.selectFrom('aircraft').select(['id', 'tail_number']).where('id', '=', aircraft_id).executeTakeFirst();
		if (!a) return bad('Pick the aircraft.');
		const title = s('title');
		if (!title) return bad('Say what is wrong, in a line.');
		if (title.length > 120) return bad('Keep the title to a line — the details go below.');
		const description = s('description') || null;

		let flight_log_id: string | null = null;
		if (form.get('link_flight')) {
			const f = await lastFlight(me.id);
			if (f && f.aircraft_id === aircraft_id) flight_log_id = f.id;
		}
		const photos = await parseDefectPhotos(form);
		if (!photos.ok) return bad(photos.error);

		const d = await reportDefect(me.id, { aircraft_id, title, description, flight_log_id }, photos.images);
		audit(event, { action: 'airworthiness.defect_report', entity: ['mx_defect', d.id], details: { tail: a.tail_number, number: d.number, title, photos: photos.images.length, flight: flight_log_id ?? undefined } });
		throw redirect(303, `/defects?saved=${d.number}`);
	}
};
