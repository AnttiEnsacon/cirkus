import { db } from '$lib/server/db';
import { formatUtcDate } from '$lib/server/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const rows = await db
		.selectFrom('invoices')
		.select(['id', 'invoice_number', 'status', 'period_start', 'period_end', 'issued_at', 'due_date', 'paid_at', 'total_amount'])
		.where('pilot_id', '=', locals.user!.id)
		.orderBy('invoice_year', 'desc')
		.orderBy('invoice_seq', 'desc')
		.execute();

	const today = formatUtcDate(new Date());
	let open = 0;
	const invoices = rows.map((r) => {
		if (r.status === 'issued') open += Number(r.total_amount);
		return {
			id: r.id,
			number: r.invoice_number,
			status: r.status,
			period: `${formatUtcDate(new Date(r.period_start))} – ${formatUtcDate(new Date(r.period_end))}`,
			issued: formatUtcDate(new Date(r.issued_at)),
			due: formatUtcDate(new Date(r.due_date)),
			overdue: r.status === 'issued' && formatUtcDate(new Date(r.due_date)) < today,
			total: Number(r.total_amount).toFixed(2)
		};
	});

	return { invoices, open: open.toFixed(2) };
};
