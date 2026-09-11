/**
 * Procountor REST client — the five calls Cirkus needs, over fetch.
 *
 * Configured by env: PROCOUNTOR_BASE_URL (test: https://pts-api.procountor.com/api,
 * production: https://api.procountor.com/api), PROCOUNTOR_CLIENT_ID,
 * PROCOUNTOR_CLIENT_SECRET and, for the client-credentials flow with an
 * "API login only" user, PROCOUNTOR_API_KEY. Without a base URL the
 * integration is off: isConfigured() is false and invoices stay drafts.
 *
 * Request shapes follow dev.procountor.com; the send endpoint, the status
 * values and the partner search parameters are confirmed against the test
 * environment (see README, Procountor). Nothing here retries: the caller
 * decides, and every outcome lands in the activity log.
 */

const BASE = process.env.PROCOUNTOR_BASE_URL?.replace(/\/$/, '') ?? '';
const CLIENT_ID = process.env.PROCOUNTOR_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.PROCOUNTOR_CLIENT_SECRET ?? '';
const API_KEY = process.env.PROCOUNTOR_API_KEY ?? '';

export function isConfigured(): boolean {
	return Boolean(BASE && CLIENT_ID && CLIENT_SECRET);
}

export class ProcountorError extends Error {
	constructor(
		message: string,
		public status?: number
	) {
		super(message);
		this.name = 'ProcountorError';
	}
}

// ---- token ----
let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
	if (token && token.expiresAt > Date.now() + 60_000) return token.value;
	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: CLIENT_ID,
		client_secret: CLIENT_SECRET
	});
	if (API_KEY) body.set('api_key', API_KEY);
	const res = await fetch(`${BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) throw new ProcountorError(`Procountor login failed (${res.status})`, res.status);
	const json = (await res.json()) as { access_token: string; expires_in?: number };
	token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
	return token.value;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
	if (!isConfigured()) throw new ProcountorError('Procountor is not configured.');
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${await accessToken()}`,
			Accept: 'application/json',
			...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
		},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	if (res.status === 401) token = null; // expired early or revoked; next call logs in again
	if (!res.ok) {
		let detail = '';
		try {
			const j = (await res.json()) as { errors?: { message?: string }[]; message?: string };
			detail = j.errors?.map((e) => e.message).filter(Boolean).join('; ') || j.message || '';
		} catch {
			detail = '';
		}
		throw new ProcountorError(`Procountor ${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

// ---- business partners (customers) ----
export interface Partner {
	id: number;
	name: string;
	email: string | null;
	customerNumber: string | null;
}

/** Customers whose name or email matches — for the Accounts page's Find button. */
export async function findPartners(query: string): Promise<Partner[]> {
	const json = await call<{ results?: Array<{ id: number; name?: string; email?: string; customerNumber?: string }> }>(
		'GET',
		`/businesspartners?type=CUSTOMER&search=${encodeURIComponent(query)}`
	);
	return (json.results ?? []).map((p) => ({
		id: p.id,
		name: p.name ?? '',
		email: p.email ?? null,
		customerNumber: p.customerNumber ?? null
	}));
}

// ---- invoices ----
export interface InvoiceRowInput {
	product: string;
	quantity: number;
	unit: string;
	/** Net unit price (VAT excluded). */
	unitPrice: number;
	vatPercent: number;
	/** Bookkeeping (sales) account, e.g. 3210. */
	account?: string | null;
}

export interface CreateInvoiceInput {
	partnerId: number;
	date: string; // YYYY-MM-DD
	dueDate: string; // YYYY-MM-DD
	referenceText: string; // shown on the invoice: Cirkus number
	rows: InvoiceRowInput[];
}

export interface ProcountorInvoice {
	id: number;
	invoiceNumber: string | null;
	referenceNumber: string | null;
	status: string;
	paymentDate: string | null;
}

function toInvoice(j: Record<string, unknown>): ProcountorInvoice {
	const paymentInfo = (j.paymentInfo ?? {}) as Record<string, unknown>;
	return {
		id: Number(j.id),
		invoiceNumber: j.invoiceNumber != null ? String(j.invoiceNumber) : null,
		referenceNumber: (paymentInfo.bankReferenceCode as string | undefined) ?? null,
		status: String(j.status ?? ''),
		paymentDate: (j.paymentDate as string | undefined) ?? null
	};
}

/** POST /invoices — an unfinished sales invoice for the partner. */
export async function createInvoice(input: CreateInvoiceInput): Promise<ProcountorInvoice> {
	const payload = {
		type: 'SALES_INVOICE',
		status: 'UNFINISHED',
		date: input.date,
		counterParty: { identifier: { type: 'BUSINESS_PARTNER_ID', id: input.partnerId } },
		paymentInfo: { paymentMethod: 'BANK_TRANSFER', currency: 'EUR', dueDate: input.dueDate },
		invoiceChannel: 'EMAIL',
		language: 'FINNISH',
		vatStatus: 1,
		additionalInformation: input.referenceText,
		invoiceRows: input.rows.map((r) => ({
			product: r.product,
			quantity: r.quantity,
			unit: r.unit,
			unitPrice: r.unitPrice,
			vatPercent: r.vatPercent,
			...(r.account ? { accountingAccount: r.account } : {})
		}))
	};
	return toInvoice(await call<Record<string, unknown>>('POST', '/invoices', payload));
}

/** Ask Procountor to send the invoice through the channel it was created with. */
export async function sendInvoice(id: number): Promise<void> {
	await call<void>('POST', `/invoices/${id}/send`, {});
}

export async function getInvoice(id: number): Promise<ProcountorInvoice> {
	return toInvoice(await call<Record<string, unknown>>('GET', `/invoices/${id}`));
}

/** Procountor statuses that mean "the pilot has paid". */
export function isPaidStatus(status: string): boolean {
	return status === 'PAID' || status === 'PAYMENT_TRANSFERRED' || status === 'MARKED_PAID';
}
