import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { formatUtc, formatUtcDate } from '$lib/server/time';
import { billingDetail } from '$lib/server/flightLog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;

	const rows = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
		.innerJoin('flight_types', 'flight_types.id', 'f.flight_type_id')
		.innerJoin('users as pic', 'pic.id', 'f.pilot_id')
		.leftJoin('users as second', 'second.id', 'f.second_pilot_id')
		.select([
			'f.id',
			'f.pilot_id',
			'f.second_pilot_id',
			'f.second_pilot_role',
			'f.block_off_at',
			'f.block_on_at',
			'f.billing_basis',
			'f.tacho_start',
			'f.tacho_end',
			'f.takeoff_at',
			'f.landing_at',
			'f.flight_hours',
			'f.block_hours',
			'f.departure_airport_code',
			'f.arrival_airport_code',
			'f.persons_on_board',
			'f.day_landings',
			'f.night_landings',
			'f.status',
			'f.remarks',
			'aircraft.tail_number',
			'flight_types.label as flight_type',
			'pic.name as pic_name',
			'second.name as second_name'
		])
		.where((eb) => eb.or([eb('f.pilot_id', '=', me.id), eb('f.second_pilot_id', '=', me.id)]))
		.orderBy('f.block_off_at', 'desc')
		.execute();

	const now = new Date();
	const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

	let totalHours = 0;
	let picHours = 0;
	let monthHours = 0;

	const entries = rows.map((r) => {
		// The pilot's logbook records block time; the billed figure is shown as detail.
		const hours = Number(r.block_hours);
		const role: 'PIC' | 'Instructor' | 'Backup' =
			r.pilot_id === me.id ? 'PIC' : r.second_pilot_role === 'instructor' ? 'Instructor' : 'Backup';
		totalHours += hours;
		if (role === 'PIC') picHours += hours;
		if (new Date(r.block_off_at).getTime() >= monthStart) monthHours += hours;

		return {
			id: r.id,
			role,
			date: formatUtcDate(new Date(r.block_off_at)),
			blockOff: formatUtc(new Date(r.block_off_at)).slice(11),
			blockOn: formatUtc(new Date(r.block_on_at)).slice(11),
			billing: billingDetail(r),
			hours: hours.toFixed(2),
			route: `${r.departure_airport_code} → ${r.arrival_airport_code}`,
			landings: `${r.day_landings}/${r.night_landings}`,
			pob: r.persons_on_board,
			tail_number: r.tail_number,
			flight_type: r.flight_type,
			pic_name: r.pic_name,
			second_name: r.second_name,
			status: r.status,
			remarks: r.remarks,
			canEdit: r.pilot_id === me.id && r.status !== 'billed'
		};
	});

	return {
		entries,
		totals: {
			total: totalHours.toFixed(1),
			pic: picHours.toFixed(1),
			month: monthHours.toFixed(1)
		},
		saved: url.searchParams.get('saved') === '1'
	};
};

export const actions: Actions = {
	delete: async (event) => {
		const { request, locals } = event;
		const me = locals.user!;
		const id = String((await request.formData()).get('id') ?? '');
		audit(event, { action: 'flight.delete', entity: ['flight', id] });
		if (!id) return fail(400, { error: 'Missing entry id.' });

		const entry = await db
			.selectFrom('flight_log_entries')
			.select(['pilot_id', 'status'])
			.where('id', '=', id)
			.executeTakeFirst();

		if (!entry) return fail(404, { error: 'Entry not found.' });
		if (entry.pilot_id !== me.id) return fail(403, { error: 'You can only delete your own entries.' });
		if (entry.status === 'billed') {
			return fail(400, { error: 'This flight has been invoiced and can no longer be changed.' });
		}

		await db.deleteFrom('flight_log_entries').where('id', '=', id).execute();
	}
};
