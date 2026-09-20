import { sql } from 'kysely';
import { db, type MxDefectStatus } from '../db';
import { helsinkiToday } from '../time';
import { MAX_UPLOAD_BYTES, normalizeReceiptImage, type StoredImage } from '../images';
import { DEFECT_STATUS_LABEL, DEFECT_STATUS_PILL } from './present';

/**
 * Defects (Phase 16). A pilot reports one from the phone; the technical
 * manager assesses whether it affects airworthiness, defers it under
 * ML.A.403 with a limit, or closes it without work. A released work order
 * whose item names the defect marks it rectified (workorders.ts).
 */

export class DefectError extends Error {}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** One row for the lists, with names instead of ids. */
export interface DefectListRow {
	id: string;
	number: number;
	title: string;
	status: MxDefectStatus;
	statusLabel: string;
	pill: string;
	reportedOn: string;
	reportedBy: string;
	affects: boolean | null;
	/** "grounds the aircraft" / "not hazardous" / "awaiting assessment" */
	airworthiness: string;
	airworthinessChip: 'danger' | 'amber' | '';
	/** The deferral limit or the rectifying work order, for the last column. */
	limit: string | null;
	limitSub: string | null;
	rectifiedOrderId: string | null;
	hasPhoto: boolean;
}

function airworthinessLabel(status: MxDefectStatus, affects: boolean | null): { text: string; chip: 'danger' | 'amber' | '' } {
	if (status === 'closed') return { text: affects === null ? '—' : affects ? 'affected airworthiness' : 'not hazardous', chip: '' };
	if (affects === null) return { text: 'awaiting assessment', chip: status === 'rectified' ? '' : 'amber' };
	if (affects) return { text: status === 'rectified' ? 'affected airworthiness' : 'grounds the aircraft', chip: status === 'rectified' ? '' : 'danger' };
	return { text: 'not hazardous', chip: '' };
}

export async function listDefects(aircraftId: string, opts: { openOnly?: boolean } = {}): Promise<DefectListRow[]> {
	const rows = await db
		.selectFrom('mx_defects as d')
		.innerJoin('users as u', 'u.id', 'd.reported_by')
		.leftJoin('mx_work_orders as o', 'o.id', 'd.rectified_work_order_id')
		.select([
			'd.id',
			'd.number',
			'd.title',
			'd.status',
			'd.affects_airworthiness',
			'd.deferral_limit_date',
			'd.deferral_limit_hours',
			'd.rectified_work_order_id',
			'd.rectified_on',
			'o.title as order_title',
			'o.kind as order_kind',
			'u.name as reported_by_name',
			sql<string>`to_char(d.reported_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD')`.as('reported_on'),
			sql<boolean>`exists (select 1 from mx_defect_images i where i.defect_id = d.id)`.as('has_photo')
		])
		.where('d.aircraft_id', '=', aircraftId)
		.$if(!!opts.openOnly, (q) => q.where('d.status', 'in', ['open', 'deferred']))
		.orderBy('d.number', 'desc')
		.execute();
	return rows.map((r) => {
		const aw = airworthinessLabel(r.status, r.affects_airworthiness);
		let limit: string | null = null;
		let limitSub: string | null = null;
		if (r.status === 'deferred') {
			limit = r.deferral_limit_date ?? (r.deferral_limit_hours !== null ? `${Number(r.deferral_limit_hours).toFixed(1)} h` : null);
			limitSub = r.deferral_limit_date && r.deferral_limit_hours !== null ? `or ${Number(r.deferral_limit_hours).toFixed(1)} h` : null;
		} else if (r.status === 'rectified' && r.rectified_work_order_id) {
			limit = `WO ${r.rectified_on ?? ''}`.trim();
			limitSub = r.order_title ?? null;
		}
		return {
			id: r.id,
			number: r.number,
			title: r.title,
			status: r.status,
			statusLabel: DEFECT_STATUS_LABEL[r.status],
			pill: DEFECT_STATUS_PILL[r.status],
			reportedOn: r.reported_on,
			reportedBy: r.reported_by_name,
			affects: r.affects_airworthiness,
			airworthiness: aw.text,
			airworthinessChip: aw.chip,
			limit,
			limitSub,
			rectifiedOrderId: r.rectified_work_order_id,
			hasPhoto: r.has_photo
		};
	});
}

