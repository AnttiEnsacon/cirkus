import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { linesSummary } from '$lib/server/expenses';
import { formatUtc, formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db
		.selectFrom('expenses as e')
		.innerJoin('users', 'users.id', 'e.user_id')
		.select(['e.id', 'e.receipt_date', 'e.vendor', 'e.total_amount', 'e.status', 'e.notes', 'e.created_at', 'e.paid_at', 'e.paid_reference', 'e.rejected_reason', 'users.name as pilot_name'])
		.orderBy('e.created_at', 'desc')
		.limit(300)
		.execute();

	const ids = rows.map((r) => r.id);
	const [lineRows, imageRows] = ids.length
		? await Promise.all([
				db
					.selectFrom('expense_lines as l')
					.innerJoin('expense_categories as c', 'c.id', 'l.category_id')
					.select(['l.expense_id', 'l.amount', 'c.code', 'c.label', 'l.position'])
					.where('l.expense_id', 'in', ids)
					.orderBy('l.position', 'asc')
					.execute(),
				db.selectFrom('receipt_images').select(['id', 'expense_id']).where('expense_id', 'in', ids).orderBy('created_at', 'asc').execute()
			])
		: [[], []];

	const receipts = rows.map((r) => {
		const lines = lineRows.filter((l) => l.expense_id === r.id);
		const firstImage = imageRows.find((i) => i.expense_id === r.id);
		return {
			id: r.id,
			pilot_name: r.pilot_name,
			vendor: r.vendor,
			date: formatUtcDate(new Date(r.receipt_date)),
			sent: formatUtc(new Date(r.created_at)),
			total: Number(r.total_amount).toFixed(2),
			status: r.status,
			notes: r.notes,
			lines: lines.map((l) => ({ code: l.code, label: l.label, amount: Number(l.amount).toFixed(2) })),
			linesText: linesSummary(lines),
			thumb: firstImage ? `/expenses/${r.id}/image/${firstImage.id}` : null,
			paid: r.paid_at ? formatUtcDate(new Date(r.paid_at)) + (r.paid_reference ? ` (${r.paid_reference})` : '') : '',
			rejected_reason: r.rejected_reason
		};
	});

	const waiting = receipts.filter((r) => r.status === 'submitted');
	return {
		waiting,
		waitingTotal: waiting.reduce((a, r) => a + Number(r.total), 0).toFixed(2),
		done: receipts.filter((r) => r.status !== 'submitted')
	};
};

/** Pilot, vendor and total, for the log. */
async function expenseSummary(id: string) {
	const e = await db
		.selectFrom('expenses')
		.innerJoin('users', 'users.id', 'expenses.user_id')
		.select(['expenses.vendor', 'expenses.total_amount', 'users.name'])
		.where('expenses.id', '=', id)
		.executeTakeFirst();
	return e ? { for: e.name, vendor: e.vendor, total: Number(e.total_amount).toFixed(2) } : {};
}

export const actions: Actions = {
	markPaid: async (event) => {
		const { request, locals } = event;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reference = String(form.get('reference') ?? '').trim() || null;
		if (!id) return fail(400, { error: 'Missing receipt.' });
		audit(event, { action: 'expense.mark_paid', entity: ['expense', id], details: { ...(await expenseSummary(id)), reference } });
		const r = await db
			.updateTable('expenses')
			.set({ status: 'paid', paid_at: new Date().toISOString(), paid_by: locals.user!.id, paid_reference: reference, rejected_reason: null, updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.where('status', '=', 'submitted')
			.executeTakeFirst();
		if (Number(r.numUpdatedRows) !== 1) return fail(400, { error: 'Only a submitted receipt can be marked paid.' });
	},
	reject: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing receipt.' });
		audit(event, { action: 'expense.reject', entity: ['expense', id], details: { ...(await expenseSummary(id)), reason } });
		if (!reason) return fail(400, { error: 'Give a reason for rejecting — the pilot will see it.' });
		const r = await db
			.updateTable('expenses')
			.set({ status: 'rejected', rejected_reason: reason, updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.where('status', '=', 'submitted')
			.executeTakeFirst();
		if (Number(r.numUpdatedRows) !== 1) return fail(400, { error: 'Only a submitted receipt can be rejected.' });
	}
};
