import { defineConfig, devices } from '@playwright/test';

// The flows run against the *built* app (node build), the way the container
// runs it, on a throwaway database. See tests/e2e/README in the specs.
const dbUrl = process.env.DATABASE_URL ?? '';
if (/azure\.com/i.test(dbUrl)) {
	throw new Error('Refusing to run e2e tests against an Azure database. Point DATABASE_URL at a local throwaway database.');
}

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 30_000,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: 'http://localhost:3100',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		locale: 'en-GB',
		timezoneId: 'Europe/Helsinki'
	},
	globalSetup: './tests/e2e/global-setup.ts',
	webServer: {
		command: 'node build',
		port: 3100,
		reuseExistingServer: false,
		env: { PORT: '3100', ORIGIN: 'http://localhost:3100', BODY_SIZE_LIMIT: '15M', DATABASE_URL: dbUrl, NODE_ENV: 'production' }
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				// Escape hatch for environments with a preinstalled Chromium (unset = Playwright's own).
				launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
			}
		}
	]
});