/** The defect with the names behind its ids, its photos' ids and the flight it was linked to. */
export async function loadDefect(id: string, aircraftId?: string) {
	const d = await db
		.selectFrom('mx_defects as d')
		.innerJoin('users as r', 'r.id', 'd.reported_by')
		.leftJoin('users as a', 'a.id', 'd.assessed_by')
		.leftJoin('users as c', 'c.id', 'd.closed_by')
		.leftJoin('mx_work_orders as o', 'o.id', 'd.rectified_work_order_id')
		.leftJoin('flight_log_entries as f', 'f.id', 'd.flight_log_id')
		.leftJoin('aircraft as ac', 'ac.id', 'd.aircraft_id')
		.selectAll('d')
		.select([
			'r.name as reported_by_name',
			'a.name as assessed_by_name',
			'c.name as closed_by_name',
			'o.title as order_title',
			'o.kind as order_kind',
			'o.status as order_status',
			'ac.tail_number',
			sql<string>`to_char(d.reported_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI')`.as('reported_at_text'),
			sql<string | null>`to_char(d.assessed_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD')`.as('assessed_on'),
			sql<string | null>`to_char(d.closed_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD')`.as('closed_on'),
			sql<string | null>`to_char(f.block_off_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD')`.as('flight_on'),
			'f.departure_airport_code as flight_from',
			'f.arrival_airport_code as flight_to',
			'f.tacho_start',
			'f.tacho_end'
		])
		.where('d.id', '=', id)
		.$if(!!aircraftId, (q) => q.where('d.aircraft_id', '=', aircraftId!))
		.executeTakeFirst();
	if (!d) return null;
	const images = await db.selectFrom('mx_defect_images').select(['id', 'width', 'height']).where('defect_id', '=', id).orderBy('created_at').execute();
	return { defect: d, images };
}

/** "flight 2026-09-19 EFHK → EFHK · Tacho 2477.1 → 2478.2" */
export function flightLabel(d: { flight_on: string | null; flight_from: string | null; flight_to: string | null; tacho_start: string | null; tacho_end: string | null }): string | null {
	if (!d.flight_on) return null;
	const tacho = d.tacho_start !== null && d.tacho_end !== null ? ` · Tacho ${Number(d.tacho_start).toFixed(1)} → ${Number(d.tacho_end).toFixed(1)}` : '';
	return `flight ${d.flight_on} ${d.flight_from} → ${d.flight_to}${tacho}`;
}

/* ---------- reporting ---------- */

export interface ReportValues {
	aircraft_id: string;
	title: string;
	description: string | null;
	flight_log_id: string | null;
}

