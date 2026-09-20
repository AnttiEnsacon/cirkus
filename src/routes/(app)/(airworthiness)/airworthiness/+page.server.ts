import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { loadFleet } from '$lib/server/airworthiness/programme';
import { dueRow, STATE_CHIP, STATE_LABEL } from '$lib/server/airworthiness/present';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const fleet = await loadFleet();
	return {
		today: helsinkiToday(),
		fleet: fleet.map(({ aircraft, profile, programme }) => ({
			id: aircraft.id,
			tail: aircraft.tail_number,
			type: aircraft.type,
			tracked: profile !== null,
			summary: profile
				? `${profile.amp_basis === 'ica' ? "Manufacturer's ICA" : 'Minimum inspection programme'}${profile.amp_reference ? ` · ${profile.amp_reference}` : ''}${profile.amp_declared_at ? ` · declared ${profile.amp_declared_at}` : ' · not declared yet'}`
				: null,
			state: programme ? { key: programme.status.state, label: STATE_LABEL[programme.status.state], chip: STATE_CHIP[programme.status.state], reasons: programme.status.reasons } : null,
			counters: programme
				? {
						hours: programme.counters.hours.toFixed(1),
						landings: programme.counters.landings,
						perDay: programme.counters.hoursPerDay.toFixed(2),
						source: profile!.hours_source
					}
				: null,
			next: programme ? programme.items.filter((i) => i.due.status !== 'complete').slice(0, 5).map(dueRow) : [],
			activeTasks: programme ? programme.items.length : 0,
			defects: programme ? { open: programme.defects.length, unassessed: programme.defects.filter((d) => d.affects === null).length } : null
		}))
	};
};

export const actions: Actions = {
	/** Start tracking an aircraft: a profile with today's date and zero counters, then straight to the programme page to fill it in. */
	setup: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('aircraft_id') ?? '');
		const plane = await db.selectFrom('aircraft').select(['id', 'tail_number', 'records_tacho']).where('id', '=', id).executeTakeFirst();
		if (!plane) return fail(400, { error: 'No such aircraft.' });
		const existing = await db.selectFrom('mx_aircraft').select('aircraft_id').where('aircraft_id', '=', id).executeTakeFirst();
		if (existing) throw redirect(303, `/airworthiness/${plane.tail_number}/programme`);
		await db
			.insertInto('mx_aircraft')
			.values({
				aircraft_id: id,
				hours_source: plane.records_tacho ? 'tacho' : 'block',
				baseline_at: helsinkiToday(),
				baseline_hours: 0,
				baseline_landings: 0
			})
			.execute();
		audit(event, { action: 'airworthiness.setup', entity: ['aircraft', id], details: { tail: plane.tail_number } });
		throw redirect(303, `/airworthiness/${plane.tail_number}/programme`);
	}
};
