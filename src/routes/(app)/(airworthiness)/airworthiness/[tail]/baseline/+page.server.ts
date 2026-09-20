import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { checkComplete, loadBaseline, parseBaselineRows, release, saveDraft } from '$lib/server/airworthiness/baseline';
import { intervalLabel } from '$lib/server/airworthiness/present';
import { loadTracked } from '$lib/server/airworthiness/programme';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const b = await loadBaseline(aircraft.id);
	const byTask = new Map(b.items.map((i) => [i.task_id, i]));
	const released = b.order?.status === 'released';
	// released: every task that has a row; open: every active task (plus rows kept for deactivated ones)
	const tasks = b.tasks.filter((t) => (released ? byTask.has(t.id) : t.active || byTask.has(t.id)));
	return {
		tail: aircraft.tail_number,
		released,
		order: b.order
			? { releasedAt: b.order.released_at, releasedBy: b.releasedBy, hash: b.order.release_hash, openedAt: b.order.opened_at, source: b.order.notes ?? '' }
			: null,
		profile: { baselineAt: profile.baseline_at, hours: Number(profile.baseline_hours).toFixed(1), landings: String(profile.baseline_landings) },
		rows: tasks.map((t) => {
			const i = byTask.get(t.id);
			return {
				id: t.id,
				code: t.code,
				title: t.title,
				interval: intervalLabel(t),
				oneTime: t.one_time,
				active: t.active,
				needsHours: t.interval_hours !== null,
				needsLandings: t.interval_landings !== null,
				done_on: i?.done_on ?? '',
				done_hours: i?.done_hours === null || i?.done_hours === undefined ? '' : String(Number(i.done_hours)),
				done_landings: i?.done_landings === null || i?.done_landings === undefined ? '' : String(i.done_landings),
				evidence: i?.reference_data ?? ''
			};
		}),
		total: b.tasks.filter((t) => t.active && !t.one_time).length
	};
};

/** What the page needs to re-render a failed submit with what was typed (plain POSTs, no use:enhance). */
export interface EchoedValues {
	baseline_at: string;
	baseline_hours: string;
	baseline_landings: string;
	source: string;
	rows: Record<string, { done_on: string; done_hours: string; done_landings: string; evidence: string }>;
}

function echo(form: FormData, taskIds: string[]): EchoedValues {
	const g = (k: string) => String(form.get(k) ?? '');
	const rows: EchoedValues['rows'] = {};
	for (const id of taskIds) rows[id] = { done_on: g(`done_on_${id}`), done_hours: g(`done_hours_${id}`), done_landings: g(`done_landings_${id}`), evidence: g(`evidence_${id}`) };
	return { baseline_at: g('baseline_at'), baseline_hours: g('baseline_hours'), baseline_landings: g('baseline_landings'), source: g('source'), rows };
}

async function readForm(event: Parameters<Actions[string]>[0]) {
	const { aircraft, profile } = await loadTracked(event.params.tail);
	const b = await loadBaseline(aircraft.id);
	const form = await event.request.formData();
	const values = echo(
		form,
		b.tasks.map((t) => t.id)
	);
	const bad = (error: string) => ({ error, values }) as const;
	if (b.order?.status === 'released') return bad('The baseline is released and cannot be changed.');
	const rows = parseBaselineRows(
		form,
		b.tasks.map((t) => t.id)
	);
	if (!rows.ok) return bad(rows.error);
	// the baseline figures live on the profile until release
	const baseline_at = values.baseline_at.trim();
	const baseline_hours = Number(values.baseline_hours.replace(',', '.'));
	const baseline_landings = Number(values.baseline_landings || 0);
	if (!YMD.test(baseline_at)) return bad('Enter the baseline date (YYYY-MM-DD).');
	if (!Number.isFinite(baseline_hours) || baseline_hours < 0) return bad('Airframe hours must be a number, 0 or more.');
	if (!Number.isInteger(baseline_landings) || baseline_landings < 0) return bad('Landings must be a whole number, 0 or more.');
	const source = values.source.trim() || null;
	return { aircraft, profile, b, rows: rows.rows, values, source, figures: { baseline_at, baseline_hours: Math.round(baseline_hours * 10) / 10, baseline_landings } } as const;
}

export const actions: Actions = {
	saveDraft: async (event) => {
		const r = await readForm(event);
		if ('error' in r) return fail(400, { error: r.error, values: r.values });
		await db.updateTable('mx_aircraft').set({ ...r.figures, updated_at: new Date().toISOString() }).where('aircraft_id', '=', r.aircraft.id).execute();
		await saveDraft(r.aircraft.id, event.locals.user!.id, r.rows, r.source, r.b.tasks);
		audit(event, { action: 'airworthiness.baseline_draft', entity: ['aircraft', r.aircraft.id], details: { tail: r.aircraft.tail_number, rows: r.rows.length, ...r.figures } });
		return { saved: 'draft' };
	},

	release: async (event) => {
		const r = await readForm(event);
		if ('error' in r) return fail(400, { error: r.error, values: r.values });
		const incomplete = checkComplete(r.b.tasks, r.rows);
		if (incomplete) return fail(400, { error: incomplete, values: r.values });
		await db.updateTable('mx_aircraft').set({ ...r.figures, updated_at: new Date().toISOString() }).where('aircraft_id', '=', r.aircraft.id).execute();
		const orderId = await saveDraft(r.aircraft.id, event.locals.user!.id, r.rows, r.source, r.b.tasks);
		const hash = await release(orderId, event.locals.user!, r.figures);
		audit(event, { action: 'airworthiness.baseline_release', entity: ['mx_work_order', orderId], details: { tail: r.aircraft.tail_number, rows: r.rows.length, ...r.figures, hash } });
		return { saved: 'released' };
	}
};
