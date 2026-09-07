import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { hashPassword, verifyPassword } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => parent();

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		if (next.length < 8) return fail(400, { error: 'New password must be at least 8 characters.' });
		if (next !== confirm) return fail(400, { error: "The two new passwords don't match." });

		const me = await db.selectFrom('users').select('password_hash').where('id', '=', locals.user!.id).executeTakeFirstOrThrow();
		if (!me.password_hash || !(await verifyPassword(current, me.password_hash))) {
			return fail(400, { error: 'Current password is wrong.' });
		}

		await db
			.updateTable('users')
			.set({ password_hash: await hashPassword(next), updated_at: new Date().toISOString() })
			.where('id', '=', locals.user!.id)
			.execute();

		return { success: true };
	}
};
