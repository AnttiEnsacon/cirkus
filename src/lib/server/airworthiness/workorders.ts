import { sql, type Selectable, type Transaction } from 'kysely';
import { db, type Database, type MxPartUsed, type MxWorkOrderItemsTable, type MxWorkOrderKind, type MxWorkOrdersTable } from '../db';
import { helsinkiToday } from '../time';
import { canonical, sha256 } from './parts';

/**
 * Work orders (Phase 16): the only way work is recorded. Items are added
 * while the order is open; the release seals it (the Phase 15 triggers
 * refuse every later change), opens and closes component installations,
 * and marks the defects it names rectified. Everything that changes rows
 * is here; the pages only parse forms and call in.
 */

export type OrderRow = Selectable<MxWorkOrdersTable>;
export type ItemRow = Selectable<MxWorkOrderItemsTable>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class WorkOrderError extends Error {}

/* ---------- loading ---------- */

export interface ItemView extends ItemRow {
	task_code: string | null;
	task_title: string | null;
	removed_label: string | null;
	installed_label: string | null;
	defect_number: number | null;
	defect_title: string | null;
}

export async function loadOrder(id: string, aircraftId: string) {
	const order = await db.selectFrom('mx_work_orders').selectAll().where('id', '=', id).where('aircraft_id', '=', aircraftId).executeTakeFirst();
	if (!order) return null;
	const items = await db
		.selectFrom('mx_work_order_items as i')
		.leftJoin('mx_tasks as t', 't.id', 'i.task_id')
		.leftJoin('mx_components as r', 'r.id', 'i.removed_component_id')
		.leftJoin('mx_components as n', 'n.id', 'i.installed_component_id')
		.leftJoin('mx_defects as d', 'd.id', 'i.defect_id')
		.selectAll('i')
		.select([
			't.code as task_code',
			't.title as task_title',
			sql<string | null>`case when r.id is null then null else r.description || ' · ' || r.part_number || ' / ' || r.serial_number end`.as('removed_label'),
			sql<string | null>`case when n.id is null then null else n.description || ' · ' || n.part_number || ' / ' || n.serial_number end`.as('installed_label'),
			'd.number as defect_number',
			'd.title as defect_title'
		])
		.where('i.work_order_id', '=', id)
		.orderBy('i.position', 'asc')
		.execute();
	const people = await db
		.selectFrom('users')
		.select(['id', 'name'])
		.where('id', 'in', [order.opened_by, order.released_by ?? order.opened_by, order.cancelled_by ?? order.opened_by])
		.execute();
	const name = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? null;
	const installations = await db
		.selectFrom('mx_component_installations as ci')
		.innerJoin('mx_components as c', 'c.id', 'ci.component_id')
		.select(['ci.id', 'ci.component_id', 'ci.installed_on', 'ci.removed_on', 'ci.position', 'ci.install_work_order_id', 'ci.remove_work_order_id', 'c.description', 'c.part_number', 'c.serial_number'])
		.where((eb) => eb.or([eb('ci.install_work_order_id', '=', id), eb('ci.remove_work_order_id', '=', id)]))
		.execute();
	return {
		order,
		items: items as ItemView[],
		openedBy: name(order.opened_by),
		releasedBy: name(order.released_by),
		cancelledBy: name(order.cancelled_by),
		installations
	};
}

/* ---------- opening, items, cancelling ---------- */

export interface OpenValues {
	kind: MxWorkOrderKind;
	title: string;
	opened_at: string;
	notes: string | null;
	taskIds: string[];
}

