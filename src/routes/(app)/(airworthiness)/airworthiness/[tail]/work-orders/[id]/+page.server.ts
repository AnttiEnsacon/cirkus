import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { aircraftCounters, aircraftCountersAt } from '$lib/server/airworthiness/counters';
import { installedComponentIds, loadComponents, componentLabel } from '$lib/server/airworthiness/inventory';
import { formatParts, parseParts } from '$lib/server/airworthiness/parts';
import { KIND_LABEL } from '$lib/server/airworthiness/present';
import { loadTracked } from '$lib/server/airworthiness/programme';
import { addItem, cancelOrder, loadOrder, releaseOrder, removeItem, validateRelease, WorkOrderError, type ItemValues, type NewComponent } from '$lib/server/airworthiness/workorders';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;

export const load: PageServerLoad = async ({ params, url }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const o = await loadOrder(params.id, aircraft.id);
	if (!o) throw error(404, 'No such work order.');
	if (o.order.kind === 'setup_baseline') throw redirect(303, `/airworthiness/${aircraft.tail_number}/baseline`);
	const isOpen = o.order.status === 'open';
	const today = helsinkiToday();

	// what the add-item and release forms offer
	const tasks = isOpen
		? await db.selectFrom('mx_tasks').select(['id', 'code', 'title', 'pilot_owner_allowed']).where('aircraft_id', '=', aircraft.id).where('active', '=', true).orderBy('code').execute()
		: [];
	const defects = isOpen
		? await db.selectFrom('mx_defects').select(['id', 'number', 'title']).where('aircraft_id', '=', aircraft.id).where('status', 'in', ['open', 'deferred']).orderBy('number').execute()
		: [];
	const counters = await aircraftCounters(aircraft.id, profile, today);
	const components = isOpen ? await loadComponents('all', { id: aircraft.id, hours: counters.hours, landings: counters.landings }, today) : new Map();
	const installedHere = new Set(isOpen ? await installedComponentIds(aircraft.id) : []);
	const installed = [...components.values()].filter((c) => installedHere.has(c.component.id)).map((c) => ({ id: c.component.id, label: `${c.current?.position ? c.current.position + ' · ' : ''}${componentLabel(c.component)}` }));
	const spares = [...components.values()].filter((c) => !c.current).map((c) => ({ id: c.component.id, label: componentLabel(c.component) }));

	// the reconciliation: what Cirkus makes of the log on the release date
	const computed = o.order.released_at ? await aircraftCountersAt(aircraft.id, profile, o.order.released_at) : null;
	const delta = computed && o.order.released_hours !== null ? Math.round((Number(o.order.released_hours) - computed.hours) * 10) / 10 : null;

	return {
		tail: aircraft.tail_number,
		today,
		justReleased: url.searchParams.get('released') === '1',
		order: {
			id: o.order.id,
			kind: o.order.kind,
			kindLabel: KIND_LABEL[o.order.kind],
			status: o.order.status,
			title: o.order.title,
			openedAt: o.order.opened_at,
			openedBy: o.openedBy,
			notes: o.order.notes,
			releasedAt: o.order.released_at,
			releasedBy: o.releasedBy,
			releasedHours: o.order.released_hours === null ? null : Number(o.order.released_hours).toFixed(1),
			releasedLandings: o.order.released_landings,
			performedByOrg: o.order.performed_by_org,
			performedByRef: o.order.performed_by_ref,
			crsName: o.order.crs_name,
			crsLicence: o.order.crs_licence,
			crsText: o.order.crs_text,
			hash: o.order.release_hash,
			cancelledAt: o.order.cancelled_at,
			cancelledBy: o.cancelledBy,
			cancelledReason: o.order.cancelled_reason
		},
		items: o.items.map((i) => ({
			id: i.id,
			n: i.position + 1,
			taskCode: i.task_code,
			taskId: i.task_id,
			description: i.description,
			reference: i.reference_data,
			removed: i.removed_label,
			installed: i.installed_label,
			installedReadings: i.installed_component_id ? `TSN ${Number(i.installed_tsn ?? 0).toFixed(1)} · TSO ${Number(i.installed_tso ?? 0).toFixed(1)} · CSN ${i.installed_csn ?? 0}` : null,
			position: i.position_label,
			parts: i.parts_used.map((p) => `${p.part_number}${p.serial_number ? ` · ${p.serial_number}` : ''} ×${p.quantity}${p.traceability ? ` · ${p.traceability}` : ''}`),
			defect: i.defect_number ? `#${i.defect_number} ${i.defect_title}` : null
		})),
		installations: o.installations.map((ci) => ({
			id: ci.id,
			label: `${ci.description} · ${ci.part_number} / ${ci.serial_number}`,
			what: ci.install_work_order_id === o.order.id ? `installed ${ci.installed_on}${ci.position ? ` as ${ci.position}` : ''}` : `removed ${ci.removed_on}`,
			componentId: ci.component_id
		})),
		computed: computed ? { hours: computed.hours.toFixed(1), landings: computed.landings, delta: delta === null ? null : (delta > 0 ? '+' : '') + delta.toFixed(1), off: delta !== null && Math.abs(delta) > 1.0 } : null,
		now: { hours: counters.hours.toFixed(1), landings: counters.landings },
		options: { tasks, defects, installed, spares },
		isPilotOwner: o.order.kind === 'pilot_owner'
	};
};

