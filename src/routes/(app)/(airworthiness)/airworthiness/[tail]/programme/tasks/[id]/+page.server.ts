import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { componentLabel } from '$lib/server/airworthiness/inventory';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import { dueAtLabel, KIND_LABEL, pointLabel, remainingLabel, STATUS_LABEL, projectedLabel } from '$lib/server/airworthiness/present';
import { taskFormRaw, validateTask } from '$lib/server/airworthiness/tasks';
import type { TaskFormValues } from '$lib/components/TaskForm.svelte';
import type { Actions, PageServerLoad } from './$types';

const EMPTY: TaskFormValues = {
	code: '',
	title: '',
	source: 'ica',
	source_ref: '',
	interval_hours: '',
	interval_months: '',
	interval_landings: '',
	one_time: false,
	anchor_kind: 'last_compliance',
	anchor_date: '',
	anchor_hours: '',
	anchor_landings: '',
	tolerance_hours: '0',
	tolerance_days: '0',
	tolerance_landings: '0',
	reset_rule: 'from_original',
	pilot_owner_allowed: false,
	notes: '',
	component_id: ''
};

const UUID = /^[0-9a-f-]{36}$/;

/** Every component, for the "applies to" select — the ones installed here first. */
async function componentOptions(aircraftId: string) {
	const rows = await db
		.selectFrom('mx_components as c')
		.leftJoin('mx_component_installations as i', (j) => j.onRef('i.component_id', '=', 'c.id').on('i.removed_on', 'is', null))
		.select(['c.id', 'c.description', 'c.part_number', 'c.serial_number', 'i.aircraft_id as installed_on', 'i.position'])
		.orderBy('c.description')
		.execute();
	return rows
		.map((r) => {
			const here = r.installed_on === aircraftId;
			const prefix = here ? (r.position ? r.position + ' · ' : '') : r.installed_on ? 'elsewhere · ' : 'spare · ';
			return { id: r.id, label: prefix + componentLabel(r), here };
		})
		.sort((a, b) => Number(b.here) - Number(a.here) || a.label.localeCompare(b.label))
		.map(({ id, label }) => ({ id, label }));
}

