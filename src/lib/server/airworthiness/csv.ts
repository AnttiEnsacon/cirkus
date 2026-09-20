import { TASK_COLUMNS, validateTask, type TaskColumn, type TaskValues } from './tasks';

/**
 * A small RFC 4180 reader: commas, quoted fields with "" escapes, CR/LF
 * or LF line ends, a leading BOM. Returns rows of strings; a row is kept
 * even when short (missing cells read as empty). No dependency — the
 * programme is 50–80 rows, not a data feed.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quoted) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && src[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	if (cell !== '' || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type CsvImport = { ok: true; tasks: TaskValues[]; notes: string[] } | { ok: false; error: string };

/**
 * Header row required, columns by name in any order (case-insensitive);
 * unknown columns are ignored, `code` and `title` must be present. The
 * first bad row stops the import with its line number.
 */
export function readTasksCsv(text: string): CsvImport {
	const rows = parseCsv(text);
	if (rows.length === 0) return { ok: false, error: 'The file is empty.' };
	const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
	const known = new Set<string>(TASK_COLUMNS);
	const index = new Map<TaskColumn, number>();
	header.forEach((h, i) => {
		if (known.has(h)) index.set(h as TaskColumn, i);
	});
	if (!index.has('code') || !index.has('title')) {
		return { ok: false, error: `The header row must name at least "code" and "title". Columns: ${TASK_COLUMNS.join(', ')}.` };
	}
	if (rows.length === 1) return { ok: false, error: 'The file has a header row but no tasks.' };

	const tasks: TaskValues[] = [];
	const notes: string[] = [];
	const seen = new Set<string>();
	for (let r = 1; r < rows.length; r++) {
		const raw: Partial<Record<TaskColumn, string>> = {};
		for (const [col, i] of index) raw[col] = rows[r][i] ?? '';
		const v = validateTask(raw);
		if (!v.ok) return { ok: false, error: `Row ${r + 1}: ${v.error}` };
		if (seen.has(v.values.code)) return { ok: false, error: `Row ${r + 1}: the code ${v.values.code} appears twice in the file.` };
		seen.add(v.values.code);
		tasks.push(v.values);
		notes.push(...v.notes);
	}
	return { ok: true, tasks, notes };
}

/** The template: header plus three example rows. */
export function tasksCsvTemplate(): string {
	const rows: Record<TaskColumn, string>[] = [
		{
			code: 'INSP-100H', title: '100-hour / annual inspection', source: 'ica', source_ref: 'AMM 05-20', interval_hours: '100', interval_months: '12', interval_landings: '',
			one_time: 'no', anchor_kind: 'last_compliance', anchor_date: '', anchor_hours: '', anchor_landings: '', tolerance_hours: '10', tolerance_days: '0', tolerance_landings: '0',
			reset_rule: 'from_original', pilot_owner_allowed: 'no', notes: ''
		},
		{
			code: 'CAPS-REPACK', title: 'CAPS parachute and rocket replacement', source: 'als', source_ref: 'AMM 04-00', interval_hours: '', interval_months: '120', interval_landings: '',
			one_time: 'no', anchor_kind: 'last_compliance', anchor_date: '', anchor_hours: '', anchor_landings: '', tolerance_hours: '0', tolerance_days: '0', tolerance_landings: '0',
			reset_rule: 'from_original', pilot_owner_allowed: 'no', notes: 'Counts from the pack date; the baseline row carries it.'
		},
		{
			code: 'OIL-50H', title: 'Engine oil and filter change', source: 'ica', source_ref: 'AMM 12-10', interval_hours: '50', interval_months: '4', interval_landings: '',
			one_time: 'no', anchor_kind: 'last_compliance', anchor_date: '', anchor_hours: '', anchor_landings: '', tolerance_hours: '0', tolerance_days: '0', tolerance_landings: '0',
			reset_rule: 'from_actual', pilot_owner_allowed: 'yes', notes: 'Part-ML Appendix II'
		}
	];
	const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
	return [TASK_COLUMNS.join(','), ...rows.map((r) => TASK_COLUMNS.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
}
