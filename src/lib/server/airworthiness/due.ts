/**
 * The due calculator — pure functions, no database.
 *
 * Nothing in Cirkus stores "next due". Every page computes it from three
 * things: the task (its intervals and tolerances), an anchor (when it was
 * last done, or a fixed point such as an AD's effective date) and today's
 * counters (hours, landings, the date, and how fast they move). Keeping
 * this a pure module is what makes it unit-testable; `programme.ts` loads
 * the rows and calls in here.
 *
 * Dates are `YYYY-MM-DD` strings throughout (the `date` columns come back
 * from Postgres as strings, see db.ts); hours and landings are numbers.
 */

export type TaskSource = 'ica' | 'mip' | 'als' | 'ad' | 'sb' | 'owner';
export type AnchorKind = 'last_compliance' | 'install' | 'manufacture' | 'fixed';
export type ResetRule = 'from_actual' | 'from_original';
export type LimitKind = 'hours' | 'calendar' | 'landings';
export type DueStatus = 'ok' | 'due_soon' | 'in_tolerance' | 'overdue' | 'complete' | 'undefined';

/** A fixed point in time and counters; any part may be unknown. */
export interface Point {
	date: string | null;
	hours: number | null;
	landings: number | null;
}

export interface DueTask {
	oneTime: boolean;
	source: TaskSource;
	intervalHours: number | null;
	intervalMonths: number | null;
	intervalLandings: number | null;
	toleranceHours: number;
	toleranceDays: number;
	toleranceLandings: number;
	resetRule: ResetRule;
	anchorKind: AnchorKind;
	/** The fixed point for `anchorKind = fixed` (M2: the component's install or manufacture point). */
	fixed: Point | null;
}

/** Where the interval counts from. `fromCompliance` = a released work order produced it. */
export interface Anchor extends Point {
	fromCompliance: boolean;
}

export interface Counters {
	today: string;
	hours: number;
	landings: number;
	/** Trailing-year utilisation; 0 when the aircraft is parked. */
	hoursPerDay: number;
	landingsPerHour: number;
}

export interface Policy {
	warnHours: number;
	warnDays: number;
	warnLandings: number;
}

export interface Limit {
	kind: LimitKind;
	/** Hours or landings as a number, the calendar limit as a date. */
	dueAt: number | string;
	/** Due minus now: negative when past due. Hours, days or landings by kind. */
	remaining: number;
	/** `remaining` converted to days with the utilisation; null when the rate is 0. */
	remainingDays: number | null;
	tolerance: number;
}

export interface Due {
	status: DueStatus;
	limits: Limit[];
	/** The limit that comes first; null only for `complete` and `undefined`. */
	controlling: Limit | null;
	projectedDate: string | null;
	/** Interval kinds the task has but the anchor cannot serve (a data problem to show). */
	missing: LimitKind[];
}

/* ---------- date arithmetic (UTC, whole days) ---------- */

const DAY = 24 * 60 * 60 * 1000;

