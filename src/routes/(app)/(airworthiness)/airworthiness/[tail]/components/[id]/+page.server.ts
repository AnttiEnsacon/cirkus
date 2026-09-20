import { error, fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { aircraftCounters } from '$lib/server/airworthiness/counters';
import { ageLabel } from '$lib/server/airworthiness/components';
import { loadComponents } from '$lib/server/airworthiness/inventory';
import { dueRow, KIND_LABEL } from '$lib/server/airworthiness/present';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	if (!UUID.test(params.id)) throw error(404, 'No such component.');
	const today = helsinkiToday();
	const counters = await aircraftCounters(aircraft.id, profile, today);
	const c = (await loadComponents([params.id], { id: aircraft.id, hours: counters.hours, landings: counters.landings }, today)).get(params.id);
	if (!c) throw error(404, 'No such component.');

	const tails = new Map((await db.selectFrom('aircraft').select(['id', 'tail_number']).execute()).map((a) => [a.id, a.tail_number]));
	const orderIds = [...new Set(c.installations.flatMap((i) => [i.install_work_order_id, i.remove_work_order_id]).filter((id): id is string => id !== null))];
	const orderTitles = new Map(orderIds.length ? (await db.selectFrom('mx_work_orders').select(['id', 'title']).where('id', 'in', orderIds).execute()).map((o) => [o.id, o.title]) : []);

	const programme = await loadProgramme(aircraft.id, profile, { includeInactive: true });
	const tasks = programme.items.filter((i) => i.task.component_id === c.component.id).map(dueRow);

	// every work order item that removed or installed this component
	const touched = await db
		.selectFrom('mx_work_order_items as i')
		.innerJoin('mx_work_orders as o', 'o.id', 'i.work_order_id')
		.select(['o.id', 'o.title', 'o.kind', 'o.status', 'o.opened_at', 'o.released_at', 'i.description', 'i.removed_component_id', 'i.installed_component_id'])
		.where((eb) => eb.or([eb('i.removed_component_id', '=', c.component.id), eb('i.installed_component_id', '=', c.component.id)]))
		.orderBy('o.opened_at', 'desc')
		.execute();

	const here = c.current?.aircraft_id === aircraft.id;
	return {
		tail: aircraft.tail_number,
		today,
		component: {
			id: c.component.id,
			description: c.component.description,
			pn: c.component.part_number,
			sn: c.component.serial_number,
			ata: c.component.ata_chapter ?? '',
			manufactureDate: c.component.manufacture_date ?? '',
			age: ageLabel(c.component.manufacture_date, today),
			traceability: c.component.traceability_ref ?? '',
			notes: c.component.notes ?? ''
		},
		state: c.current ? (here ? 'installed' : 'elsewhere') : c.installations.length ? 'removed' : 'spare',
		where: c.current ? (tails.get(c.current.aircraft_id) ?? '?') : null,
		position: c.current?.position ?? null,
		counters: c.counters.current ? { tsn: c.counters.tsn.toFixed(1), tso: c.counters.tso.toFixed(1), csn: c.counters.csn } : null,
		installations: c.installations.map((i) => ({
			id: i.id,
			tail: tails.get(i.aircraft_id) ?? '?',
			position: i.position,
			installed: `${i.installed_on} at ${i.installed_at_hours.toFixed(1)} h`,
			installedOrder: i.install_work_order_id ? { id: i.install_work_order_id, title: orderTitles.get(i.install_work_order_id) ?? 'work order' } : null,
			removed: i.removed_on ? `${i.removed_on} at ${Number(i.removed_at_hours).toFixed(1)} h` : null,
			removedReason: i.removed_reason,
			removedOrder: i.remove_work_order_id ? { id: i.remove_work_order_id, title: orderTitles.get(i.remove_work_order_id) ?? 'work order' } : null,
			atFitting: `TSN ${i.tsn_at_install.toFixed(1)} · TSO ${i.tso_at_install.toFixed(1)} · CSN ${i.csn_at_install}`
		})),
		tasks,
		orders: touched.map((o) => ({
			id: o.id,
			title: o.title,
			kind: KIND_LABEL[o.kind],
			status: o.status,
			when: o.released_at ?? o.opened_at,
			what: o.removed_component_id === c.component.id && o.installed_component_id === c.component.id ? 'removed and refitted' : o.removed_component_id === c.component.id ? 'removed' : 'installed',
			description: o.description
		}))
	};
};

export const actions: Actions = {
	update: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values: Record<string, string> = {};
		for (const [k, val] of form) if (typeof val === 'string') values[k] = val;
		const s = (k: string) => String(form.get(k) ?? '').trim();
		const description = s('description');
		if (!description) return fail(400, { error: 'The description cannot be empty.', values });
		const manufacture_date = s('manufacture_date') || null;
		if (manufacture_date && !YMD.test(manufacture_date)) return fail(400, { error: 'The manufacture date must be YYYY-MM-DD.', values });
		const r = await db
			.updateTable('mx_components')
			.set({ description, ata_chapter: s('ata_chapter') || null, manufacture_date, traceability_ref: s('traceability_ref') || null, notes: s('notes') || null, updated_at: new Date().toISOString() })
			.where('id', '=', event.params.id)
			.executeTakeFirst();
		if (Number(r.numUpdatedRows) === 0) return fail(404, { error: 'No such component.', values });
		audit(event, { action: 'airworthiness.component_update', entity: ['mx_component', event.params.id], details: { tail: aircraft.tail_number, description } });
		return { saved: true };
	}
};
