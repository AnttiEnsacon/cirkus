import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { helsinkiToday } from '$lib/server/time';
import { aircraftCounters } from '$lib/server/airworthiness/counters';
import { ageLabel } from '$lib/server/airworthiness/components';
import { loadComponents, type ComponentWithState } from '$lib/server/airworthiness/inventory';
import { STATUS_LABEL } from '$lib/server/airworthiness/present';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

interface TaskChip {
	id: string;
	code: string;
	status: string;
	statusLabel: string;
}

function view(c: ComponentWithState, today: string, tasks: TaskChip[]) {
	return {
		id: c.component.id,
		description: c.component.description,
		pn: c.component.part_number,
		sn: c.component.serial_number,
		ata: c.component.ata_chapter,
		position: c.current?.position ?? null,
		tsn: c.counters.current ? c.counters.tsn.toFixed(1) : '—',
		tso: c.counters.current ? c.counters.tso.toFixed(1) : '—',
		csn: c.counters.current ? String(c.counters.csn) : '—',
		age: ageLabel(c.component.manufacture_date, today),
		tasks,
		// spares and removed
		removed: (() => {
			const last = c.installations[0];
			if (!last || last.removed_on === null) return null;
			return { on: last.removed_on, hours: Number(last.removed_at_hours).toFixed(1), reason: last.removed_reason };
		})()
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const today = helsinkiToday();
	const counters = await aircraftCounters(aircraft.id, profile, today);
	const components = await loadComponents('all', { id: aircraft.id, hours: counters.hours, landings: counters.landings }, today);
	const programme = await loadProgramme(aircraft.id, profile);

	const tasksByComponent = new Map<string, TaskChip[]>();
	for (const i of programme.items) {
		if (!i.task.component_id) continue;
		const list = tasksByComponent.get(i.task.component_id) ?? [];
		list.push({ id: i.task.id, code: i.task.code, status: i.due.status, statusLabel: STATUS_LABEL[i.due.status] });
		tasksByComponent.set(i.task.component_id, list);
	}
	const tails = new Map((await db.selectFrom('aircraft').select(['id', 'tail_number']).execute()).map((a) => [a.id, a.tail_number]));

	const installed = [];
	const others = [];
	for (const c of components.values()) {
		const v = view(c, today, tasksByComponent.get(c.component.id) ?? []);
		if (c.current && c.current.aircraft_id === aircraft.id) installed.push(v);
		else others.push({ ...v, elsewhere: c.current ? (tails.get(c.current.aircraft_id) ?? '?') : null });
	}
	installed.sort((a, b) => (a.position ?? '').localeCompare(b.position ?? '') || a.description.localeCompare(b.description));

	return {
		tail: aircraft.tail_number,
		today,
		now: { hours: counters.hours.toFixed(1), landings: counters.landings },
		installed,
		others
	};
};

export const actions: Actions = {
	add: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const values: Record<string, string> = {};
		for (const [k, val] of form) if (typeof val === 'string') values[k] = val;
		const s = (k: string) => String(form.get(k) ?? '').trim();
		const bad = (error: string) => fail(400, { error, values });

		const part_number = s('part_number');
		const serial_number = s('serial_number');
		const description = s('description');
		if (!part_number || !serial_number || !description) return bad('A component needs a part number, a serial number and a description.');
		const manufacture_date = s('manufacture_date') || null;
		if (manufacture_date && !YMD.test(manufacture_date)) return bad('The manufacture date must be YYYY-MM-DD.');

		// Optional: already fitted to this aircraft (the setup record — no work order).
		const fitted = s('fitted') === 'on';
		let install: { installed_on: string; installed_at_hours: number; installed_at_landings: number; tsn: number; tso: number; csn: number; position: string | null } | null = null;
		if (fitted) {
			const installed_on = s('installed_on');
			if (!YMD.test(installed_on)) return bad('Enter the date it was fitted (YYYY-MM-DD).');
			if (installed_on > helsinkiToday()) return bad('The fitting date cannot be in the future.');
			const n = (k: string) => (s(k) === '' ? 0 : Number(s(k).replace(',', '.')));
			const installed_at_hours = n('installed_at_hours');
			const installed_at_landings = n('installed_at_landings');
			const tsn = n('tsn');
			const tso = n('tso');
			const csn = n('csn');
			for (const [v, name] of [[installed_at_hours, 'Aircraft hours at fitting'], [installed_at_landings, 'Aircraft landings at fitting'], [tsn, 'TSN'], [tso, 'TSO'], [csn, 'CSN']] as const) {
				if (!Number.isFinite(v) || v < 0) return bad(`${name} must be a number, 0 or more.`);
			}
			if (!Number.isInteger(installed_at_landings) || !Number.isInteger(csn)) return bad('Landings and CSN are whole numbers.');
			install = { installed_on, installed_at_hours, installed_at_landings, tsn, tso, csn, position: s('position') || null };
		}

		let id: string;
		try {
			id = await db.transaction().execute(async (trx) => {
				const c = await trx
					.insertInto('mx_components')
					.values({ part_number, serial_number, description, ata_chapter: s('ata_chapter') || null, manufacture_date, traceability_ref: s('traceability_ref') || null, notes: s('notes') || null })
					.returning('id')
					.executeTakeFirstOrThrow();
				if (install) {
					await trx
						.insertInto('mx_component_installations')
						.values({
							component_id: c.id,
							aircraft_id: aircraft.id,
							position: install.position,
							installed_on: install.installed_on,
							installed_at_hours: install.installed_at_hours.toFixed(1),
							installed_at_landings: install.installed_at_landings,
							tsn_at_install: install.tsn.toFixed(1),
							tso_at_install: install.tso.toFixed(1),
							csn_at_install: install.csn
						})
						.execute();
				}
				return c.id;
			});
		} catch (e) {
			if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505') return bad(`A component ${part_number} / ${serial_number} already exists.`);
			throw e;
		}
		audit(event, { action: 'airworthiness.component_add', entity: ['mx_component', id], details: { tail: aircraft.tail_number, part_number, serial_number, description, fitted: install ? install.installed_on : undefined } });
		return { saved: true };
	}
};
