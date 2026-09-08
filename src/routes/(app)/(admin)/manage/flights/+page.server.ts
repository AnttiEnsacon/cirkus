import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { formatUtc, formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
		.innerJoin('flight_types', 'flight_types.id', 'f.flight_type_id')
		.innerJoin('users as pic', 'pic.id', 'f.pilot_id')
		.leftJoin('users as second', 'second.id', 'f.second_pilot_id')
		.select([
			'f.id',
			'f.block_off_at',
			'f.block_on_at',
			'f.tacho_start',
			'f.tacho_end',
			'f.flight_hours',
			'f.departure_airport_code',
			'f.arrival_airport_code',
			'f.persons_on_board',
			'f.day_landings',
			'f.night_landings',
			'f.refuel_liters',
			'f.oil_added_liters',
			'f.second_pilot_role',
			'f.status',
			'f.remarks',
			'aircraft.tail_number',
			'flight_types.label as flight_type',
			'pic.name as pic_name',
			'second.name as second_name'
		])
		.orderBy('f.block_off_at', 'desc')
		.limit(200)
		.execute();

	const entries = rows.map((r) => ({
		id: r.id,
		date: formatUtcDate(new Date(r.block_off_at)),
		blockOff: formatUtc(new Date(r.block_off_at)).slice(11),
		blockOn: formatUtc(new Date(r.block_on_at)).slice(11),
		tacho: `${r.tacho_start} → ${r.tacho_end}`,
		hours: Number(r.flight_hours).toFixed(2),
		route: `${r.departure_airport_code} → ${r.arrival_airport_code}`,
		landings: `${r.day_landings}/${r.night_landings}`,
		pob: r.persons_on_board,
		fuel: r.refuel_liters ?? '',
		oil: r.oil_added_liters ?? '',
		tail_number: r.tail_number,
		flight_type: r.flight_type,
		pic_name: r.pic_name,
		second: r.second_name ? `${r.second_name} (${r.second_pilot_role === 'instructor' ? 'instr.' : 'backup'})` : '',
		status: r.status,
		remarks: r.remarks ?? '',
		canEdit: r.status !== 'billed'
	}));

	return { entries };
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing entry id.' });
		// Billed entries are frozen; cancel the invoice first.
		const r = await db.deleteFrom('flight_log_entries').where('id', '=', id).where('status', '<>', 'billed').executeTakeFirst();
		if (Number(r.numDeletedRows) !== 1) return fail(400, { error: 'This flight has been invoiced and can no longer be changed.' });
	}
};
