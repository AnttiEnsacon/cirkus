import { listDefects } from '$lib/server/airworthiness/defects';
import { loadTracked } from '$lib/server/airworthiness/programme';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { aircraft } = await loadTracked(params.tail);
	const defects = await listDefects(aircraft.id);
	const counts = { open: 0, deferred: 0, unassessed: 0 };
	for (const d of defects) {
		if (d.status === 'open') counts.open++;
		if (d.status === 'deferred') counts.deferred++;
		if ((d.status === 'open' || d.status === 'deferred') && d.affects === null) counts.unassessed++;
	}
	return { tail: aircraft.tail_number, defects, counts };
};
