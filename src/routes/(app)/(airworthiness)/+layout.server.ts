import { error, redirect } from '@sveltejs/kit';
import { canManageAirworthiness } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

// Admins and technical managers (users.technical_manager, set on Accounts).
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (!canManageAirworthiness(locals.user)) throw error(403, 'Admins and technical managers only.');
	return { user: locals.user };
};
