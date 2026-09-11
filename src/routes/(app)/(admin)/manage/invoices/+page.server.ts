import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { cancelInvoice, createInvoiceForPilot, pushInvoice, syncIfStale, syncInvoiceStatuses, unbilledByPilot, unbilledFlights } from '$lib/server/invoicing';
import { isConfigured } from '$lib/server/procountor';
import { formatUtcDate } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	await syncIfStale();
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
			'invoices.procountor_number',
			'invoices.procountor_reference',
			'invoices.last_error',
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
		overdue: r.status === 'sent' && formatUtcDate(new Date(r.due_date)) < today,
		procountor_number: r.procountor_number,
		reference: r.procountor_reference,
		error: r.last_error,
		paid: r.paid_at ? formatUtcDate(new Date(r.paid_at)) + (r.paid_reference ? ` (${r.paid_reference})` : '') : '',
		total: Number(r.total_amount).toFixed(2)
	}));

	return { unbilled, flights, invoices, procountor: isConfigured() };
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
			const pushed = id ? await pushInvoice(id) : null;
			audit(event, { action: 'invoice.create', entity: ['invoice', id], details: { ...(await invoiceSummary(id)), procountor: pushed } });
			return id ? { created: 1, pushed: pushed === 'sent' ? 1 : 0 } : { created: 0 };
		} catch (err) {
			return fail(409, { error: err instanceof Error ? err.message : 'Could not create the invoice.' });
		}
	},

	createAll: async (event) => {
		const { locals } = event;
		const pending = await unbilledByPilot();
		let created = 0;
		let pushed = 0;
		const numbers: string[] = [];
		try {
			for (const p of pending) {
				const id = await createInvoiceForPilot(p.pilot_id, locals.user!.id);
				if (id) {
					created++;
					numbers.push((await invoiceSummary(id)).number ?? id);
					if ((await pushInvoice(id)) === 'sent') pushed++;
				}
			}
			audit(event, { action: 'invoice.create_all', details: { created, pushed, numbers } });
		} catch (err) {
			return fail(409, {
				error: `${err instanceof Error ? err.message : 'Could not create an invoice.'} (${created} created before that.)`
			});
		}
		return { created, pushed };
	},

	retry: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing invoice.' });
		const result = await pushInvoice(id);
		audit(event, { action: 'invoice.retry', entity: ['invoice', id], details: { ...(await invoiceSummary(id)), procountor: result } });
		if (result !== 'sent') {
			const inv = await db.selectFrom('invoices').select('last_error').where('id', '=', id).executeTakeFirst();
			return fail(400, { error: inv?.last_error ?? 'Could not send the invoice to Procountor.' });
		}
	},

	sync: async (event) => {
		const r = await syncInvoiceStatuses();
		audit(event, { action: 'invoice.sync', details: r });
		return { synced: r };
	},

	cancel: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing invoice.' });
		audit(event, { action: 'invoice.cancel', entity: ['invoice', id], details: await invoiceSummary(id) });
		if (!(await cancelInvoice(id))) return fail(400, { error: 'Only an invoice that never reached Procountor can be cancelled here; one in the books is reversed in Procountor.' });
	}
};
