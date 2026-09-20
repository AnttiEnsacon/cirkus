import { createHash } from 'node:crypto';
import type { MxPartUsed } from '../db';

/**
 * Pure helpers for work orders (Phase 16): the parts-used lines a
 * mechanic's report is typed from, and the canonical hash that seals a
 * released order.
 */

/**
 * One part per line: `part number · serial · quantity · traceability`.
 * Separators may be `·`, `;` or `|`; a serial of `-`, `—` or nothing is
 * none; quantity defaults to 1; traceability is optional.
 */
export function parseParts(text: string): { ok: true; parts: MxPartUsed[] } | { ok: false; error: string } {
	const parts: MxPartUsed[] = [];
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	for (const [i, line] of lines.entries()) {
		const cells = line.split(/\s*[·;|]\s*/).map((c) => c.trim());
		const part_number = cells[0] ?? '';
		if (!part_number) return { ok: false, error: `Parts line ${i + 1}: the part number is missing.` };
		const serialRaw = cells[1] ?? '';
		const serial_number = ['', '-', '—', '–', 'n/a', 'N/A'].includes(serialRaw) ? null : serialRaw;
		const qtyRaw = (cells[2] ?? '').replace(',', '.');
		const quantity = qtyRaw === '' ? 1 : Number(qtyRaw);
		if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: `Parts line ${i + 1}: the quantity must be a positive number.` };
		const traceRaw = cells[3] ?? '';
		const traceability = ['', '-', '—', '–'].includes(traceRaw) ? null : traceRaw;
		parts.push({ part_number, serial_number, quantity, traceability });
	}
	return { ok: true, parts };
}

/** The inverse, for the form: one line per part. */
export function formatParts(parts: MxPartUsed[]): string {
	return parts.map((p) => [p.part_number, p.serial_number ?? '—', String(p.quantity), p.traceability ?? '—'].join(' · ')).join('\n');
}

/** JSON with keys sorted at every level, so the same record always hashes the same. */
export function canonical(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sortKeys);
	if (v && typeof v === 'object') {
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortKeys((v as Record<string, unknown>)[k]);
		return out;
	}
	return v;
}

export function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
