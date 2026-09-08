import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { activeCategories, assertCanSee, canEdit, loadExpense, loadImageIds, loadLines, parseExpenseForm, parseUploadedImages, postedLines } from '$lib/server/expenses';
import { formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const e = await loadExpense(params.id);
	assertCanSee(e, me);
	const [categories, lines, images] = await Promise.all([activeCategories(), loadLines(e.id), loadImageIds(e.id)]);
	// A line's category may have been switched off since; keep it selectable here.
	const cats = [...categories];
	for (const l of lines) if (!cats.some((c) => c.id === l.category_id)) cats.push({ id: l.category_id, code: l.code, label: l.label });

	return {
		paid: !canEdit(e, me),
		vendor: e.vendor,
		mine: e.user_id === me.id,
		categories: cats,
		images: images.map((i) => ({ id: i.id, url: `/expenses/${e.id}/image/${i.id}` })),
		initial: {
			receipt_date: formatUtcDate(new Date(e.receipt_date)),
			vendor: e.vendor,
			total_amount: Number(e.total_amount).toFixed(2),
			notes: e.notes ?? '',
			lines: lines.map((l) => ({ category_id: l.category_id, amount: Number(l.amount).toFixed(2), description: l.description ?? '' }))
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, params } = event;
		const me = locals.user!;
		const e = await loadExpense(params.id);
		assertCanSee(e, me);
		const form = await request.formData();
		const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
		const bad = (error: string, status = 400) => fail(status, { error, values, lines: postedLines(form) });

		const parsed = await parseExpenseForm(form);
		if (!parsed.ok) return bad(parsed.error);
		const uploaded = await parseUploadedImages(form);
		if (!uploaded.ok) return bad(uploaded.error);
		const remove = form.getAll('remove_image').map(String);
		const existing = await loadImageIds(e.id);
		if (existing.filter((i) => !remove.includes(i.id)).length + uploaded.images.length === 0) {
			return bad('Keep or add at least one photo of the receipt.');
		}

		const updated = await db.transaction().execute(async (trx) => {
			const { lines, ...expense } = parsed.values;
			// A rejected receipt that is edited goes back to submitted; the
			// status check keeps a receipt paid meanwhile from being changed.
			const r = await trx
				.updateTable('expenses')
				.set({ ...expense, status: 'submitted', rejected_reason: null, updated_at: new Date().toISOString() })
				.where('id', '=', e.id)
				.where('status', '<>', 'paid')
				.executeTakeFirst();
			if (Number(r.numUpdatedRows) !== 1) return false;
			await trx.deleteFrom('expense_lines').where('expense_id', '=', e.id).execute();
			await trx
				.insertInto('expense_lines')
				.values(lines.map((l, position) => ({ ...l, expense_id: e.id, position })))
				.execute();
			if (remove.length) await trx.deleteFrom('receipt_images').where('expense_id', '=', e.id).where('id', 'in', remove).execute();
			if (uploaded.images.length) {
				await trx
					.insertInto('receipt_images')
					.values(uploaded.images.map((img) => ({ ...img, expense_id: e.id })))
					.execute();
			}
			return true;
		});
		audit(event, { action: 'expense.update', entity: ['expense', e.id], details: { vendor: parsed.values.vendor, total: parsed.values.total_amount.toFixed(2), ...(e.user_id !== me.id ? { for: e.pilot_name } : {}) } });
		if (!updated) return bad('This receipt has been paid and can no longer be changed.', 409);

		throw redirect(303, e.user_id === me.id ? '/expenses?saved=1' : '/manage/expenses');
	}
};
