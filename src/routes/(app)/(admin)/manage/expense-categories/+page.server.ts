import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { sql } from 'kysely';
import { db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

const CODE = /^[A-ZÅÄÖ0-9]{2,6}$/;

export const load: PageServerLoad = async () => {
	const types = await db
		.selectFrom('expense_categories as t')
		.leftJoin(
			(eb) => eb.selectFrom('expense_lines').select(['category_id', sql<number>`count(*)::int`.as('n')]).groupBy('category_id').as('use'),
			(join) => join.onRef('use.category_id', '=', 't.id')
		)
		.select(['t.id', 't.code', 't.label', 't.account', 't.is_active', 't.sort_order', 'use.n as receipts'])
		.orderBy('t.is_active', 'desc')
		.orderBy('t.sort_order', 'asc')
		.orderBy('t.code', 'asc')
		.execute();
	return { types: types.map((t) => ({ ...t, receipts: t.receipts ?? 0 })) };
};

function read(form: FormData) {
	const code = String(form.get('code') ?? '').trim().toUpperCase();
	const label = String(form.get('label') ?? '').trim();
	const account = String(form.get('account') ?? '').trim() || null;
	const sort_order = Number(form.get('sort_order') ?? 0) || 0;
	if (!CODE.test(code)) return { error: 'Abbreviation: 2–6 capital letters or digits.' } as const;
	if (!label) return { error: 'Name is required.' } as const;
	if (account && !/^\d{3,6}$/.test(account)) return { error: 'Account should be a 3–6 digit number.' } as const;
	return { code, label, account, sort_order } as const;
}

export const actions: Actions = {
	add: async (event) => {
		const r = read(await event.request.formData());
		if (!('error' in r)) audit(event, { action: 'expense_category.add', details: { code: r.code } });
		if ('error' in r) return fail(400, { error: r.error });
		try {
			await db.insertInto('expense_categories').values({ ...r }).execute();
		} catch {
			return fail(400, { error: `A category with abbreviation ${r.code} already exists.` });
		}
	},
	update: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const r = read(form);
		if (!('error' in r)) audit(event, { action: 'expense_category.update', entity: ['expense_category', id], details: { code: r.code } });
		if (!id) return fail(400, { error: 'Missing id.' });
		if ('error' in r) return fail(400, { error: r.error });
		try {
			await db.updateTable('expense_categories').set({ ...r }).where('id', '=', id).execute();
		} catch {
			return fail(400, { error: `A category with abbreviation ${r.code} already exists.` });
		}
	},
	toggle: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		audit(event, { action: 'expense_category.toggle', entity: ['expense_category', id] });
		if (!id) return fail(400, { error: 'Missing id.' });
		await db.updateTable('expense_categories').set({ is_active: sql`not is_active` }).where('id', '=', id).execute();
	},
	delete: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		audit(event, { action: 'expense_category.delete', entity: ['expense_category', id] });
		if (!id) return fail(400, { error: 'Missing id.' });
		const used = await db.selectFrom('expense_lines').select('id').where('category_id', '=', id).limit(1).executeTakeFirst();
		if (used) return fail(400, { error: 'This type is used by receipts — deactivate it instead of deleting.' });
		await db.deleteFrom('expense_categories').where('id', '=', id).execute();
	}
};
