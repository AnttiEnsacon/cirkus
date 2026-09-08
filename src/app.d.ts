// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SessionUser } from '$lib/server/auth';
import type { AuditEntry } from '$lib/server/audit';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SessionUser | null;
			/** Set by audit(); the hook writes it as the request's activity row. */
			audit?: AuditEntry;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
