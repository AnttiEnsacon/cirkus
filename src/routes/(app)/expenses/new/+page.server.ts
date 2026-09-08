import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { activeCategories, parseExpenseForm, parseUploadedImages, postedLines } from '$lib/server/expenses';
import { formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const categories = await activeCategories();
	return {
		categories,
		initial: {
			receipt_date: formatUtcDate(new Date()),
			vendor: '',
			total_amount: '',
			notes: '',
			// One line prefilled: the common one-category receipt is zero extra taps.
			lines: [{ category_id: categories[0]?.id ?? '', amount: '', description: '' }]
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		const me = locals.user!;
		const form = await request.formData();
		const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
		const bad = (error: string) => fail(400, { error, values, lines: postedLines(form) });

		const parsed = await parseExpenseForm(form);
		if (!parsed.ok) return bad(parsed.error);
		const uploaded = await parseUploadedImages(form);
		if (!uploaded.ok) return bad(uploaded.error);
		if (uploaded.images.length === 0) return bad('Add a photo of the receipt.');

		await db.transaction().execute(async (trx) => {
			const { lines, ...expense } = parsed.values;
			const e = await trx.insertInto('expenses').values({ ...expense, user_id: me.id }).returning('id').executeTakeFirstOrThrow();
			audit(event, { action: 'expense.create', entity: ['expense', e.id], details: { vendor: expense.vendor, total: expense.total_amount.toFixed(2) } });
			await trx
				.insertInto('expense_lines')
				.values(lines.map((l, position) => ({ ...l, expense_id: e.id, position })))
				.execute();
			await trx
				.insertInto('receipt_images')
				.values(uploaded.images.map((img) => ({ ...img, expense_id: e.id })))
				.execute();
		});

		throw redirect(303, '/expenses?saved=1');
	}
};
