import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { eligibility } from '$lib/server/airworthiness/pilotOwner';
import { STATUS_LABEL, dueAtLabel, remainingLabel } from '$lib/server/airworthiness/present';
import { loadProgramme } from '$lib/server/airworthiness/programme';
import { pilotOwnerRelease, WorkOrderError } from '$lib/server/airworthiness/workorders';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const CRS_TEXT =
	'Pilot-owner maintenance (Part-ML Appendix II). I certify that the work specified was carried out in accordance with Part-ML and the aircraft maintenance programme, and that in respect of that work the aircraft is considered ready for release to service.';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const e = await eligibility(me.id);
	if (e.aircraft.length === 0) throw redirect(303, '/pilot-owner');
	const wanted = url.searchParams.get('aircraft')?.toUpperCase();
	const chosen = e.aircraft.find((a) => a.tail_number === wanted) ?? e.aircraft[0];
	const profile = await db.selectFrom('mx_aircraft').selectAll().where('aircraft_id', '=', chosen.aircraft_id).executeTakeFirstOrThrow();
	const programme = await loadProgramme(chosen.aircraft_id, profile);
	const tasks = programme.items
		.filter((i) => i.task.pilot_owner_allowed)
		.map((i) => ({
			id: i.task.id,
			code: i.task.code,
			title: i.task.title,
			status: i.due.status,
			statusLabel: STATUS_LABEL[i.due.status],
			due: i.due.controlling ? `${remainingLabel(i.due.controlling)} · ${dueAtLabel(i.due.controlling)}` : i.due.status === 'undefined' ? 'no baseline yet' : ''
		}));
	return {
		today: helsinkiToday(),
		aircraft: e.aircraft.map((a) => ({ tail: a.tail_number, type: a.type, on: a.aircraft_id === chosen.aircraft_id })),
		chosen: { id: chosen.aircraft_id, tail: chosen.tail_number, type: chosen.type, tacho: chosen.records_tacho && profile.hours_source === 'tacho' },
		now: { hours: programme.counters.hours.toFixed(1), landings: programme.counters.landings, lastTacho: programme.counters.lastTacho === null ? null : programme.counters.lastTacho.toFixed(1) },
		tasks,
		signer: { name: me.name, licence: e.licence ?? '' },
		crsText: CRS_TEXT
	};
};

export const actions: Actions = {
	default: async (event) => {
		const me = event.locals.user!;
		const form = await event.request.formData();
		const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const taskIds = form.getAll('task_ids').map(String).filter(Boolean);
		const bad = (error: string) => fail(400, { error, values, taskIds });
		const s = (k: string) => String(form.get(k) ?? '').trim();

		const e = await eligibility(me.id);
		const aircraft = e.aircraft.find((a) => a.aircraft_id === s('aircraft_id'));
		if (!aircraft || !e.licence) return bad('You cannot release pilot-owner maintenance on that aircraft.');
		if (taskIds.length === 0) return bad('Tick at least one task.');
		const released_at = s('released_at');
		if (!YMD.test(released_at)) return bad('Enter the date.');
		if (released_at > helsinkiToday()) return bad('The date cannot be in the future.');
		const released_hours = Number(s('released_hours').replace(',', '.'));
		if (!Number.isFinite(released_hours) || released_hours < 0) return bad(`Enter the ${aircraft.records_tacho ? 'Tacho reading' : 'hours'}.`);
		const released_landings = Number(s('released_landings') || 0);
		if (!Number.isInteger(released_landings) || released_landings < 0) return bad('Landings must be a whole number.');
		const oil = s('oil_added');
		if (oil && (!Number.isFinite(Number(oil.replace(',', '.'))) || Number(oil.replace(',', '.')) < 0)) return bad('Oil added must be a number of litres.');
		const notesParts = [oil ? `oil added ${Number(oil.replace(',', '.')).toFixed(1)} l` : '', s('notes')].filter(Boolean);
		const crs_text = s('crs_text') || CRS_TEXT;

		let r: { orderId: string; hash: string; codes: string[] };
		try {
			r = await pilotOwnerRelease(aircraft.aircraft_id, { id: me.id, name: me.name, licence_no: e.licence }, {
				taskIds,
				released_at,
				released_hours: Math.round(released_hours * 10) / 10,
				released_landings,
				notes: notesParts.join(' · ') || null,
				crs_text
			});
		} catch (err) {
			if (err instanceof WorkOrderError) return bad(err.message);
			throw err;
		}
		audit(event, {
			action: 'airworthiness.pilot_owner_release',
			entity: ['mx_work_order', r.orderId],
			details: { tail: aircraft.tail_number, tasks: r.codes, released_at, hours: released_hours, landings: released_landings, crs: me.name, licence: e.licence, hash: r.hash }
		});
		throw redirect(303, '/pilot-owner?released=1');
	}
};
