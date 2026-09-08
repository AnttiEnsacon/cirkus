import { sql } from 'kysely';
import { db } from './db';
import { formatUtcDate } from './time';

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
	tacho: string;
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
			'f.tacho_start',
			'f.tacho_end',
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
		tacho: `${r.tacho_start} → ${r.tacho_end}`,
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
					description: `${formatUtcDate(new Date(f.block_off_at))} ${f.tail_number} ${f.departure_airport_code}→${f.arrival_airport_code}`
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

/** Marks an issued invoice paid. */
export async function markInvoicePaid(invoiceId: string, reference: string | null): Promise<boolean> {
	const r = await db
		.updateTable('invoices')
		.set({ status: 'paid', paid_at: new Date().toISOString(), paid_reference: reference })
		.where('id', '=', invoiceId)
		.where('status', '=', 'issued')
		.executeTakeFirst();
	return Number(r.numUpdatedRows) === 1;
}

/** Cancels an issued invoice and releases its flights to be billed again. Lines are kept for the record. */
export async function cancelInvoice(invoiceId: string): Promise<boolean> {
	return db.transaction().execute(async (trx) => {
		const r = await trx
			.updateTable('invoices')
			.set({ status: 'cancelled', cancelled_at: new Date().toISOString() })
			.where('id', '=', invoiceId)
			.where('status', '=', 'issued')
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
