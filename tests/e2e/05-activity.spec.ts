import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

// Sign-ins, a failed sign-in, a booking and a flight all show up on the
// admin's Activity page; the Sign-ins chip narrows it.
test('activity log records what people do', async ({ page }) => {
	// A failed sign-in first (wrong password), then a real one.
	await page.goto('/login');
	await page.getByLabel('Email').fill(PILOT.email);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: /log in/i }).click();
	await expect(page.getByText('Incorrect email or password.')).toBeVisible();
	await login(page, PILOT);

	// Something to log: a flight on OH-KML.
	await page.goto('/log');
	await page.getByLabel('Tacho start').fill('5000.0');
	await page.getByLabel('Tacho end').fill('5000.5');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await expect(page).toHaveURL(/\/logbook\?saved=1/);
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login/);

	// Admin: everything is there, newest first.
	await login(page, ADMIN);
	await page.goto('/manage/activity');
	const entries = page.locator('.entry');
	await expect(entries.first()).toContainText(ADMIN.name); // this sign-in
	await expect(entries.first()).toContainText('Signed in');
	await expect(page.locator('.entry', { hasText: 'Signed out' }).first()).toContainText(PILOT.name);
	await expect(page.locator('.entry', { hasText: 'Logged a flight' }).first()).toContainText('Tacho 5000 → 5000.5');
	const failed = page.locator('.entry.failed', { hasText: `Failed sign-in for ${PILOT.email}` }).first();
	await expect(failed).toContainText('wrong password');
	await expect(failed).toContainText('refused');
	await shoot(page, 'activity');

	// The Sign-ins chip hides the flight.
	await page.getByRole('link', { name: 'Sign-ins' }).click();
	await expect(page.locator('.entry', { hasText: 'Logged a flight' })).toHaveCount(0);
	await expect(page.locator('.entry', { hasText: 'Signed in' }).first()).toBeVisible();

	// Filtering by person keeps only theirs.
	await page.getByLabel('Person').selectOption({ label: PILOT.name });
	await page.getByRole('button', { name: 'Show' }).click();
	await expect(page.locator('.entry', { hasText: ADMIN.name })).toHaveCount(0);
	await logout(page);
});
