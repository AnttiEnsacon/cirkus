import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, type UserRole, type UserStatus } from './db';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	status: UserStatus;
}

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

function newSessionToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = newSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await db
		.insertInto('sessions')
		.values({ token, user_id: userId, expires_at: expiresAt.toISOString() })
		.execute();

	return { token, expiresAt };
}

export async function invalidateSession(token: string): Promise<void> {
	await db.deleteFrom('sessions').where('token', '=', token).execute();
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
	if (!token) return null;

	const row = await db
		.selectFrom('sessions')
		.innerJoin('users', 'users.id', 'sessions.user_id')
		.select([
			'users.id',
			'users.name',
			'users.email',
			'users.role',
			'users.status',
			'sessions.expires_at'
		])
		.where('sessions.token', '=', token)
		.executeTakeFirst();

	if (!row) return null;

	if (new Date(row.expires_at) < new Date()) {
		await invalidateSession(token);
		return null;
	}

	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		status: row.status
	};
}
