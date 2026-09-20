import { sql } from 'kysely';
import { db, type MxHoursSource } from '../db';
import { helsinkiToday } from '../time';
import { daysBetween } from './due';

/** What the profile row contributes to the sums. */
export interface CounterProfile {
	hours_source: MxHoursSource;
	baseline_at: string;
	baseline_hours: string | number;
	baseline_landings: number;
}

export interface AircraftCounters {
	today: string;
	/** Airframe totals today: baseline + flights since + adjustments. */
	hours: number;
	landings: number;
	/** Utilisation over the trailing window, for projections. */
	hoursPerDay: number;
	landingsPerHour: number;
	window: { days: number; hours: number; landings: number; flights: number };
	/** The parts, for the usage page. */
	baseline: { at: string; hours: number; landings: number };
	flights: { count: number; hours: number; landings: number; withoutReadings: number };
	adjustments: { count: number; hours: number; landings: number };
	/** Highest Tacho reading in the log (any date) — the reconciliation check on the usage page. */
	lastTacho: number | null;
}

/** The per-flight hours figure by the profile's hours source, as SQL. */
export function hoursExpr(source: MxHoursSource) {
	switch (source) {
		case 'tacho':
			return sql<string>`coalesce(f.tacho_end - f.tacho_start, 0)`;
		case 'block':
			return sql<string>`f.block_hours`;
		case 'airborne':
			return sql<string>`coalesce(round((extract(epoch from (f.landing_at - f.takeoff_at)) / 3600.0)::numeric, 2), 0)`;
	}
}

/** Flights on the baseline day are inside the baseline (its figure is end of day, club calendar). */
export const afterBaseline = (baselineAt: string) =>
	sql<boolean>`(f.block_off_at at time zone 'Europe/Helsinki')::date > ${baselineAt}::date`;

/**
 * Airframe hours and landings today, summed from the flight log after the
 * baseline plus the adjustments, and the utilisation behind the
 * projections: hours flown in the trailing 365 days (or since the first
 * logged flight, if that is more recent, floored at 90 days) per day.
 */
export async function aircraftCounters(aircraftId: string, profile: CounterProfile, today = helsinkiToday()): Promise<AircraftCounters> {
	const hours = hoursExpr(profile.hours_source);
	const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

	const f = await db
		.selectFrom('flight_log_entries as f')
		.select([
			sql<number>`count(*) filter (where ${afterBaseline(profile.baseline_at)})::int`.as('count'),
			sql<string>`coalesce(sum(${hours}) filter (where ${afterBaseline(profile.baseline_at)}), 0)`.as('hours'),
			sql<number>`coalesce(sum(f.day_landings + f.night_landings) filter (where ${afterBaseline(profile.baseline_at)}), 0)::int`.as('landings'),
			sql<number>`count(*) filter (where ${afterBaseline(profile.baseline_at)} and f.tacho_end is null)::int`.as('without_readings'),
			sql<number>`count(*) filter (where f.block_off_at >= ${yearAgo}::timestamptz)::int`.as('w_count'),
			sql<string>`coalesce(sum(${hours}) filter (where f.block_off_at >= ${yearAgo}::timestamptz), 0)`.as('w_hours'),
			sql<number>`coalesce(sum(f.day_landings + f.night_landings) filter (where f.block_off_at >= ${yearAgo}::timestamptz), 0)::int`.as('w_landings'),
			sql<string | null>`min(f.block_off_at)::text`.as('first_flight'),
			sql<string | null>`max(f.tacho_end)`.as('last_tacho')
		])
		.where('f.aircraft_id', '=', aircraftId)
		.executeTakeFirstOrThrow();

	// Adjustments that no later row supersedes, after the baseline.
	const a = await db
		.selectFrom('mx_usage_adjustments as x')
		.select([
			sql<number>`count(*)::int`.as('count'),
			sql<string>`coalesce(sum(x.hours_delta), 0)`.as('hours'),
			sql<number>`coalesce(sum(x.landings_delta), 0)::int`.as('landings')
		])
		.where('x.aircraft_id', '=', aircraftId)
		.where('x.on_date', '>', profile.baseline_at)
		.where(({ not, exists, selectFrom }) => not(exists(selectFrom('mx_usage_adjustments as y').select('y.id').whereRef('y.supersedes_id', '=', 'x.id'))))
		.executeTakeFirstOrThrow();

	const baseline = { at: profile.baseline_at, hours: Number(profile.baseline_hours), landings: profile.baseline_landings };
	const flights = { count: f.count, hours: Number(f.hours), landings: f.landings, withoutReadings: profile.hours_source === 'tacho' ? f.without_readings : 0 };
	const adjustments = { count: a.count, hours: Number(a.hours), landings: a.landings };

	// Window: 365 days, or the time the aircraft has been in the log if shorter, never under 90.
	let days = 365;
	if (f.first_flight) {
		const since = daysBetween(f.first_flight.slice(0, 10), today);
		days = Math.max(90, Math.min(365, since));
	}
	const wHours = Number(f.w_hours);
	const window = { days, hours: wHours, landings: f.w_landings, flights: f.w_count };

	return {
		today,
		hours: round1(baseline.hours + flights.hours + adjustments.hours),
		landings: baseline.landings + flights.landings + adjustments.landings,
		hoursPerDay: wHours / days,
		landingsPerHour: wHours > 0 ? f.w_landings / wHours : 0,
		window,
		baseline,
		flights,
		adjustments,
		lastTacho: f.last_tacho === null ? null : Number(f.last_tacho)
	};
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/**
 * The counters as they stood at the end of a past day: baseline + flights
 * and adjustments up to and including that day. Shown next to a release
 * form so the mechanic's readings can be compared with the log.
 */
export async function aircraftCountersAt(aircraftId: string, profile: CounterProfile, date: string): Promise<{ hours: number; landings: number }> {
	const hours = hoursExpr(profile.hours_source);
	if (date <= profile.baseline_at) return { hours: Number(profile.baseline_hours), landings: profile.baseline_landings };
	const f = await db
		.selectFrom('flight_log_entries as f')
		.select([
			sql<string>`coalesce(sum(${hours}), 0)`.as('hours'),
			sql<number>`coalesce(sum(f.day_landings + f.night_landings), 0)::int`.as('landings')
		])
		.where('f.aircraft_id', '=', aircraftId)
		.where(afterBaseline(profile.baseline_at))
		.where(sql<boolean>`(f.block_off_at at time zone 'Europe/Helsinki')::date <= ${date}::date`)
		.executeTakeFirstOrThrow();
	const a = await db
		.selectFrom('mx_usage_adjustments as x')
		.select([sql<string>`coalesce(sum(x.hours_delta), 0)`.as('hours'), sql<number>`coalesce(sum(x.landings_delta), 0)::int`.as('landings')])
		.where('x.aircraft_id', '=', aircraftId)
		.where('x.on_date', '>', profile.baseline_at)
		.where('x.on_date', '<=', date)
		.where(({ not, exists, selectFrom }) => not(exists(selectFrom('mx_usage_adjustments as y').select('y.id').whereRef('y.supersedes_id', '=', 'x.id'))))
		.executeTakeFirstOrThrow();
	return {
		hours: round1(Number(profile.baseline_hours) + Number(f.hours) + Number(a.hours)),
		landings: profile.baseline_landings + f.landings + a.landings
	};
}

