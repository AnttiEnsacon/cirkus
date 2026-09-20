import { fail } from '@sveltejs/kit';
import { sql } from 'kysely';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { formatUtcDate } from '$lib/server/time';
import { afterBaseline, aircraftCounters, hoursExpr } from '$lib/server/airworthiness/counters';
import { loadTracked } from '$lib/server/airworthiness/programme';
import type { Actions, PageServerLoad } from './$types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const FLIGHTS_SHOWN = 12;

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const c = await aircraftCounters(aircraft.id, profile);

	const adjustments = await db
		.selectFrom('mx_usage_adjustments as x')
		.innerJoin('users as u', 'u.id', 'x.entered_by')
		.leftJoin('mx_usage_adjustments as y', 'y.supersedes_id', 'x.id')
		.select(['x.id', 'x.on_date', 'x.hours_delta', 'x.landings_delta', 'x.reason', 'u.name as by', 'x.supersedes_id', 'y.id as superseded_by'])
		.where('x.aircraft_id', '=', aircraft.id)
		.orderBy('x.on_date', 'desc')
		.orderBy('x.created_at', 'desc')
		.execute();

	const flights = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('users as u', 'u.id', 'f.pilot_id')
		.innerJoin('flight_types as t', 't.id', 'f.flight_type_id')
		.select([
			'f.id',
			'f.block_off_at',
			'u.name as pilot',
			'f.departure_airport_code as dep',
			'f.arrival_airport_code as arr',
			'f.tacho_start',
			'f.tacho_end',
			hoursExpr(profile.hours_source).as('hours'),
			sql<number>`f.day_landings + f.night_landings`.as('landings'),
			't.code as type'
		])
		.where('f.aircraft_id', '=', aircraft.id)
		.where(afterBaseline(profile.baseline_at))
		.orderBy('f.block_off_at', 'desc')
		.limit(FLIGHTS_SHOWN)
		.execute();

	// The reconciliation check: only meaningful when the Tacho meter reads airframe time.
	const tachoDelta = profile.hours_source === 'tacho' && c.lastTacho !== null ? Math.round((c.lastTacho - c.hours) * 10) / 10 : null;

	return {
		tail: aircraft.tail_number,
		source: profile.hours_source,
		baselineAt: c.baseline.at,
		today: c.today,
		rows: {
			baseline: { hours: c.baseline.hours.toFixed(1), landings: c.baseline.landings },
			flights: { count: c.flights.count, hours: signed(c.flights.hours), landings: signedInt(c.flights.landings), withoutReadings: c.flights.withoutReadings },
			adjustments: { count: c.adjustments.count, hours: signed(c.adjustments.hours), landings: signedInt(c.adjustments.landings) },
			total: { hours: c.hours.toFixed(1), landings: c.landings }
		},
		utilisation: { perDay: c.hoursPerDay.toFixed(2), windowDays: c.window.days, windowHours: c.window.hours.toFixed(1), windowFlights: c.window.flights },
		tacho: c.lastTacho === null ? null : { last: c.lastTacho.toFixed(1), delta: tachoDelta === null ? null : signed(tachoDelta), off: tachoDelta !== null && Math.abs(tachoDelta) > 1.0 },
		adjustments: adjustments.map((a) => ({
			id: a.id,
			date: a.on_date,
			hours: signed(Number(a.hours_delta)),
			landings: signedInt(a.landings_delta),
			reason: a.reason,
			by: a.by,
			supersedesId: a.supersedes_id,
			superseded: a.superseded_by !== null,
			beforeBaseline: a.on_date <= c.baseline.at
		})),
		flights: flights.map((f) => ({
			id: f.id,
			date: formatUtcDate(new Date(f.block_off_at)),
			pilot: f.pilot,
			route: `${f.dep} → ${f.arr}`,
			tacho: f.tacho_start !== null ? `${f.tacho_start} → ${f.tacho_end}` : '—',
			hours: Number(f.hours).toFixed(1),
			landings: f.landings,
			type: f.type
		})),
		flightsShown: FLIGHTS_SHOWN
	};
};

const signed = (n: number) => (n > 0 ? '+' : '') + n.toFixed(1);
const signedInt = (n: number) => (n > 0 ? '+' : '') + String(n);

export const actions: Actions = {
	addAdjustment: async (event) => {
		const { aircraft, profile } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const on_date = String(form.get('on_date') ?? '').trim();
		const hours = Number(String(form.get('hours_delta') ?? '0').replace(',', '.') || 0);
		const landings = Number(String(form.get('landings_delta') ?? '0') || 0);
		const reason = String(form.get('reason') ?? '').trim();
		const supersedes = String(form.get('supersedes_id') ?? '').trim() || null;
		const values = { on_date, hours_delta: String(form.get('hours_delta') ?? ''), landings_delta: String(form.get('landings_delta') ?? ''), reason };
		const bad = (error: string) => fail(400, { error, values });
		if (!YMD.test(on_date)) return bad('Enter the date (YYYY-MM-DD).');
		if (on_date <= profile.baseline_at) return bad(`The date must be after the baseline (${profile.baseline_at}); anything earlier is inside the baseline figures.`);
		if (!Number.isFinite(hours) || !Number.isInteger(landings)) return bad('Hours must be a number and landings a whole number.');
		if (hours === 0 && landings === 0) return bad('An adjustment needs hours, landings or both.');
		if (!reason) return bad('Say why the flight log does not have it.');
		if (supersedes) {
			const prev = await db.selectFrom('mx_usage_adjustments').select('id').where('id', '=', supersedes).where('aircraft_id', '=', aircraft.id).executeTakeFirst();
			if (!prev) return bad('The adjustment to correct no longer exists.');
		}
		await db
			.insertInto('mx_usage_adjustments')
			.values({ aircraft_id: aircraft.id, on_date, hours_delta: Math.round(hours * 10) / 10, landings_delta: landings, reason, entered_by: event.locals.user!.id, supersedes_id: supersedes })
			.execute();
		audit(event, { action: supersedes ? 'airworthiness.adjustment_correct' : 'airworthiness.adjustment_add', entity: ['aircraft', aircraft.id], details: { tail: aircraft.tail_number, on_date, hours, landings, reason } });
		return { saved: true };
	},

	/** Cancel an adjustment: a zero row that supersedes it, so the history keeps both. */
	cancelAdjustment: async (event) => {
		const { aircraft } = await loadTracked(event.params.tail);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const prev = await db.selectFrom('mx_usage_adjustments').selectAll().where('id', '=', id).where('aircraft_id', '=', aircraft.id).executeTakeFirst();
		if (!prev) return fail(400, { error: 'No such adjustment.' });
		const already = await db.selectFrom('mx_usage_adjustments').select('id').where('supersedes_id', '=', id).executeTakeFirst();
		if (already) return fail(400, { error: 'That adjustment was already corrected.' });
		await db
			.insertInto('mx_usage_adjustments')
			.values({ aircraft_id: aircraft.id, on_date: prev.on_date, hours_delta: 0, landings_delta: 0, reason: `Cancelled: ${prev.reason}`, entered_by: event.locals.user!.id, supersedes_id: id })
			.execute();
		audit(event, { action: 'airworthiness.adjustment_cancel', entity: ['aircraft', aircraft.id], details: { tail: aircraft.tail_number, adjustment: id } });
		return { saved: true };
	}
};
