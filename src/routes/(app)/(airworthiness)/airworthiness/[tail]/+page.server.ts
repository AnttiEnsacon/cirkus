import { db } from '$lib/server/db';
import { listDefects } from '$lib/server/airworthiness/defects';
import { loadProgramme, loadTracked } from '$lib/server/airworthiness/programme';
import { dueRow, KIND_LABEL, STATE_CHIP, STATE_LABEL } from '$lib/server/airworthiness/present';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft, profile } = await loadTracked(params.tail);
	const p = await loadProgramme(aircraft.id, profile);
	const c = p.counters;
	// Phase 16: the open defects (grounding ones first) and the open work orders.
	const defects = (await listDefects(aircraft.id, { openOnly: true })).sort((a, b) => Number(b.airworthinessChip === 'danger') - Number(a.airworthinessChip === 'danger') || b.number - a.number);
	const orders = await db
		.selectFrom('mx_work_orders as o')
		.leftJoin('users as u', 'u.id', 'o.opened_by')
		.select(['o.id', 'o.kind', 'o.title', 'o.opened_at', 'u.name as opened_by', (eb) => eb.selectFrom('mx_work_order_items as i').select(eb.fn.countAll<number>().as('n')).whereRef('i.work_order_id', '=', 'o.id').as('items')])
		.where('o.aircraft_id', '=', aircraft.id)
		.where('o.status', '=', 'open')
		.where('o.kind', '<>', 'setup_baseline')
		.orderBy('o.opened_at', 'desc')
		.execute();
	return {
		defects,
		orders: orders.map((o) => ({ id: o.id, kind: KIND_LABEL[o.kind], title: o.title, openedAt: o.opened_at, openedBy: o.opened_by, items: Number(o.items) })),
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
