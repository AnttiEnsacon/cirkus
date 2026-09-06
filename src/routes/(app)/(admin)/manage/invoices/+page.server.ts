import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cancelInvoice, createInvoiceForPilot, markInvoicePaid, unbilledByPilot } from '$lib/server/invoicing';
import { formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const unbilled = await unbilledByPilot();

	const rows = await db
		.selectFrom('invoices')
		.innerJoin('users', 'users.id', 'invoices.pilot_id')
		.select([
			'invoices.id',
			'invoices.invoice_number',
			'invoices.status',
			'invoices.period_start',
			'invoices.period_end',
			'invoices.issued_at',
			'invoices.due_date',
			'invoices.paid_at',
			'invoices.paid_reference',
			'invoices.total_amount',
			'users.name as pilot_name'
		])
		.orderBy('invoices.invoice_year', 'desc')
		.orderBy('invoices.invoice_seq', 'desc')
		.limit(200)
		.execute();

	const today = formatUtcDate(new Date());
	const invoices = rows.map((r) => ({
		id: r.id,
		number: r.invoice_number,
		pilot_name: r.pilot_name,
		status: r.status,
		period: `${formatUtcDate(new Date(r.period_start))} – ${formatUtcDate(new Date(r.period_end))}`,
		issued: formatUtcDate(new Date(r.issued_at)),
		due: formatUtcDate(new Date(r.due_date)),
		overdue: r.status === 'issued' && formatUtcDate(new Date(r.due_date)) < today,
		paid: r.paid_at ? formatUtcDate(new Date(r.paid_at)) + (r.paid_reference ? ` (${r.paid_reference})` : '') : '',
		total: Number(r.total_amount).toFixed(2)
	}));

	return { unbilled, invoices };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const pilotId = String((await request.formData()).get('pilot_id') ?? '');
		if (!pilotId) return fail(400, { error: 'Missing pilot.' });
		try {
			const id = await createInvoiceForPilot(pilotId, locals.user!.id);
			return id ? { created: 1 } : { created: 0 };
		} catch (err) {
			return fail(409, { error: err instanceof Error ? err.message : 'Could not create the invoice.' });
		}
	},

	createAll: async ({ locals }) => {
		const pending = await unbilledByPilot();
		let created = 0;
		try {
			for (const p of pending) {
				if (await createInvoiceForPilot(p.pilot_id, locals.user!.id)) created++;
			}
		} catch (err) {
			return fail(409, {
				error: `${err instanceof Error ? err.message : 'Could not create an invoice.'} (${created} created before that.)`
			});
		}
		return { created };
	},

	markPaid: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reference = String(form.get('reference') ?? '').trim() || null;
		if (!id) return fail(400, { error: 'Missing invoice.' });
		if (!(await markInvoicePaid(id, reference))) return fail(400, { error: 'Only an issued invoice can be marked paid.' });
	},

	cancel: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing invoice.' });
		if (!(await cancelInvoice(id))) return fail(400, { error: 'Only an issued invoice can be cancelled.' });
	}
};
