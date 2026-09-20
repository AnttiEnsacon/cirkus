import type { Insertable } from 'kysely';
import type { MxAnchorKind, MxResetRule, MxTaskSource, MxTasksTable } from '../db';

/**
 * One validator for a task, whatever the input: the task form or a CSV
 * row. Everything arrives as strings (empty = not given) and leaves as the
 * columns to store. The rules mirror the check constraints on mx_tasks so
 * a bad row is refused with a sentence, not a Postgres error.
 */

export const SOURCES: MxTaskSource[] = ['ica', 'mip', 'als', 'ad', 'sb', 'owner'];
export const ANCHOR_KINDS: MxAnchorKind[] = ['last_compliance', 'install', 'manufacture', 'fixed'];
export const RESET_RULES: MxResetRule[] = ['from_actual', 'from_original'];

/** The CSV columns, in the order the template lists them. */
export const TASK_COLUMNS = [
	'code',
	'title',
	'source',
	'source_ref',
	'interval_hours',
	'interval_months',
	'interval_landings',
	'one_time',
	'anchor_kind',
	'anchor_date',
	'anchor_hours',
	'anchor_landings',
	'tolerance_hours',
	'tolerance_days',
	'tolerance_landings',
	'reset_rule',
	'pilot_owner_allowed',
	'notes'
] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

export type TaskValues = Omit<Insertable<MxTasksTable>, 'id' | 'aircraft_id' | 'active' | 'created_at' | 'updated_at'> & {
	code: string;
	title: string;
	source: MxTaskSource;
	one_time: boolean;
	anchor_kind: MxAnchorKind;
	reset_rule: MxResetRule;
	pilot_owner_allowed: boolean;
};

export type TaskResult = { ok: true; values: TaskValues; notes: string[] } | { ok: false; error: string };

const CODE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function bool(v: string, name: string): boolean | string {
	const s = v.trim().toLowerCase();
	if (['', 'false', 'no', '0', 'off'].includes(s)) return false;
	if (['true', 'yes', '1', 'on'].includes(s)) return true;
	return `${name} must be yes or no.`;
}

function number(v: string, name: string, opts: { integer?: boolean; min?: number } = {}): number | null | string {
	const s = v.trim().replace(',', '.');
	if (s === '') return null;
	const n = Number(s);
	if (!Number.isFinite(n)) return `${name} must be a number.`;
	if (opts.integer && !Number.isInteger(n)) return `${name} must be a whole number.`;
	if (opts.min !== undefined && n < opts.min) return `${name} must be at least ${opts.min}.`;
	return n;
}

function date(v: string, name: string): string | null | string {
	const s = v.trim();
	if (s === '') return null;
	if (!YMD.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) return `${name} must be a date (YYYY-MM-DD).`;
	return s;
}

