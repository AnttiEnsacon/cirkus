import type { Point } from './due';

/**
 * Components (Phase 16). A component is a club-level thing — part number
 * and serial — that an installation binds to an aircraft for a period.
 * Its hours follow the aircraft while installed and freeze at removal;
 * the readings at fitting (TSN/TSO/CSN) are entered and carry whatever
 * history the part had before. Pure functions here; the loaders are in
 * componentsDb.ts.
 */

export interface Installation {
	installed_on: string;
	installed_at_hours: number;
	installed_at_landings: number;
	tsn_at_install: number;
	tso_at_install: number;
	csn_at_install: number;
	removed_on: string | null;
	removed_at_hours: number | null;
	removed_at_landings: number | null;
}

export interface ComponentCounters {
	installed: boolean;
	tsn: number;
	tso: number;
	csn: number;
	/** Whole months since manufacture, null without a date. */
	ageMonths: number | null;
	/** The latest installation, if any. */
	current: Installation | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function monthsBetween(from: string, to: string): number {
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ty, tm, td] = to.split('-').map(Number);
	let months = (ty - fy) * 12 + (tm - fm);
	if (td < fd) months--;
	return months;
}

/** Today's readings for a component, given its installations (any aircraft) and, if installed, that aircraft's counters now. */
export function componentCounters(
	installations: Installation[],
	aircraftNow: { hours: number; landings: number } | null,
	manufactureDate: string | null,
	today: string
): ComponentCounters {
	const ageMonths = manufactureDate ? monthsBetween(manufactureDate, today) : null;
	const latest = [...installations].sort((a, b) => (a.installed_on < b.installed_on ? 1 : a.installed_on > b.installed_on ? -1 : 0))[0] ?? null;
	if (!latest) return { installed: false, tsn: 0, tso: 0, csn: 0, ageMonths, current: null };
	const open = latest.removed_on === null;
	const hoursNow = open ? (aircraftNow?.hours ?? latest.installed_at_hours) : latest.removed_at_hours!;
	const landingsNow = open ? (aircraftNow?.landings ?? latest.installed_at_landings) : latest.removed_at_landings!;
	// Never below the fitting readings: the aircraft counters are summed from
	// the flight log and can lag a mechanic's reading by a few hours; a
	// component fitted "at 1010.0 h" has flown nothing until the log catches up.
	const dh = Math.max(0, hoursNow - latest.installed_at_hours);
	const dl = Math.max(0, landingsNow - latest.installed_at_landings);
	return {
		installed: open,
		tsn: r1(latest.tsn_at_install + dh),
		tso: r1(latest.tso_at_install + dh),
		csn: latest.csn_at_install + dl,
		ageMonths,
		current: latest
	};
}

/** The installation current on a date (inclusive of the fitting and removal days), or null. */
export function installationOn(installations: Installation[], date: string): Installation | null {
	return installations.find((i) => i.installed_on <= date && (i.removed_on === null || i.removed_on >= date)) ?? null;
}

/**
 * An aircraft reading (a compliance point) in the component's own hours
 * and landings: through the installation current on that date. With none
 * — the task predates the record — the date stays and the readings go, so
 * the task shows as undefined rather than with a wrong number.
 */
export function toComponentPoint(installations: Installation[], point: Point): Point {
	if (!point.date) return { date: null, hours: null, landings: null };
	const inst = installationOn(installations, point.date);
	if (!inst) return { date: point.date, hours: null, landings: null };
	return {
		date: point.date,
		hours: point.hours === null ? null : r1(inst.tsn_at_install + Math.max(0, point.hours - inst.installed_at_hours)),
		landings: point.landings === null ? null : inst.csn_at_install + Math.max(0, point.landings - inst.installed_at_landings)
	};
}

/** The anchor a component task counts from, for anchor kinds install and manufacture. */
export function componentAnchorPoint(kind: 'install' | 'manufacture', current: Installation | null, manufactureDate: string | null): Point | null {
	if (kind === 'manufacture') return manufactureDate ? { date: manufactureDate, hours: 0, landings: 0 } : null;
	return current ? { date: current.installed_on, hours: current.tsn_at_install, landings: current.csn_at_install } : null;
}

/** "6.3 y" from a manufacture date. */
export function ageLabel(manufactureDate: string | null, today: string): string {
	if (!manufactureDate) return '—';
	return `${(monthsBetween(manufactureDate, today) / 12).toFixed(1)} y`;
}
