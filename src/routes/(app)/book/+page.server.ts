import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { fromHelsinkiInputValue, toHelsinkiInputValue, helsinkiTime, helsinkiRange } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

// The calendar shows 06:00–22:00 Helsinki time in one-hour rows.
const HOUR_START = 6;
const HOUR_END = 22;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdParts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];
/** Calendar-date arithmetic on Helsinki dates, independent of DST. */
function ymdAdd(ymd: string, days: number): string {
	const [y, m, d] = ymdParts(ymd);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
/** 0 = Monday … 6 = Sunday */
function weekdayIndex(ymd: string): number {
	const [y, m, d] = ymdParts(ymd);
	return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;

	const aircraft = await db
		.selectFrom('aircraft')
		.select(['id', 'tail_number', 'type', 'seats'])
		.orderBy('tail_number', 'asc')
		.execute();

	// ?edit=<id>: the reservation being changed is loaded into the form and
	// the calendar opens on its week. Own reservations, or any as admin, and
	// only while it has not ended — the same rule as Cancel.
	const editId = url.searchParams.get('edit');
	const editing = editId ? await editableReservation(editId, me) : null;
	if (editId && !editing) throw redirect(303, '/book');

	const selectedAircraft =
		aircraft.find((a) => a.id === (url.searchParams.get('aircraft') ?? editing?.aircraft_id)) ?? aircraft[0] ?? null;

	// Default selection: the reservation being edited, else the next full
	// hour (Helsinki), or 09:00 the next morning if that falls outside the
	// grid's hours.
	let defaultStart: string;
	let defaultEnd: string;
	if (editing) {
		defaultStart = toHelsinkiInputValue(new Date(editing.starts_at));
		defaultEnd = toHelsinkiInputValue(new Date(editing.ends_at));
	} else {
		const now = new Date();
		now.setMinutes(0, 0, 0);
		now.setHours(now.getHours() + 1);
		defaultStart = toHelsinkiInputValue(now);
		const h = Number(defaultStart.slice(11, 13));
		if (h >= HOUR_END - 1) defaultStart = `${ymdAdd(defaultStart.slice(0, 10), 1)}T09:00`;
		else if (h < HOUR_START) defaultStart = `${defaultStart.slice(0, 10)}T09:00`;
		defaultEnd = `${defaultStart.slice(0, 10)}T${String(Math.min(Number(defaultStart.slice(11, 13)) + 2, HOUR_END)).padStart(2, '0')}:00`;
	}

	// Which week: ?week=YYYY-MM-DD (any day in it); default the week that
	// holds the default selection, so the selection is always on screen.
	const todayYmd = toHelsinkiInputValue(new Date()).slice(0, 10);
	const weekParam = url.searchParams.get('week');
	const anchor = weekParam && YMD.test(weekParam) ? weekParam : defaultStart.slice(0, 10);
	const monday = ymdAdd(anchor, -weekdayIndex(anchor));

	const days = Array.from({ length: 7 }, (_, i) => {
		const ymd = ymdAdd(monday, i);
		const noon = fromHelsinkiInputValue(`${ymd}T12:00`);
		return {
			ymd,
			weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short' }).format(noon),
			label: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'short' }).format(noon),
			isToday: ymd === todayYmd,
			isPast: ymd < todayYmd
		};
	});

	const weekStart = fromHelsinkiInputValue(`${monday}T00:00`);
	const weekEnd = fromHelsinkiInputValue(`${ymdAdd(monday, 7)}T00:00`);

	const rows = selectedAircraft
		? await db
				.selectFrom('reservations')
				.innerJoin('users', 'users.id', 'reservations.user_id')
				.select(['reservations.id', 'reservations.starts_at', 'reservations.ends_at', 'reservations.notes', 'reservations.user_id', 'users.name as pilot_name'])
				.where('reservations.aircraft_id', '=', selectedAircraft.id)
				.where('reservations.starts_at', '<', weekEnd)
				.where('reservations.ends_at', '>', weekStart)
				.orderBy('reservations.starts_at', 'asc')
				.execute()
		: [];

	// One block per (reservation, day) it touches, in wall-clock minutes.
	const blocks = rows.flatMap((r) => {
		if (r.id === editing?.id) return []; // shown as the selection instead
		const starts = new Date(r.starts_at);
		const ends = new Date(r.ends_at);
		const out = [];
		for (let i = 0; i < 7; i++) {
			const dayStart = fromHelsinkiInputValue(`${days[i].ymd}T00:00`);
			const dayEnd = fromHelsinkiInputValue(`${ymdAdd(days[i].ymd, 1)}T00:00`);
			if (starts >= dayEnd || ends <= dayStart) continue;
			out.push({
				id: r.id,
				day: i,
				startMin: starts <= dayStart ? 0 : minutesOf(helsinkiTime(starts)),
				endMin: ends >= dayEnd ? 24 * 60 : minutesOf(helsinkiTime(ends)),
				pilot: r.pilot_name,
				mine: r.user_id === me.id,
				notes: r.notes
			});
		}
		return out;
	});

	const thisWeek = rows.map((r) => ({
		id: r.id,
		when: `${days[Math.max(0, weekdayIndex(toHelsinkiInputValue(new Date(r.starts_at)).slice(0, 10)))]?.weekday ?? ''} ${helsinkiTime(new Date(r.starts_at))} – ${helsinkiTime(new Date(r.ends_at))}`,
		pilot: r.pilot_name,
		mine: r.user_id === me.id,
		notes: r.notes,
		past: new Date(r.ends_at) < new Date(),
		editing: r.id === editing?.id
	}));

	return {
		aircraft,
		selectedAircraftId: selectedAircraft?.id ?? '',
		monday,
		prevWeek: ymdAdd(monday, -7),
		nextWeek: ymdAdd(monday, 7),
		days,
		blocks,
		thisWeek,
		todayIndex: days.findIndex((d) => d.isToday),
		hourStart: HOUR_START,
		hourEnd: HOUR_END,
		defaultStart,
		defaultEnd,
		editing: editing ? { id: editing.id, notes: editing.notes ?? '' } : null,
		updated: url.searchParams.get('updated') === '1',
		isAdmin: me.role === 'admin'
	};
};

