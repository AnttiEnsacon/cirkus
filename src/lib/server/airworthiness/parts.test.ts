import { describe, expect, it } from 'vitest';
import { canonical, formatParts, parseParts, sha256 } from './parts';

describe('parseParts', () => {
	it('reads the four cells with any of the separators and sensible defaults', () => {
		const r = parseParts('6314 · B5678 · 1 · 8130-3 ref\n654301 ; — ; 2\nAN3-5A | - | | \n');
		expect(r).toEqual({
			ok: true,
			parts: [
				{ part_number: '6314', serial_number: 'B5678', quantity: 1, traceability: '8130-3 ref' },
				{ part_number: '654301', serial_number: null, quantity: 2, traceability: null },
				{ part_number: 'AN3-5A', serial_number: null, quantity: 1, traceability: null }
			]
		});
	});
	it('names the line that is wrong', () => {
		expect(parseParts('6314 · B5678 · 1\n · x · 1')).toMatchObject({ ok: false, error: expect.stringMatching(/line 2: the part number/) });
		expect(parseParts('6314 · B5678 · zero')).toMatchObject({ ok: false, error: expect.stringMatching(/line 1: the quantity/) });
		expect(parseParts('6314 · B5678 · 0')).toMatchObject({ ok: false, error: expect.stringMatching(/quantity/) });
	});
	it('an empty box is no parts', () => {
		expect(parseParts('  \n')).toEqual({ ok: true, parts: [] });
	});
	it('round-trips through the form text', () => {
		const text = '6314 · B5678 · 1 · 8130-3 ref\n654301 · — · 2 · —';
		const r = parseParts(text);
		expect(r.ok && formatParts(r.parts)).toBe(text);
	});
});

describe('canonical hash', () => {
	it('does not depend on key order or nesting order of keys', () => {
		const a = canonical({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } });
		const b = canonical({ a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 });
		expect(a).toBe(b);
		expect(a).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}');
	});
	it('does depend on array order and values', () => {
		expect(sha256(canonical([1, 2]))).not.toBe(sha256(canonical([2, 1])));
		expect(sha256('x')).toHaveLength(64);
	});
});
