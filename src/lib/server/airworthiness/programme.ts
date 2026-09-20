import { error } from '@sveltejs/kit';
import { db, type MxAircraftTable, type MxTasksTable } from '../db';
import type { Selectable } from 'kysely';
import { aircraftCounters, type AircraftCounters } from './counters';
import { componentAnchorPoint, toComponentPoint } from './components';
import { aircraftStatus, computeDue, resolveAnchor, type AircraftState, type DefectForStatus, type Due, type DueTask, type Point, type Policy } from './due';
import { loadComponents, type ComponentWithState } from './inventory';

export type TaskRow = Selectable<MxTasksTable>;
export type ProfileRow = Selectable<MxAircraftTable>;

/** The aircraft behind a `/airworthiness/[tail]` page, with its profile if tracked. */
export async function loadAircraft(tail: string) {
	const aircraft = await db
		.selectFrom('aircraft')
		.select(['id', 'tail_number', 'type', 'records_tacho', 'billing_basis'])
		.where('tail_number', '=', tail.toUpperCase())
		.executeTakeFirst();
	if (!aircraft) throw error(404, 'No such aircraft.');
	const profile = (await db.selectFrom('mx_aircraft').selectAll().where('aircraft_id', '=', aircraft.id).executeTakeFirst()) ?? null;
	return { aircraft, profile };
}

/** Like loadAircraft, but a 404 when the aircraft is not tracked yet. */
export async function loadTracked(tail: string) {
	const { aircraft, profile } = await loadAircraft(tail);
	if (!profile) throw error(404, `${aircraft.tail_number} is not tracked yet — set it up on the Airworthiness overview.`);
	return { aircraft, profile };
}

export function policyOf(profile: ProfileRow): Policy {
	return { warnHours: Number(profile.warn_hours), warnDays: profile.warn_days, warnLandings: profile.warn_landings };
}

const num = (v: string | number | null) => (v === null ? null : Number(v));

/** The calculator's view of a task row. */
export function toDueTask(t: TaskRow): DueTask {
	const fixed: Point | null =
		t.anchor_kind === 'last_compliance' ? null : { date: t.anchor_date, hours: num(t.anchor_hours), landings: t.anchor_landings };
	return {
		oneTime: t.one_time,
		source: t.source,
		intervalHours: num(t.interval_hours),
		intervalMonths: t.interval_months,
		intervalLandings: t.interval_landings,
		toleranceHours: Number(t.tolerance_hours),
		toleranceDays: t.tolerance_days,
		toleranceLandings: t.tolerance_landings,
		resetRule: t.reset_rule,
		anchorKind: t.anchor_kind,
		fixed
	};
}

export interface ProgrammeItem {
	task: TaskRow;
	due: Due;
	/** The most recent compliance, if any (what the pages show as "last done"); in the component's readings for a component task. */
	lastDone: Point | null;
	compliances: number;
	/** Phase 16: the component a task belongs to, with today's readings. */
	component: ComponentWithState | null;
}

export interface Programme {
	counters: AircraftCounters;
	items: ProgrammeItem[];
	status: { state: AircraftState; reasons: string[] };
	baselineReleased: boolean;
	/** Phase 16: open and deferred defects, as the status saw them. */
	defects: DefectForStatus[];
	components: Map<string, ComponentWithState>;
}

const SEVERITY: Record<Due['status'], number> = { overdue: 0, in_tolerance: 1, due_soon: 2, undefined: 3, ok: 4, complete: 5 };

/**
 * Every active task with its due state, sorted by what comes first, plus
 * the aircraft's rolled-up state. One query for tasks, one for the
 * compliance history, one for the counters.
 */
