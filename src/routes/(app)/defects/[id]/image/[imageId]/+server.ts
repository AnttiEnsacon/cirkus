import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Defect photos: any logged-in member — a defect on a club aircraft is
// everyone's business. Bytes never leave the database otherwise.
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	if (!locals.user) throw error(401, 'Log in');
	const img = await db
		.selectFrom('mx_defect_images')
		.select(['bytes', 'content_type'])
		.where('id', '=', params.imageId)
		.where('defect_id', '=', params.id)
		.executeTakeFirst();
	if (!img) throw error(404, 'Not found');
	setHeaders({ 'Content-Type': img.content_type, 'Cache-Control': 'private, max-age=3600', 'Content-Length': String(img.bytes.length) });
	return new Response(new Uint8Array(img.bytes));
};
