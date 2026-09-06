import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const users = await db
		.selectFrom('users')
		.select(['id', 'name', 'email', 'role', 'status', 'password_hash'])
		.orderBy('name', 'asc')
		.execute();

	// Never send password hashes to the client — just whether one is set.
	return {
		users: users.map(({ password_hash, ...u }) => ({ ...u, hasPassword: password_hash !== null }))
	};
};

export const actions: Actions = {
	update: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const role = String(form.get('role') ?? '');
		const status = String(form.get('status') ?? '');

		if (!id || !name || !email) return fail(400, { error: 'Name and email are required.' });
		if (role !== 'admin' && role !== 'pilot') return fail(400, { error: 'Invalid role.' });
		if (!['pending', 'approved', 'rejected'].includes(status)) {
			return fail(400, { error: 'Invalid status.' });
		}

		await db
			.updateTable('users')
			.set({
				name,
				email,
				role: role as 'admin' | 'pilot',
				status: status as 'pending' | 'approved' | 'rejected',
				updated_at: new Date().toISOString()
			})
			.where('id', '=', id)
			.execute();
	},

	setPassword: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const password = String(form.get('password') ?? '');

		if (!id || password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}

		const password_hash = await hashPassword(password);
		await db
			.updateTable('users')
			.set({ password_hash, updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();

		return { passwordSetFor: id };
	}
};
