import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'kysely';
import { db, type SecondPilotRole } from '$lib/server/db';
import { fromUtcInputValue, toUtcInputValue, formatHelsinki } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

const ICAO = /^[A-Z]{4}$/;

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;

	const aircraft = await db
		.selectFrom('aircraft')
		.leftJoin(
			(eb) =>
				eb
					.selectFrom('flight_log_entries')
					.select(['aircraft_id', sql<string>`max(tacho_end)`.as('last_tacho')])
					.groupBy('aircraft_id')
					.as('last'),
			(join) => join.onRef('last.aircraft_id', '=', 'aircraft.id')
		)
		.select(['aircraft.id', 'aircraft.tail_number', 'aircraft.type', 'aircraft.seats', 'last.last_tacho'])
		.orderBy('aircraft.tail_number', 'asc')
		.execute();

	const flightTypes = await db
		.selectFrom('flight_types')
		.select(['id', 'code', 'label', 'taxable'])
		.where('is_active', '=', true)
		.orderBy('sort_order', 'asc')
		.execute();

	const people = await db
		.selectFrom('users')
		.select(['id', 'name'])
		.where('status', '=', 'approved')
		.where('id', '<>', me.id)
		.orderBy('name', 'asc')
		.execute();

	// The pilot's own reservations from the last two weeks (plus today), to
	// optionally link a flight to the booking it was flown under.
	const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
	const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const reservationRows = await db
		.selectFrom('reservations')
		.innerJoin('aircraft', 'aircraft.id', 'reservations.aircraft_id')
		.select(['reservations.id', 'reservations.starts_at', 'reservations.ends_at', 'aircraft.tail_number'])
		.where('reservations.user_id', '=', me.id)
		.where('reservations.starts_at', '>=', since)
		.where('reservations.starts_at', '<=', until)
		.orderBy('reservations.starts_at', 'desc')
		.execute();

	const reservations = reservationRows.map((r) => ({
		id: r.id,
		label: `${r.tail_number} · ${formatHelsinki(new Date(r.starts_at))} – ${new Date(r.ends_at)
			.toISOString()
			.slice(11, 16)}`
	}));

	const now = new Date();
	now.setUTCSeconds(0, 0);

	return {
		aircraft,
		flightTypes,
		people,
		reservations,
		defaultBlockOff: toUtcInputValue(new Date(now.getTime() - 60 * 60 * 1000)),
		defaultBlockOn: toUtcInputValue(now)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const me = locals.user!;
		const form = await request.formData();
		const str = (k: string) => String(form.get(k) ?? '').trim();
		const num = (k: string) => {
			const v = str(k);
			return v === '' ? null : Number(v);
		};

		const aircraft_id = str('aircraft_id');
		const reservation_id = str('reservation_id') || null;
		const block_off_at = fromUtcInputValue(`${str('block_off_date')}T${str('block_off_time')}`);
		const block_on_at = fromUtcInputValue(`${str('block_on_date')}T${str('block_on_time')}`);
		const tacho_start = num('tacho_start');
		const tacho_end = num('tacho_end');
		const departure = str('departure').toUpperCase();
		const arrival = str('arrival').toUpperCase();
		const day_landings = num('day_landings') ?? 0;
		const night_landings = num('night_landings') ?? 0;
		const refuel_liters = num('refuel_liters');
		const oil_added_liters = num('oil_added_liters');
		const flight_type_id = str('flight_type_id');
		const persons_on_board = num('persons_on_board') ?? 1;
		const second_pilot_id = str('second_pilot_id') || null;
		const second_pilot_role = (str('second_pilot_role') || null) as SecondPilotRole | null;
		const remarks = str('remarks') || null;

		const values = Object.fromEntries(form.entries());
		const bad = (error: string) => fail(400, { error, values });

		if (!aircraft_id) return bad('Choose an aircraft.');
		if (!block_off_at || !block_on_at) return bad('Enter off-block and on-block dates and times (UTC).');
		if (block_on_at <= block_off_at) return bad('On-block must be after off-block.');
		if (tacho_start === null || tacho_end === null || !Number.isFinite(tacho_start) || !Number.isFinite(tacho_end)) {
			return bad('Enter both Tacho readings.');
		}
		if (tacho_end <= tacho_start) return bad('Tacho end must be greater than Tacho start.');
		if (!ICAO.test(departure) || !ICAO.test(arrival)) {
			return bad('Departure and arrival must be 4-letter ICAO codes (use XXXX for no aerodrome).');
		}
		if (!Number.isInteger(day_landings) || day_landings < 0 || !Number.isInteger(night_landings) || night_landings < 0) {
			return bad('Landings must be whole numbers.');
		}
		if (refuel_liters !== null && (!Number.isFinite(refuel_liters) || refuel_liters < 0)) {
			return bad('Fuel added must be a non-negative number.');
		}
		if (oil_added_liters !== null && (!Number.isFinite(oil_added_liters) || oil_added_liters < 0)) {
			return bad('Oil added must be a non-negative number.');
		}
		if (!flight_type_id) return bad('Choose a flight type.');
		if (!Number.isInteger(persons_on_board) || persons_on_board < 1) return bad('Persons on board must be at least 1 (you).');
		const plane = await db.selectFrom('aircraft').select('seats').where('id', '=', aircraft_id).executeTakeFirst();
		if (!plane) return bad('Choose an aircraft.');
		if (persons_on_board > plane.seats) return bad(`That aircraft has ${plane.seats} seats.`);
		if (second_pilot_id && second_pilot_id === me.id) return bad('The second pilot must be someone else.');
		if ((second_pilot_id === null) !== (second_pilot_role === null)) {
			return bad('Pick both a second pilot and their role, or neither.');
		}
		if (second_pilot_role && !['instructor', 'backup_pilot'].includes(second_pilot_role)) {
			return bad('Invalid second pilot role.');
		}

		await db.transaction().execute(async (trx) => {
			// Airports are created on first use; names can be filled in later.
			await trx
				.insertInto('airports')
				.values([{ icao_code: departure, name: null }, { icao_code: arrival, name: null }])
				.onConflict((oc) => oc.column('icao_code').doNothing())
				.execute();

			await trx
				.insertInto('flight_log_entries')
				.values({
					reservation_id,
					aircraft_id,
					pilot_id: me.id,
					second_pilot_id,
					second_pilot_role,
					block_off_at: block_off_at.toISOString(),
					block_on_at: block_on_at.toISOString(),
					tacho_start,
					tacho_end,
					departure_airport_code: departure,
					arrival_airport_code: arrival,
					day_landings,
					night_landings,
					refuel_liters,
					oil_added_liters,
					flight_type_id,
					persons_on_board,
					remarks
				})
				.execute();
		});

		throw redirect(303, '/logbook?saved=1');
	}
};