export function validateOpen(form: FormData): { ok: true; values: OpenValues } | { ok: false; error: string } {
	const kind = String(form.get('kind') ?? '') as MxWorkOrderKind;
	if (!['scheduled', 'unscheduled', 'defect', 'pilot_owner'].includes(kind)) return { ok: false, error: 'Choose the kind of work order.' };
	const title = String(form.get('title') ?? '').trim();
	if (!title) return { ok: false, error: 'Give the work order a title.' };
	const opened_at = String(form.get('opened_at') ?? '').trim() || helsinkiToday();
	if (!YMD.test(opened_at)) return { ok: false, error: 'The opened-on date must be YYYY-MM-DD.' };
	const notes = String(form.get('notes') ?? '').trim() || null;
	const taskIds = form.getAll('task_ids').map(String).filter(Boolean);
	return { ok: true, values: { kind, title, opened_at, notes, taskIds } };
}

/** Opens an order, seeded with one item per chosen task. */
export async function openOrder(aircraftId: string, userId: string, v: OpenValues): Promise<string> {
	return db.transaction().execute(async (trx) => {
		const order = await trx
			.insertInto('mx_work_orders')
			.values({ aircraft_id: aircraftId, kind: v.kind, title: v.title, opened_at: v.opened_at, opened_by: userId, notes: v.notes })
			.returning('id')
			.executeTakeFirstOrThrow();
		if (v.taskIds.length) {
			const tasks = await trx.selectFrom('mx_tasks').select(['id', 'title', 'source_ref']).where('aircraft_id', '=', aircraftId).where('id', 'in', v.taskIds).execute();
			if (tasks.length) {
				await trx
					.insertInto('mx_work_order_items')
					.values(tasks.map((t, i) => ({ work_order_id: order.id, task_id: t.id, description: t.title, reference_data: t.source_ref, position: i })))
					.execute();
			}
		}
		return order.id;
	});
}

export interface ItemValues {
	task_id: string | null;
	description: string;
	reference_data: string | null;
	defect_id: string | null;
	removed_component_id: string | null;
	installed_component_id: string | null;
	installed_tsn: number | null;
	installed_tso: number | null;
	installed_csn: number | null;
	position_label: string | null;
	parts_used: MxPartUsed[];
}

async function assertOpen(trx: Transaction<Database> | typeof db, orderId: string, aircraftId: string): Promise<OrderRow> {
	const order = await trx.selectFrom('mx_work_orders').selectAll().where('id', '=', orderId).where('aircraft_id', '=', aircraftId).executeTakeFirst();
	if (!order) throw new WorkOrderError('No such work order.');
	if (order.status !== 'open') throw new WorkOrderError(`This work order is ${order.status} and cannot be changed.`);
	return order;
}

/** A component created on the spot for an item that installs it. */
export interface NewComponent {
	part_number: string;
	serial_number: string;
	description: string;
	ata_chapter: string | null;
	manufacture_date: string | null;
	traceability_ref: string | null;
}

export async function addItem(orderId: string, aircraftId: string, v: ItemValues, newComponent?: NewComponent): Promise<string> {
	return db.transaction().execute(async (trx) => {
		const order = await assertOpen(trx, orderId, aircraftId);
		if (newComponent) {
			const clash = await trx.selectFrom('mx_components').select('id').where('part_number', '=', newComponent.part_number).where('serial_number', '=', newComponent.serial_number).executeTakeFirst();
			if (clash) throw new WorkOrderError(`${newComponent.part_number} / ${newComponent.serial_number} already exists — pick it from the list instead.`);
			const c = await trx.insertInto('mx_components').values(newComponent).returning('id').executeTakeFirstOrThrow();
			v = { ...v, installed_component_id: c.id };
		}
		if (v.task_id) {
			const t = await trx.selectFrom('mx_tasks').select(['id', 'pilot_owner_allowed']).where('id', '=', v.task_id).where('aircraft_id', '=', aircraftId).executeTakeFirst();
			if (!t) throw new WorkOrderError('No such task on this aircraft.');
			if (order.kind === 'pilot_owner' && !t.pilot_owner_allowed) throw new WorkOrderError('A pilot-owner order may only hold Appendix II tasks.');
		}
		if (order.kind === 'pilot_owner' && (v.removed_component_id || v.installed_component_id)) throw new WorkOrderError('Component swaps are not pilot-owner work.');
		if (v.defect_id) {
			const d = await trx.selectFrom('mx_defects').select(['status']).where('id', '=', v.defect_id).where('aircraft_id', '=', aircraftId).executeTakeFirst();
			if (!d) throw new WorkOrderError('No such defect on this aircraft.');
			if (d.status === 'rectified' || d.status === 'closed') throw new WorkOrderError(`That defect is already ${d.status}.`);
		}
		const last = await trx.selectFrom('mx_work_order_items').select(({ fn }) => fn.max('position').as('m')).where('work_order_id', '=', orderId).executeTakeFirst();
		const row = await trx
			.insertInto('mx_work_order_items')
			.values({ work_order_id: orderId, ...v, parts_used: JSON.stringify(v.parts_used), position: (last?.m ?? -1) + 1 })
			.returning('id')
			.executeTakeFirstOrThrow();
		return row.id;
	});
}

