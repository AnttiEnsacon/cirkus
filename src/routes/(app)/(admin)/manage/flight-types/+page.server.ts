import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { sql } from 'kysely';
import { db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

const CODE = /^[A-ZÅÄÖ0-9]{2,6}$/;

export const load: PageServerLoad = async () => {
	const types = await db
		.selectFrom('flight_types as t')
		.leftJoin(
			(eb) => eb.selectFrom('flight_log_entries').select(['flight_type_id', sql<number>`count(*)::int`.as('n')]).groupBy('flight_type_id').as('use'),
			(join) => join.onRef('use.flight_type_id', '=', 't.id')
		)
		.select(['t.id', 't.code', 't.label', 't.account', 't.taxable', 't.is_active', 't.sort_order', 'use.n as flights'])
		.orderBy('t.is_active', 'desc')
		.orderBy('t.sort_order', 'asc')
		.orderBy('t.code', 'asc')
		.execute();
	return { types: types.map((t) => ({ ...t, flights: t.flights ?? 0 })) };
};

function read(form: FormData) {
	const code = String(form.get('code') ?? '').trim().toUpperCase();
	const label = String(form.get('label') ?? '').trim();
	const account = String(form.get('account') ?? '').trim() || null;
	const taxable = form.get('taxable') === 'on';
	const sort_order = Number(form.get('sort_order') ?? 0) || 0;
	if (!CODE.test(code)) return { error: 'Abbreviation: 2–6 capital letters or digits.' } as const;
	if (!label) return { error: 'Name is required.' } as const;
	if (account && !/^\d{3,6}$/.test(account)) return { error: 'Account should be a 3–6 digit number.' } as const;
	return { code, label, account, taxable, sort_order } as const;
}

export const actions: Actions = {
	add: async (event) => {
		const r = read(await event.request.formData());
		if (!('error' in r)) audit(event, { action: 'flight_type.add', details: { code: r.code } });
		if ('error' in r) return fail(400, { error: r.error });
		try {
			await db.insertInto('flight_types').values({ ...r }).execute();
		} catch {
			return fail(400, { error: `A flight type with abbreviation ${r.code} already exists.` });
		}
	},
	update: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const r = read(form);
		if (!('error' in r)) audit(event, { action: 'flight_type.update', entity: ['flight_type', id], details: { code: r.code } });
		if (!id) return fail(400, { error: 'Missing id.' });
		if ('error' in r) return fail(400, { error: r.error });
		try {
			await db.updateTable('flight_types').set({ ...r }).where('id', '=', id).execute();
		} catch {
			return fail(400, { error: `A flight type with abbreviation ${r.code} already exists.` });
		}
	},
	toggle: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		audit(event, { action: 'flight_type.toggle', entity: ['flight_type', id] });
		if (!id) return fail(400, { error: 'Missing id.' });
		await db.updateTable('flight_types').set({ is_active: sql`not is_active` }).where('id', '=', id).execute();
	},
	delete: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		audit(event, { action: 'flight_type.delete', entity: ['flight_type', id] });
		if (!id) return fail(400, { error: 'Missing id.' });
		const used = await db.selectFrom('flight_log_entries').select('id').where('flight_type_id', '=', id).limit(1).executeTakeFirst();
		if (used) return fail(400, { error: 'This type is used by logged flights — deactivate it instead of deleting.' });
		await db.deleteFrom('flight_types').where('id', '=', id).execute();
	}
};
