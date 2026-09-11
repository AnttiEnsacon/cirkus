import { sql } from 'kysely';
import { db, type InvoiceStatus } from './db';
import { formatUtcDate } from './time';
import { billingDetail, billingLabel } from './flightLog';
import * as procountor from './procountor';

/** Normal Finnish VAT. Member rates include it; Procountor rows are sent net. */
export const VAT_PERCENT = 25.5;
const net = (gross: number) => Math.round((gross / (1 + VAT_PERCENT / 100)) * 10000) / 10000;

const DUE_DAYS = 14;

export interface UnbilledSummary {
	pilot_id: string;
	pilot_name: string;
	flights: number;
	hours: string;
	amount: string;
}

export interface UnbilledFlight {
	id: string;
	pilot_id: string;
	date: string;
	tail_number: string;
	route: string;
	billing: string;
	hours: string;
	amount: string;
}

/**
 * The individual flights behind unbilledByPilot(), oldest first — what the
 * admin sees before pressing Create. Same pricing rule as the summary.
 */
export async function unbilledFlights(): Promise<UnbilledFlight[]> {
	const rows = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
		.select([
			'f.id',
			'f.pilot_id',
			'f.block_off_at',
			'f.billing_basis',
			'f.tacho_start',
			'f.tacho_end',
			'f.takeoff_at',
			'f.landing_at',
			'f.flight_hours',
			'f.departure_airport_code',
			'f.arrival_airport_code',
			'aircraft.tail_number',
			sql<string>`round(f.flight_hours * aircraft.member_rate_per_hour, 2)`.as('amount')
		])
		.where('f.status', '=', 'submitted')
		.orderBy('f.block_off_at', 'asc')
		.execute();

	return rows.map((r) => ({
		id: r.id,
		pilot_id: r.pilot_id,
		date: formatUtcDate(new Date(r.block_off_at)),
		tail_number: r.tail_number,
		route: `${r.departure_airport_code} → ${r.arrival_airport_code}`,
		billing: billingDetail(r),
		hours: Number(r.flight_hours).toFixed(2),
		amount: Number(r.amount).toFixed(2)
	}));
}

/** Not-yet-billed flights grouped by pilot, priced at today's member rate. */
export async function unbilledByPilot(): Promise<UnbilledSummary[]> {
	const rows = await db
		.selectFrom('flight_log_entries as f')
		.innerJoin('users', 'users.id', 'f.pilot_id')
		.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
		.select([
			'f.pilot_id',
			'users.name as pilot_name',
			sql<number>`count(*)::int`.as('flights'),
			sql<string>`sum(f.flight_hours)`.as('hours'),
			sql<string>`sum(round(f.flight_hours * aircraft.member_rate_per_hour, 2))`.as('amount')
		])
		.where('f.status', '=', 'submitted')
		.groupBy(['f.pilot_id', 'users.name'])
		.orderBy('users.name', 'asc')
		.execute();

	return rows.map((r) => ({
		pilot_id: r.pilot_id,
		pilot_name: r.pilot_name,
		flights: r.flights,
		hours: Number(r.hours).toFixed(2),
		amount: Number(r.amount).toFixed(2)
	}));
}

/**
 * Creates one invoice for a pilot covering every unbilled flight
 * they have, and marks those flights billed. Returns the invoice id, or
 * null if there was nothing to bill. Everything happens in one transaction
 * with an advisory lock so two admins can't hand out the same number.
 */
