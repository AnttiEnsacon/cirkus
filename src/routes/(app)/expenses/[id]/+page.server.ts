import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { assertCanSee, canEdit, loadExpense, loadImageIds, loadLines } from '$lib/server/expenses';
import { formatUtc, formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const e = await loadExpense(params.id);
	assertCanSee(e, me);
	const [lines, images] = await Promise.all([loadLines(e.id), loadImageIds(e.id)]);

	return {
		receipt: {
			id: e.id,
			vendor: e.vendor,
			date: formatUtcDate(new Date(e.receipt_date)),
			sent: formatUtc(new Date(e.created_at)),
			total: Number(e.total_amount).toFixed(2),
			notes: e.notes,
			status: e.status,
			pilot_name: e.pilot_name,
			mine: e.user_id === me.id,
			paid: e.paid_at ? formatUtcDate(new Date(e.paid_at)) + (e.paid_reference ? ` (${e.paid_reference})` : '') : '',
			rejected_reason: e.rejected_reason,
			canEdit: canEdit(e, me)
		},
		lines: lines.map((l) => ({ id: l.id, code: l.code, label: l.label, amount: Number(l.amount).toFixed(2), description: l.description })),
		images: images.map((i) => ({ id: i.id, url: `/expenses/${e.id}/image/${i.id}`, portrait: i.height >= i.width }))
	};
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		const me = locals.user!;
		const e = await loadExpense(params.id);
		assertCanSee(e, me);
		// Paid receipts are frozen; the status check is in the delete itself.
		const r = await db.deleteFrom('expenses').where('id', '=', e.id).where('status', '<>', 'paid').executeTakeFirst();
		if (Number(r.numDeletedRows) !== 1) return fail(400, { error: 'This receipt has been paid and can no longer be changed.' });
		throw redirect(303, me.role === 'admin' && !canEdit(e, me) ? '/manage/expenses' : e.user_id === me.id ? '/expenses?deleted=1' : '/manage/expenses');
	}
};
