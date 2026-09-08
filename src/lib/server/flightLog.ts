import { sql } from 'kysely';
import { db, type SecondPilotRole } from './db';
import { formatHelsinki, fromUtcInputValue } from './time';

const ICAO = /^[A-Z]{4}$/;

/** The columns a pilot enters for a flight; shared by the create and edit pages. */
export interface FlightValues {
	reservation_id: string | null;
	aircraft_id: string;
	second_pilot_id: string | null;
	second_pilot_role: SecondPilotRole | null;
	block_off_at: string;
	block_on_at: string;
	tacho_start: number;
	tacho_end: number;
	departure_airport_code: string;
	arrival_airport_code: string;
	day_landings: number;
	night_landings: number;
	refuel_liters: number | null;
	oil_added_liters: number | null;
	flight_type_id: string;
	persons_on_board: number;
	remarks: string | null;
}

/**
 * Parses and validates the flight form. `pilotId` is the pilot the flight
 * belongs to (the logged-in user when creating; the original pilot when an
 * admin edits someone else's entry). Returns either the values to store or
 * the error to show.
 */
export async function parseFlightForm(
	form: FormData,
	pilotId: string
): Promise<{ ok: true; values: FlightValues } | { ok: false; error: string }> {
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

	if (!aircraft_id) return { ok: false, error: 'Choose an aircraft.' };
	if (!block_off_at || !block_on_at) return { ok: false, error: 'Enter off-block and on-block dates and times (UTC).' };
	if (block_on_at <= block_off_at) return { ok: false, error: 'On-block must be after off-block.' };
	if (tacho_start === null || tacho_end === null || !Number.isFinite(tacho_start) || !Number.isFinite(tacho_end)) {
		return { ok: false, error: 'Enter both Tacho readings.' };
	}
	if (tacho_end <= tacho_start) return { ok: false, error: 'Tacho end must be greater than Tacho start.' };
	if (!ICAO.test(departure) || !ICAO.test(arrival)) {
		return { ok: false, error: 'Departure and arrival must be 4-letter ICAO codes (use XXXX for no aerodrome).' };
	}
	if (!Number.isInteger(day_landings) || day_landings < 0 || !Number.isInteger(night_landings) || night_landings < 0) {
		return { ok: false, error: 'Landings must be whole numbers.' };
	}
	if (refuel_liters !== null && (!Number.isFinite(refuel_liters) || refuel_liters < 0)) {
		return { ok: false, error: 'Fuel added must be a non-negative number.' };
	}
	if (oil_added_liters !== null && (!Number.isFinite(oil_added_liters) || oil_added_liters < 0)) {
		return { ok: false, error: 'Oil added must be a non-negative number.' };
	}
	if (!flight_type_id) return { ok: false, error: 'Choose a flight type.' };
	if (!Number.isInteger(persons_on_board) || persons_on_board < 1) return { ok: false, error: 'Persons on board must be at least 1 (you).' };
	const plane = await db.selectFrom('aircraft').select('seats').where('id', '=', aircraft_id).executeTakeFirst();
	if (!plane) return { ok: false, error: 'Choose an aircraft.' };
	if (persons_on_board > plane.seats) return { ok: false, error: `That aircraft has ${plane.seats} seats.` };
	if (second_pilot_id && second_pilot_id === pilotId) return { ok: false, error: 'The second pilot must be someone else.' };
	if ((second_pilot_id === null) !== (second_pilot_role === null)) {
		return { ok: false, error: 'Pick both a second pilot and their role, or neither.' };
	}
	if (second_pilot_role && !['instructor', 'backup_pilot'].includes(second_pilot_role)) {
		return { ok: false, error: 'Invalid second pilot role.' };
	}

	return {
		ok: true,
		values: {
			reservation_id,
			aircraft_id,
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
		}
	};
}

/** Airports are created on first use; names can be filled in later. */
export async function ensureAirports(trx: typeof db, codes: string[]): Promise<void> {
	await trx
		.insertInto('airports')
		.values(codes.map((icao_code) => ({ icao_code, name: null })))
		.onConflict((oc) => oc.column('icao_code').doNothing())
		.execute();
}

/**
 * Everything the flight form needs to render: aircraft with their last
 * Tacho reading, active flight types, other approved people, and the
 * pilot's recent reservations to link to. `excludeEntryId` keeps an entry
 * being edited out of its own "last Tacho" hint; `includeReservationId`
 * keeps an already-linked reservation in the list even when it is older
 * than the two-week window.
 */
export async function flightFormData(
	pilotId: string,
	opts: { excludeEntryId?: string; includeReservationId?: string | null } = {}
) {
	const aircraft = await db
		.selectFrom('aircraft')
		.leftJoin(
			(eb) => {
				let q = eb.selectFrom('flight_log_entries').select(['aircraft_id', sql<string>`max(tacho_end)`.as('last_tacho')]);
				if (opts.excludeEntryId) q = q.where('id', '<>', opts.excludeEntryId);
				return q.groupBy('aircraft_id').as('last');
			},
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
		.where('id', '<>', pilotId)
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
		.where('reservations.user_id', '=', pilotId)
		.where((eb) => {
			const recent = eb.and([eb('reservations.starts_at', '>=', since), eb('reservations.starts_at', '<=', until)]);
			return opts.includeReservationId ? eb.or([recent, eb('reservations.id', '=', opts.includeReservationId)]) : recent;
		})
		.orderBy('reservations.starts_at', 'desc')
		.execute();

	const reservations = reservationRows.map((r) => ({
		id: r.id,
		label: `${r.tail_number} · ${formatHelsinki(new Date(r.starts_at))} – ${new Date(r.ends_at)
			.toISOString()
			.slice(11, 16)}`
	}));

	return { aircraft, flightTypes, people, reservations };
}
