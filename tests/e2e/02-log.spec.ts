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
	// The logbook shows block hours (the default block is one hour) with the
	// billed Tacho figure as detail.
	const row = page.locator('table tbody tr').first();
	await expect(row).toContainText('1.00');
	await expect(row).toContainText('Tacho 1234.5 → 1235.7');
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
	await expect(page.locator('table tbody tr').first()).toContainText('Tacho 1234.5 → 1235.8');

	// The second aircraft is billed by airborne time: take-off and landing
	// appear, Tacho is not asked, and the figures under the times update.
	await page.goto('/log');
	await page.getByLabel('Aircraft').selectOption({ label: 'OH-TST — Test plane' });
	await expect(page.getByLabel('Take-off date')).toBeVisible();
	await expect(page.getByLabel('Tacho start')).toHaveCount(0);
	await page.getByLabel('Off-block date').fill('2026-09-08');
	await page.getByLabel('Off-block time').fill('10:05');
	await page.getByLabel('On-block date').fill('2026-09-08');
	await page.getByLabel('On-block time').fill('11:04');
	await page.getByLabel('Take-off date').fill('2026-09-08');
	await page.getByLabel('Take-off time').fill('10:12');
	await page.getByLabel('Landing date').fill('2026-09-08');
	await page.getByLabel('Landing time').fill('10:59');
	await expect(page.getByText('Airborne 0.78 h · billed')).toBeVisible();
	await expect(page.getByText('Block 0.98 h · logbook')).toBeVisible();
	await shoot(page, 'log-airborne');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await expect(page).toHaveURL(/\/logbook\?saved=1/);
	const air = page.locator('table tbody tr', { hasText: 'OH-TST' });
	await expect(air).toContainText('0.98');
	await expect(air).toContainText('T/O 10:12Z → LDG 10:59Z');
	await shoot(page, 'logbook');

	// Landing outside the block window is refused; the entry keeps its basis.
	await air.getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByLabel('Landing time')).toHaveValue('10:59');
	await page.getByLabel('Landing time').fill('11:30');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('Take-off and landing must be between off-block and on-block.')).toBeVisible();

	// The admin sees the same flight, editable, on the Flights page.
	await logout(page);
	await login(page, ADMIN);
	await page.goto('/manage/flights');
	const adminRow = page.locator('table tbody tr', { hasText: 'OH-KML' });
	await expect(adminRow).toHaveCount(1);
	await expect(adminRow).toContainText('submitted');
	await expect(adminRow).toContainText('1.30'); // billed hours, Tacho
	await expect(page.locator('table tbody tr', { hasText: 'OH-TST' })).toContainText('0.78'); // billed hours, airborne
	await expect(adminRow.getByRole('link', { name: 'Edit' })).toBeVisible();
	await expect(adminRow.getByRole('button', { name: 'Delete' })).toBeVisible();
	await shoot(page, 'manage-flights');

	// Admin edits it as the pilot's flight: pilot shown, and the redirect goes back to Flights.
	await adminRow.getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByRole('textbox', { name: 'Pilot' })).toHaveValue(PILOT.name);
	await page.getByLabel('Remarks').fill('checked by admin');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/\/manage\/flights/);
	await expect(page.locator('table tbody tr', { hasText: 'OH-KML' })).toContainText('checked by admin');
});