const s = (v: string | number | null) => (v === null ? '' : String(v));

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	if (params.id === 'new') {
		return { tail: aircraft.tail_number, isNew: true, task: null, initial: EMPTY, computed: null, components: await componentOptions(aircraft.id), component: null, history: [] };
	}
	const p = await loadProgramme(aircraft.id, profile, { includeInactive: true });
	const item = p.items.find((i) => i.task.id === params.id);
	if (!item) throw error(404, 'No such task.');
	const t = item.task;
	const initial: TaskFormValues = {
		code: t.code,
		title: t.title,
		source: t.source,
		source_ref: t.source_ref ?? '',
		interval_hours: s(t.interval_hours === null ? null : Number(t.interval_hours)),
		interval_months: s(t.interval_months),
		interval_landings: s(t.interval_landings),
		one_time: t.one_time,
		anchor_kind: t.anchor_kind,
		anchor_date: t.anchor_date ?? '',
		anchor_hours: s(t.anchor_hours === null ? null : Number(t.anchor_hours)),
		anchor_landings: s(t.anchor_landings),
		tolerance_hours: String(Number(t.tolerance_hours)),
		tolerance_days: String(t.tolerance_days),
		tolerance_landings: String(t.tolerance_landings),
		reset_rule: t.reset_rule,
		pilot_owner_allowed: t.pilot_owner_allowed,
		notes: t.notes ?? '',
		component_id: t.component_id ?? ''
	};
	const l = item.due.controlling;
	const history = await db
		.selectFrom('mx_task_compliance as c')
		.innerJoin('mx_work_orders as o', 'o.id', 'c.work_order_id')
		.select(['c.work_order_id', 'c.kind', 'c.done_on', 'c.done_hours', 'c.done_landings', 'o.title', 'o.crs_name'])
		.where('c.task_id', '=', t.id)
		.orderBy('c.done_on', 'desc')
		.execute();
	return {
		history: history.map((h) => ({
			id: h.work_order_id,
			isBaseline: h.kind === 'setup_baseline',
			kind: KIND_LABEL[h.kind],
			on: h.done_on ?? '—',
			hours: h.done_hours === null ? '—' : `${Number(h.done_hours).toFixed(1)} h`,
			landings: h.done_landings === null ? '—' : `${h.done_landings} ldg`,
			title: h.title,
			crs: h.crs_name
		})),
		tail: aircraft.tail_number,
		isNew: false,
		task: { id: t.id, code: t.code, title: t.title, active: t.active },
		initial,
		components: await componentOptions(aircraft.id),
		component: item.component ? { id: item.component.component.id, label: componentLabel(item.component.component), installed: !!item.component.current && item.component.current.aircraft_id === aircraft.id } : null,
		computed: {
			lastDone: pointLabel(item.lastDone),
			compliances: item.compliances,
			dueAt: item.due.limits.map(dueAtLabel).join(' or ') || '—',
			controlling: l ? l.kind : '—',
			remaining: remainingLabel(l) + (l && l.tolerance > 0 ? ` (tolerance +${l.tolerance}${l.kind === 'hours' ? ' h' : l.kind === 'calendar' ? ' days' : ' ldg'})` : ''),
			projected: projectedLabel(item.due),
			status: item.due.status,
			statusLabel: STATUS_LABEL[item.due.status],
			missing: item.due.missing.join(', ')
		}
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const raw = taskFormRaw(form);
		const componentIdRaw = String(form.get('component_id') ?? '').trim();
		const values = { ...raw, component_id: componentIdRaw };
		const v = validateTask(raw);
		if (!v.ok) return fail(400, { error: v.error, values });
		let component_id: string | null = null;
		if (componentIdRaw) {
			if (!UUID.test(componentIdRaw)) return fail(400, { error: 'Pick a component from the list.', values });
			const c = await db.selectFrom('mx_components').select('id').where('id', '=', componentIdRaw).executeTakeFirst();
			if (!c) return fail(400, { error: 'That component no longer exists.', values });
			component_id = c.id;
		}
		if ((v.values.anchor_kind === 'install' || v.values.anchor_kind === 'manufacture') && !component_id) {
			return fail(400, { error: 'An install or manufacture anchor needs a component under "applies to".', values });
		}
		const isNew = event.params.id === 'new';
		const clash = await db
			.selectFrom('mx_tasks')
			.select('id')
			.where('aircraft_id', '=', aircraft.id)
			.where('code', '=', v.values.code)
			.$if(!isNew, (q) => q.where('id', '<>', event.params.id))
			.executeTakeFirst();
		if (clash) return fail(400, { error: `${v.values.code} is already used by another task on ${aircraft.tail_number}.`, values });

		let id = event.params.id;
		if (isNew) {
			const row = await db.insertInto('mx_tasks').values({ ...v.values, component_id, aircraft_id: aircraft.id }).returning('id').executeTakeFirstOrThrow();
			id = row.id;
		} else {
			const n = await db.updateTable('mx_tasks').set({ ...v.values, component_id, updated_at: new Date().toISOString() }).where('id', '=', id).where('aircraft_id', '=', aircraft.id).executeTakeFirst();
			if (Number(n.numUpdatedRows) === 0) throw error(404, 'No such task.');
		}
		audit(event, { action: isNew ? 'airworthiness.task_add' : 'airworthiness.task_save', entity: ['mx_task', id], details: { tail: aircraft.tail_number, code: v.values.code, notes: v.notes } });
		throw redirect(303, `/airworthiness/${aircraft.tail_number}/programme/tasks/${id}?saved=1`);
	},

	deactivate: async (event) => setActive(event, false),
	reactivate: async (event) => setActive(event, true)
};

async function setActive(event: Parameters<Actions[string]>[0], active: boolean) {
	const { aircraft } = await loadTracked(event.params.tail);
	const n = await db
		.updateTable('mx_tasks')
		.set({ active, updated_at: new Date().toISOString() })
		.where('id', '=', event.params.id)
		.where('aircraft_id', '=', aircraft.id)
		.executeTakeFirst();
	if (Number(n.numUpdatedRows) === 0) throw error(404, 'No such task.');
	audit(event, { action: active ? 'airworthiness.task_reactivate' : 'airworthiness.task_deactivate', entity: ['mx_task', event.params.id], details: { tail: aircraft.tail_number } });
	throw redirect(303, `/airworthiness/${aircraft.tail_number}/programme`);
}