export async function createInvoiceForPilot(pilotId: string, createdBy: string): Promise<string | null> {
	return db.transaction().execute(async (trx) => {
		await sql`select pg_advisory_xact_lock(hashtext('cirkus.invoice_number'))`.execute(trx);

		const flights = await trx
			.selectFrom('flight_log_entries as f')
			.innerJoin('aircraft', 'aircraft.id', 'f.aircraft_id')
			.select([
				'f.id',
				'f.aircraft_id',
				'f.block_off_at',
				'f.flight_hours',
				'f.billing_basis',
				'f.departure_airport_code',
				'f.arrival_airport_code',
				'aircraft.tail_number',
				'aircraft.member_rate_per_hour'
			])
			.where('f.pilot_id', '=', pilotId)
			.where('f.status', '=', 'submitted')
			.orderBy('f.block_off_at', 'asc')
			.execute();

		if (flights.length === 0) return null;

		const now = new Date();
		const year = now.getUTCFullYear();
		const last = await trx
			.selectFrom('invoices')
			.select(sql<number>`coalesce(max(invoice_seq), 0)`.as('seq'))
			.where('invoice_year', '=', year)
			.executeTakeFirstOrThrow();

		const periodStart = formatUtcDate(new Date(flights[0].block_off_at));
		const periodEnd = formatUtcDate(new Date(flights[flights.length - 1].block_off_at));
		const due = new Date(now.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000);

		const invoice = await trx
			.insertInto('invoices')
			.values({
				invoice_year: year,
				invoice_seq: last.seq + 1,
				pilot_id: pilotId,
				period_start: periodStart,
				period_end: periodEnd,
				due_date: formatUtcDate(due),
				created_by: createdBy
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		await trx
			.insertInto('invoice_line_items')
			.values(
				flights.map((f) => ({
					invoice_id: invoice.id,
					flight_log_id: f.id,
					aircraft_id: f.aircraft_id,
					hours_billed: f.flight_hours,
					rate_applied: f.member_rate_per_hour,
					description: `${formatUtcDate(new Date(f.block_off_at))} ${f.tail_number} ${f.departure_airport_code}→${f.arrival_airport_code} · ${Number(f.flight_hours).toFixed(2)} h ${billingLabel(f.billing_basis)}`
				}))
			)
			.execute();

		// Mark the flights billed — and insist every one of them still was
		// 'submitted', so a flight billed concurrently can't be billed twice.
		const marked = await trx
			.updateTable('flight_log_entries')
			.set({ status: 'billed', updated_at: now.toISOString() })
			.where(
				'id',
				'in',
				flights.map((f) => f.id)
			)
			.where('status', '=', 'submitted')
			.executeTakeFirst();
		if (Number(marked.numUpdatedRows) !== flights.length) {
			throw new Error('A flight changed status while the invoice was being created — nothing was saved. Try again.');
		}

		await trx
			.updateTable('invoices')
			.set({
				subtotal: sql`(select coalesce(sum(amount), 0) from invoice_line_items where invoice_id = ${invoice.id})`,
				total_amount: sql`(select coalesce(sum(amount), 0) from invoice_line_items where invoice_id = ${invoice.id})`
			})
			.where('id', '=', invoice.id)
			.execute();

		return invoice.id;
	});
}

/**
 * Cancels an invoice that never reached Procountor (draft or error) and
 * releases its flights to be billed again. Lines are kept for the record.
 * Anything already in Procountor is reversed there, by the bookkeeper.
 */
export async function cancelInvoice(invoiceId: string): Promise<boolean> {
	return db.transaction().execute(async (trx) => {
		const r = await trx
			.updateTable('invoices')
			.set({ status: 'cancelled', cancelled_at: new Date().toISOString() })
			.where('id', '=', invoiceId)
			.where('status', 'in', ['draft', 'error'])
			.executeTakeFirst();
		if (Number(r.numUpdatedRows) !== 1) return false;

		await trx
			.updateTable('flight_log_entries')
			.set({ status: 'submitted', updated_at: new Date().toISOString() })
			.where('id', 'in', (eb) =>
				eb.selectFrom('invoice_line_items').select('flight_log_id').where('invoice_id', '=', invoiceId)
			)
			.where('status', '=', 'billed')
			.execute();
		return true;
	});
}

/**
 * Pushes a draft/error invoice into Procountor: create, then send. On
 * success the invoice is 'sent' with Procountor's id, number and bank
 * reference; on failure it is 'error' with the message, flights untouched.
 * Returns the resulting status. A pilot without a Procountor customer
 * link leaves the invoice a draft with an explanatory last_error.
 */
export async function pushInvoice(invoiceId: string): Promise<InvoiceStatus> {
	const inv = await db
		.selectFrom('invoices')
		.innerJoin('users', 'users.id', 'invoices.pilot_id')
		.select(['invoices.id', 'invoices.status', 'invoices.invoice_number', 'invoices.issued_at', 'invoices.due_date', 'users.procountor_partner_id', 'users.name'])
		.where('invoices.id', '=', invoiceId)
		.executeTakeFirst();
	if (!inv || (inv.status !== 'draft' && inv.status !== 'error')) return inv?.status ?? 'error';

	const stamp = (patch: Record<string, unknown>) =>
		db.updateTable('invoices').set(patch).where('id', '=', invoiceId).execute();

	if (!procountor.isConfigured()) {
		await stamp({ last_error: 'Procountor is not configured on this server.' });
		return 'draft';
	}
	if (!inv.procountor_partner_id) {
		await stamp({ status: 'draft', last_error: `${inv.name} is not linked to a Procountor customer — link them under Accounts, then retry.` });
		return 'draft';
	}

	const lines = await db
		.selectFrom('invoice_line_items as l')
		.innerJoin('flight_log_entries as f', 'f.id', 'l.flight_log_id')
		.innerJoin('flight_types as t', 't.id', 'f.flight_type_id')
		.select(['l.description', 'l.hours_billed', 'l.rate_applied', 't.account'])
		.where('l.invoice_id', '=', invoiceId)
		.orderBy('f.block_off_at', 'asc')
		.execute();

	try {
		const created = await procountor.createInvoice({
			partnerId: inv.procountor_partner_id,
			date: formatUtcDate(new Date(inv.issued_at)),
			dueDate: formatUtcDate(new Date(inv.due_date)),
			referenceText: `Cirkus ${inv.invoice_number}`,
			rows: lines.map((l) => ({
				product: l.description ?? 'Flight',
				quantity: Number(l.hours_billed),
				unit: 'h',
				unitPrice: net(Number(l.rate_applied)),
				vatPercent: VAT_PERCENT,
				account: l.account
			}))
		});
		await stamp({ procountor_id: created.id, procountor_number: created.invoiceNumber, procountor_reference: created.referenceNumber, procountor_status: created.status });
		await procountor.sendInvoice(created.id);
		const after = await procountor.getInvoice(created.id);
		await stamp({
			status: 'sent',
			sent_at: new Date().toISOString(),
			synced_at: new Date().toISOString(),
			procountor_number: after.invoiceNumber ?? created.invoiceNumber,
			procountor_reference: after.referenceNumber ?? created.referenceNumber,
			procountor_status: after.status,
			last_error: null
		});
		return 'sent';
	} catch (err) {
		await stamp({ status: 'error', last_error: err instanceof Error ? err.message : String(err) });
		return 'error';
	}
}

/**
 * Asks Procountor about every 'sent' invoice and marks the paid ones paid.
 * Returns how many changed. Throttled by the callers (pages: 15 min;
 * the hourly /internal/sync: always).
 */
export async function syncInvoiceStatuses(): Promise<{ checked: number; paid: number; errors: number }> {
	if (!procountor.isConfigured()) return { checked: 0, paid: 0, errors: 0 };
	const open = await db
		.selectFrom('invoices')
		.select(['id', 'procountor_id'])
		.where('status', '=', 'sent')
		.where('procountor_id', 'is not', null)
		.execute();
	let paid = 0;
	let errors = 0;
	for (const inv of open) {
		try {
			const remote = await procountor.getInvoice(inv.procountor_id!);
			const patch: Record<string, unknown> = {
				procountor_status: remote.status,
				procountor_number: remote.invoiceNumber,
				procountor_reference: remote.referenceNumber,
				synced_at: new Date().toISOString()
			};
			if (procountor.isPaidStatus(remote.status)) {
				patch.status = 'paid';
				patch.paid_at = remote.paymentDate ? new Date(remote.paymentDate).toISOString() : new Date().toISOString();
				paid++;
			}
			await db.updateTable('invoices').set(patch).where('id', '=', inv.id).execute();
		} catch {
			errors++;
		}
	}
	return { checked: open.length, paid, errors };
}

let lastSync = 0;
/** The page-open variant: at most once per 15 minutes. */
export async function syncIfStale(): Promise<void> {
	if (Date.now() - lastSync < 15 * 60 * 1000) return;
	lastSync = Date.now();
	await syncInvoiceStatuses();
}
