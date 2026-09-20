import { describe, expect, it } from 'vitest';
import { parseCsv, readTasksCsv, tasksCsvTemplate } from './csv';
import { validateTask } from './tasks';

describe('validateTask', () => {
	it('accepts a plain ICA task and normalises the code', () => {
		const r = validateTask({ code: ' insp-100h ', title: '100 h', source: 'ICA', interval_hours: '100', interval_months: '12', tolerance_hours: '10' });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.values.code).toBe('INSP-100H');
			expect(r.values.interval_hours).toBe(100);
			expect(r.values.interval_landings).toBeNull();
			expect(r.values.tolerance_hours).toBe(10);
			expect(r.values.reset_rule).toBe('from_original');
			expect(r.values.anchor_kind).toBe('last_compliance');
		}
	});
	it('forces zero tolerance on ALS and AD with a note, never an error', () => {
		const r = validateTask({ code: 'CAPS', title: 'x', source: 'als', interval_months: '120', tolerance_days: '30' });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.values.tolerance_days).toBe(0);
			expect(r.notes[0]).toMatch(/tolerance set to 0/);
		}
	});
	it('refuses what the check constraints would refuse, in words', () => {
		expect(validateTask({ code: 'x', title: 'x', source: 'ica', interval_hours: '1' })).toMatchObject({ ok: false, error: expect.stringMatching(/code/) });
		expect(validateTask({ code: 'AB', title: '', source: 'ica', interval_hours: '1' })).toMatchObject({ ok: false, error: expect.stringMatching(/title/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'xyz', interval_hours: '1' })).toMatchObject({ ok: false, error: expect.stringMatching(/Source/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ica' })).toMatchObject({ ok: false, error: expect.stringMatching(/at least one interval/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ica', interval_hours: '0' })).toMatchObject({ ok: false, error: expect.stringMatching(/greater than zero/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ica', interval_months: '1.5' })).toMatchObject({ ok: false, error: expect.stringMatching(/whole number/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ad', interval_hours: '50', anchor_kind: 'fixed' })).toMatchObject({ ok: false, error: expect.stringMatching(/fixed anchor/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ad', interval_hours: '50', anchor_kind: 'fixed', anchor_date: '2026-13-01' })).toMatchObject({ ok: false, error: expect.stringMatching(/date/) });
		expect(validateTask({ code: 'AB', title: 'x', source: 'ica', interval_hours: '1', one_time: 'maybe' })).toMatchObject({ ok: false, error: expect.stringMatching(/yes or no/) });
	});
	it('allows a one-time task without an interval and a decimal comma', () => {
		const r = validateTask({ code: 'AD-1', title: 'x', source: 'ad', one_time: 'yes', anchor_kind: 'fixed', anchor_date: '2026-01-01', interval_hours: '12,5' });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.values.interval_hours).toBe(12.5);
	});
});

describe('csv', () => {
	it('parses quotes, escaped quotes, CRLF and a BOM', () => {
		const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\n\n2,,\n');
		expect(rows).toEqual([
			['a', 'b', 'c'],
			['1', 'x, y', 'say "hi"'],
			['2', '', '']
		]);
	});
	it('reads the template back', () => {
		const r = readTasksCsv(tasksCsvTemplate());
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.tasks.map((t) => t.code)).toEqual(['INSP-100H', 'CAPS-REPACK', 'OIL-50H']);
			expect(r.tasks[2].pilot_owner_allowed).toBe(true);
			expect(r.tasks[2].reset_rule).toBe('from_actual');
		}
	});
	it('names the row that fails and refuses duplicates and missing headers', () => {
		expect(readTasksCsv('title\nx')).toMatchObject({ ok: false, error: expect.stringMatching(/header row/) });
		expect(readTasksCsv('code,title,source\n')).toMatchObject({ ok: false, error: expect.stringMatching(/no tasks/) });
		expect(readTasksCsv('code,title,source,interval_hours\nA1,x,ica,100\nB2,y,ica,')).toMatchObject({ ok: false, error: expect.stringMatching(/^Row 3: /) });
		expect(readTasksCsv('code,title,source,interval_hours\nA1,x,ica,100\na1,y,ica,50')).toMatchObject({ ok: false, error: expect.stringMatching(/appears twice/) });
	});
	it('takes columns in any order and case', () => {
		const r = readTasksCsv('Title,CODE,Source,Interval Months\nCAPS repack,caps-repack,als,120');
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.tasks[0]).toMatchObject({ code: 'CAPS-REPACK', interval_months: 120, source: 'als' });
	});
});
