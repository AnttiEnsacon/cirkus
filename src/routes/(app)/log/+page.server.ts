import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ensureAirports, flightFormData, parseFlightForm } from '$lib/server/flightLog';
import { toUtcInputValue } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const formData = await flightFormData(me.id);

	const now = new Date();
	now.setUTCSeconds(0, 0);
	const defaultBlockOff = toUtcInputValue(new Date(now.getTime() - 60 * 60 * 1000));
	const defaultBlockOn = toUtcInputValue(now);

	return {
		...formData,
		initial: {
			block_off_date: defaultBlockOff.slice(0, 10),
			block_off_time: defaultBlockOff.slice(11, 16),
			block_on_date: defaultBlockOn.slice(0, 10),
			block_on_time: defaultBlockOn.slice(11, 16)
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const me = locals.user!;
		const form = await request.formData();
		const parsed = await parseFlightForm(form, me.id);
		if (!parsed.ok) return fail(400, { error: parsed.error, values: Object.fromEntries(form.entries()) });

		await db.transaction().execute(async (trx) => {
			await ensureAirports(trx, [parsed.values.departure_airport_code, parsed.values.arrival_airport_code]);
			await trx
				.insertInto('flight_log_entries')
				.values({ ...parsed.values, pilot_id: me.id })
				.execute();
		});

		throw redirect(303, '/logbook?saved=1');
	}
};
