import { tasksCsvTemplate } from '$lib/server/airworthiness/csv';
import type { RequestHandler } from './$types';

/** The CSV template for importing tasks: the header row and three example rows. */
export const GET: RequestHandler = async ({ params }) => {
	return new Response(tasksCsvTemplate(), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="tasks-${params.tail}-template.csv"`
		}
	});
};
