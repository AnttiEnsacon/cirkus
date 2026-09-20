import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	// Unit tests (Vitest) cover pure modules only — the airworthiness due
	// calculator in Phase 15. Anything that touches the database or a page
	// is covered by the Playwright flows instead.
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
