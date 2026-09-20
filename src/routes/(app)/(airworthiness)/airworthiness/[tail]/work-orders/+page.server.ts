import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import { KIND_LABEL, STATUS_LABEL } from '$lib/server/airworthiness/present';
import { openOrder, validateOpen } from '$lib/server/airworthiness/workorders';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const orders = await db
		.selectFrom('mx_work_orders as w')
		.innerJoin('users as u', 'u.id', 'w.opened_by')
		.leftJoin(
			(eb) => eb.selectFrom('mx_work_order_items').select(['work_order_id', eb.fn.countAll<number>().as('n')]).groupBy('work_order_id').as('c'),
			(join) => join.onRef('c.work_order_id', '=', 'w.id')
		)
		.select(['w.id', 'w.kind', 'w.status', 'w.title', 'w.opened_at', 'w.released_at', 'w.released_hours', 'w.released_landings', 'w.crs_name', 'w.performed_by_org', 'w.performed_by_ref', 'w.release_hash', 'w.cancelled_at', 'w.cancelled_reason', 'u.name as opened_by', 'c.n as items'])
		.where('w.aircraft_id', '=', aircraft.id)
		.orderBy('w.opened_at', 'desc')
		.orderBy('w.created_at', 'desc')
		.execute();
	const p = await loadProgramme(aircraft.id, profile);
	const row = (o: (typeof orders)[number]) => ({
		id: o.id,
		kind: KIND_LABEL[o.kind],
		isBaseline: o.kind === 'setup_baseline',
		title: o.title,
		openedAt: o.opened_at,
		openedBy: o.opened_by,
		items: Number(o.items ?? 0),
		releasedAt: o.released_at,
		readings: o.released_hours === null ? '' : `${Number(o.released_hours).toFixed(1)} h · ${o.released_landings}`,
		crs: o.crs_name ?? '',
		performedBy: [o.performed_by_org, o.performed_by_ref].filter(Boolean).join(' · '),
		hash: o.release_hash ? o.release_hash.slice(0, 8) + '…' : '',
		cancelledAt: o.cancelled_at,
		cancelledReason: o.cancelled_reason
	});
	return {
		tail: aircraft.tail_number,
		today: helsinkiToday(),
		open: orders.filter((o) => o.status === 'open').map(row),
		released: orders.filter((o) => o.status === 'released').sort((a, b) => (a.released_at! < b.released_at! ? 1 : -1)).map(row),
		cancelled: orders.filter((o) => o.status === 'cancelled').map(row),
		// tasks worth starting an order with: anything not plainly ok
		suggested: p.items
			.filter((i) => i.task.active && ['overdue', 'in_tolerance', 'due_soon'].includes(i.due.status))
			.map((i) => ({ id: i.task.id, code: i.task.code, title: i.task.title, status: i.due.status, statusLabel: STATUS_LABEL[i.due.status] })),
		others: p.items.filter((i) => i.task.active && !['overdue', 'in_tolerance', 'due_soon'].includes(i.due.status)).map((i) => ({ id: i.task.id, code: i.task.code, title: i.task.title }))
	};
};

export const actions: Actions = {
	open: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = { kind: String(form.get('kind') ?? ''), title: String(form.get('title') ?? ''), opened_at: String(form.get('opened_at') ?? ''), notes: String(form.get('notes') ?? '') };
		const v = validateOpen(form);
		if (!v.ok) return fail(400, { error: v.error, values });
		if (v.values.kind === 'pilot_owner') return fail(400, { error: 'Pilot-owner releases are made from the pilot-owner page, in one step.', values });
		const id = await openOrder(aircraft.id, event.locals.user!.id, v.values);
		audit(event, { action: 'airworthiness.work_order_open', entity: ['mx_work_order', id], details: { tail: aircraft.tail_number, kind: v.values.kind, title: v.values.title, tasks: v.values.taskIds.length } });
		throw redirect(303, `/airworthiness/${aircraft.tail_number}/work-orders/${id}`);
	}
};
