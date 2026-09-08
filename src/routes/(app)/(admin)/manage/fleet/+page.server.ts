import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db, type BillingBasis } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

/** Billing basis + whether the log form asks for Tacho (forced on for Tacho billing). */
function readBilling(form: FormData): { billing_basis: BillingBasis; records_tacho: boolean } | { error: string } {
	const basis = String(form.get('billing_basis') ?? 'tacho');
	if (basis !== 'tacho' && basis !== 'airborne') return { error: 'Choose how the aircraft is billed.' };
	return { billing_basis: basis, records_tacho: basis === 'tacho' || form.get('records_tacho') === 'on' };
}

export const load: PageServerLoad = async () => {
	const aircraft = await db
		.selectFrom('aircraft')
		.select([
			'id',
			'tail_number',
			'type',
			'seats',
			'member_rate_per_hour',
			'guest_rate_per_hour',
			'billing_basis',
			'records_tacho'
		])
		.orderBy('tail_number', 'asc')
		.execute();

	const people = await db
		.selectFrom('users')
		.select(['id', 'name', 'email'])
		.where('status', '=', 'approved')
		.orderBy('name', 'asc')
		.execute();

	const ownerRows = await db.selectFrom('aircraft_owners').select(['aircraft_id', 'user_id']).execute();

	const ownersByAircraft: Record<string, string[]> = {};
	for (const row of ownerRows) {
		(ownersByAircraft[row.aircraft_id] ??= []).push(row.user_id);
	}

	return { aircraft, people, ownersByAircraft };
};

export const actions: Actions = {
	add: async (event) => {
		const form = await event.request.formData();
		const tail_number = String(form.get('tail_number') ?? '')
			.trim()
			.toUpperCase();
		const type = String(form.get('type') ?? '').trim();
		const seats = Number(form.get('seats'));
		const member_rate_per_hour = Number(form.get('member_rate_per_hour'));
		const guest_rate_per_hour = Number(form.get('guest_rate_per_hour'));

		if (!tail_number || !type || !Number.isFinite(seats) || seats < 1) {
			return fail(400, { error: 'Fill in a tail number, type, and a valid seat count.' });
		}
		if (!Number.isFinite(member_rate_per_hour) || !Number.isFinite(guest_rate_per_hour)) {
			return fail(400, { error: 'Both hourly rates must be numbers.' });
		}
		const billing = readBilling(form);
		if ('error' in billing) return fail(400, { error: billing.error });

		audit(event, { action: 'aircraft.add', details: { tail: tail_number, ...billing } });
		try {
			await db
				.insertInto('aircraft')
				.values({ tail_number, type, seats, member_rate_per_hour, guest_rate_per_hour, ...billing })
				.execute();
		} catch {
			return fail(400, { error: `An aircraft with tail number ${tail_number} already exists.` });
		}
	},

	update: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const type = String(form.get('type') ?? '').trim();
		const seats = Number(form.get('seats'));
		const member_rate_per_hour = Number(form.get('member_rate_per_hour'));
		const guest_rate_per_hour = Number(form.get('guest_rate_per_hour'));

		if (!id || !type || !Number.isFinite(seats) || seats < 1) {
			return fail(400, { error: 'Fill in a type and a valid seat count.' });
		}
		if (!Number.isFinite(member_rate_per_hour) || !Number.isFinite(guest_rate_per_hour)) {
			return fail(400, { error: 'Both hourly rates must be numbers.' });
		}
		const billing = readBilling(form);
		if ('error' in billing) return fail(400, { error: billing.error });

		audit(event, { action: 'aircraft.update', entity: ['aircraft', id], details: { member_rate_per_hour, guest_rate_per_hour, ...billing } });
		// Existing flights keep the basis they were logged under (it is
		// copied onto each entry); this only affects flights logged from now on.
		await db
			.updateTable('aircraft')
			.set({
				type,
				seats,
				member_rate_per_hour,
				guest_rate_per_hour,
				...billing,
				updated_at: new Date().toISOString()
			})
			.where('id', '=', id)
			.execute();
	},

	updateOwners: async (event) => {
		const form = await event.request.formData();
		const aircraftId = String(form.get('aircraft_id') ?? '');
		audit(event, { action: 'aircraft.owners', entity: ['aircraft', aircraftId] });
		const ownerIds = form.getAll('owner_ids').map(String);

		if (!aircraftId) return fail(400, { error: 'Missing aircraft id.' });

		await db.transaction().execute(async (trx) => {
			await trx.deleteFrom('aircraft_owners').where('aircraft_id', '=', aircraftId).execute();
			if (ownerIds.length > 0) {
				await trx
					.insertInto('aircraft_owners')
					.values(ownerIds.map((user_id) => ({ aircraft_id: aircraftId, user_id })))
					.execute();
			}
		});
	}
};