export function validateTask(raw: Partial<Record<TaskColumn, string>>): TaskResult {
	const get = (k: TaskColumn) => raw[k] ?? '';
	const notes: string[] = [];

	const code = get('code').trim().toUpperCase();
	if (!CODE.test(code)) return { ok: false, error: 'The code must be 2–32 characters: letters, digits and hyphens (e.g. INSP-100H).' };
	const title = get('title').trim();
	if (!title) return { ok: false, error: 'Give the task a title.' };
	const source = get('source').trim().toLowerCase() as MxTaskSource;
	if (!SOURCES.includes(source)) return { ok: false, error: `Source must be one of ${SOURCES.join(', ')}.` };

	const interval_hours = number(get('interval_hours'), 'Interval hours');
	const interval_months = number(get('interval_months'), 'Interval months', { integer: true });
	const interval_landings = number(get('interval_landings'), 'Interval landings', { integer: true });
	for (const v of [interval_hours, interval_months, interval_landings]) if (typeof v === 'string') return { ok: false, error: v };
	for (const [v, name] of [[interval_hours, 'hours'], [interval_months, 'months'], [interval_landings, 'landings']] as const) {
		if (v !== null && (v as number) <= 0) return { ok: false, error: `Interval ${name} must be greater than zero.` };
	}
	const one_time = bool(get('one_time'), 'One-time');
	if (typeof one_time === 'string') return { ok: false, error: one_time };
	if (!one_time && interval_hours === null && interval_months === null && interval_landings === null) {
		return { ok: false, error: 'Give at least one interval (hours, months or landings), or mark the task one-time.' };
	}

	const anchor_kind = (get('anchor_kind').trim().toLowerCase() || 'last_compliance') as MxAnchorKind;
	if (!ANCHOR_KINDS.includes(anchor_kind)) return { ok: false, error: `Anchor must be one of ${ANCHOR_KINDS.join(', ')}.` };
	const anchor_date = date(get('anchor_date'), 'Anchor date');
	const anchor_hours = number(get('anchor_hours'), 'Anchor hours', { min: 0 });
	const anchor_landings = number(get('anchor_landings'), 'Anchor landings', { integer: true, min: 0 });
	for (const v of [anchor_date, anchor_hours, anchor_landings]) if (typeof v === 'string' && v.length > 10) return { ok: false, error: v };
	if (anchor_kind === 'fixed' && anchor_date === null && anchor_hours === null && anchor_landings === null) {
		return { ok: false, error: 'A fixed anchor needs a date, hours or landings to count from.' };
	}

	const tolRaw = [
		number(get('tolerance_hours'), 'Tolerance hours', { min: 0 }),
		number(get('tolerance_days'), 'Tolerance days', { integer: true, min: 0 }),
		number(get('tolerance_landings'), 'Tolerance landings', { integer: true, min: 0 })
	];
	for (const v of tolRaw) if (typeof v === 'string') return { ok: false, error: v };
	let [tolerance_hours, tolerance_days, tolerance_landings] = tolRaw.map((v) => (v as number | null) ?? 0);
	if (source === 'als' || source === 'ad') {
		if (tolerance_hours > 0 || tolerance_days > 0 || tolerance_landings > 0) {
			notes.push(`${code}: tolerance set to 0 — ${source === 'als' ? 'airworthiness limitations' : 'ADs'} never carry one.`);
		}
		tolerance_hours = tolerance_days = tolerance_landings = 0;
	}

	const reset_rule = (get('reset_rule').trim().toLowerCase() || 'from_original') as MxResetRule;
	if (!RESET_RULES.includes(reset_rule)) return { ok: false, error: `Reset rule must be one of ${RESET_RULES.join(', ')}.` };
	const pilot_owner_allowed = bool(get('pilot_owner_allowed'), 'Pilot-owner');
	if (typeof pilot_owner_allowed === 'string') return { ok: false, error: pilot_owner_allowed };

	return {
		ok: true,
		notes,
		values: {
			code,
			title,
			source,
			source_ref: get('source_ref').trim() || null,
			interval_hours: interval_hours as number | null,
			interval_months: interval_months as number | null,
			interval_landings: interval_landings as number | null,
			one_time,
			anchor_kind,
			anchor_date: anchor_date as string | null,
			anchor_hours: anchor_hours as number | null,
			anchor_landings: anchor_landings as number | null,
			tolerance_hours,
			tolerance_days,
			tolerance_landings,
			reset_rule,
			pilot_owner_allowed,
			notes: get('notes').trim() || null
		}
	};
}

/** The form's fields as the strings validateTask expects. */
export function taskFormRaw(form: FormData): Partial<Record<TaskColumn, string>> {
	const raw: Partial<Record<TaskColumn, string>> = {};
	for (const k of TASK_COLUMNS) {
		const v = form.get(k);
		raw[k] = v === null ? '' : String(v);
	}
	// checkboxes: present = on
	raw.one_time = form.get('one_time') ? 'yes' : 'no';
	raw.pilot_owner_allowed = form.get('pilot_owner_allowed') ? 'yes' : 'no';
	return raw;
}