function itemEcho(form: FormData) {
	const out: Record<string, string> = {};
	for (const [k, v] of form) if (typeof v === 'string') out[k] = v;
	return out;
}

export const actions: Actions = {
	addItem: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = itemEcho(form);
		const s = (k: string) => String(form.get(k) ?? '').trim();
		const opt = (k: string) => (UUID.test(s(k)) ? s(k) : null);
		const num = (k: string) => (s(k) === '' ? null : Number(s(k).replace(',', '.')));
		const bad = (error: string) => fail(400, { error, values });

		const task_id = opt('task_id');
		let description = s('description');
		if (!description && task_id) {
			const t = await db.selectFrom('mx_tasks').select('title').where('id', '=', task_id).executeTakeFirst();
			description = t?.title ?? '';
		}
		if (!description) return bad('Describe what was done (or pick a task).');
		const parts = parseParts(s('parts'));
		if (!parts.ok) return bad(parts.error);
		const installedTsn = num('installed_tsn');
		const installedTso = num('installed_tso');
		const installedCsn = num('installed_csn');
		for (const [v, name] of [[installedTsn, 'TSN'], [installedTso, 'TSO'], [installedCsn, 'CSN']] as const) {
			if (v !== null && (!Number.isFinite(v) || v < 0)) return bad(`${name} at fitting must be a number, 0 or more.`);
		}
		if (installedCsn !== null && !Number.isInteger(installedCsn)) return bad('CSN at fitting must be a whole number.');

		const installedChoice = s('installed_component_id');
		let newComponent: NewComponent | undefined;
		let installed_component_id: string | null = null;
		if (installedChoice === 'new') {
			const part_number = s('new_part_number');
			const serial_number = s('new_serial_number');
			const cdesc = s('new_description');
			if (!part_number || !serial_number || !cdesc) return bad('A new component needs a part number, a serial number and a description.');
			const manufacture_date = s('new_manufacture_date') || null;
			if (manufacture_date && !YMD.test(manufacture_date)) return bad('The manufacture date must be YYYY-MM-DD.');
			newComponent = { part_number, serial_number, description: cdesc, ata_chapter: s('new_ata') || null, manufacture_date, traceability_ref: s('new_traceability') || null };
		} else if (UUID.test(installedChoice)) installed_component_id = installedChoice;

		const v: ItemValues = {
			task_id,
			description,
			reference_data: s('reference_data') || null,
			defect_id: opt('defect_id'),
			removed_component_id: opt('removed_component_id'),
			installed_component_id,
			installed_tsn: installedTsn,
			installed_tso: installedTso,
			installed_csn: installedCsn,
			position_label: s('position_label') || null,
			parts_used: parts.parts
		};
		try {
			const itemId = await addItem(event.params.id, aircraft.id, v, newComponent);
			audit(event, { action: 'airworthiness.work_order_item_add', entity: ['mx_work_order', event.params.id], details: { tail: aircraft.tail_number, item: itemId, description, newComponent: newComponent ? `${newComponent.part_number} / ${newComponent.serial_number}` : undefined } });
		} catch (e) {
			if (e instanceof WorkOrderError) return bad(e.message);
			throw e;
		}
		return { saved: 'item' };
	},

	removeItem: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const itemId = String(form.get('item_id') ?? '');
		try {
			await removeItem(event.params.id, aircraft.id, itemId);
		} catch (e) {
			if (e instanceof WorkOrderError) return fail(400, { error: e.message });
			throw e;
		}
		audit(event, { action: 'airworthiness.work_order_item_remove', entity: ['mx_work_order', event.params.id], details: { tail: aircraft.tail_number, item: itemId } });
		return { saved: 'removed' };
	},

	release: async (event) => {
		const { aircraft, profile } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values = itemEcho(form);
		const v = validateRelease(form);
		if (!v.ok) return fail(400, { error: v.error, values });
		try {
			const r = await releaseOrder(event.params.id, aircraft.id, event.locals.user!.id, v.values);
			const computed = await aircraftCountersAt(aircraft.id, profile, v.values.released_at);
			audit(event, {
				action: 'airworthiness.work_order_release',
				entity: ['mx_work_order', event.params.id],
				details: { tail: aircraft.tail_number, released_at: v.values.released_at, hours: v.values.released_hours, landings: v.values.released_landings, computed_hours: computed.hours, crs: v.values.crs_name, items: r.items, hash: r.hash }
			});
		} catch (e) {
			if (e instanceof WorkOrderError) return fail(400, { error: e.message, values });
			throw e;
		}
		throw redirect(303, `/airworthiness/${aircraft.tail_number}/work-orders/${event.params.id}?released=1`);
	},

	cancel: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Say why the order is cancelled.' });
		try {
			await cancelOrder(event.params.id, aircraft.id, event.locals.user!.id, reason);
		} catch (e) {
			if (e instanceof WorkOrderError) return fail(400, { error: e.message });
			throw e;
		}
		audit(event, { action: 'airworthiness.work_order_cancel', entity: ['mx_work_order', event.params.id], details: { tail: aircraft.tail_number, reason } });
		throw redirect(303, `/airworthiness/${aircraft.tail_number}/work-orders`);
	}
};
