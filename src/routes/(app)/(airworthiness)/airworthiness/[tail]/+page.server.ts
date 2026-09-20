import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import { dueRow, STATE_CHIP, STATE_LABEL } from '$lib/server/airworthiness/present';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const p = await loadProgramme(aircraft.id, profile);
	const c = p.counters;
	return {
		tail: aircraft.tail_number,
		subtitle: `${aircraft.type}${profile.msn ? ` · MSN ${profile.msn}` : ''}${profile.year_built ? ` · ${profile.year_built}` : ''}`,
		state: { key: p.status.state, label: STATE_LABEL[p.status.state], chip: STATE_CHIP[p.status.state], reasons: p.status.reasons },
		counters: {
			hours: c.hours.toFixed(1),
			source: profile.hours_source,
			landings: c.landings,
			perDay: c.hoursPerDay.toFixed(2),
			perYear: Math.round(c.hoursPerDay * 365),
			windowDays: c.window.days,
			baselineAt: c.baseline.at,
			baselineHours: c.baseline.hours.toFixed(1),
			baselineReleased: p.baselineReleased
		},
		rows: p.items.map(dueRow),
		activeCount: p.items.length
	};
};
