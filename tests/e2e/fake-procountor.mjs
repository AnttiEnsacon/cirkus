// A stand-in for Procountor's REST API, for the Playwright flows: the five
// calls src/lib/server/procountor.ts makes, backed by an in-memory store,
// plus test hooks under /_test. Started by playwright.config.ts on port 3199.
//
//   node tests/e2e/fake-procountor.mjs         (PORT overrides 3199)
//
// Hooks:  POST /_test/pay/:id        mark invoice :id paid
//         POST /_test/fail-next/:n   make the next n POST /invoices fail (422)
//         POST /_test/reset          forget everything
//         GET  /_test/invoices       what has been created, for assertions
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3199);

const partners = [
	{ id: 1001, name: 'Juha Valkonen', email: 'juha.valkonen@kmlaviation.fi', customerNumber: 'C-0017' },
	{ id: 1002, name: 'Antti Hänninen', email: 'antti.hanninen@kmlaviation.fi', customerNumber: 'C-0001' },
	{ id: 1003, name: 'Valkonen Oy', email: 'laskut@valkonen.example', customerNumber: 'C-0042' }
];

let invoices = new Map();
let nextId = 5001;
let nextNumber = 10023;
let failNext = 0;
let calls = [];

const json = (res, status, body) => {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(body === undefined ? '' : JSON.stringify(body));
};
const readJson = (req) =>
	new Promise((resolve) => {
		let data = '';
		req.on('data', (c) => (data += c));
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				resolve({});
			}
		});
	});
const bankReference = (n) => {
	// Finnish reference number: base digits + 7-3-1 check digit.
	const digits = String(n);
	let sum = 0;
	const w = [7, 3, 1];
	for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * w[i % 3];
	return `${digits}${(10 - (sum % 10)) % 10}`;
};

http
	.createServer(async (req, res) => {
		const url = new URL(req.url, `http://localhost:${PORT}`);
		const path = url.pathname.replace(/^\/api/, '');
		calls.push(`${req.method} ${path}`);

		// ---- test hooks ----
		if (path === '/_test/reset' && req.method === 'POST') {
			invoices = new Map();
			nextId = 5001;
			nextNumber = 10023;
			failNext = 0;
			calls = [];
			return json(res, 200, { ok: true });
		}
		if (path === '/_test/invoices') return json(res, 200, { invoices: [...invoices.values()], calls });
		let m = path.match(/^\/_test\/pay\/(\d+)$/);
		if (m && req.method === 'POST') {
			const inv = invoices.get(Number(m[1]));
			if (!inv) return json(res, 404, { error: 'no such invoice' });
			inv.status = 'PAID';
			inv.paymentDate = new Date().toISOString().slice(0, 10);
			return json(res, 200, inv);
		}
		m = path.match(/^\/_test\/fail-next\/(\d+)$/);
		if (m && req.method === 'POST') {
			failNext = Number(m[1]);
			return json(res, 200, { failNext });
		}

		// ---- OAuth ----
		if (path === '/oauth/token' && req.method === 'POST') {
			return json(res, 200, { access_token: 'fake-token', token_type: 'bearer', expires_in: 3600 });
		}
		if (req.headers.authorization !== 'Bearer fake-token') return json(res, 401, { message: 'Unauthorized' });

		// ---- business partners ----
		if (path === '/businesspartners' && req.method === 'GET') {
			const q = (url.searchParams.get('search') ?? '').toLowerCase();
			const results = partners.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
			return json(res, 200, { results, meta: { pageNumber: 0, pageSize: 100, resultCount: results.length } });
		}

		// ---- invoices ----
		if (path === '/invoices' && req.method === 'POST') {
			const body = await readJson(req);
			if (failNext > 0) {
				failNext--;
				return json(res, 422, { errors: [{ field: 'invoiceRows', message: 'Simulated validation error: accounting account 3210 not found' }] });
			}
			const partner = partners.find((p) => p.id === body.counterParty?.identifier?.id);
			if (!partner) return json(res, 422, { errors: [{ field: 'counterParty', message: 'Business partner not found' }] });
			if (!Array.isArray(body.invoiceRows) || body.invoiceRows.length === 0) {
				return json(res, 422, { errors: [{ field: 'invoiceRows', message: 'At least one row is required' }] });
			}
			const id = nextId++;
			const number = nextNumber++;
			const inv = {
				id,
				type: 'SALES_INVOICE',
				status: 'UNFINISHED',
				invoiceNumber: number,
				date: body.date,
				counterParty: { identifier: { type: 'BUSINESS_PARTNER_ID', id: partner.id }, name: partner.name, email: partner.email },
				paymentInfo: { ...body.paymentInfo, bankReferenceCode: bankReference(number) },
				invoiceChannel: body.invoiceChannel,
				invoiceRows: body.invoiceRows,
				additionalInformation: body.additionalInformation,
				paymentDate: null,
				sent: false
			};
			invoices.set(id, inv);
			return json(res, 200, inv);
		}
		m = path.match(/^\/invoices\/(\d+)\/send$/);
		if (m && req.method === 'POST') {
			const inv = invoices.get(Number(m[1]));
			if (!inv) return json(res, 404, { message: 'Invoice not found' });
			inv.status = 'SENT';
			inv.sent = true;
			return json(res, 204);
		}
		m = path.match(/^\/invoices\/(\d+)$/);
		if (m && req.method === 'GET') {
			const inv = invoices.get(Number(m[1]));
			if (!inv) return json(res, 404, { message: 'Invoice not found' });
			return json(res, 200, inv);
		}

		json(res, 404, { message: `fake procountor: no route for ${req.method} ${path}` });
	})
	.listen(PORT, () => console.log(`fake procountor on http://localhost:${PORT}/api`));
