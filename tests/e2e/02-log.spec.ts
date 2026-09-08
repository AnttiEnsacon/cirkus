import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

// Log a flight → correct a Tacho typo → admin sees it as editable.
test('log, correct, admin sees it', async ({ page }) => {
	await login(page, PILOT);

	await page.goto('/log');
	await page.getByLabel('Tacho start').fill('1234.5');
	await page.getByLabel('Tacho end').fill('1235.7');
	await page.getByLabel('Departure (ICAO)').fill('EFHK');
	await page.getByLabel('Arrival (ICAO)').fill('EFTU');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await expect(page).toHaveURL(/\/logbook\?saved=1/);
	await expect(page.getByText('Flight saved.')).toBeVisible();
	const row = page.locator('table tbody tr').first();
	await expect(row).toContainText('1.20');
	await expect(row).toContainText('EFHK → EFTU');

	// Fix the Tacho end: 1235.7 → 1235.8.
	await row.getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByRole('heading', { name: 'Edit flight' })).toBeVisible();
	await expect(page.getByLabel('Tacho end')).toHaveValue('1235.7');
	await expect(page.getByLabel('Arrival (ICAO)')).toHaveValue('EFTU');
	await shoot(page, 'log-edit');
	await page.getByLabel('Tacho end').fill('1235.8');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/\/logbook\?saved=1/);
	await expect(page.locator('table tbody tr').first()).toContainText('1.30');
	await shoot(page, 'logbook');

	// The admin sees the same flight, editable, on the Flights page.
	await logout(page);
	await login(page, ADMIN);
	await page.goto('/manage/flights');
	const adminRow = page.locator('table tbody tr', { hasText: PILOT.name });
	await expect(adminRow).toHaveCount(1);
	await expect(adminRow).toContainText('submitted');
	await expect(adminRow.getByRole('link', { name: 'Edit' })).toBeVisible();
	await expect(adminRow.getByRole('button', { name: 'Delete' })).toBeVisible();
	await shoot(page, 'manage-flights');

	// Admin edits it as the pilot's flight: pilot shown, and the redirect goes back to Flights.
	await adminRow.getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByRole('textbox', { name: 'Pilot' })).toHaveValue(PILOT.name);
	await page.getByLabel('Remarks').fill('checked by admin');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/\/manage\/flights/);
	await expect(page.locator('table tbody tr', { hasText: PILOT.name })).toContainText('checked by admin');
});