export async function removeItem(orderId: string, aircraftId: string, itemId: string): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await assertOpen(trx, orderId, aircraftId);
		await trx.deleteFrom('mx_work_order_items').where('id', '=', itemId).where('work_order_id', '=', orderId).execute();
	});
}

export async function cancelOrder(orderId: string, aircraftId: string, userId: string, reason: string): Promise<void> {
	await db.transaction().execute(async (trx) => {
		const order = await assertOpen(trx, orderId, aircraftId);
		if (order.kind === 'setup_baseline') throw new WorkOrderError('The baseline cannot be cancelled.');
		await trx
			.updateTable('mx_work_orders')
			.set({ status: 'cancelled', cancelled_at: helsinkiToday(), cancelled_reason: reason, cancelled_by: userId, updated_at: new Date().toISOString() })
			.where('id', '=', orderId)
			.execute();
	});
}

/* ---------- release ---------- */

export interface ReleaseValues {
	released_at: string;
	released_hours: number;
	released_landings: number;
	performed_by_org: string | null;
	performed_by_ref: string | null;
	crs_name: string;
	crs_licence: string | null;
	crs_text: string | null;
}

export function validateRelease(form: FormData, today = helsinkiToday()): { ok: true; values: ReleaseValues } | { ok: false; error: string } {
	const s = (k: string) => String(form.get(k) ?? '').trim();
	const released_at = s('released_at');
	if (!YMD.test(released_at)) return { ok: false, error: 'Enter the release date (YYYY-MM-DD).' };
	if (released_at > today) return { ok: false, error: 'The release date cannot be in the future.' };
	const released_hours = Number(s('released_hours').replace(',', '.'));
	if (!Number.isFinite(released_hours) || released_hours < 0) return { ok: false, error: 'Hours at release must be a number, 0 or more.' };
	const released_landings = Number(s('released_landings') || 0);
	if (!Number.isInteger(released_landings) || released_landings < 0) return { ok: false, error: 'Landings at release must be a whole number, 0 or more.' };
	const crs_name = s('crs_name');
	if (!crs_name) return { ok: false, error: 'Who signed the CRS? Enter the name.' };
	return {
		ok: true,
		values: {
			released_at,
			released_hours: Math.round(released_hours * 10) / 10,
			released_landings,
			performed_by_org: s('performed_by_org') || null,
			performed_by_ref: s('performed_by_ref') || null,
			crs_name,
			crs_licence: s('crs_licence') || null,
			crs_text: s('crs_text') || null
		}
	};
}

