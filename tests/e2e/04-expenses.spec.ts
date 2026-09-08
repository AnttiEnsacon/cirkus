import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

const RECEIPT = 'tests/e2e/fixtures/receipt.jpg';

// Receipt with a photo and two lines → admin pays it → frozen for the pilot.
// A second receipt is rejected with a reason the pilot sees.
test('expense: post, pay back, reject', async ({ page }) => {
	test.setTimeout(60_000);
	await login(page, PILOT);

	// Post a receipt split into two categories.
	await page.goto('/expenses/new');
	await page.getByLabel('Photo of the receipt').setInputFiles(RECEIPT);
	await page.getByLabel('Date').fill('2026-09-05');
	await page.getByLabel('Total €').fill('57.50');
	await page.getByLabel('Vendor').fill('Shell Malmi');
	await page.getByLabel('Amount €').first().fill('45.00');
	await page.getByRole('button', { name: 'Add line' }).click();
	await page.getByLabel('Category').nth(1).selectOption({ label: 'TAR · Tarvikkeet' });
	await page.getByLabel('Amount €').nth(1).fill('12.50');
	await expect(page.getByText('57.50 = 57.50 ✓')).toBeVisible();
	await shoot(page, 'expense-new');
	await page.getByRole('button', { name: 'Send receipt' }).click();
	await expect(page).toHaveURL(/\/expenses\?saved=1/);
	await expect(page.getByText('Receipt saved.')).toBeVisible();
	const row = page.locator('table tbody tr', { hasText: 'Shell Malmi' });
	await expect(row).toContainText('Öljy 45.00 · Tarvikkeet 12.50');
	await expect(row).toContainText('submitted');
	await shoot(page, 'expenses');

	// The receipt page shows the (downscaled) photo.
	await row.getByRole('link', { name: '2026-09-05' }).click();
	await expect(page.getByRole('heading', { name: 'Shell Malmi' })).toBeVisible();
	const img = page.locator('img[alt^="Receipt from"]');
	await expect(img).toBeVisible();
	const src = await img.getAttribute('src');
	const res = await page.request.get(src!);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toBe('image/jpeg');
	expect((await res.body()).length).toBeLessThan(600_000);
	await shoot(page, 'expense-detail');

	// The lines must add up: a wrong total is refused.
	await page.getByRole('link', { name: 'Edit' }).click();
	await page.getByLabel('Total €').fill('60.00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('The lines add up to €57.50 but the receipt total is €60.00.')).toBeVisible();

	// A second receipt, to be rejected.
	await page.goto('/expenses/new');
	await page.getByLabel('Photo of the receipt').setInputFiles(RECEIPT);
	await page.getByLabel('Date').fill('2026-09-06');
	await page.getByLabel('Total €').fill('24.90');
	await page.getByLabel('Vendor').fill('K-Rauta');
	await page.getByLabel('Amount €').first().fill('24.90');
	await page.getByRole('button', { name: 'Send receipt' }).click();
	await expect(page).toHaveURL(/\/expenses\?saved=1/);
	await logout(page);

	// Admin: both waiting, €82.40 in total; pay one, reject the other.
	await login(page, ADMIN);
	await expect(page.getByText('€82.40 of expenses to pay back')).toBeVisible();
	await page.goto('/manage/expenses');
	await expect(page.locator('.section-label', { hasText: 'To pay back' })).toContainText('€82.40');
	const shell = page.locator('.receipt', { hasText: 'Shell Malmi' });
	await expect(shell).toContainText('OLJ · Öljy');
	await expect(shell.locator('img')).toBeVisible();
	await shoot(page, 'manage-expenses');
	await shell.getByPlaceholder('reference').fill('SEPA 4471');
	await shell.getByRole('button', { name: 'Mark paid' }).click();
	await expect(page.locator('table tbody tr', { hasText: 'Shell Malmi' })).toContainText('paid');
	const krauta = page.locator('.receipt', { hasText: 'K-Rauta' });
	await krauta.getByPlaceholder('reason').fill('Not a club expense');
	await krauta.getByRole('button', { name: 'Reject' }).click();
	await expect(page.locator('table tbody tr', { hasText: 'K-Rauta' })).toContainText('rejected');
	await expect(page.getByText('Nothing waiting.')).toBeVisible();
	await logout(page);

	// Pilot: the paid one is frozen, the rejected one shows the reason and is editable.
	await login(page, PILOT);
	await page.goto('/expenses');
	const paidRow = page.locator('table tbody tr', { hasText: 'Shell Malmi' });
	await expect(paidRow).toContainText('paid');
	await expect(paidRow).toContainText('SEPA 4471');
	await expect(paidRow.getByRole('link', { name: 'Edit' })).toHaveCount(0);
	const rejectedRow = page.locator('table tbody tr', { hasText: 'K-Rauta' });
	await expect(rejectedRow).toContainText('Not a club expense');
	await expect(rejectedRow.getByRole('link', { name: 'Edit' })).toBeVisible();
	await page.goto(`/expenses/${(await paidRow.locator('a').first().getAttribute('href'))!.split('/')[2]}/edit`);
	await expect(page.getByText('This receipt has been paid and can no longer be changed.')).toBeVisible();
});