function parse(ymd: string): number {
	const [y, m, d] = ymd.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** `from` + `months`, with the day clamped to the target month (29 Feb + 12 → 28 Feb). */
export function addMonthsClamped(from: string, months: number): string {
	const [y, m, d] = from.split('-').map(Number);
	const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
	return format(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
}

export function addDays(from: string, days: number): string {
	return format(parse(from) + days * DAY);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
	return Math.round((parse(b) - parse(a)) / DAY);
}

/* ---------- anchor resolution ---------- */

const KINDS: LimitKind[] = ['hours', 'calendar', 'landings'];

function interval(task: DueTask, kind: LimitKind): number | null {
	return kind === 'hours' ? task.intervalHours : kind === 'calendar' ? task.intervalMonths : task.intervalLandings;
}

function field(kind: LimitKind): keyof Point {
	return kind === 'hours' ? 'hours' : kind === 'calendar' ? 'date' : 'landings';
}

function plusInterval(value: string | number, kind: LimitKind, n: number): string | number {
	return kind === 'calendar' ? addMonthsClamped(value as string, n) : (value as number) + n;
}

/**
 * Walks the compliance history (oldest first) to the anchor the next cycle
 * counts from. With `from_original`, a compliance released after its
 * original due point anchors at that due point, so a tolerance used once
 * does not push every later cycle out; released early, the clock restarts
 * from the actual point under either rule. With no history the fixed
 * point (if any) is the anchor; otherwise there is none.
 */
export function resolveAnchor(task: DueTask, history: Point[]): Anchor | null {
	if (history.length === 0) {
		return task.fixed && task.anchorKind !== 'last_compliance' ? { ...task.fixed, fromCompliance: false } : null;
	}
	const a: Anchor = { ...history[0], fromCompliance: true };
	for (const c of history.slice(1)) {
		for (const kind of KINDS) {
			const f = field(kind);
			const actual = c[f];
			if (actual === null) continue; // a compliance without this figure leaves the anchor alone: it shows as overdue, which is the point
			const n = interval(task, kind);
			const previous = a[f];
			let next: string | number = actual;
			if (task.resetRule === 'from_original' && n !== null && previous !== null) {
				const original = plusInterval(previous, kind, n);
				next = actual < original ? actual : original;
			}
			if (f === 'date') a.date = next as string;
			else if (f === 'hours') a.hours = next as number;
			else a.landings = next as number;
		}
	}
	return a;
}

/* ---------- the calculation ---------- */

const KIND_ORDER: Record<LimitKind, number> = { calendar: 0, hours: 1, landings: 2 };

export function computeDue(task: DueTask, anchor: Anchor | null, counters: Counters, policy: Policy): Due {
	if (!anchor) return { status: 'undefined', limits: [], controlling: null, projectedDate: null, missing: [] };
	if (task.oneTime && anchor.fromCompliance) return { status: 'complete', limits: [], controlling: null, projectedDate: null, missing: [] };

	// ALS items and ADs never get a tolerance, whatever the row says (the
	// check constraint on mx_tasks enforces the same; this is the second lock).
	const noTolerance = task.source === 'als' || task.source === 'ad';
	const tol = (kind: LimitKind) =>
		noTolerance ? 0 : kind === 'hours' ? task.toleranceHours : kind === 'calendar' ? task.toleranceDays : task.toleranceLandings;

	const limits: Limit[] = [];
	const missing: LimitKind[] = [];
	for (const kind of KINDS) {
		const n = interval(task, kind);
		if (n === null) continue;
		const from = anchor[field(kind)];
		if (from === null) {
			missing.push(kind);
			continue;
		}
		if (kind === 'calendar') {
			const dueAt = addMonthsClamped(from as string, n);
			const remaining = daysBetween(counters.today, dueAt);
			limits.push({ kind, dueAt, remaining, remainingDays: remaining, tolerance: tol(kind) });
		} else {
			const dueAt = (from as number) + n;
			const now = kind === 'hours' ? counters.hours : counters.landings;
			const rate = kind === 'hours' ? counters.hoursPerDay : counters.hoursPerDay * counters.landingsPerHour;
			// tenths of an hour / whole landings: keeps float noise out of the comparisons
			const remaining = kind === 'hours' ? Math.round((dueAt - now) * 10) / 10 : dueAt - now;
			limits.push({ kind, dueAt: kind === 'hours' ? Math.round(dueAt * 10) / 10 : dueAt, remaining, remainingDays: rate > 0 ? remaining / rate : null, tolerance: tol(kind) });
		}
	}
	if (limits.length === 0) return { status: 'undefined', limits, controlling: null, projectedDate: null, missing };

	// Whichever comes first: the smallest projection; no projection sorts
	// last; a tie goes to the calendar (it is exact, the others are estimates).
	const controlling = [...limits].sort((x, y) => {
		const dx = x.remainingDays === null ? Infinity : Math.round(x.remainingDays * 1e6);
		const dy = y.remainingDays === null ? Infinity : Math.round(y.remainingDays * 1e6);
		return dx - dy || KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
	})[0];

	const overdue = limits.some((l) => l.remaining < -l.tolerance);
	const inTolerance = limits.some((l) => l.remaining < 0);
	const dueSoon = limits.some((l) =>
		l.kind === 'hours' ? l.remaining <= policy.warnHours : l.kind === 'calendar' ? l.remaining <= policy.warnDays : l.remaining <= policy.warnLandings
	);
	const status: DueStatus = overdue ? 'overdue' : inTolerance ? 'in_tolerance' : dueSoon ? 'due_soon' : 'ok';
	const projectedDate = controlling.remainingDays === null ? null : addDays(counters.today, Math.max(0, Math.round(controlling.remainingDays)));
	return { status, limits, controlling, projectedDate, missing };
}

/* ---------- presentation helpers (used by pages and by the reasons list) ---------- */

/** "4.3 h", "25 days", "12 landings" — always the magnitude; the caller says past or ahead. */
export function formatRemaining(l: Pick<Limit, 'kind' | 'remaining'>): string {
	const v = Math.abs(l.remaining);
	if (l.kind === 'hours') return `${v.toFixed(1)} h`;
	if (l.kind === 'calendar') return `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}`;
	return `${Math.round(v)} landings`;
}

function formatTolerance(l: Limit): string {
	return l.kind === 'hours' ? `+${l.tolerance} h` : l.kind === 'calendar' ? `+${l.tolerance} days` : `+${l.tolerance} landings`;
}

/** "at 1 334.5 h" / "2026-10-15" / "at 3 500 landings" for the reasons list. */
export function formatDueAt(l: Limit): string {
	if (l.kind === 'calendar') return String(l.dueAt);
	const n = l.kind === 'hours' ? (l.dueAt as number).toFixed(1) : String(l.dueAt);
	return `at ${n} ${l.kind === 'hours' ? 'h' : 'landings'}`;
}

/* ---------- the aircraft's state ---------- */

export type AircraftState = 'airworthy' | 'attention' | 'grounded';

export interface StatusExtras {
	baselineReleased: boolean;
	declaredAt: string | null;
	reviewedAt: string | null;
	today: string;
}

/**
 * Rolls the due list up to one state with the reasons behind it. Overdue
 * grounds; everything else is attention. M2–M4 add defects, the ARC,
 * directives and life limits to the same function.
 */
export function aircraftStatus(items: { code: string; due: Due }[], extras: StatusExtras): { state: AircraftState; reasons: string[] } {
	const grounded: string[] = [];
	const attention: string[] = [];
	for (const { code, due } of items) {
		const past = due.limits.filter((l) => l.remaining < 0).sort((x, y) => x.remaining / (x.tolerance || 1) - y.remaining / (y.tolerance || 1))[0];
		switch (due.status) {
			case 'overdue': {
				const l = due.limits.find((x) => x.remaining < -x.tolerance) ?? past;
				grounded.push(`${code} is ${formatRemaining(l)} past due${l.tolerance > 0 ? `, beyond the ${formatTolerance(l)} tolerance` : ''}.`);
				break;
			}
			case 'in_tolerance':
				attention.push(`${code} is ${formatRemaining(past)} past due, inside the ${formatTolerance(past)} tolerance.`);
				break;
			case 'due_soon': {
				const l = due.controlling!;
				attention.push(
					l.kind === 'calendar'
						? `${code} is due in ${formatRemaining(l)} (${l.dueAt}).`
						: `${code} is due in ${formatRemaining(l)} (${formatDueAt(l)}${due.projectedDate ? `, about ${due.projectedDate}` : ''}).`
				);
				break;
			}
			case 'undefined':
				attention.push(`${code} has no usable anchor — check the baseline${due.missing.length ? ` (missing: ${due.missing.join(', ')})` : ''}.`);
				break;
			default:
				break;
		}
	}
	if (!extras.baselineReleased) attention.push('No released baseline — the due list is not trustworthy yet.');
	if (!extras.declaredAt) attention.push('The programme has not been declared yet.');
	else {
		const last = extras.reviewedAt ?? extras.declaredAt;
		if (addMonthsClamped(last, 12) < extras.today) attention.push(`The programme has not been reviewed for over a year (last ${last}).`);
	}
	const state: AircraftState = grounded.length ? 'grounded' : attention.length ? 'attention' : 'airworthy';
	return { state, reasons: [...grounded, ...attention] };
}
