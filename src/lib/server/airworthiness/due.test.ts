import { describe, expect, it } from 'vitest';
import {
	addDays,
	addMonthsClamped,
	aircraftStatus,
	computeDue,
	daysBetween,
	formatRemaining,
	resolveAnchor,
	type Anchor,
	type Counters,
	type DueTask,
	type Policy
} from './due';

const policy: Policy = { warnHours: 10, warnDays: 30, warnLandings: 25 };

const task = (over: Partial<DueTask> = {}): DueTask => ({
	oneTime: false,
	source: 'ica',
	intervalHours: null,
	intervalMonths: null,
	intervalLandings: null,
	toleranceHours: 0,
	toleranceDays: 0,
	toleranceLandings: 0,
	resetRule: 'from_original',
	anchorKind: 'last_compliance',
	fixed: null,
	...over
});

const counters = (over: Partial<Counters> = {}): Counters => ({
	today: '2026-09-20',
	hours: 1301.2,
	landings: 3100,
	hoursPerDay: 0.4,
	landingsPerHour: 3,
	...over
});

const anchor = (over: Partial<Anchor> = {}): Anchor => ({
	date: '2026-03-15',
	hours: 1234.5,
	landings: 3000,
	fromCompliance: true,
	...over
});

describe('date arithmetic', () => {
	it('clamps to the end of the target month', () => {
		expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
		expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonthsClamped('2017-03-10', 120)).toBe('2027-03-10');
		expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
	});
	it('counts whole days', () => {
		expect(daysBetween('2026-09-20', '2027-03-10')).toBe(171);
		expect(daysBetween('2026-09-20', '2026-09-20')).toBe(0);
		expect(daysBetween('2026-09-20', '2026-09-19')).toBe(-1);
		expect(addDays('2026-09-20', 83)).toBe('2026-12-12');
	});
});

