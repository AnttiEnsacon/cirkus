import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { readTasksCsv } from '$lib/server/airworthiness/csv';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import { baselineReleased, parseProfileForm } from '$lib/server/airworthiness/profile';
import { dueRow } from '$lib/server/airworthiness/present';
import type { Actions, PageServerLoad } from './$types';

const MAX_CSV_BYTES = 512 * 1024;

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const [p, locked, declaredBy] = await Promise.all([
		loadProgramme(aircraft.id, profile, { includeInactive: true }),
		baselineReleased(aircraft.id),
		profile.amp_declared_by ? db.selectFrom('users').select('name').where('id', '=', profile.amp_declared_by).executeTakeFirst() : null
	]);
	return {
		tail: aircraft.tail_number,
		subtitle: 'Programme',
		recordsTacho: aircraft.records_tacho,
		baselineLocked: locked,
		profile: {
			msn: profile.msn ?? '',
			year_built: profile.year_built === null ? '' : String(profile.year_built),
			mtow_kg: profile.mtow_kg === null ? '' : String(profile.mtow_kg),
			hours_source: profile.hours_source,
			baseline_at: profile.baseline_at,
			baseline_hours: Number(profile.baseline_hours).toFixed(1),
			baseline_landings: String(profile.baseline_landings),
			amp_basis: profile.amp_basis,
			amp_reference: profile.amp_reference ?? '',
			amp_declared_at: profile.amp_declared_at ?? '',
			amp_declared_by: declaredBy?.name ?? '',
			amp_reviewed_at: profile.amp_reviewed_at ?? '',
			warn_hours: String(Number(profile.warn_hours)),
			warn_days: String(profile.warn_days),
			warn_landings: String(profile.warn_landings)
		},
		tasks: p.items.map(dueRow),
		activeCount: p.items.filter((i) => i.task.active).length,
		inactiveCount: p.items.filter((i) => !i.task.active).length
	};
};

export const actions: Actions = {
	saveProfile: async (event) => {
		const { aircraft, profile } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const locked = await baselineReleased(aircraft.id);
		const parsed = parseProfileForm(form, aircraft, { baselineLocked: locked, current: profile });
		if (!parsed.ok) {
			const values: Record<string, string> = {};
			for (const [k, v] of form) if (typeof v === 'string') values[k] = v;
			return fail(400, { error: parsed.error, values });
		}
		const v = parsed.values;
		await db
			.updateTable('mx_aircraft')
			.set({
				...v,
				// the first person to enter a declaration date is recorded as the declarer
				amp_declared_by: v.amp_declared_at ? (profile.amp_declared_by ?? event.locals.user!.id) : null,
				updated_at: new Date().toISOString()
			})
			.where('aircraft_id', '=', aircraft.id)
			.execute();
		audit(event, {
			action: 'airworthiness.profile_save',
			entity: ['aircraft', aircraft.id],
			details: { tail: aircraft.tail_number, hours_source: v.hours_source, baseline: locked ? 'locked' : `${v.baseline_at} ${v.baseline_hours} h ${v.baseline_landings} ldg`, declared: v.amp_declared_at }
		});
		return { saved: 'profile' };
	},

	/** All-or-nothing: the first bad row stops everything with its line number. Existing codes are updated, new ones added. */
	import: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a CSV file.' });
		if (file.size > MAX_CSV_BYTES) return fail(400, { error: 'That file is larger than 512 KB — a programme is a few dozen rows.' });
		const parsed = readTasksCsv(await file.text());
		if (!parsed.ok) return fail(400, { error: parsed.error });

		let added = 0;
		let updated = 0;
		await db.transaction().execute(async (trx) => {
			for (const t of parsed.tasks) {
				const existing = await trx.selectFrom('mx_tasks').select('id').where('aircraft_id', '=', aircraft.id).where('code', '=', t.code).executeTakeFirst();
				if (existing) {
					await trx.updateTable('mx_tasks').set({ ...t, active: true, updated_at: new Date().toISOString() }).where('id', '=', existing.id).execute();
					updated++;
				} else {
					await trx.insertInto('mx_tasks').values({ ...t, aircraft_id: aircraft.id }).execute();
					added++;
				}
			}
		});
		audit(event, { action: 'airworthiness.tasks_import', entity: ['aircraft', aircraft.id], details: { tail: aircraft.tail_number, file: file.name, added, updated } });
		return { imported: { added, updated, notes: parsed.notes } };
	}
};
