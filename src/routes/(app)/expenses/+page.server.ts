import { db } from '$lib/server/db';
import { formatUtcDate } from '$lib/server/time';
import { linesSummary } from '$lib/server/expenses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;

	const rows = await db
		.selectFrom('expenses')
		.select(['id', 'receipt_date', 'vendor', 'total_amount', 'status', 'rejected_reason', 'paid_at', 'paid_reference'])
		.where('user_id', '=', me.id)
		.orderBy('receipt_date', 'desc')
		.orderBy('created_at', 'desc')
		.execute();

	const lineRows = rows.length
		? await db
				.selectFrom('expense_lines as l')
				.innerJoin('expense_categories as c', 'c.id', 'l.category_id')
				.select(['l.expense_id', 'l.amount', 'c.label'])
				.where('l.expense_id', 'in', rows.map((r) => r.id))
				.execute()
		: [];

	const year = new Date().getUTCFullYear();
	let waiting = 0;
	let paidThisYear = 0;
	const receipts = rows.map((r) => {
		const total = Number(r.total_amount);
		if (r.status === 'submitted') waiting += total;
		if (r.status === 'paid' && r.paid_at && new Date(r.paid_at).getUTCFullYear() === year) paidThisYear += total;
		return {
			id: r.id,
			date: formatUtcDate(new Date(r.receipt_date)),
			vendor: r.vendor,
			total: total.toFixed(2),
			status: r.status,
			lines: linesSummary(lineRows.filter((l) => l.expense_id === r.id)),
			rejected_reason: r.rejected_reason,
			paid: r.paid_at ? formatUtcDate(new Date(r.paid_at)) + (r.paid_reference ? ` (${r.paid_reference})` : '') : '',
			canEdit: r.status !== 'paid'
		};
	});

	return {
		receipts,
		totals: { waiting: waiting.toFixed(2), paidThisYear: paidThisYear.toFixed(2), count: receipts.length },
		saved: url.searchParams.get('saved') === '1',
		deleted: url.searchParams.get('deleted') === '1'
	};
};
