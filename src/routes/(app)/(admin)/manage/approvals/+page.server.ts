import { fail } from '@sveltejs/kit';
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

export const actions: Actions = {
	approve: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing user id.' });
		await db
			.updateTable('users')
			.set({ status: 'approved', updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();
	},
	reject: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing user id.' });
		await db
			.updateTable('users')
			.set({ status: 'rejected', updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();
	}
};
