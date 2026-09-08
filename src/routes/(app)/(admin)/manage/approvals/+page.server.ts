import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const pending = await db
		.selectFrom('users')
		.select(['id', 'name', 'email', 'created_at'])
		.where('status', '=', 'pending')
		.orderBy('created_at', 'asc')
		.execute();

	return { pending };
};

/** { target: name } for the log. */
async function userName(id: string) {
	const u = await db.selectFrom('users').select('name').where('id', '=', id).executeTakeFirst();
	return { target: u?.name ?? id };
}

export const actions: Actions = {
	approve: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing user id.' });
		audit(event, { action: 'user.approve', entity: ['user', id], details: await userName(id) });
		await db
			.updateTable('users')
			.set({ status: 'approved', updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();
	},
	reject: async (event) => {
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing user id.' });
		audit(event, { action: 'user.reject', entity: ['user', id], details: await userName(id) });
		await db
			.updateTable('users')
			.set({ status: 'rejected', updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();
	}
};
