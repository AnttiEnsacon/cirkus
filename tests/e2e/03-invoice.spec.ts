import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

// Unbilled flight listed → invoice created → flight frozen → paid;
// a second invoice cancelled → flight editable again.
test('invoice lifecycle freezes and releases the flight', async ({ page }) => {
	test.setTimeout(60_000);
	// Two flights by the pilot: one to bill and pay, one to bill and cancel.
	await login(page, PILOT);
	for (const [start, end] of [
		['2000.0', '2001.0'],
		['2001.0', '2001.5']
	]) {
		await page.goto('/log');
		await page.getByLabel('Tacho start').fill(start);
		await page.getByLabel('Tacho end').fill(end);
		await page.getByRole('button', { name: 'Save flight log' }).click();
		await expect(page).toHaveURL(/\/logbook\?saved=1/);
	}
	// Flights from the earlier spec may still be here; count only ours.
	const ours = page.locator('table tbody tr', { hasText: '2000.0 → 2001.0' });
	await expect(ours).toHaveCount(1);
	await logout(page);

	// Admin: the pilot's row lists the flights that would be billed.
	await login(page, ADMIN);
	await page.goto('/manage/invoices');
	const pilotRow = page.locator('.list-item', { hasText: PILOT.name });
	await expect(pilotRow).toBeVisible();
		await expect(page.locator('.list-item.flight', { hasText: '2000.0 → 2001.0' })).toBeVisible();
	await shoot(page, 'manage-invoices');

	// Create the pilot's invoice: everything unbilled at €240/h.
	await pilotRow.getByRole('button', { name: 'Create invoice' }).click();
	await expect(page.getByText('1 invoice created.')).toBeVisible();
	await expect(page.getByText('No unbilled flights.')).toBeVisible();
	const invoiceRow = page.locator('table tbody tr', { hasText: PILOT.name }).first();
	await expect(invoiceRow).toContainText('issued');
	const invoiceNumber = (await invoiceRow.locator('td').first().innerText()).trim();

	// Mark it paid.
	await invoiceRow.getByPlaceholder('reference').fill('bank ref 1');
	await invoiceRow.getByRole('button', { name: 'Mark paid' }).click();
	await expect(page.locator('table tbody tr', { hasText: invoiceNumber })).toContainText('paid');
	await logout(page);

	// Pilot: the invoice is visible; the billed flights have no Edit/Delete.
	await login(page, PILOT);
	await page.goto('/invoices');
	await expect(page.locator('.list-item', { hasText: invoiceNumber })).toBeVisible();
	await page.goto('/logbook');
	const billed = page.locator('table tbody tr', { hasText: 'billed' });
	await expect(billed.first()).toBeVisible();
	await expect(billed.first().getByRole('link', { name: 'Edit' })).toHaveCount(0);
	await expect(page.locator('table tbody tr', { hasText: '2000.0 → 2001.0' })).toContainText('billed');
	// …and the edit page itself refuses a billed flight.
	const billedId = await billed.first().locator('form[action="?/delete"] input[name="id"]').count();
	expect(billedId).toBe(0);

	// A new flight, billed on a second invoice that is then cancelled → editable again.
	await page.goto('/log');
	await page.getByLabel('Tacho start').fill('3000.0');
	await page.getByLabel('Tacho end').fill('3000.5');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await logout(page);
	await login(page, ADMIN);
	await page.goto('/manage/invoices');
	await page.getByRole('button', { name: /Create all/ }).click();
	await expect(page.getByText(/invoice(s)? created\./)).toBeVisible();
	const second = page.locator('table tbody tr', { hasText: 'issued' }).first();
	await second.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('table tbody tr', { hasText: 'cancelled' })).toHaveCount(1);
	await expect(page.locator('.list-item.flight', { hasText: '3000.0 → 3000.5' })).toBeVisible(); // released
	await logout(page);
	await login(page, PILOT);
	await page.goto('/logbook');
	const released = page.locator('table tbody tr', { hasText: '3000.0 → 3000.5' });
	await expect(released).toContainText('submitted');
	await expect(released.getByRole('link', { name: 'Edit' })).toBeVisible();
});