export async function parseDefectPhotos(form: FormData): Promise<{ ok: true; images: StoredImage[] } | { ok: false; error: string }> {
	const images: StoredImage[] = [];
	for (const entry of form.getAll('photos')) {
		if (!(entry instanceof File) || entry.size === 0) continue;
		if (entry.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${entry.name} is larger than 10 MB.` };
		try {
			images.push(await normalizeReceiptImage(Buffer.from(await entry.arrayBuffer())));
		} catch {
			return { ok: false, error: `${entry.name} is not an image we can read.` };
		}
	}
	return { ok: true, images };
}

/** Creates the defect with its photos; returns id and number. */
export async function reportDefect(userId: string, v: ReportValues, images: StoredImage[]): Promise<{ id: string; number: number }> {
	return db.transaction().execute(async (trx) => {
		const d = await trx
			.insertInto('mx_defects')
			.values({ aircraft_id: v.aircraft_id, reported_by: userId, title: v.title, description: v.description, flight_log_id: v.flight_log_id })
			.returning(['id', 'number'])
			.executeTakeFirstOrThrow();
		if (images.length) await trx.insertInto('mx_defect_images').values(images.map((img) => ({ ...img, defect_id: d.id }))).execute();
		return d;
	});
}

/* ---------- the technical manager's actions ---------- */

async function openDefect(trx: typeof db, id: string, aircraftId: string) {
	const d = await trx.selectFrom('mx_defects').select(['id', 'status', 'number']).where('id', '=', id).where('aircraft_id', '=', aircraftId).executeTakeFirst();
	if (!d) throw new DefectError('No such defect.');
	return d;
}

/** Records whether the defect affects airworthiness. Allowed while open or deferred. */
export async function assessDefect(id: string, aircraftId: string, userId: string, affects: boolean, assessment: string | null): Promise<void> {
	const d = await openDefect(db, id, aircraftId);
	if (d.status === 'rectified' || d.status === 'closed') throw new DefectError(`Defect #${d.number} is ${d.status}; the assessment is part of its record now.`);
	await db
		.updateTable('mx_defects')
		.set({ affects_airworthiness: affects, assessed_by: userId, assessed_at: new Date().toISOString(), assessment, updated_at: new Date().toISOString() })
		.where('id', '=', id)
		.execute();
}

export interface DeferValues {
	deferred_by: string;
	deferral_basis: string;
	deferral_limit_date: string | null;
	deferral_limit_hours: number | null;
}

export function validateDefer(form: FormData, today = helsinkiToday()): { ok: true; values: DeferValues } | { ok: false; error: string } {
	const s = (k: string) => String(form.get(k) ?? '').trim();
	const deferred_by = s('deferred_by');
	if (!deferred_by) return { ok: false, error: 'Who assessed the defect as not hazardous? Name (and licence) of the certifying staff, or the pilot-owner.' };
	const deferral_basis = s('deferral_basis');
	if (!deferral_basis) return { ok: false, error: 'Give the basis for deferring — why it can wait.' };
	const date = s('deferral_limit_date') || null;
	if (date && !YMD.test(date)) return { ok: false, error: 'The limit date must be YYYY-MM-DD.' };
	if (date && date < today) return { ok: false, error: 'The limit date is already past.' };
	const hoursRaw = s('deferral_limit_hours');
	const hours = hoursRaw === '' ? null : Number(hoursRaw.replace(',', '.'));
	if (hours !== null && (!Number.isFinite(hours) || hours <= 0)) return { ok: false, error: 'The limit hours must be a number above zero.' };
	if (!date && hours === null) return { ok: false, error: 'A deferral needs a limit: a date, aircraft hours, or both.' };
	return { ok: true, values: { deferred_by, deferral_basis, deferral_limit_date: date, deferral_limit_hours: hours } };
}

/** Defers an open (or re-defers a deferred) defect. It must have been assessed as not affecting airworthiness. */
export async function deferDefect(id: string, aircraftId: string, v: DeferValues, today = helsinkiToday()): Promise<void> {
	const d = await db.selectFrom('mx_defects').select(['id', 'status', 'number', 'affects_airworthiness']).where('id', '=', id).where('aircraft_id', '=', aircraftId).executeTakeFirst();
	if (!d) throw new DefectError('No such defect.');
	if (d.status !== 'open' && d.status !== 'deferred') throw new DefectError(`Defect #${d.number} is ${d.status}.`);
	if (d.affects_airworthiness !== false) throw new DefectError('Only a defect assessed as not affecting airworthiness can be deferred — save the assessment first.');
	await db
		.updateTable('mx_defects')
		.set({ status: 'deferred', deferred_on: today, deferred_by: v.deferred_by, deferral_basis: v.deferral_basis, deferral_limit_date: v.deferral_limit_date, deferral_limit_hours: v.deferral_limit_hours, updated_at: new Date().toISOString() })
		.where('id', '=', id)
		.execute();
}

/** Closes without work: no fault found, duplicate, withdrawn. Open or deferred only. */
export async function closeDefect(id: string, aircraftId: string, userId: string, reason: string): Promise<void> {
	const d = await openDefect(db, id, aircraftId);
	if (d.status !== 'open' && d.status !== 'deferred') throw new DefectError(`Defect #${d.number} is already ${d.status}.`);
	await db
		.updateTable('mx_defects')
		.set({ status: 'closed', closed_at: new Date().toISOString(), closed_by: userId, closed_reason: reason, updated_at: new Date().toISOString() })
		.where('id', '=', id)
		.execute();
}

/** Reopens a closed defect (closed by mistake). Rectified ones stay rectified — report a new defect instead. */
export async function reopenDefect(id: string, aircraftId: string): Promise<void> {
	const d = await openDefect(db, id, aircraftId);
	if (d.status !== 'closed') throw new DefectError(`Defect #${d.number} is ${d.status}, not closed.`);
	await db.updateTable('mx_defects').set({ status: 'open', closed_at: null, closed_by: null, closed_reason: null, updated_at: new Date().toISOString() }).where('id', '=', id).execute();
}
