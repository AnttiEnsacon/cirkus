import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { cancelInvoice, createInvoiceForPilot, markInvoicePaid, unbilledByPilot, unbilledFlights } from '$lib/server/invoicing';
import { formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [unbilled, flights] = await Promise.all([unbilledByPilot(), unbilledFlights()]);

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

	return { unbilled, flights, invoices };
};

/** Number, pilot and total, for the log. */
async function invoiceSummary(id: string | null) {
	if (!id) return {};
	const inv = await db
		.selectFrom('invoices')
		.innerJoin('users', 'users.id', 'invoices.pilot_id')
		.select(['invoices.invoice_number', 'invoices.total_amount', 'users.name'])
		.where('invoices.id', '=', id)
		.executeTakeFirst();
	return inv ? { number: inv.invoice_number, pilot: inv.name, total: Number(inv.total_amount).toFixed(2) } : {};
}

export const actions: Actions = {
	create: async (event) => {
		const { request, locals } = event;
		const pilotId = String((await request.formData()).get('pilot_id') ?? '');
		if (!pilotId) return fail(400, { error: 'Missing pilot.' });
		try {
			const id = await createInvoiceForPilot(pilotId, locals.user!.id);
			audit(event, { action: 'invoice.create', entity: ['invoice', id], details: await invoiceSummary(id) });
			return id ? { created: 1 } : { created: 0 };
		} catch (err) {
			return fail(409, { error: err instanceof Error ? err.message : 'Could not create the invoice.' });
		}
	},

	createAll: async (event) => {
		const { locals } = event;
		const pending = await unbilledByPilot();
		let created = 0;
		const numbers: string[] = [];
		try {
			for (const p of pending) {
				const id = await createInvoiceForPilot(p.pilot_id, locals.user!.id);
				if (id) {
					created++;
					numbers.push((await invoiceSummary(id)).number ?? id);
				}
			}
			audit(event, { action: 'invoice.create_all', details: { created, numbers } });
		} catch (err) {
			return fail(409, {
				error: `${err instanceof Error ? err.message : 'Could not create an invoice.'} (${created} created before that.)`
			});
		}
		return { created };
	},

	markPaid: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const reference = String(form.get('reference') ?? '').trim() || null;
		if (!id) return fail(400, { error: 'Missing invoice.' });
		audit(event, { action: 'invoice.mark_paid', entity: ['invoice', id], details: { ...(await invoiceSummary(id)), reference } });
		if (!(await markInvoicePaid(id, reference))) return fail(400, { error: 'Only an issued invoice can be marked paid.' });
	},

	cancel: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing invoice.' });
		audit(event, { action: 'invoice.cancel', entity: ['invoice', id], details: await invoiceSummary(id) });
		if (!(await cancelInvoice(id))) return fail(400, { error: 'Only an issued invoice can be cancelled.' });
	}
};
