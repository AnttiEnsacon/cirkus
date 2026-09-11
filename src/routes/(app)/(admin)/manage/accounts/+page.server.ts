import { fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth';
import { findPartners, isConfigured, ProcountorError } from '$lib/server/procountor';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const users = await db
		.selectFrom('users')
		.select(['id', 'name', 'email', 'role', 'status', 'password_hash', 'procountor_partner_id'])
		.orderBy('name', 'asc')
		.execute();

	// Never send password hashes to the client — just whether one is set.
	return {
		users: users.map(({ password_hash, ...u }) => ({ ...u, hasPassword: password_hash !== null })),
		procountor: isConfigured()
	};
};

export const actions: Actions = {
	add: async (event) => {
		const { request } = event;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const role = String(form.get('role') ?? 'pilot');
		const password = String(form.get('password') ?? '');

		if (!name || !email) return fail(400, { error: 'Name and email are required.' });
		if (role !== 'admin' && role !== 'pilot') return fail(400, { error: 'Invalid role.' });
		if (password.length < 8) return fail(400, { error: 'Temporary password must be at least 8 characters.' });

		const existing = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
		if (existing) return fail(400, { error: `An account with ${email} already exists.` });

		await db
			.insertInto('users')
			.values({
				name,
				email,
				role: role as 'admin' | 'pilot',
				status: 'approved',
				password_hash: await hashPassword(password)
			})
			.execute();

		audit(event, { action: 'user.add', details: { target: name, email, role } });
		return { added: name };
	},

	update: async (event) => {
		const { request } = event;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		audit(event, { action: 'user.update', entity: ['user', id] });
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

	setPassword: async (event) => {
		const { request } = event;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		audit(event, { action: 'user.set_password', entity: ['user', id] });
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
	},

	/** Search Procountor's customers by the person's email and name; the matches are offered to link. */
	findPartner: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const query = String(form.get('query') ?? '').trim();
		if (!id || !query) return fail(400, { error: 'Type a name or email to search for.' });
		if (!isConfigured()) return fail(400, { error: 'Procountor is not configured.' });
		try {
			const matches = await findPartners(query);
			audit(event, { action: 'user.find_partner', entity: ['user', id], details: { query, matches: matches.length } });
			return { partnerSearch: { userId: id, query, matches } };
		} catch (err) {
			audit(event, { action: 'user.find_partner', entity: ['user', id], details: { query }, ok: false });
			return fail(502, { error: err instanceof ProcountorError ? err.message : 'Procountor did not answer.' });
		}
	},

	/** Link (or, with an empty id, unlink) the person to a Procountor customer. */
	linkPartner: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const raw = String(form.get('partner_id') ?? '').trim();
		const partnerId = raw === '' ? null : Number(raw);
		if (!id) return fail(400, { error: 'Missing account.' });
		if (partnerId !== null && (!Number.isInteger(partnerId) || partnerId <= 0)) {
			return fail(400, { error: 'The Procountor customer id must be a whole number.' });
		}
		if (partnerId !== null) {
			const taken = await db.selectFrom('users').select('name').where('procountor_partner_id', '=', partnerId).where('id', '<>', id).executeTakeFirst();
			if (taken) return fail(400, { error: `Procountor customer ${partnerId} is already linked to ${taken.name}.` });
		}
		await db
			.updateTable('users')
			.set({ procountor_partner_id: partnerId, updated_at: new Date().toISOString() })
			.where('id', '=', id)
			.execute();
		audit(event, { action: 'user.link_partner', entity: ['user', id], details: { partnerId } });
		return { linked: id };
	}
};
