import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { formatUtcDate } from '$lib/server/time';
import { billingDetail } from '$lib/server/flightLog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const me = locals.user!;

	const inv = await db
		.selectFrom('invoices')
		.innerJoin('users', 'users.id', 'invoices.pilot_id')
		.select([
			'invoices.id',
			'invoices.invoice_number',
			'invoices.pilot_id',
			'invoices.status',
			'invoices.period_start',
			'invoices.period_end',
			'invoices.issued_at',
			'invoices.due_date',
			'invoices.paid_at',
			'invoices.paid_reference',
			'invoices.procountor_number',
			'invoices.procountor_reference',
			'invoices.cancelled_at',
			'invoices.subtotal',
			'invoices.total_amount',
			'invoices.currency',
			'invoices.notes',
			'users.name as pilot_name',
			'users.email as pilot_email'
		])
		.where('invoices.id', '=', params.id)
		.executeTakeFirst();

	if (!inv) throw error(404, 'Invoice not found.');
	if (inv.pilot_id !== me.id && me.role !== 'admin') throw error(403, 'Not your invoice.');

	const lines = await db
		.selectFrom('invoice_line_items as l')
		.innerJoin('aircraft', 'aircraft.id', 'l.aircraft_id')
		.innerJoin('flight_log_entries as f', 'f.id', 'l.flight_log_id')
		.select([
			'l.id',
			'l.description',
			'l.hours_billed',
			'l.rate_applied',
			'l.amount',
			'aircraft.tail_number',
			'f.block_off_at',
			'f.departure_airport_code',
			'f.arrival_airport_code',
			'f.billing_basis',
			'f.tacho_start',
			'f.tacho_end',
			'f.takeoff_at',
			'f.landing_at'
		])
		.where('l.invoice_id', '=', inv.id)
		.orderBy('f.block_off_at', 'asc')
		.execute();

	return {
		invoice: {
			id: inv.id,
			number: inv.invoice_number,
			status: inv.status,
			pilot_name: inv.pilot_name,
			pilot_email: inv.pilot_email,
			period: `${formatUtcDate(new Date(inv.period_start))} – ${formatUtcDate(new Date(inv.period_end))}`,
			issued: formatUtcDate(new Date(inv.issued_at)),
			procountor_number: inv.procountor_number,
			reference: inv.procountor_reference,
			due: formatUtcDate(new Date(inv.due_date)),
			paid: inv.paid_at ? formatUtcDate(new Date(inv.paid_at)) : null,
			paid_reference: inv.paid_reference,
			cancelled: inv.cancelled_at ? formatUtcDate(new Date(inv.cancelled_at)) : null,
			subtotal: Number(inv.subtotal).toFixed(2),
			total: Number(inv.total_amount).toFixed(2),
			currency: inv.currency,
			notes: inv.notes
		},
		lines: lines.map((l) => ({
			id: l.id,
			date: formatUtcDate(new Date(l.block_off_at)),
			aircraft: l.tail_number,
			route: `${l.departure_airport_code} → ${l.arrival_airport_code}`,
			billing: billingDetail(l),
			hours: Number(l.hours_billed).toFixed(2),
			rate: Number(l.rate_applied).toFixed(2),
			amount: Number(l.amount).toFixed(2)
		}))
	};
};