/** What the hash seals: the order's substance and its items, canonical JSON. */
export function releaseDigest(order: Pick<OrderRow, 'id' | 'aircraft_id' | 'kind' | 'title' | 'opened_at' | 'notes'>, v: ReleaseValues, items: ItemRow[]): string {
	return canonical({
		id: order.id,
		aircraft_id: order.aircraft_id,
		kind: order.kind,
		title: order.title,
		opened_at: order.opened_at,
		notes: order.notes,
		released_at: v.released_at,
		released_hours: v.released_hours,
		released_landings: v.released_landings,
		performed_by_org: v.performed_by_org,
		performed_by_ref: v.performed_by_ref,
		crs_name: v.crs_name,
		crs_licence: v.crs_licence,
		crs_text: v.crs_text,
		items: items.map((i) => ({
			position: i.position,
			task_id: i.task_id,
			description: i.description,
			reference_data: i.reference_data,
			removed_component_id: i.removed_component_id,
			installed_component_id: i.installed_component_id,
			installed_tsn: i.installed_tsn === null ? null : Number(i.installed_tsn),
			installed_tso: i.installed_tso === null ? null : Number(i.installed_tso),
			installed_csn: i.installed_csn,
			position_label: i.position_label,
			defect_id: i.defect_id,
			parts_used: i.parts_used
		}))
	});
}

/**
 * The release, in one transaction: checks, hash, the order flipped to
 * released (the trigger passes because the old row was open), component
 * installations closed and opened at the release readings, defects marked
 * rectified. Returns the hash.
 */
export async function releaseOrder(orderId: string, aircraftId: string, userId: string, v: ReleaseValues): Promise<{ hash: string; items: number }> {
	return db.transaction().execute((trx) => releaseIn(trx, orderId, aircraftId, userId, v));
}