describe('computeDue', () => {
	it('1 · hours limit controls when it comes first; warn threshold makes it due soon', () => {
		const t = task({ intervalHours: 100, intervalMonths: 12 });
		const d = computeDue(t, anchor(), counters(), policy);
		expect(d.status).toBe('ok');
		expect(d.controlling?.kind).toBe('hours');
		expect(d.controlling?.dueAt).toBe(1334.5);
		expect(d.controlling?.remaining).toBeCloseTo(33.3, 5);
		expect(d.controlling?.remainingDays).toBeCloseTo(83.25, 5);
		expect(d.projectedDate).toBe('2026-12-12');
		const cal = d.limits.find((l) => l.kind === 'calendar')!;
		expect(cal.dueAt).toBe('2027-03-15');
		expect(cal.remaining).toBe(176);

		const soon = computeDue(t, anchor(), counters({ hours: 1325.0 }), policy);
		expect(soon.status).toBe('due_soon');
	});

	it('2 · calendar-only task is exact to the day', () => {
		const t = task({ intervalMonths: 120, source: 'als' });
		const d = computeDue(t, anchor({ date: '2017-03-10', hours: null, landings: null }), counters(), policy);
		expect(d.status).toBe('ok');
		expect(d.limits).toHaveLength(1);
		expect(d.controlling?.dueAt).toBe('2027-03-10');
		expect(d.controlling?.remaining).toBe(171);
		expect(d.projectedDate).toBe('2027-03-10');
	});

	it('3 · one-time task with a fixed anchor: overdue past the compliance time, complete once done', () => {
		const t = task({ oneTime: true, source: 'ad', intervalHours: 50, intervalMonths: 3, anchorKind: 'fixed', fixed: { date: '2026-01-01', hours: 1200, landings: null } });
		const none = resolveAnchor(t, []);
		expect(none).toEqual({ date: '2026-01-01', hours: 1200, landings: null, fromCompliance: false });
		const d = computeDue(t, none, counters({ today: '2026-04-02', hours: 1210 }), policy);
		expect(d.status).toBe('overdue');
		expect(d.controlling?.kind).toBe('calendar');
		const done = resolveAnchor(t, [{ date: '2026-02-10', hours: 1205, landings: 3010 }]);
		expect(computeDue(t, done, counters(), policy).status).toBe('complete');
	});

	it('4 · an AD ignores any tolerance on the task', () => {
		const t = task({ source: 'ad', intervalHours: 100, toleranceHours: 10 });
		const d = computeDue(t, anchor({ hours: 1000 }), counters({ hours: 1100.1 }), policy);
		expect(d.status).toBe('overdue');
		expect(d.controlling?.tolerance).toBe(0);
		const ica = computeDue(task({ intervalHours: 100, toleranceHours: 10 }), anchor({ hours: 1000 }), counters({ hours: 1100.1 }), policy);
		expect(ica.status).toBe('in_tolerance');
		expect(computeDue(task({ intervalHours: 100, toleranceHours: 10 }), anchor({ hours: 1000 }), counters({ hours: 1110.1 }), policy).status).toBe('overdue');
	});

	it('5 · reset rule: from_original keeps the original due point when released late, from_actual moves it', () => {
		const history = [
			{ date: '2026-01-01', hours: 1000, landings: 3000 },
			{ date: '2026-06-01', hours: 1105, landings: 3300 }
		];
		const orig = resolveAnchor(task({ intervalHours: 100, toleranceHours: 10, resetRule: 'from_original' }), history);
		expect(orig?.hours).toBe(1100);
		expect(orig?.date).toBe('2026-06-01'); // no calendar interval: the actual date is kept
		const actual = resolveAnchor(task({ intervalHours: 100, toleranceHours: 10, resetRule: 'from_actual' }), history);
		expect(actual?.hours).toBe(1105);
		// released early: the clock restarts from the actual point under both rules
		const early = resolveAnchor(task({ intervalHours: 100, resetRule: 'from_original' }), [history[0], { date: '2026-05-01', hours: 1090, landings: 3200 }]);
		expect(early?.hours).toBe(1090);
	});

	it('6 · a parked aircraft has no projection on hours; calendar controls when present', () => {
		const t = task({ intervalHours: 100, intervalMonths: 12 });
		const d = computeDue(t, anchor(), counters({ hoursPerDay: 0 }), policy);
		expect(d.limits.find((l) => l.kind === 'hours')?.remainingDays).toBeNull();
		expect(d.controlling?.kind).toBe('calendar');
		const onlyHours = computeDue(task({ intervalHours: 100 }), anchor(), counters({ hoursPerDay: 0 }), policy);
		expect(onlyHours.controlling?.kind).toBe('hours');
		expect(onlyHours.projectedDate).toBeNull();
		expect(onlyHours.status).toBe('ok');
	});

	it('8 · a task with no usable limit is undefined, never silently ok', () => {
		expect(computeDue(task(), anchor(), counters(), policy).status).toBe('undefined');
		const noAnchor = computeDue(task({ intervalHours: 100 }), null, counters(), policy);
		expect(noAnchor.status).toBe('undefined');
		// hours interval but the anchor has no hours (a calendar-only baseline row)
		const d = computeDue(task({ intervalHours: 100 }), anchor({ hours: null }), counters(), policy);
		expect(d.status).toBe('undefined');
		expect(d.missing).toEqual(['hours']);
	});

	it('9 · landings limit projects with landings per hour × hours per day', () => {
		const t = task({ intervalLandings: 500 });
		const d = computeDue(t, anchor({ landings: 3000 }), counters({ landings: 3100 }), policy);
		expect(d.controlling?.kind).toBe('landings');
		expect(d.controlling?.remaining).toBe(400);
		expect(d.controlling?.remainingDays).toBeCloseTo(333.33, 1);
		expect(computeDue(t, anchor({ landings: 3000 }), counters({ landings: 3480 }), policy).status).toBe('due_soon');
	});

	it('11 · a tie between hours and calendar is controlled by the calendar', () => {
		// 12 h at 0.4 h/day = 30 days; calendar due in 30 days
		const t = task({ intervalHours: 100, intervalMonths: 1 });
		const d = computeDue(t, anchor({ hours: 1000, date: '2026-09-20' }), counters({ hours: 1088, today: '2026-09-20' }), policy);
		const cal = d.limits.find((l) => l.kind === 'calendar')!;
		expect(cal.remaining).toBe(30);
		expect(d.limits.find((l) => l.kind === 'hours')!.remainingDays).toBeCloseTo(30, 9);
		expect(d.controlling?.kind).toBe('calendar');
		expect(d.status).toBe('due_soon');
	});

	it('formats remaining values for the reasons list', () => {
		expect(formatRemaining({ kind: 'hours', remaining: 4.25 })).toBe('4.3 h');
		expect(formatRemaining({ kind: 'hours', remaining: -4.25 })).toBe('4.3 h');
		expect(formatRemaining({ kind: 'calendar', remaining: 1 })).toBe('1 day');
		expect(formatRemaining({ kind: 'calendar', remaining: 25 })).toBe('25 days');
		expect(formatRemaining({ kind: 'landings', remaining: 12 })).toBe('12 landings');
	});
});

