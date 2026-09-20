import type { Selectable } from 'kysely';
import { db, type MxComponentInstallationsTable, type MxComponentsTable } from '../db';
import { componentCounters, type ComponentCounters, type Installation } from './components';

/**
 * Database side of components (Phase 16): loading a component with its
 * installations and today's counters. The arithmetic is in components.ts.
 */

export type ComponentRow = Selectable<MxComponentsTable>;
export type InstallationRow = Selectable<MxComponentInstallationsTable>;

export function toInstallation(r: InstallationRow): Installation & { id: string; aircraft_id: string; position: string | null; install_work_order_id: string | null; remove_work_order_id: string | null; removed_reason: string | null } {
	return {
		id: r.id,
		aircraft_id: r.aircraft_id,
		position: r.position,
		installed_on: r.installed_on,
		installed_at_hours: Number(r.installed_at_hours),
		installed_at_landings: r.installed_at_landings,
		tsn_at_install: Number(r.tsn_at_install),
		tso_at_install: Number(r.tso_at_install),
		csn_at_install: r.csn_at_install,
		removed_on: r.removed_on,
		removed_at_hours: r.removed_at_hours === null ? null : Number(r.removed_at_hours),
		removed_at_landings: r.removed_at_landings,
		removed_reason: r.removed_reason,
		install_work_order_id: r.install_work_order_id,
		remove_work_order_id: r.remove_work_order_id
	};
}

export type InstallationView = ReturnType<typeof toInstallation>;

export interface ComponentWithState {
	component: ComponentRow;
	installations: InstallationView[];
	counters: ComponentCounters;
	/** The open installation, if any. */
	current: InstallationView | null;
}

/**
 * Components by id, each with every installation (any aircraft, newest
 * first) and today's counters. `aircraftNow` is used for a component
 * currently installed on that aircraft; one installed elsewhere freezes
 * at its fitting readings until that aircraft is tracked too.
 */
export async function loadComponents(ids: string[] | 'all', aircraftNow: { id: string; hours: number; landings: number } | null, today: string): Promise<Map<string, ComponentWithState>> {
	let cq = db.selectFrom('mx_components').selectAll();
	if (ids !== 'all') {
		if (ids.length === 0) return new Map();
		cq = cq.where('id', 'in', ids);
	}
	const components = await cq.orderBy('description', 'asc').execute();
	if (components.length === 0) return new Map();
	const installs = await db
		.selectFrom('mx_component_installations')
		.selectAll()
		.where(
			'component_id',
			'in',
			components.map((c) => c.id)
		)
		.orderBy('installed_on', 'desc')
		.orderBy('created_at', 'desc')
		.execute();
	const byComponent = new Map<string, InstallationView[]>();
	for (const i of installs) (byComponent.get(i.component_id) ?? byComponent.set(i.component_id, []).get(i.component_id)!).push(toInstallation(i));

	const out = new Map<string, ComponentWithState>();
	for (const c of components) {
		const list = byComponent.get(c.id) ?? [];
		const current = list.find((i) => i.removed_on === null) ?? null;
		const here = current && aircraftNow && current.aircraft_id === aircraftNow.id ? { hours: aircraftNow.hours, landings: aircraftNow.landings } : null;
		out.set(c.id, { component: c, installations: list, counters: componentCounters(list, here, c.manufacture_date, today), current });
	}
	return out;
}

/** Ids of the components installed on an aircraft right now. */
export async function installedComponentIds(aircraftId: string): Promise<string[]> {
	const rows = await db.selectFrom('mx_component_installations').select('component_id').where('aircraft_id', '=', aircraftId).where('removed_on', 'is', null).execute();
	return rows.map((r) => r.component_id);
}

/** "Magneto, Slick 6314 · 6314 / B5678" */
export function componentLabel(c: Pick<ComponentRow, 'description' | 'part_number' | 'serial_number'>): string {
	return `${c.description} · ${c.part_number} / ${c.serial_number}`;
}