/** The release inside a transaction, so the pilot-owner page can open and release in one. */
async function releaseIn(trx: Transaction<Database>, orderId: string, aircraftId: string, userId: string, v: ReleaseValues): Promise<{ hash: string; items: number }> {
	const order = await assertOpen(trx, orderId, aircraftId);
	const items = await trx.selectFrom('mx_work_order_items').selectAll().where('work_order_id', '=', orderId).orderBy('position').execute();
	if (items.length === 0) throw new WorkOrderError('Add at least one item before releasing.');

	// component swaps must be consistent with the installations as they stand
	for (const i of items) {
		if (i.removed_component_id) {
			const open = await trx.selectFrom('mx_component_installations').select('id').where('component_id', '=', i.removed_component_id).where('removed_on', 'is', null).where('aircraft_id', '=', aircraftId).executeTakeFirst();
			if (!open) throw new WorkOrderError(`Item ${i.position + 1}: the removed component is not installed on this aircraft.`);
		}
		if (i.installed_component_id) {
			const elsewhere = await trx.selectFrom('mx_component_installations').select('id').where('component_id', '=', i.installed_component_id).where('removed_on', 'is', null).executeTakeFirst();
			const removedHere = items.some((o) => o.removed_component_id === i.installed_component_id);
			if (elsewhere && !removedHere) throw new WorkOrderError(`Item ${i.position + 1}: the installed component is already installed somewhere.`);
		}
	}

	const hash = sha256(releaseDigest(order, v, items));
	await trx
		.updateTable('mx_work_orders')
		.set({
			status: 'released',
			released_at: v.released_at,
			released_hours: v.released_hours,
			released_landings: v.released_landings,
			performed_by_org: v.performed_by_org,
			performed_by_ref: v.performed_by_ref,
			crs_name: v.crs_name,
			crs_licence: v.crs_licence,
			crs_text: v.crs_text,
			release_hash: hash,
			released_by: userId,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', orderId)
		.where('status', '=', 'open')
		.execute();

	for (const i of items) {
		if (i.removed_component_id) {
			await trx
				.updateTable('mx_component_installations')
				.set({ removed_on: v.released_at, removed_at_hours: v.released_hours, removed_at_landings: v.released_landings, removed_reason: i.description, remove_work_order_id: orderId })
				.where('component_id', '=', i.removed_component_id)
				.where('removed_on', 'is', null)
				.execute();
		}
	}
	for (const i of items) {
		if (i.installed_component_id) {
			await trx
				.insertInto('mx_component_installations')
				.values({
					component_id: i.installed_component_id,
					aircraft_id: aircraftId,
					position: i.position_label,
					installed_on: v.released_at,
					installed_at_hours: v.released_hours,
					installed_at_landings: v.released_landings,
					tsn_at_install: i.installed_tsn === null ? 0 : Number(i.installed_tsn),
					tso_at_install: i.installed_tso === null ? 0 : Number(i.installed_tso),
					csn_at_install: i.installed_csn ?? 0,
					install_work_order_id: orderId
				})
				.execute();
		}
	}
	// A task on the removed component follows the one fitted in its place: the
	// 500 h magneto inspection belongs to whatever magneto is on the aircraft.
	for (const i of items) {
		if (i.removed_component_id && i.installed_component_id && i.removed_component_id !== i.installed_component_id) {
			await trx.updateTable('mx_tasks').set({ component_id: i.installed_component_id, updated_at: new Date().toISOString() }).where('aircraft_id', '=', aircraftId).where('component_id', '=', i.removed_component_id).execute();
		}
	}
	const defectIds = items.map((i) => i.defect_id).filter((d): d is string => d !== null);
	if (defectIds.length) {
		await trx
			.updateTable('mx_defects')
			.set({ status: 'rectified', rectified_work_order_id: orderId, rectified_on: v.released_at, updated_at: new Date().toISOString() })
			.where('id', 'in', defectIds)
			.where('status', 'in', ['open', 'deferred'])
			.execute();
	}
	return { hash, items: items.length };
}

/* ---------- pilot-owner (Part-ML Appendix II) ---------- */

export interface PilotOwnerValues {
	taskIds: string[];
	released_at: string;
	released_hours: number;
	released_landings: number;
	notes: string | null;
	crs_text: string;
}

/**
 * A pilot-owner release: the order is opened with the chosen Appendix II
 * tasks and released in the same transaction, signed with the pilot's
 * name and licence number. It cannot be changed afterwards.
 */
export async function pilotOwnerRelease(aircraftId: string, user: { id: string; name: string; licence_no: string }, v: PilotOwnerValues): Promise<{ orderId: string; hash: string; codes: string[] }> {
	return db.transaction().execute(async (trx) => {
		const tasks = v.taskIds.length
			? await trx.selectFrom('mx_tasks').select(['id', 'code', 'title', 'source_ref', 'pilot_owner_allowed', 'active']).where('aircraft_id', '=', aircraftId).where('id', 'in', v.taskIds).orderBy('code').execute()
			: [];
		if (tasks.length === 0) throw new WorkOrderError('Tick at least one task.');
		const notAllowed = tasks.filter((t) => !t.pilot_owner_allowed || !t.active);
		if (notAllowed.length) throw new WorkOrderError(`${notAllowed.map((t) => t.code).join(', ')}: not pilot-owner work.`);
		const codes = tasks.map((t) => t.code);
		const order = await trx
			.insertInto('mx_work_orders')
			.values({ aircraft_id: aircraftId, kind: 'pilot_owner', title: `Pilot-owner: ${codes.join(', ')}`, opened_at: v.released_at, opened_by: user.id, notes: v.notes })
			.returning('id')
			.executeTakeFirstOrThrow();
		await trx
			.insertInto('mx_work_order_items')
			.values(tasks.map((t, i) => ({ work_order_id: order.id, task_id: t.id, description: t.title, reference_data: t.source_ref, position: i })))
			.execute();
		const r = await releaseIn(trx, order.id, aircraftId, user.id, {
			released_at: v.released_at,
			released_hours: v.released_hours,
			released_landings: v.released_landings,
			performed_by_org: null,
			performed_by_ref: 'pilot-owner (Part-ML Appendix II)',
			crs_name: user.name,
			crs_licence: user.licence_no,
			crs_text: v.crs_text
		});
		return { orderId: order.id, hash: r.hash, codes };
	});
}
