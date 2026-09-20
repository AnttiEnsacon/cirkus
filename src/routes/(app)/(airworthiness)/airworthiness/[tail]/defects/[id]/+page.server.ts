import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { aircraftCounters } from '$lib/server/airworthiness/counters';
import { assessDefect, closeDefect, DefectError, deferDefect, flightLabel, loadDefect, reopenDefect, validateDefer } from '$lib/server/airworthiness/defects';
import { DEFECT_STATUS_LABEL, DEFECT_STATUS_PILL, KIND_LABEL } from '$lib/server/airworthiness/present';
import { loadTracked } from '$lib/server/airworthiness/programme';
import { addItem, openOrder } from '$lib/server/airworthiness/workorders';
import type { Actions, PageServerLoad } from './$types';

const UUID = /^[0-9a-f-]{36}$/;

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	if (!UUID.test(params.id)) throw error(404, 'No such defect.');
	const r = await loadDefect(params.id, aircraft.id);
	if (!r) throw error(404, 'No such defect.');
	const d = r.defect;
	const today = helsinkiToday();
	const counters = await aircraftCounters(aircraft.id, profile, today);

	// work orders that already carry this defect as an item (open ones — the release rectifies it)
	const orders = await db
		.selectFrom('mx_work_order_items as i')
		.innerJoin('mx_work_orders as o', 'o.id', 'i.work_order_id')
		.select(['o.id', 'o.title', 'o.status', 'o.kind'])
		.where('i.defect_id', '=', d.id)
		.orderBy('o.opened_at', 'desc')
		.execute();

	const active = d.status === 'open' || d.status === 'deferred';
	const pastLimit =
		d.status === 'deferred' &&
		((d.deferral_limit_date !== null && d.deferral_limit_date < today) || (d.deferral_limit_hours !== null && counters.hours > Number(d.deferral_limit_hours)));

	return {
		tail: aircraft.tail_number,
		today,
		now: { hours: counters.hours.toFixed(1) },
		defect: {
			id: d.id,
			number: d.number,
			title: d.title,
			description: d.description,
			status: d.status,
			statusLabel: DEFECT_STATUS_LABEL[d.status],
			pill: DEFECT_STATUS_PILL[d.status],
			active,
			reportedAt: d.reported_at_text,
			reportedBy: d.reported_by_name,
			flight: flightLabel(d),
			affects: d.affects_airworthiness,
			assessedBy: d.assessed_by_name,
			assessedOn: d.assessed_on,
			assessment: d.assessment ?? '',
			deferredBy: d.deferred_by ?? '',
			deferredOn: d.deferred_on,
			basis: d.deferral_basis ?? '',
			limitDate: d.deferral_limit_date ?? '',
			limitHours: d.deferral_limit_hours === null ? '' : Number(d.deferral_limit_hours).toFixed(1),
			pastLimit,
			rectified: d.rectified_work_order_id ? { id: d.rectified_work_order_id, on: d.rectified_on, title: d.order_title ?? '', kind: KIND_LABEL[d.order_kind ?? 'unscheduled'] } : null,
			closedOn: d.closed_on,
			closedBy: d.closed_by_name,
			closedReason: d.closed_reason
		},
		images: r.images.map((i) => ({ id: i.id, url: `/defects/${d.id}/image/${i.id}`, width: i.width, height: i.height })),
		orders: orders.map((o) => ({ id: o.id, title: o.title, status: o.status, kind: KIND_LABEL[o.kind] }))
	};
};

function echo(form: FormData) {
	const out: Record<string, string> = {};
	for (const [k, v] of form) if (typeof v === 'string') out[k] = v;
	return out;
}

export const actions: Actions = {
	assess: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = echo(form);
		const choice = String(form.get('affects') ?? '');
		if (choice !== 'yes' && choice !== 'no') return fail(400, { error: 'Say whether the defect affects airworthiness.', values });
		const assessment = String(form.get('assessment') ?? '').trim() || null;
		try {
			await assessDefect(event.params.id, aircraft.id, event.locals.user!.id, choice === 'yes', assessment);
		} catch (e) {
			if (e instanceof DefectError) return fail(400, { error: e.message, values });
			throw e;
		}
		audit(event, { action: 'airworthiness.defect_assess', entity: ['mx_defect', event.params.id], details: { tail: aircraft.tail_number, affects_airworthiness: choice === 'yes', assessment } });
		return { saved: 'assessed' };
	},

	defer: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = echo(form);
		const v = validateDefer(form);
		if (!v.ok) return fail(400, { error: v.error, values });
		try {
			await deferDefect(event.params.id, aircraft.id, v.values);
		} catch (e) {
			if (e instanceof DefectError) return fail(400, { error: e.message, values });
			throw e;
		}
		audit(event, { action: 'airworthiness.defect_defer', entity: ['mx_defect', event.params.id], details: { tail: aircraft.tail_number, ...v.values } });
		return { saved: 'deferred' };
	},

	close: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = echo(form);
		const reason = String(form.get('closed_reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Say why the defect is closed without work.', values });
		try {
			await closeDefect(event.params.id, aircraft.id, event.locals.user!.id, reason);
		} catch (e) {
			if (e instanceof DefectError) return fail(400, { error: e.message, values });
			throw e;
		}
		audit(event, { action: 'airworthiness.defect_close', entity: ['mx_defect', event.params.id], details: { tail: aircraft.tail_number, reason } });
		return { saved: 'closed' };
	},

	reopen: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		try {
			await reopenDefect(event.params.id, aircraft.id);
		} catch (e) {
			if (e instanceof DefectError) return fail(400, { error: e.message });
			throw e;
		}
		audit(event, { action: 'airworthiness.defect_reopen', entity: ['mx_defect', event.params.id], details: { tail: aircraft.tail_number } });
		return { saved: 'reopened' };
	},

	/** Opens a defect work order with this defect as its first item, and goes there. */
	openOrder: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const r = await loadDefect(event.params.id, aircraft.id);
		if (!r) throw error(404, 'No such defect.');
		const d = r.defect;
		if (d.status !== 'open' && d.status !== 'deferred') return fail(400, { error: `Defect #${d.number} is ${d.status}.` });
		const orderId = await openOrder(aircraft.id, event.locals.user!.id, { kind: 'defect', title: `Defect #${d.number} — ${d.title}`, opened_at: helsinkiToday(), notes: null, taskIds: [] });
		await addItem(orderId, aircraft.id, {
			task_id: null,
			description: `Rectify defect #${d.number}: ${d.title}`,
			reference_data: null,
			defect_id: d.id,
			removed_component_id: null,
			installed_component_id: null,
			installed_tsn: null,
			installed_tso: null,
			installed_csn: null,
			position_label: null,
			parts_used: []
		});
		audit(event, { action: 'airworthiness.work_order_open', entity: ['mx_work_order', orderId], details: { tail: aircraft.tail_number, kind: 'defect', defect: d.number, title: d.title } });
		throw redirect(303, `/airworthiness/${aircraft.tail_number}/work-orders/${orderId}`);
	}
};
