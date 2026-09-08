import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Receipt photos: own, or any as admin. Bytes never leave the database
// otherwise.
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	const me = locals.user;
	if (!me) throw error(401, 'Log in');
	const img = await db
		.selectFrom('receipt_images as i')
		.innerJoin('expenses as e', 'e.id', 'i.expense_id')
		.select(['i.bytes', 'i.content_type', 'e.user_id'])
		.where('i.id', '=', params.imageId)
		.where('i.expense_id', '=', params.id)
		.executeTakeFirst();
	if (!img) throw error(404, 'Not found');
	if (img.user_id !== me.id && me.role !== 'admin') throw error(403, 'Not allowed');
	setHeaders({ 'Content-Type': img.content_type, 'Cache-Control': 'private, max-age=3600', 'Content-Length': String(img.bytes.length) });
	return new Response(new Uint8Array(img.bytes));
};
