import type { AircraftState, Due, DueStatus, Limit } from './due';
import { formatRemaining } from './due';
import type { ProgrammeItem, TaskRow } from './programme';

/* Display shapes for the pages: plain strings, computed once in load(). */

export const STATUS_LABEL: Record<DueStatus, string> = {
	ok: 'OK',
	due_soon: 'Due soon',
	in_tolerance: 'In tolerance',
	overdue: 'Overdue',
	complete: 'Complete',
	undefined: 'Undefined'
};

export const STATE_LABEL: Record<AircraftState, string> = { airworthy: 'Airworthy', attention: 'Needs attention', grounded: 'Grounded' };
export const STATE_CHIP: Record<AircraftState, string> = { airworthy: 'teal', attention: 'amber', grounded: 'danger' };

export const SOURCE_LABEL: Record<TaskRow['source'], string> = {
	ica: 'ICA',
	mip: 'MIP',
	als: 'ALS',
	ad: 'AD',
	sb: 'SB',
	owner: 'Owner'
};

export const ANCHOR_LABEL: Record<TaskRow['anchor_kind'], string> = {
	last_compliance: 'last compliance',
	install: 'install',
	manufacture: 'manufacture',
	fixed: 'fixed point'
};

export const hours = (n: number | string | null) => (n === null ? '—' : `${Number(n).toFixed(1)} h`);

/** "100 h / 12 mo / 500 ldg" — whichever parts the task has; "one-time" prefix when so. */
export function intervalLabel(t: Pick<TaskRow, 'interval_hours' | 'interval_months' | 'interval_landings' | 'one_time'>): string {
	const parts: string[] = [];
	if (t.interval_hours !== null) parts.push(`${Number(t.interval_hours)} h`);
	if (t.interval_months !== null) parts.push(`${t.interval_months} mo`);
	if (t.interval_landings !== null) parts.push(`${t.interval_landings} ldg`);
	const s = parts.join(' / ') || '—';
	return t.one_time ? `once, within ${s}` : s;
}

/** "+10 h" / "+10 h, +30 days" / "none (ALS)" / "—". */
export function toleranceLabel(t: Pick<TaskRow, 'source' | 'tolerance_hours' | 'tolerance_days' | 'tolerance_landings'>): string {
	if (t.source === 'als' || t.source === 'ad') return `none (${SOURCE_LABEL[t.source]})`;
	const parts: string[] = [];
	if (Number(t.tolerance_hours) > 0) parts.push(`+${Number(t.tolerance_hours)} h`);
	if (t.tolerance_days > 0) parts.push(`+${t.tolerance_days} days`);
	if (t.tolerance_landings > 0) parts.push(`+${t.tolerance_landings} ldg`);
	return parts.join(', ') || '—';
}

/** "2373.9 h · 2026-04-14" from whichever parts the point has. */
export function pointLabel(p: { date: string | null; hours: number | null; landings: number | null } | null): string {
	if (!p) return '—';
	const parts: string[] = [];
	if (p.hours !== null) parts.push(`${p.hours.toFixed(1)} h`);
	if (p.date) parts.push(p.date);
	if (p.landings !== null && p.hours === null) parts.push(`${p.landings} ldg`);
	return parts.join(' · ') || '—';
}

export function dueAtLabel(l: Limit | null): string {
	if (!l) return '—';
	if (l.kind === 'calendar') return String(l.dueAt);
	return l.kind === 'hours' ? `${(l.dueAt as number).toFixed(1)} h` : `${l.dueAt} ldg`;
}

/** Signed: "−4.3 h" past due, "22.8 h" ahead. */
export function remainingLabel(l: Limit | null): string {
	if (!l) return '—';
	return (l.remaining < 0 ? '−' : '') + formatRemaining(l);
}

export function projectedLabel(due: Due): string {
	if (due.status === 'complete') return '—';
	if (due.controlling && due.controlling.remaining <= 0) return 'now';
	return due.projectedDate ?? (due.controlling ? 'no projection' : '—');
}

export interface DueRow {
	id: string;
	code: string;
	title: string;
	source: string;
	sourceRef: string | null;
	interval: string;
	tolerance: string;
	lastDone: string;
	dueAt: string;
	remaining: string;
	projected: string;
	status: DueStatus;
	statusLabel: string;
	pilotOwner: boolean;
	active: boolean;
	anchor: string;
	missing: string;
}

export function dueRow(i: ProgrammeItem): DueRow {
	return {
		id: i.task.id,
		code: i.task.code,
		title: i.task.title,
		source: SOURCE_LABEL[i.task.source],
		sourceRef: i.task.source_ref,
		interval: intervalLabel(i.task),
		tolerance: toleranceLabel(i.task),
		lastDone: pointLabel(i.lastDone),
		dueAt: dueAtLabel(i.due.controlling),
		remaining: remainingLabel(i.due.controlling),
		projected: projectedLabel(i.due),
		status: i.due.status,
		statusLabel: STATUS_LABEL[i.due.status],
		pilotOwner: i.task.pilot_owner_allowed,
		active: i.task.active,
		anchor: ANCHOR_LABEL[i.task.anchor_kind],
		missing: i.due.missing.join(', ')
	};
}

/* ---------- Phase 16 ---------- */

export const KIND_LABEL: Record<string, string> = {
	setup_baseline: 'Baseline',
	scheduled: 'Scheduled',
	unscheduled: 'Unscheduled',
	pilot_owner: 'Pilot-owner',
	defect: 'Defect'
};

export const DEFECT_STATUS_LABEL: Record<string, string> = { open: 'Open', deferred: 'Deferred', rectified: 'Rectified', closed: 'Closed' };
/** The pill class per defect status (reuses the existing pill colours). */
export const DEFECT_STATUS_PILL: Record<string, string> = { open: 'open', deferred: 'due_soon', rectified: 'released', closed: 'complete' };

