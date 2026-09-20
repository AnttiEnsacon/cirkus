import { db, type MxAmpBasis, type MxHoursSource } from '../db';

/** The profile form: validated into the columns to store. */
export interface ProfileValues {
	msn: string | null;
	year_built: number | null;
	mtow_kg: number | null;
	hours_source: MxHoursSource;
	baseline_at: string;
	baseline_hours: number;
	baseline_landings: number;
	amp_basis: MxAmpBasis;
	amp_reference: string | null;
	amp_declared_at: string | null;
	amp_reviewed_at: string | null;
	warn_hours: number;
	warn_days: number;
	warn_landings: number;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseProfileForm(
	form: FormData,
	aircraft: { records_tacho: boolean },
	opts: { baselineLocked: boolean; current: { baseline_at: string; baseline_hours: string | number; baseline_landings: number } }
): { ok: true; values: ProfileValues } | { ok: false; error: string } {
	const str = (k: string) => String(form.get(k) ?? '').trim();
	const num = (k: string) => (str(k) === '' ? null : Number(str(k).replace(',', '.')));
	const date = (k: string) => {
		const s = str(k);
		if (s === '') return null;
		return YMD.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) ? s : undefined;
	};

	const hours_source = str('hours_source') as MxHoursSource;
	if (!['tacho', 'block', 'airborne'].includes(hours_source)) return { ok: false, error: 'Choose which figure feeds airframe hours.' };
	if (hours_source === 'tacho' && !aircraft.records_tacho) return { ok: false, error: 'This aircraft does not record Tacho readings (see Fleet) — choose block or airborne time.' };
	const amp_basis = str('amp_basis') as MxAmpBasis;
	if (!['ica', 'mip'].includes(amp_basis)) return { ok: false, error: 'Choose the programme basis.' };

	let baseline_at: string;
	let baseline_hours: number;
	let baseline_landings: number;
	if (opts.baselineLocked) {
		baseline_at = opts.current.baseline_at;
		baseline_hours = Number(opts.current.baseline_hours);
		baseline_landings = opts.current.baseline_landings;
	} else {
		const d = date('baseline_at');
		if (!d) return { ok: false, error: 'Enter the baseline date (YYYY-MM-DD).' };
		baseline_at = d;
		const h = num('baseline_hours');
		if (h === null || !Number.isFinite(h) || h < 0) return { ok: false, error: 'Baseline hours must be a number, 0 or more.' };
		baseline_hours = Math.round(h * 10) / 10;
		const l = num('baseline_landings') ?? 0;
		if (!Number.isInteger(l) || l < 0) return { ok: false, error: 'Baseline landings must be a whole number, 0 or more.' };
		baseline_landings = l;
	}

	const year_built = num('year_built');
	if (year_built !== null && (!Number.isInteger(year_built) || year_built < 1900 || year_built > 2100)) return { ok: false, error: 'Year built must be a four-digit year.' };
	const mtow_kg = num('mtow_kg');
	if (mtow_kg !== null && (!Number.isInteger(mtow_kg) || mtow_kg <= 0)) return { ok: false, error: 'MTOW must be a whole number of kilograms.' };
	const amp_declared_at = date('amp_declared_at');
	if (amp_declared_at === undefined) return { ok: false, error: 'The declaration date must be YYYY-MM-DD.' };
	const amp_reviewed_at = date('amp_reviewed_at');
	if (amp_reviewed_at === undefined) return { ok: false, error: 'The review date must be YYYY-MM-DD.' };
	const warn_hours = num('warn_hours') ?? 10;
	const warn_days = num('warn_days') ?? 30;
	const warn_landings = num('warn_landings') ?? 25;
	if (!Number.isFinite(warn_hours) || warn_hours < 0 || !Number.isInteger(warn_days) || warn_days < 0 || !Number.isInteger(warn_landings) || warn_landings < 0) {
		return { ok: false, error: 'The warning thresholds must be 0 or more (days and landings whole numbers).' };
	}

	return {
		ok: true,
		values: {
			msn: str('msn') || null,
			year_built,
			mtow_kg,
			hours_source,
			baseline_at,
			baseline_hours,
			baseline_landings,
			amp_basis,
			amp_reference: str('amp_reference') || null,
			amp_declared_at,
			amp_reviewed_at,
			warn_hours,
			warn_days,
			warn_landings
		}
	};
}

/** Whether the aircraft's baseline work order is released (then the profile's baseline fields are frozen). */
export async function baselineReleased(aircraftId: string): Promise<boolean> {
	const wo = await db.selectFrom('mx_work_orders').select('status').where('aircraft_id', '=', aircraftId).where('kind', '=', 'setup_baseline').executeTakeFirst();
	return wo?.status === 'released';
}
