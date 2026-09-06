import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { verifyPassword, createSession, purgeExpiredSessions, SESSION_COOKIE } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/home');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Enter your email and password.', email });
		}

		const user = await db
			.selectFrom('users')
			.select(['id', 'password_hash', 'status'])
			.where('email', '=', email)
			.executeTakeFirst();

		if (!user || !user.password_hash) {
			return fail(400, {
				error: user
					? 'No password is set on this account yet — ask an admin to set one for you.'
					: 'Incorrect email or password.',
				email
			});
		}

		const valid = await verifyPassword(password, user.password_hash);
		if (!valid) {
			return fail(400, { error: 'Incorrect email or password.', email });
		}

		if (user.status !== 'approved') {
			return fail(400, {
				error:
					user.status === 'pending'
						? 'Your account is still waiting for admin approval.'
						: 'Your account is not active. Contact an admin.',
				email
			});
		}

		const { token, expiresAt } = await createSession(user.id);
		await purgeExpiredSessions();
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: expiresAt
		});

		throw redirect(303, '/home');
	}
};
