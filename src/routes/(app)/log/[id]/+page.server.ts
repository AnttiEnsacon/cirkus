import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ensureAirports, flightFormData, parseFlightForm } from '$lib/server/flightLog';
import { toUtcInputValue } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

/** The entry, if this user may change it: their own or any as admin, and not billed. */
async function editableEntry(id: string, me: { id: string; role: string }) {
	const entry = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('users', 'users.id', 'f.pilot_id')
		.selectAll('f')
		.select('users.name as pilot_name')
		.where('f.id', '=', id)
		.executeTakeFirst();
	if (!entry) throw error(404, 'Flight not found');
	if (entry.pilot_id !== me.id && me.role !== 'admin') throw error(403, 'Not allowed');
	return entry;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const entry = await editableEntry(params.id, me);
	const formData = await flightFormData(entry.pilot_id, {
		excludeEntryId: entry.id,
		includeReservationId: entry.reservation_id
	});

	const off = toUtcInputValue(new Date(entry.block_off_at));
	const on = toUtcInputValue(new Date(entry.block_on_at));
	const to = entry.takeoff_at ? toUtcInputValue(new Date(entry.takeoff_at)) : off;
	const ldg = entry.landing_at ? toUtcInputValue(new Date(entry.landing_at)) : on;
	const s = (x: string | number | null) => (x === null ? '' : String(x));

	return {
		...formData,
		billed: entry.status === 'billed',
		pilotName: entry.pilot_id === me.id ? undefined : entry.pilot_name,
		basis: entry.billing_basis,
		initial: {
			aircraft_id: entry.aircraft_id,
			reservation_id: s(entry.reservation_id),
			block_off_date: off.slice(0, 10),
			block_off_time: off.slice(11, 16),
			block_on_date: on.slice(0, 10),
			block_on_time: on.slice(11, 16),
			takeoff_date: to.slice(0, 10),
			takeoff_time: to.slice(11, 16),
			landing_date: ldg.slice(0, 10),
			landing_time: ldg.slice(11, 16),
			tacho_start: s(entry.tacho_start),
			tacho_end: s(entry.tacho_end),
			departure: entry.departure_airport_code,
			arrival: entry.arrival_airport_code,
			day_landings: String(entry.day_landings),
			night_landings: String(entry.night_landings),
			second_pilot_id: s(entry.second_pilot_id),
			second_pilot_role: s(entry.second_pilot_role),
			flight_type_id: entry.flight_type_id,
			persons_on_board: String(entry.persons_on_board),
			refuel_liters: s(entry.refuel_liters),
			oil_added_liters: s(entry.oil_added_liters),
			remarks: s(entry.remarks)
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const me = locals.user!;
		const entry = await editableEntry(params.id, me);
		const form = await request.formData();
		const parsed = await parseFlightForm(form, entry.pilot_id, entry.billing_basis);
		if (!parsed.ok) return fail(400, { error: parsed.error, values: Object.fromEntries(form.entries()) });

		const updated = await db.transaction().execute(async (trx) => {
			await ensureAirports(trx, [parsed.values.departure_airport_code, parsed.values.arrival_airport_code]);
			// The status check is part of the update itself, so an invoice
			// created at the same moment wins and this edit is refused.
			const r = await trx
				.updateTable('flight_log_entries')
				.set({ ...parsed.values, updated_at: new Date().toISOString() })
				.where('id', '=', entry.id)
				.where('status', '<>', 'billed')
				.executeTakeFirst();
			return Number(r.numUpdatedRows) === 1;
		});
		if (!updated) {
			return fail(409, { error: 'This flight has been invoiced and can no longer be changed.', values: Object.fromEntries(form.entries()) });
		}

		throw redirect(303, me.role === 'admin' && entry.pilot_id !== me.id ? '/manage/flights' : '/logbook?saved=1');
	}
};
