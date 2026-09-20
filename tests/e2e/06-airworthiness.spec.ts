import { test, expect } from '@playwright/test';
import { ADMIN, login, logout, PILOT, shoot } from './helpers';

const CSV = 'tests/e2e/fixtures/tasks-sr20-sample.csv';

/** YYYY-MM-DD, n days before today (Helsinki) — anchors stay recent whenever the flow runs. */
function daysAgo(n: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

// A pilot is made technical manager → sets up OH-KML → imports the
// programme → releases the baseline → the dashboard counts from it; a
// logged flight and an adjustment move the counters; the released
// baseline refuses changes; a task can be deactivated.
test('airworthiness: set up, import, baseline, counters follow the flight log', async ({ page }) => {
	test.setTimeout(120_000);

	// A plain pilot has no access.
	await login(page, PILOT);
	await page.goto('/airworthiness');
	await expect(page.getByText('Admins and technical managers only.')).toBeVisible();
	await logout(page);

	// Admin makes the pilot a technical manager.
	await login(page, ADMIN);
	await page.goto('/manage/accounts');
	const card = page.locator('.card', { hasText: PILOT.email });
	await card.getByLabel('Technical manager').check();
	await card.getByLabel('Licence no.').fill('FI.FCL.TEST01');
	await card.getByRole('button', { name: 'Save', exact: true }).first().click();
	await expect(card.getByText('technical manager', { exact: true })).toBeVisible();
	await shoot(page, 'accounts-technical-manager');
	await logout(page);

	// The technical manager sets up OH-KML.
	await login(page, PILOT);
	await page.goto('/airworthiness');
	const kml = page.locator('form', { hasText: 'OH-KML' });
	await expect(kml).toContainText('Not tracked');
	await shoot(page, 'airworthiness-untracked');
	await kml.getByRole('button', { name: 'Set up tracking' }).click();
	await expect(page).toHaveURL(/\/airworthiness\/OH-KML\/programme$/);

	// Profile: baseline figures, programme reference, declaration.
	await page.getByLabel('Baseline date').fill(daysAgo(10));
	await page.getByLabel('Baseline hours').fill('1000.0');
	await page.getByLabel('Baseline landings').fill('800');
	await page.getByLabel('Programme reference').fill('Cirrus AMM 12137-001 rev 20, ch. 4 & 5');
	await page.getByLabel('Declared on').fill(daysAgo(10));
	await page.getByRole('button', { name: 'Save profile' }).click();
	await expect(page.getByText('Profile saved.')).toBeVisible();
	await expect(page.getByText(`Declared ${daysAgo(10)}`)).toBeVisible();

	// Import the programme from CSV; the ALS row's tolerance is refused with a note, not an error.
	await page.getByLabel('File').setInputFiles(CSV);
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByText('Imported: 7 added, 0 updated.')).toBeVisible();
	await expect(page.getByText('CAPS-REPACK: tolerance set to 0')).toBeVisible();
	const tasks = page.locator('table tbody tr');
	await expect(tasks).toHaveCount(7);
	await expect(page.locator('table tbody tr', { hasText: 'CAPS-REPACK' })).toContainText('none (ALS)');
	await expect(page.locator('table tbody tr', { hasText: 'OIL-50H' })).toContainText('yes');
	await shoot(page, 'airworthiness-programme');

	// Importing again updates, never duplicates.
	await page.getByLabel('File').setInputFiles(CSV);
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByText('Imported: 0 added, 7 updated.')).toBeVisible();

	// Before the baseline the due list is undefined and the aircraft needs attention.
	await page.goto('/airworthiness/OH-KML');
	await expect(page.getByText('No released baseline')).toBeVisible();
	await expect(page.locator('table tbody tr', { hasText: 'INSP-100H' })).toContainText('Undefined');

	// The baseline: every recurring task needs a date, hour-based ones need hours.
	await page.goto('/airworthiness/OH-KML/baseline');
	const recent = daysAgo(30);
	const fill = async (code: string, date: string, hours?: string) => {
		await page.getByLabel(`${code} last done on`).fill(date);
		if (hours) await page.getByLabel(`${code} at hours`).fill(hours);
		await page.getByLabel(`${code} evidence`).fill('CAO status list p. 2');
	};
	await fill('INSP-100H', recent, '950.0');
	await fill('OIL-50H', recent, '1000.0');
	await fill('ELT-BATT', recent);
	await fill('CAPS-REPACK', recent);
	await fill('AD-2022-0187', recent, '950.0');
	await fill('FIRE-EXT', recent);
	await fill('MAG-500H', recent); // hours left out on purpose
	await page.getByLabel('Source of the figures').fill('CAO final status list');
	await page.getByRole('button', { name: 'Release baseline' }).click();
	await expect(page.getByText('Fill in before releasing — MAG-500H: hours.')).toBeVisible();
	await shoot(page, 'airworthiness-baseline-incomplete');
	await page.getByLabel('MAG-500H at hours').fill('800.0');
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page.getByText('Draft saved.')).toBeVisible();
	await page.getByRole('button', { name: 'Release baseline' }).click();
	await expect(page.getByText('Baseline released.')).toBeVisible();
	await expect(page.getByText('Released', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Release baseline' })).toHaveCount(0);
	await expect(page.getByLabel('INSP-100H at hours')).toBeDisabled();
	await shoot(page, 'airworthiness-baseline');

	// The released baseline refuses changes, from the UI and from a raw request.
	const raw = await page.request.post('/airworthiness/OH-KML/baseline?/saveDraft', {
		form: { baseline_at: daysAgo(5), baseline_hours: '1', baseline_landings: '1' },
		headers: { origin: new URL(page.url()).origin }
	});
	// (page.request looks like a JS client to SvelteKit, so the failure comes back as JSON with status 400 inside)
	expect(await raw.text()).toContain('released and cannot be changed');
	await page.goto('/airworthiness/OH-KML/programme');
	await expect(page.getByLabel('Baseline hours')).toBeDisabled();
	await expect(page.getByText('The baseline is released; its date and figures are frozen.')).toBeVisible();

	// The dashboard counts from the baseline. Earlier flows may have logged
	// OH-KML flights after the baseline date, so the checks are deltas: the
	// AD (200 h, no calendar) was last done at 950 h, so its due point is
	// 1150.0 h and "remaining" is 1150 minus today's hours.
	await page.goto('/airworthiness/OH-KML');
	await expect(page.getByText('No released baseline')).toHaveCount(0);
	const stat = (n: number) => page.locator('.stats4 .stat .n').nth(n);
	const hoursNow = async () => Number((await stat(0).innerText()).replace(/ h$/, ''));
	const landingsNow = async () => Number(await stat(1).innerText());
	const ad = page.locator('table tbody tr', { hasText: 'AD-2022-0187' });
	const remaining = async () => Number((await ad.locator('td').nth(6).innerText()).replace(/ h$/, ''));
	const h0 = await hoursNow();
	const l0 = await landingsNow();
	expect(h0).toBeGreaterThanOrEqual(1000);
	await expect(ad).toContainText('1150.0 h');
	expect(await remaining()).toBeCloseTo(1150 - h0, 5);
	await expect(ad).toContainText('none (AD)');
	await expect(page.locator('table tbody tr', { hasText: 'INSP-100H' })).toContainText('+10 h');
	await shoot(page, 'airworthiness-dashboard');

	// A flight moves the counters: Tacho 1000.0 → 1001.5, 2 landings.
	await page.goto('/log');
	await page.getByLabel('Tacho start').fill('1000.0');
	await page.getByLabel('Tacho end').fill('1001.5');
	await page.getByLabel('Departure (ICAO)').fill('EFHK');
	await page.getByLabel('Arrival (ICAO)').fill('EFHK');
	await page.getByLabel('Day landings').fill('2');
	await page.getByRole('button', { name: 'Save flight log' }).click();
	await expect(page).toHaveURL(/\/logbook\?saved=1/);
	await page.goto('/airworthiness/OH-KML');
	expect(await hoursNow()).toBeCloseTo(h0 + 1.5, 5);
	expect(await landingsNow()).toBe(l0 + 2);
	expect(await remaining()).toBeCloseTo(1150 - h0 - 1.5, 5);

	// An adjustment: +2.0 h, +1 landing not in the log.
	await page.goto('/airworthiness/OH-KML/usage');
	await expect(page.getByText(/Last Tacho reading logged/)).toBeVisible();
	await page.getByLabel('Date', { exact: true }).fill(daysAgo(0));
	await page.getByLabel('Hours Δ').fill('2.0');
	await page.getByLabel('Landings Δ').fill('1');
	await page.getByLabel('Reason').fill('Ferry by the shop, not in Cirkus');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Saved. The counters on every page follow.')).toBeVisible();
	await expect(page.locator('tfoot')).toContainText((h0 + 3.5).toFixed(1));
	await expect(page.locator('tfoot')).toContainText(String(l0 + 3));
	await shoot(page, 'airworthiness-usage');
	await page.goto('/airworthiness/OH-KML');
	expect(await remaining()).toBeCloseTo(1150 - h0 - 3.5, 5);

	// Cancelling the adjustment restores the counters; the row stays, struck through.
	await page.goto('/airworthiness/OH-KML/usage');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.locator('tfoot')).toContainText((h0 + 1.5).toFixed(1));
	await expect(page.locator('tr.superseded')).toHaveCount(1);

	// Deactivating a task drops it from the due list but keeps it on the programme.
	await page.goto('/airworthiness/OH-KML/programme');
	await page.locator('table tbody tr', { hasText: 'FIRE-EXT' }).getByRole('link', { name: 'Edit' }).click();
	await expect(page.getByLabel('Code')).toHaveValue('FIRE-EXT');
	await expect(page.getByText('Computed now')).toBeVisible();
	await shoot(page, 'airworthiness-task');
	await page.getByRole('button', { name: 'Deactivate task' }).click();
	await expect(page).toHaveURL(/\/programme$/);
	await expect(page.getByText('6 active · 1 deactivated')).toBeVisible();
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('table tbody tr', { hasText: 'FIRE-EXT' })).toHaveCount(0);
	await expect(page.locator('table tbody tr')).toHaveCount(6);

	// The overview shows the tracked aircraft with its next-due list.
	await page.goto('/airworthiness');
	await expect(page.locator('.card', { hasText: 'OH-KML' })).toContainText('Next due');
	await expect(page.locator('.card', { hasText: 'OH-TST' })).toContainText('Not tracked');
	await shoot(page, 'airworthiness-overview');

	// The activity log names the release.
	await logout(page);
	await login(page, ADMIN);
	await page.goto('/manage/activity?kind=airworthiness');
	await expect(page.getByText(/Released the OH-KML baseline: .* at 1000 h \/ 800 landings, 7 rows, hash [0-9a-f]{64}/)).toBeVisible();
	await expect(page.getByText('Imported tasks for OH-KML from tasks-sr20-sample.csv: 7 added, 0 updated')).toBeVisible();
	await shoot(page, 'activity-airworthiness');
});
