import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/home');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!name || !email || !password) {
			return fail(400, { error: 'Fill in your name, email and a password.', name, email });
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.', name, email });
		}

		const existing = await db
			.selectFrom('users')
			.select('id')
			.where('email', '=', email)
			.executeTakeFirst();
		if (existing) {
			return fail(400, { error: 'An account with that email already exists.', name, email });
		}

		const password_hash = await hashPassword(password);
		await db
			.insertInto('users')
			.values({ name, email, password_hash, role: 'pilot', status: 'pending' })
			.execute();

		return { success: true };
	}
};
