import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { fromHelsinkiInputValue, toHelsinkiInputValue, helsinkiDay, helsinkiTime } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const aircraft = await db
		.selectFrom('aircraft')
		.select(['id', 'tail_number', 'type', 'seats'])
		.orderBy('tail_number', 'asc')
		.execute();

	const rows = await db
		.selectFrom('reservations')
		.innerJoin('aircraft', 'aircraft.id', 'reservations.aircraft_id')
		.innerJoin('users', 'users.id', 'reservations.user_id')
		.select([
			'reservations.id',
			'reservations.starts_at',
			'reservations.ends_at',
			'reservations.notes',
			'reservations.user_id',
			'aircraft.tail_number',
			'users.name as pilot_name'
		])
		.where('reservations.ends_at', '>', new Date())
		.orderBy('reservations.starts_at', 'asc')
		.execute();

	const dayOf = helsinkiDay;
	const timeOf = helsinkiTime;

	const upcoming = rows.map((r) => ({
		id: r.id,
		tail_number: r.tail_number,
		pilot_name: r.pilot_name,
		mine: r.user_id === locals.user!.id,
		notes: r.notes,
		day: dayOf(new Date(r.starts_at)),
		time: `${timeOf(new Date(r.starts_at))} – ${timeOf(new Date(r.ends_at))}`
	}));

	// Sensible default start: next full hour, Helsinki time.
	const defaultStart = new Date();
	defaultStart.setMinutes(0, 0, 0);
	defaultStart.setHours(defaultStart.getHours() + 1);
	const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

	return {
		aircraft,
		upcoming,
		isAdmin: locals.user!.role === 'admin',
		defaultStart: toHelsinkiInputValue(defaultStart),
		defaultEnd: toHelsinkiInputValue(defaultEnd)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const aircraft_id = String(form.get('aircraft_id') ?? '');
		const startsRaw = String(form.get('starts_at') ?? '');
		const endsRaw = String(form.get('ends_at') ?? '');
		const notes = String(form.get('notes') ?? '').trim() || null;

		if (!aircraft_id || !startsRaw || !endsRaw) {
			return fail(400, { error: 'Choose an aircraft and a start and end time.' });
		}

		const starts_at = fromHelsinkiInputValue(startsRaw);
		const ends_at = fromHelsinkiInputValue(endsRaw);

		if (ends_at <= starts_at) {
			return fail(400, { error: 'End time must be after the start time.' });
		}

		try {
			await db
				.insertInto('reservations')
				.values({
					aircraft_id,
					user_id: locals.user!.id,
					starts_at: starts_at.toISOString(),
					ends_at: ends_at.toISOString(),
					notes
				})
				.execute();
		} catch (err) {
			// 23P01 = exclusion_violation — the time range overlaps an
			// existing reservation for the same aircraft.
			if (err && typeof err === 'object' && 'code' in err && err.code === '23P01') {
				return fail(400, {
					error: 'That overlaps with an existing reservation for this aircraft.'
				});
			}
			throw err;
		}

		return { success: true };
	},

	cancel: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing reservation id.' });

		const reservation = await db
			.selectFrom('reservations')
			.select(['user_id'])
			.where('id', '=', id)
			.executeTakeFirst();

		if (!reservation) return fail(404, { error: 'Reservation not found.' });
		if (reservation.user_id !== locals.user!.id && locals.user!.role !== 'admin') {
			return fail(403, { error: "You can only cancel your own reservations." });
		}

		await db.deleteFrom('reservations').where('id', '=', id).execute();
	}
};
