import { createHash } from 'node:crypto';
import { db } from '../db';
import { helsinkiToday } from '../time';

/**
 * The baseline work order: the day-one "last done" for every task, read
 * from the logbooks or the CAO's last status list. Saved as a draft any
 * number of times, released once; the trigger in 0015 freezes it after.
 * Released, it is the only compliance record until M2's work orders.
 */

export interface BaselineRowInput {
	task_id: string;
	done_on: string;
	done_hours: string;
	done_landings: string;
	evidence: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function loadBaseline(aircraftId: string) {
	const order = (await db.selectFrom('mx_work_orders').selectAll().where('aircraft_id', '=', aircraftId).where('kind', '=', 'setup_baseline').executeTakeFirst()) ?? null;
	const items = order ? await db.selectFrom('mx_work_order_items').selectAll().where('work_order_id', '=', order.id).execute() : [];
	const tasks = await db
		.selectFrom('mx_tasks')
		.select(['id', 'code', 'title', 'one_time', 'interval_hours', 'interval_months', 'interval_landings', 'active'])
		.where('aircraft_id', '=', aircraftId)
		.orderBy('code', 'asc')
		.execute();
	const releasedBy = order?.released_by ? await db.selectFrom('users').select('name').where('id', '=', order.released_by).executeTakeFirst() : null;
	return { order, items, tasks, releasedBy: releasedBy?.name ?? null };
}

/** Rows from the form → items to store. Empty rows (nothing filled) are left out. */
export function parseBaselineRows(form: FormData, taskIds: string[]): { ok: true; rows: BaselineRowInput[] } | { ok: false; error: string } {
	const rows: BaselineRowInput[] = [];
	for (const id of taskIds) {
		const get = (k: string) => String(form.get(`${k}_${id}`) ?? '').trim();
		const row = { task_id: id, done_on: get('done_on'), done_hours: get('done_hours').replace(',', '.'), done_landings: get('done_landings'), evidence: get('evidence') };
		if (!row.done_on && !row.done_hours && !row.done_landings && !row.evidence) continue;
		if (row.done_on && !YMD.test(row.done_on)) return { ok: false, error: `Row ${id}: the date must be YYYY-MM-DD.` };
		if (row.done_hours && !(Number.isFinite(Number(row.done_hours)) && Number(row.done_hours) >= 0)) return { ok: false, error: 'Hours must be a number, 0 or more.' };
		if (row.done_landings && !(Number.isInteger(Number(row.done_landings)) && Number(row.done_landings) >= 0)) return { ok: false, error: 'Landings must be a whole number, 0 or more.' };
		rows.push(row);
	}
	return { ok: true, rows };
}

/** What a release needs: a date for every active recurring task, hours/landings where the intervals count them. */
export function checkComplete(
	tasks: { id: string; code: string; one_time: boolean; active: boolean; interval_hours: string | null; interval_landings: number | null }[],
	rows: BaselineRowInput[]
): string | null {
	const byTask = new Map(rows.map((r) => [r.task_id, r]));
	const missing: string[] = [];
	for (const t of tasks) {
		if (!t.active || t.one_time) continue;
		const r = byTask.get(t.id);
		if (!r || !r.done_on) missing.push(`${t.code}: last done date`);
		else {
			if (t.interval_hours !== null && !r.done_hours) missing.push(`${t.code}: hours`);
			if (t.interval_landings !== null && !r.done_landings) missing.push(`${t.code}: landings`);
		}
	}
	return missing.length ? `Fill in before releasing — ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.` : null;
}

/** Writes the draft: creates the order if needed, replaces its items. Caller checks it is not released. */
export async function saveDraft(aircraftId: string, userId: string, rows: BaselineRowInput[], source: string | null, tasks: { id: string; title: string; code: string }[]): Promise<string> {
	return db.transaction().execute(async (trx) => {
		let order = await trx.selectFrom('mx_work_orders').select(['id', 'status']).where('aircraft_id', '=', aircraftId).where('kind', '=', 'setup_baseline').executeTakeFirst();
		if (!order) {
			order = await trx
				.insertInto('mx_work_orders')
				.values({ aircraft_id: aircraftId, kind: 'setup_baseline', title: 'Baseline — last done for every task', opened_at: helsinkiToday(), opened_by: userId, notes: source })
				.returning(['id', 'status'])
				.executeTakeFirstOrThrow();
		} else {
			await trx.updateTable('mx_work_orders').set({ notes: source, updated_at: new Date().toISOString() }).where('id', '=', order.id).execute();
		}
		await trx.deleteFrom('mx_work_order_items').where('work_order_id', '=', order.id).execute();
		if (rows.length) {
			const titles = new Map(tasks.map((t) => [t.id, `${t.code} · ${t.title}`]));
			await trx
				.insertInto('mx_work_order_items')
				.values(
					rows.map((r, i) => ({
						work_order_id: order!.id,
						task_id: r.task_id,
						description: titles.get(r.task_id) ?? 'task',
						reference_data: r.evidence || null,
						done_on: r.done_on || null,
						done_hours: r.done_hours === '' ? null : Number(r.done_hours),
						done_landings: r.done_landings === '' ? null : Number(r.done_landings),
						position: i
					}))
				)
				.execute();
		}
		return order.id;
	});
}

/** Flips the draft to released with the profile's figures; items first, status last (the triggers). */
export async function release(orderId: string, user: { id: string; name: string }, profile: { baseline_at: string; baseline_hours: string | number; baseline_landings: number }): Promise<string> {
	const items = await db.selectFrom('mx_work_order_items').selectAll().where('work_order_id', '=', orderId).orderBy('position').execute();
	const order = await db.selectFrom('mx_work_orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();
	const canonical = JSON.stringify({
		id: orderId,
		kind: 'setup_baseline',
		released_at: profile.baseline_at,
		released_hours: Number(profile.baseline_hours),
		released_landings: profile.baseline_landings,
		notes: order.notes,
		items: items.map((i) => ({ task_id: i.task_id, done_on: i.done_on, done_hours: i.done_hours === null ? null : Number(i.done_hours), done_landings: i.done_landings, evidence: i.reference_data }))
	});
	const hash = createHash('sha256').update(canonical).digest('hex');
	await db
		.updateTable('mx_work_orders')
		.set({
			status: 'released',
			released_at: profile.baseline_at,
			released_hours: Number(profile.baseline_hours),
			released_landings: profile.baseline_landings,
			crs_name: user.name,
			crs_text: 'Baseline record: last-done figures read from the logbooks and the previous status list. Not a maintenance release.',
			release_hash: hash,
			released_by: user.id,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', orderId)
		.where('status', '=', 'open')
		.execute();
	return hash;
}
