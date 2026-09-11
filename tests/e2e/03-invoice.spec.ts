import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

const FAKE = 'http://localhost:3199';

// Unbilled flight listed → invoice created as a draft (pilot not linked)
// → pilot linked to a Procountor customer under Accounts → sent to
// Procountor (number + reference) → Procountor reports it paid → sync →
// paid on both pages; a second invoice fails in Procountor → retry fails
// again → cancelled → flight editable again.
test('invoice lifecycle through Procountor', async ({ page, request }) => {
	test.setTimeout(90_000);
	await request.post(`${FAKE}/_test/reset`);

	// Two flights by the pilot, both on the first invoice.
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
	await expect(page.locator('table tbody tr', { hasText: '2000.0 → 2001.0' })).toHaveCount(1);
	await logout(page);

	// Admin: the pilot's row lists the flights that would be billed.
	await login(page, ADMIN);
	await page.goto('/manage/invoices');
	const pilotRow = page.locator('.list-item', { hasText: PILOT.name });
	await expect(pilotRow).toBeVisible();
	await expect(page.locator('.list-item.flight', { hasText: '2000.0 → 2001.0' })).toBeVisible();
	await shoot(page, 'manage-invoices');

	// Create the invoice: the pilot has no Procountor customer yet, so it
	// stays a draft with the reason on the row.
	await pilotRow.getByRole('button', { name: 'Create invoice' }).click();
	await expect(page.getByText('1 invoice created, 0 sent to Procountor.')).toBeVisible();
	await expect(page.getByText('No unbilled flights.')).toBeVisible();
	const draftRow = page.locator('table tbody tr', { hasText: PILOT.name }).first();
	await expect(draftRow).toContainText('draft');
	await expect(draftRow).toContainText('not linked to a Procountor customer');
	const cirkusNumber = (await draftRow.locator('td').first().innerText()).trim();
	expect(cirkusNumber).toMatch(/^\d{4}-\d{4}$/);

	// Accounts: find the pilot in Procountor by email and link the match.
	await page.goto('/manage/accounts');
	const card = page.locator('.card', { hasText: PILOT.email }).first();
	await expect(card.getByLabel('Find in Procountor')).toHaveValue(PILOT.email);
	await card.getByRole('button', { name: 'Find' }).click();
	const match = page.locator('.matches .list-item', { hasText: 'C-0017' });
	await expect(match).toContainText(PILOT.name);
	await shoot(page, 'manage-accounts-procountor');
	await match.getByRole('button', { name: 'Link' }).click();
	await expect(page.getByText('Procountor customer saved.')).toBeVisible();
	await expect(page.locator('.card', { hasText: PILOT.email }).first().getByLabel('Procountor customer')).toHaveValue('1001');

	// Billing: send the draft. Procountor numbers it and gives a reference.
	await page.goto('/manage/invoices');
	await page.locator('table tbody tr', { hasText: 'draft' }).getByRole('button', { name: 'Send' }).click();
	const sentRow = page.locator('table tbody tr', { hasText: `Cirkus ${cirkusNumber}` });
	await expect(sentRow).toContainText('sent');
	await expect(sentRow).toContainText('10023'); // the fake's first invoice number
	await expect(sentRow).toContainText('ref 100230'); // …and its bank reference
	await expect(sentRow.getByRole('button')).toHaveCount(0); // nothing to do with a sent invoice
	await shoot(page, 'manage-invoices-sent');

	// What reached Procountor: one invoice, two rows, net prices, VAT 25.5.
	const remote = await (await request.get(`${FAKE}/_test/invoices`)).json();
	expect(remote.invoices).toHaveLength(1);
	const r = remote.invoices[0];
	expect(r.status).toBe('SENT');
	expect(r.counterParty.identifier.id).toBe(1001);
	expect(r.invoiceChannel).toBe('EMAIL');
	// (Flow 02 may have left flights of its own; check ours.)
	const row = r.invoiceRows.find((x: { product: string }) => x.product.includes('1.00 h Tacho'));
	expect(row).toBeTruthy();
	expect(row.quantity).toBe(1);
	expect(row.unit).toBe('h');
	expect(row.vatPercent).toBe(25.5);
	expect(row.unitPrice).toBeCloseTo(240 / 1.255, 2); // €240/h is VAT-inclusive; Procountor gets the net price
	expect(row.accountingAccount).toBe('3210');
	expect(r.additionalInformation).toBe(`Cirkus ${cirkusNumber}`);

	// Procountor records the payment; Cirkus finds out on sync.
	await request.post(`${FAKE}/_test/pay/${r.id}`);
	await page.getByRole('button', { name: 'Sync with Procountor' }).click();
	await expect(page.getByText('1 open invoice checked, 1 paid.')).toBeVisible();
	await expect(page.locator('table tbody tr', { hasText: `Cirkus ${cirkusNumber}` })).toContainText('paid');
	await logout(page);

	// Pilot: the invoice shows Procountor's number and reference; the billed
	// flights have no Edit/Delete.
	await login(page, PILOT);
	await page.goto('/invoices');
	const mine = page.locator('.list-item', { hasText: '10023' });
	await expect(mine).toContainText('100230');
	await expect(mine).toContainText('paid');
	await shoot(page, 'invoices-paid');
	await mine.click();
	await expect(page.getByRole('heading', { name: /10023/ })).toBeVisible();
	await expect(page.getByText(`Cirkus ${cirkusNumber}`)).toBeVisible();
	await page.goto('/logbook');
	const billed = page.locator('table tbody tr', { hasText: 'billed' });
	await expect(billed.first()).toBeVisible();
	await expect(billed.first().getByRole('link', { name: 'Edit' })).toHaveCount(0);
	await expect(page.locator('table tbody tr', { hasText: '2000.0 → 2001.0' })).toContainText('billed');

	// A new flight on the airborne-billed plane (0.78 h × €200 = €156.00),
	// billed on a second invoice that Procountor rejects twice → error,
	// retry still fails → cancelled → editable again.
	await page.goto('/log');
	await page.getByLabel('Aircraft').selectOption({ label: 'OH-TST — Test plane' });
	await page.getByLabel('Off-block date').fill('2026-09-08');
	await page.getByLabel('Off-block time').fill('10:05');
	await page.getByLabel('On-block date').fill('2026-09-08');
	await page.getByLabel('On-block time').fill('11:04');
	await page.getByLabel('Take-off time').fill('10:12');
	await page.getByLabel('Landing time').fill('10:59');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await logout(page);

	await request.post(`${FAKE}/_test/fail-next/2`);
	await login(page, ADMIN);
	await page.goto('/manage/invoices');
	await expect(page.locator('.list-item.flight', { hasText: 'T/O 10:12Z → LDG 10:59Z' })).toContainText('€156.00');
	await page.getByRole('button', { name: /Create all/ }).click();
	await expect(page.getByText('1 invoice created, 0 sent to Procountor.')).toBeVisible();
	const errorRow = page.locator('table tbody tr', { hasText: 'error' });
	await expect(errorRow).toHaveCount(1);
	await expect(errorRow).toContainText('Simulated validation error');
	await shoot(page, 'manage-invoices-error');
	await errorRow.getByRole('button', { name: 'Send' }).click();
	await expect(page.locator('.alert.error')).toContainText('Simulated validation error');
	await expect(page.locator('table tbody tr', { hasText: 'error' })).toHaveCount(1);
	await page.locator('table tbody tr', { hasText: 'error' }).getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('table tbody tr', { hasText: 'cancelled' })).toHaveCount(1);
	await expect(page.locator('.list-item.flight', { hasText: 'T/O 10:12Z → LDG 10:59Z' })).toBeVisible(); // released

	// The scheduled sync endpoint: refuses without the secret, answers with it.
	expect((await request.post('/internal/sync')).status()).toBe(401);
	const sync = await request.post('/internal/sync', { headers: { Authorization: 'Bearer test-sync-secret' } });
	expect(sync.status()).toBe(200);
	expect(await sync.json()).toEqual({ checked: 0, paid: 0, errors: 0 });
	await logout(page);

	await login(page, PILOT);
	await page.goto('/logbook');
	// (Flow 02 left an earlier OH-TST flight, now billed on the first invoice.)
	const released = page.locator('table tbody tr', { hasText: 'OH-TST' }).filter({ hasText: 'submitted' });
	await expect(released).toHaveCount(1);
	await expect(released.getByRole('link', { name: 'Edit' })).toBeVisible();
});