describe('10 · aircraftStatus', () => {
	const extras = { baselineReleased: true, declaredAt: '2026-10-01', reviewedAt: null, today: '2026-09-20' };
	const item = (code: string, t: DueTask, a: Anchor | null, c: Counters) => ({ code, due: computeDue(t, a, c, policy) });

	it('grounds on any overdue item and names it', () => {
		const s = aircraftStatus([item('AD-1', task({ source: 'ad', intervalHours: 100 }), anchor({ hours: 1000 }), counters({ hours: 1100.1 }))], extras);
		expect(s.state).toBe('grounded');
		expect(s.reasons[0]).toMatch(/^AD-1 is 0\.1 h past due/);
	});
	it('attention on due soon, in tolerance, undefined, missing baseline, stale review', () => {
		const soon = aircraftStatus([item('ELT', task({ intervalMonths: 60 }), anchor({ date: '2021-10-15' }), counters())], extras);
		expect(soon.state).toBe('attention');
		expect(soon.reasons[0]).toBe('ELT is due in 25 days (2026-10-15).');

		const tol = aircraftStatus([item('INSP', task({ intervalHours: 100, toleranceHours: 10 }), anchor({ hours: 1000 }), counters({ hours: 1104.3 }))], extras);
		expect(tol.reasons[0]).toBe('INSP is 4.3 h past due, inside the +10 h tolerance.');

		const undef = aircraftStatus([item('X', task({ intervalHours: 100 }), anchor({ hours: null }), counters())], extras);
		expect(undef.state).toBe('attention');
		expect(undef.reasons[0]).toMatch(/^X has no usable anchor/);

		const noBase = aircraftStatus([], { ...extras, baselineReleased: false });
		expect(noBase.state).toBe('attention');
		expect(noBase.reasons).toContain('No released baseline — the due list is not trustworthy yet.');

		const stale = aircraftStatus([], { ...extras, declaredAt: '2025-01-01', today: '2026-09-20' });
		expect(stale.reasons).toContain('The programme has not been reviewed for over a year (last 2025-01-01).');
		const undeclared = aircraftStatus([], { ...extras, declaredAt: null });
		expect(undeclared.reasons).toContain('The programme has not been declared yet.');
	});
	it('airworthy when everything is ok and the baseline is released', () => {
		const s = aircraftStatus([item('OIL', task({ intervalHours: 50 }), anchor({ hours: 1290 }), counters())], extras);
		expect(s).toEqual({ state: 'airworthy', reasons: [] });
	});
});
