import { describe, expect, it } from 'vitest';
import { ageLabel, componentCounters, installationOn, toComponentPoint, type Installation } from './components';

const inst = (over: Partial<Installation> = {}): Installation => ({
	installed_on: '2026-01-10',
	installed_at_hours: 2000,
	installed_at_landings: 3000,
	tsn_at_install: 1200,
	tso_at_install: 0,
	csn_at_install: 1800,
	removed_on: null,
	removed_at_hours: null,
	removed_at_landings: null,
	...over
});

describe('componentCounters', () => {
	it('follows the aircraft while installed', () => {
		const c = componentCounters([inst()], { hours: 2478.2, landings: 3912 }, '2020-06-01', '2026-09-20');
		expect(c.installed).toBe(true);
		expect(c.tsn).toBeCloseTo(1678.2, 5);
		expect(c.tso).toBeCloseTo(478.2, 5);
		expect(c.csn).toBe(2712);
		expect(c.ageMonths).toBe(75);
	});
	it('never reads below the fitting readings when the log lags the release', () => {
		const c = componentCounters([inst()], { hours: 1992.8, landings: 2990 }, null, '2026-09-20');
		expect(c.tsn).toBe(1200);
		expect(c.tso).toBe(0);
		expect(c.csn).toBe(1800);
	});
	it('freezes at removal', () => {
		const c = componentCounters([inst({ removed_on: '2026-06-01', removed_at_hours: 2300, removed_at_landings: 3500 })], { hours: 2478.2, landings: 3912 }, null, '2026-09-20');
		expect(c.installed).toBe(false);
		expect(c.tsn).toBe(1500);
		expect(c.tso).toBe(300);
		expect(c.csn).toBe(2300);
		expect(c.ageMonths).toBeNull();
	});
	it('uses the latest installation, whose figures carry the earlier history', () => {
		const c = componentCounters(
			[inst({ installed_on: '2024-01-01', removed_on: '2025-01-01', removed_at_hours: 1500, removed_at_landings: 2500, installed_at_hours: 1000, installed_at_landings: 2000, tsn_at_install: 0 }), inst({ installed_on: '2026-01-10', tsn_at_install: 500 })],
			{ hours: 2100, landings: 3100 },
			null,
			'2026-09-20'
		);
		expect(c.tsn).toBe(600);
		expect(c.installed).toBe(true);
	});
	it('a spare with no history reads zero and not installed', () => {
		expect(componentCounters([], { hours: 2478.2, landings: 3912 }, null, '2026-09-20')).toEqual({ installed: false, tsn: 0, tso: 0, csn: 0, ageMonths: null, current: null });
	});
});

describe('installationOn / toComponentPoint', () => {
	const history = [
		inst({ installed_on: '2024-01-01', removed_on: '2025-01-01', removed_at_hours: 1500, removed_at_landings: 2500, installed_at_hours: 1000, installed_at_landings: 2000, tsn_at_install: 0, csn_at_install: 0 }),
		inst({ installed_on: '2026-01-10', tsn_at_install: 500, csn_at_install: 500 })
	];
	it('finds the installation current on a date, inclusive at both ends', () => {
		expect(installationOn(history, '2024-06-01')?.installed_on).toBe('2024-01-01');
		expect(installationOn(history, '2025-01-01')?.installed_on).toBe('2024-01-01');
		expect(installationOn(history, '2025-06-01')).toBeNull();
		expect(installationOn(history, '2026-01-10')?.installed_on).toBe('2026-01-10');
		expect(installationOn(history, '2026-09-20')?.installed_on).toBe('2026-01-10');
	});
	it('converts an aircraft point to component hours through the installation of the day', () => {
		expect(toComponentPoint(history, { date: '2024-06-01', hours: 1250, landings: 2200 })).toEqual({ date: '2024-06-01', hours: 250, landings: 200 });
		expect(toComponentPoint(history, { date: '2026-05-01', hours: 2300, landings: 3200 })).toEqual({ date: '2026-05-01', hours: 800, landings: 700 });
	});
	it('keeps the date but drops the readings when no installation covers the day', () => {
		expect(toComponentPoint(history, { date: '2025-06-01', hours: 1600, landings: 2600 })).toEqual({ date: '2025-06-01', hours: null, landings: null });
		expect(toComponentPoint(history, { date: null, hours: 1600, landings: null })).toEqual({ date: null, hours: null, landings: null });
	});
	it('ages in years with one decimal', () => {
		expect(ageLabel('2020-06-01', '2026-09-20')).toBe('6.3 y');
		expect(ageLabel(null, '2026-09-20')).toBe('—');
	});
});
