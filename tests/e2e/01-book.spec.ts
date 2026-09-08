import { test, expect } from '@playwright/test';
import { login, PILOT, shoot, tomorrowYmd } from './helpers';

// Reservation → edit → overlap refused → cancel.
test('book, edit, overlap, cancel', async ({ page }) => {
	await login(page, PILOT);
	const day = tomorrowYmd();

	// Book 10:00–12:00 tomorrow.
	await page.goto(`/book?week=${day}`);
	await page.getByLabel('Start date').fill(day);
	await page.getByLabel('Start time').selectOption('10:00');
	await page.getByLabel('End date').fill(day);
	await page.getByLabel('End time').selectOption('12:00');
	await page.getByRole('button', { name: 'Confirm booking' }).click();
	await expect(page.getByText('Reservation booked.')).toBeVisible();
	await page.goto(`/book?week=${day}`);
	const mine = page.locator('.list-item', { hasText: '(you)' });
	await expect(mine).toHaveCount(1);
	await expect(mine).toContainText('10:00 – 12:00');

	// Move it to 11:00–13:00.
	await mine.getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByRole('heading', { name: 'Change reservation' })).toBeVisible();
	await expect(page.getByLabel('Start time')).toHaveValue('10:00');
	await page.getByLabel('Start time').selectOption('11:00');
	await expect(page.getByLabel('End time')).toHaveValue('13:00'); // duration follows the start
	await shoot(page, 'book-edit');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('Reservation updated.')).toBeVisible();
	await expect(page.locator('.list-item', { hasText: '(you)' })).toContainText('11:00 – 13:00');

	// A second booking over the same hours is refused by the database.
	await page.getByLabel('Start date').fill(day);
	await expect(page.getByLabel('End date')).toHaveValue(day); // the end follows the start
	await page.getByLabel('Start time').selectOption('12:00');
	await expect(page.getByLabel('End time')).toHaveValue('14:00');
	await page.getByRole('button', { name: 'Confirm booking' }).click();
	await expect(page.getByText('That overlaps with an existing reservation')).toBeVisible();

	// Cancel it.
	await page.goto(`/book?week=${day}`);
	await page.locator('.list-item', { hasText: '(you)' }).getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('.list-item', { hasText: '(you)' })).toHaveCount(0);
});