export async function loadProgramme(aircraftId: string, profile: ProfileRow, opts: { includeInactive?: boolean } = {}): Promise<Programme> {
	const counters = await aircraftCounters(aircraftId, profile);
	let q = db.selectFrom('mx_tasks').selectAll().where('aircraft_id', '=', aircraftId).orderBy('code', 'asc');
	if (!opts.includeInactive) q = q.where('active', '=', true);
	const tasks = await q.execute();

	const history = await db
		.selectFrom('mx_task_compliance')
		.select(['task_id', 'done_on', 'done_hours', 'done_landings'])
		.where('aircraft_id', '=', aircraftId)
		.orderBy('done_on', 'asc')
		.orderBy('done_hours', 'asc')
		.execute();
	const byTask = new Map<string, Point[]>();
	for (const h of history) {
		(byTask.get(h.task_id) ?? byTask.set(h.task_id, []).get(h.task_id)!).push({ date: h.done_on, hours: num(h.done_hours), landings: h.done_landings });
	}

	const baseline = await db
		.selectFrom('mx_work_orders')
		.select('status')
		.where('aircraft_id', '=', aircraftId)
		.where('kind', '=', 'setup_baseline')
		.executeTakeFirst();
	const baselineReleased = baseline?.status === 'released';

	// Phase 16: components behind component tasks, and the open/deferred defects.
	const componentIds = [...new Set(tasks.map((t) => t.component_id).filter((id): id is string => id !== null))];
	const components = await loadComponents(componentIds, { id: aircraftId, hours: counters.hours, landings: counters.landings }, counters.today);
	const defectRows = await db
		.selectFrom('mx_defects')
		.select(['number', 'title', 'status', 'affects_airworthiness', 'deferral_limit_date', 'deferral_limit_hours'])
		.where('aircraft_id', '=', aircraftId)
		.where('status', 'in', ['open', 'deferred'])
		.orderBy('number', 'asc')
		.execute();
	const defects: DefectForStatus[] = defectRows.map((d) => ({
		number: d.number,
		title: d.title,
		status: d.status as 'open' | 'deferred',
		affects: d.affects_airworthiness,
		limitDate: d.deferral_limit_date,
		limitHours: d.deferral_limit_hours === null ? null : Number(d.deferral_limit_hours)
	}));

	const policy = policyOf(profile);
	const items: ProgrammeItem[] = tasks.map((task) => {
		const dueTask = toDueTask(task);
		let points = byTask.get(task.id) ?? [];
		let taskCounters = counters;
		const component = task.component_id ? (components.get(task.component_id) ?? null) : null;
		if (task.component_id) {
			// A component task counts in the component's own hours and landings:
			// compliance points are converted through the installation current on
			// their date, the anchor for install/manufacture is the component's,
			// and the counters are the component's readings today.
			const here = component ? component.installations.filter((i) => i.aircraft_id === aircraftId) : [];
			points = points.map((p) => toComponentPoint(here, p));
			if (task.anchor_kind === 'install' || task.anchor_kind === 'manufacture') {
				dueTask.fixed = component ? componentAnchorPoint(task.anchor_kind, component.current, component.component.manufacture_date) : null;
			}
			taskCounters = component ? { ...counters, hours: component.counters.tsn, landings: component.counters.csn } : { ...counters, hours: 0, landings: 0 };
		}
		const anchor = resolveAnchor(dueTask, points);
		return { task, due: computeDue(dueTask, anchor, taskCounters, policy), lastDone: points.at(-1) ?? null, compliances: points.length, component };
	});
	items.sort((a, b) => {
		if (a.task.active !== b.task.active) return a.task.active ? -1 : 1;
		const pa = a.due.projectedDate ?? '9999-99-99';
		const pb = b.due.projectedDate ?? '9999-99-99';
		return SEVERITY[a.due.status] - SEVERITY[b.due.status] || (pa < pb ? -1 : pa > pb ? 1 : 0) || a.task.code.localeCompare(b.task.code);
	});

	const status = aircraftStatus(
		items.filter((i) => i.task.active).map((i) => ({ code: i.task.code, due: i.due })),
		{ baselineReleased, declaredAt: profile.amp_declared_at, reviewedAt: profile.amp_reviewed_at, today: counters.today, defects, hoursNow: counters.hours }
	);
	return { counters, items, status, baselineReleased, defects, components };
}

/** The whole fleet for the overview: every aircraft, tracked or not. */
export async function loadFleet() {
	const aircraft = await db.selectFrom('aircraft').select(['id', 'tail_number', 'type', 'records_tacho']).orderBy('tail_number', 'asc').execute();
	const profiles = await db.selectFrom('mx_aircraft').selectAll().execute();
	const out = [];
	for (const a of aircraft) {
		const profile = profiles.find((p) => p.aircraft_id === a.id) ?? null;
		out.push({ aircraft: a, profile, programme: profile ? await loadProgramme(a.id, profile) : null });
	}
	return out;
}