/** The reservation if this user may change it (own, or any as admin) and it has not ended. */
async function editableReservation(id: string, me: { id: string; role: string }) {
	const r = await db
		.selectFrom('reservations')
		.select(['id', 'aircraft_id', 'user_id', 'starts_at', 'ends_at', 'notes'])
		.where('id', '=', id)
		.executeTakeFirst();
	if (!r) return null;
	if (r.user_id !== me.id && me.role !== 'admin') return null;
	if (new Date(r.ends_at) < new Date()) return null;
	return r;
}

/** Parses the booking form; shared by create and update. */
function parseBookingForm(form: FormData) {
	const aircraft_id = String(form.get('aircraft_id') ?? '');
	const startsRaw = `${form.get('starts_date') ?? ''}T${form.get('starts_time') ?? ''}`;
	const endsRaw = `${form.get('ends_date') ?? ''}T${form.get('ends_time') ?? ''}`;
	const notes = String(form.get('notes') ?? '').trim() || null;

	if (!aircraft_id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsRaw) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endsRaw)) {
		return { error: 'Choose an aircraft and a start and end date and time.' } as const;
	}
	const starts_at = fromHelsinkiInputValue(startsRaw);
	const ends_at = fromHelsinkiInputValue(endsRaw);
	if (ends_at <= starts_at) return { error: 'End time must be after the start time.' } as const;

	return { values: { aircraft_id, starts_at: starts_at.toISOString(), ends_at: ends_at.toISOString(), notes } } as const;
}

/** Helsinki range for the log. */
function bookingSummary(v: { starts_at: string; ends_at: string }) {
	return { when: helsinkiRange(new Date(v.starts_at), new Date(v.ends_at)) };
}

const isOverlap = (err: unknown) =>
	// 23P01 = exclusion_violation — overlaps an existing reservation.
	!!err && typeof err === 'object' && 'code' in err && err.code === '23P01';

export const actions: Actions = {
	create: async (event) => {
		const { request, locals } = event;
		const parsed = parseBookingForm(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });
		try {
			const r = await db
				.insertInto('reservations')
				.values({ ...parsed.values, user_id: locals.user!.id })
				.returning('id')
				.executeTakeFirstOrThrow();
			audit(event, { action: 'reservation.create', entity: ['reservation', r.id], details: bookingSummary(parsed.values) });
		} catch (err) {
			if (isOverlap(err)) return fail(400, { error: 'That overlaps with an existing reservation for this aircraft.' });
			throw err;
		}
		return { success: true };
	},

	update: async (event) => {
		const { request, locals } = event;
		const form = await request.formData();
		const id = String(form.get('reservation_id') ?? '');
		const existing = id ? await editableReservation(id, locals.user!) : null;
		if (!existing) {
			return fail(403, { error: 'That reservation can no longer be changed.' });
		}
		const parsed = parseBookingForm(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		try {
			audit(event, {
				action: 'reservation.update',
				entity: ['reservation', id],
				details: { ...bookingSummary(parsed.values), ...(existing.user_id !== locals.user!.id ? { for: existing.user_id } : {}) }
			});
			// The exclusion constraint checks overlap against the *other*
			// reservations; a row never conflicts with its own old range.
			await db
				.updateTable('reservations')
				.set({ ...parsed.values, updated_at: new Date().toISOString() })
				.where('id', '=', id)
				.execute();
		} catch (err) {
			if (isOverlap(err)) return fail(400, { error: 'That overlaps with an existing reservation for this aircraft.' });
			throw err;
		}
		throw redirect(303, `/book?aircraft=${parsed.values.aircraft_id}&week=${toHelsinkiInputValue(new Date(parsed.values.starts_at)).slice(0, 10)}&updated=1`);
	},

	cancel: async (event) => {
		const { request, locals } = event;
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing reservation id.' });
		audit(event, { action: 'reservation.cancel', entity: ['reservation', id] });

		const reservation = await db.selectFrom('reservations').select(['user_id']).where('id', '=', id).executeTakeFirst();
		if (!reservation) return fail(404, { error: 'Reservation not found.' });
		if (reservation.user_id !== locals.user!.id && locals.user!.role !== 'admin') {
			return fail(403, { error: 'You can only cancel your own reservations.' });
		}

		await db.deleteFrom('reservations').where('id', '=', id).execute();
	}
};
