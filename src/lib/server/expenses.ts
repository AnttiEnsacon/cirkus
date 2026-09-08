import { error } from '@sveltejs/kit';
import { db } from './db';
import { formatUtcDate } from './time';
import { MAX_UPLOAD_BYTES, normalizeReceiptImage, type StoredImage } from './images';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const money = (s: string) => Number(Number(s).toFixed(2));

export interface ExpenseLineValues {
	category_id: string;
	amount: number;
	description: string | null;
}

export interface ExpenseValues {
	receipt_date: string;
	vendor: string;
	total_amount: number;
	notes: string | null;
	lines: ExpenseLineValues[];
}

/** Active categories for the form, in the club's order. */
export function activeCategories() {
	return db
		.selectFrom('expense_categories')
		.select(['id', 'code', 'label'])
		.where('is_active', '=', true)
		.orderBy('sort_order', 'asc')
		.execute();
}

/**
 * Parses and validates the receipt form. Lines arrive as parallel fields
 * `line_category[]`, `line_amount[]`, `line_description[]`; empty rows are
 * ignored. The lines must add up to the receipt total.
 */
export async function parseExpenseForm(
	form: FormData
): Promise<{ ok: true; values: ExpenseValues } | { ok: false; error: string }> {
	const str = (k: string) => String(form.get(k) ?? '').trim();
	const receipt_date = str('receipt_date');
	const vendor = str('vendor');
	const totalRaw = str('total_amount').replace(',', '.');
	const notes = str('notes') || null;

	if (!YMD.test(receipt_date)) return { ok: false, error: 'Enter the receipt date.' };
	if (receipt_date > formatUtcDate(new Date())) return { ok: false, error: 'The receipt date cannot be in the future.' };
	if (!vendor) return { ok: false, error: 'Enter where you bought it.' };
	const total_amount = money(totalRaw);
	if (!totalRaw || !Number.isFinite(total_amount) || total_amount <= 0) return { ok: false, error: 'Enter the receipt total.' };

	const cats = form.getAll('line_category').map(String);
	const amts = form.getAll('line_amount').map((v) => String(v).trim().replace(',', '.'));
	const descs = form.getAll('line_description').map((v) => String(v).trim());
	const active = new Set((await activeCategories()).map((c) => c.id));

	const lines: ExpenseLineValues[] = [];
	for (let i = 0; i < Math.max(cats.length, amts.length); i++) {
		const category_id = cats[i] ?? '';
		const amountRaw = amts[i] ?? '';
		if (!category_id && !amountRaw) continue; // an untouched extra row
		if (!category_id || !active.has(category_id)) return { ok: false, error: `Choose a category on line ${i + 1}.` };
		const amount = money(amountRaw);
		if (!amountRaw || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: `Enter the amount on line ${i + 1}.` };
		lines.push({ category_id, amount, description: descs[i] || null });
	}
	if (lines.length === 0) return { ok: false, error: 'Add at least one line: what the receipt was for.' };

	const sum = money(String(lines.reduce((a, l) => a + l.amount, 0)));
	if (sum !== total_amount) {
		return { ok: false, error: `The lines add up to €${sum.toFixed(2)} but the receipt total is €${total_amount.toFixed(2)}.` };
	}

	return { ok: true, values: { receipt_date, vendor, total_amount, notes, lines } };
}

/**
 * Reads the uploaded photos from the form and normalises them. Returns the
 * images to store, or an error message. Empty file inputs (no file chosen)
 * are skipped.
 */
export async function parseUploadedImages(form: FormData): Promise<{ ok: true; images: StoredImage[] } | { ok: false; error: string }> {
	const images: StoredImage[] = [];
	for (const entry of form.getAll('photos')) {
		if (!(entry instanceof File) || entry.size === 0) continue;
		if (entry.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${entry.name} is larger than 10 MB.` };
		try {
			images.push(await normalizeReceiptImage(Buffer.from(await entry.arrayBuffer())));
		} catch {
			return { ok: false, error: `${entry.name} is not an image we can read.` };
		}
	}
	return { ok: true, images };
}

/** The expense with its owner's name, or a 404. */
export async function loadExpense(id: string) {
	const e = await db
		.selectFrom('expenses as e')
		.innerJoin('users', 'users.id', 'e.user_id')
		.selectAll('e')
		.select('users.name as pilot_name')
		.where('e.id', '=', id)
		.executeTakeFirst();
	if (!e) throw error(404, 'Receipt not found');
	return e;
}

/** Own receipt, or any as admin — else 403. */
export function assertCanSee(e: { user_id: string }, me: { id: string; role: string }) {
	if (e.user_id !== me.id && me.role !== 'admin') throw error(403, 'Not allowed');
}

/** Editable while not paid, by the owner or an admin. */
export function canEdit(e: { user_id: string; status: string }, me: { id: string; role: string }) {
	return (e.user_id === me.id || me.role === 'admin') && e.status !== 'paid';
}

export async function loadLines(expenseId: string) {
	return db
		.selectFrom('expense_lines as l')
		.innerJoin('expense_categories as c', 'c.id', 'l.category_id')
		.select(['l.id', 'l.category_id', 'l.amount', 'l.description', 'c.code', 'c.label'])
		.where('l.expense_id', '=', expenseId)
		.orderBy('l.position', 'asc')
		.execute();
}

export async function loadImageIds(expenseId: string) {
	return db
		.selectFrom('receipt_images')
		.select(['id', 'width', 'height'])
		.where('expense_id', '=', expenseId)
		.orderBy('created_at', 'asc')
		.execute();
}

/** Lines as a one-line summary: "Öljy 45.00 · Tarvikkeet 12.50". */
export function linesSummary(lines: { label: string; amount: string }[]) {
	return lines.map((l) => `${l.label} ${Number(l.amount).toFixed(2)}`).join(' · ');
}

/** The posted lines, re-shown after a failed submit. */
export function postedLines(form: FormData) {
	const cats = form.getAll('line_category').map(String);
	const amts = form.getAll('line_amount').map(String);
	const descs = form.getAll('line_description').map(String);
	return cats.map((category_id, i) => ({ category_id, amount: amts[i] ?? '', description: descs[i] ?? '' }));
}
