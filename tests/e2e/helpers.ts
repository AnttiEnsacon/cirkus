import { expect, type Page } from '@playwright/test';

export const ADMIN = { email: 'antti.hanninen@kmlaviation.fi', password: 'test-admin-pw', name: 'Antti Hänninen' };
export const PILOT = { email: 'juha.valkonen@kmlaviation.fi', password: 'test-pilot-pw', name: 'Juha Valkonen' };

export async function login(page: Page, who: { email: string; password: string }) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: /log in|sign in/i }).click();
	await expect(page).toHaveURL(/\/home/);
}

export async function logout(page: Page) {
	await page.context().clearCookies();
}

/**
 * The review step from the handoff, automated: the same screen at phone and
 * laptop widths, into test-results/screens/<name>-{390,1440}.png.
 */
export async function shoot(page: Page, name: string) {
	const original = page.viewportSize();
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
		await page.waitForTimeout(150);
		await page.screenshot({ path: `test-results/screens/${name}-${width}.png`, fullPage: true });
	}
	if (original) await page.setViewportSize(original);
}

/** Tomorrow's date (Helsinki), YYYY-MM-DD — the flows book in the future. */
export function tomorrowYmd(): string {
	const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(d);
}
