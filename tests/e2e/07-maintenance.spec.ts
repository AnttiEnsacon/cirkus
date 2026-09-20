import { test, expect } from '@playwright/test';
import { ADMIN, hydrated, login, logout, PILOT, shoot } from './helpers';

const PHOTO = 'tests/e2e/fixtures/receipt.jpg';

function daysAgo(n: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

// Runs after 06: OH-KML is tracked with the imported programme and a
// released baseline (INSP-100H last done at 950 h, OIL-50H at 1000 h), the
// pilot is the technical manager with a licence number, and a co-owner of
// OH-KML from the seed. A work order swaps a magneto and releases with a
// CRS; the due list moves; the released order is frozen; the component
// counts TSN; a pilot reports a defect that grounds the aircraft until a
// defect work order rectifies it; a second one is deferred; the pilot
// releases OIL-50H as pilot-owner from the phone.
test('maintenance: work orders, components, defects, pilot-owner release', async ({ page }) => {
	test.setTimeout(180_000);

	await login(page, PILOT);

	// ---- a component already fitted (the setup record) ----
	await page.goto('/airworthiness/OH-KML/components');
	await expect(page.getByText('Nothing recorded as installed')).toBeVisible();
	await page.getByLabel('Part number', { exact: true }).fill('6314');
	await page.getByLabel('Serial number', { exact: true }).fill('A1234');
	await page.getByLabel('Description', { exact: true }).fill('Magneto, Slick 6314');
	await page.getByLabel('ATA').fill('74');
	await page.getByLabel(/Already fitted to OH-KML/).check();
	await page.getByLabel('Fitted on').fill(daysAgo(400));
	await page.getByLabel('Aircraft hours then').fill('700.0');
	await page.getByLabel('Aircraft landings then').fill('500');
	await page.getByLabel('Position').fill('Magneto LH');
	await page.getByLabel('TSN at fitting').fill('300.0');
	await page.getByRole('button', { name: 'Add component' }).click();
	await expect(page.getByText('Component added.')).toBeVisible();
	const lh = page.locator('table tbody tr', { hasText: 'A1234' });
	await expect(lh).toContainText('Magneto LH');
	// TSN today = 300 + (hours now − 700): hours now is at least 1001.5 after flow 06.
	const dash = (n: number) => page.locator('.stats4 .stat .n').nth(n);

	// MAG-500H becomes a component task anchored at the install.
	await page.goto('/airworthiness/OH-KML/programme');
	await page.locator('table tbody tr', { hasText: 'MAG-500H' }).getByRole('link', { name: 'Edit' }).click();
	await hydrated(page);
	await page.getByLabel('Applies to').selectOption({ label: 'Magneto LH · Magneto, Slick 6314 · 6314 / A1234' });
	await page.getByLabel('Counts from').selectOption('install');
	await page.getByRole('button', { name: 'Save task' }).click();
	await expect(page.getByText('Task saved.')).toBeVisible();
	await expect(page.getByText('Intervals count in its TSN and CSN.')).toBeVisible();
	// The baseline said MAG-500H was last done at 800.0 airframe hours — 400.0 h TSN through
	// the installation (fitted at 700 h with TSN 300) — so it is due at 900.0 h TSN.
	await expect(page.locator('.kv')).toContainText('400.0 h');
	await expect(page.locator('.kv')).toContainText('900.0 h');
	await shoot(page, 'maintenance-component-task');

	// ---- a scheduled work order from the due list ----
	await page.goto('/airworthiness/OH-KML/work-orders');
	await expect(page.getByText('Nothing open.')).toBeVisible();
	await page.getByLabel('Title').fill('100-hour inspection + magneto');
	await page.getByLabel('Notes').fill('Booked at the shop');
	// INSP-100H is suggested (in tolerance or due soon after flow 06's flight); untick everything else.
	for (const box of await page.locator('.task-grid input[type=checkbox]').all()) await box.uncheck();
	await page.locator('.task-grid label', { hasText: 'INSP-100H' }).locator('input').check();
	await page.getByRole('button', { name: 'Open work order' }).click();
	await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Items 1')).toBeVisible();
	await expect(page.locator('table tbody tr').first()).toContainText('INSP-100H');
	const orderUrl = page.url();
	await hydrated(page);

	// An item swapping the magneto for a new one, with two parts used.
	await page.getByLabel('Task').selectOption({ label: 'MAG-500H · Magneto 500 h inspection' });
	await page.getByLabel('Description', { exact: true }).fill('Magneto LH replaced — worn contacts found at inspection');
	await page.getByLabel('Component removed').selectOption({ label: 'Magneto LH · Magneto, Slick 6314 · 6314 / A1234' });
	await page.getByLabel('Component installed').selectOption('new');
	await page.getByLabel('Part number', { exact: true }).fill('6314');
	await page.getByLabel('Serial number', { exact: true }).fill('B5678');
	await page.locator('input[name=new_description]').fill('Magneto, Slick 6314');
	await page.getByLabel('Manufacture date').fill(daysAgo(120));
	await page.getByLabel('Position', { exact: true }).fill('Magneto LH');
	await page.getByLabel('TSN at fitting (h)').fill('0');
	await page.getByLabel(/Parts used/).fill('6314 · B5678 · 1 · 8130-3 no. 4471\n654301 · — · 1');
	await page.getByRole('button', { name: 'Add item' }).click();
	await expect(page.getByText('Item added.')).toBeVisible();
	await expect(page.getByText('Items 2')).toBeVisible();
	const swap = page.locator('table tbody tr', { hasText: 'MAG-500H' });
	await expect(swap).toContainText('out Magneto, Slick 6314 · 6314 / A1234');
	await expect(swap).toContainText('in Magneto, Slick 6314 · 6314 / B5678 as Magneto LH');
	await expect(swap).toContainText('654301 ×1');
	await shoot(page, 'maintenance-work-order-open');

	// A bad parts line is refused with the line number, and nothing typed is lost.
	await page.getByLabel('Description', { exact: true }).fill('Something else');
	await page.getByLabel(/Parts used/).fill('6314 · B5678 · zero');
	await page.getByRole('button', { name: 'Add item' }).click();
	await expect(page.getByText(/line 1: the quantity/)).toBeVisible();
	await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Something else');

	// Release: readings, shop, CRS. A future date is refused and nothing typed is lost.
	await page.getByLabel('Released on').fill(daysAgo(-1));
	await page.getByLabel('Hours at release').fill('1010.0');
	await page.getByLabel('Landings at release').fill('900');
	await page.getByLabel('Performed by').fill('Shop Oy');
	await page.getByLabel('Approval / reference').fill('FI.145.0001 · work report 4512');
	await page.getByLabel('CRS signed by').fill('Matti Mekaanikko');
	await page.getByRole('button', { name: 'Release', exact: true }).click();
	await expect(page.getByText('The release date cannot be in the future.')).toBeVisible();
	await expect(page.getByLabel('Performed by')).toHaveValue('Shop Oy');
	await page.getByLabel('Released on').fill(daysAgo(0));
	await page.getByLabel('Licence / authorisation').fill('FI.66.12345');
	await page.getByRole('button', { name: 'Release', exact: true }).click();
	await expect(page).toHaveURL(/\?released=1$/);
	await expect(page.getByText('Released. The order is frozen')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Release to service' })).toBeVisible();
	await expect(page.locator('.facts')).toContainText('1010.0 h · 900 ldg');
	await expect(page.locator('.facts')).toContainText('Matti Mekaanikko');
	await expect(page.locator('.facts')).toContainText(/[0-9a-f]{64}/);
	await expect(page.getByText('installed ' + daysAgo(0))).toBeVisible();
	await expect(page.getByText('removed ' + daysAgo(0))).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
	await shoot(page, 'maintenance-work-order-released');

	// The released order refuses a new item, from a raw request too.
	const raw = await page.request.post(orderUrl + '?/addItem', { form: { description: 'late' }, headers: { origin: new URL(orderUrl).origin } });
	expect(await raw.text()).toContain('released and cannot be changed');

	// The due list moved: INSP-100H was last done at 1010.0 h today (due at 1110.0 h, though the
	// calendar controls); MAG-500H at 500.0 h TSN (new magneto, TSN 0 at fitting).
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('table tbody tr', { hasText: 'INSP-100H' })).toContainText(`1010.0 h · ${daysAgo(0)}`);
	await expect(page.locator('table tbody tr', { hasText: 'MAG-500H' })).toContainText('500.0 h');
	await page.locator('table tbody tr', { hasText: 'INSP-100H' }).getByRole('link', { name: 'INSP-100H' }).click();
	await expect(page.locator('.kv')).toContainText('1110.0 h');
	await expect(page.locator('.history')).toContainText('100-hour inspection + magneto');
	await page.goto('/airworthiness/OH-KML');
	await expect(page.getByText('Open work orders')).toBeVisible();
	await shoot(page, 'maintenance-dashboard');

	// Components: the new magneto is installed with TSN growing from 0 — never below it, even
	// while the log lags the mechanic's 1010.0 h; the old one is removed at 1010.0 h.
	await page.goto('/airworthiness/OH-KML/components');
	const newMag = page.locator('table tbody tr', { hasText: 'B5678' });
	await expect(newMag).toContainText('Magneto LH');
	const tsnNew = Number(await newMag.locator('td').nth(3).innerText());
	await page.goto('/airworthiness/OH-KML');
	const hoursNow = Number((await dash(0).innerText()).replace(/ h$/, ''));
	expect(tsnNew).toBeCloseTo(Math.max(0, hoursNow - 1010.0), 5);
	await page.goto('/airworthiness/OH-KML/components');
	await expect(page.locator('table tbody tr', { hasText: 'A1234' })).toContainText(`removed ${daysAgo(0)} at 1010.0 h`);
	await shoot(page, 'maintenance-components');
	await page.locator('table tbody tr', { hasText: 'B5678' }).getByRole('link', { name: 'Open' }).click();
	await expect(page.getByText('Installation history')).toBeVisible();
	await expect(page.locator('table tbody tr', { hasText: 'OH-KML' })).toContainText('TSN 0.0 · TSO 0.0 · CSN 0');
	await expect(page.locator('table tbody tr', { hasText: 'MAG-500H' })).toContainText('500.0 h');
	await shoot(page, 'maintenance-component');

	// Cancelling an order keeps it, marked, and nothing counts from it.
	await page.goto('/airworthiness/OH-KML/work-orders');
	await page.getByLabel('Title').fill('Opened by mistake');
	for (const box of await page.locator('.task-grid input[type=checkbox]').all()) await box.uncheck();
	await page.getByRole('button', { name: 'Open work order' }).click();
	await page.getByRole('button', { name: 'Cancel order' }).click();
	await page.getByLabel('Why').fill('double booking');
	await page.getByRole('button', { name: 'Cancel the order' }).click();
	await expect(page).toHaveURL(/\/work-orders$/);
	await expect(page.locator('tr.cancelled')).toContainText('Opened by mistake');
	await shoot(page, 'maintenance-work-orders');

	// ---- a defect, from the phone ----
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/logbook?saved=1');
	await page.getByRole('link', { name: 'Report a defect' }).click();
	await expect(page).toHaveURL(/\/defects\/new$/);
	await hydrated(page);
	await page.getByLabel('Aircraft').selectOption({ label: 'OH-KML · Cirrus SR20' });
	await page.getByLabel('What is wrong').fill('Nose wheel shimmy above 40 kt');
	await page.getByLabel('Details').fill('Strong shimmy on the landing roll from about 40 kt, stopped below 25 kt.');
	await page.getByLabel('Photo').setInputFiles(PHOTO);
	await shoot(page, 'defect-report');
	await page.getByRole('button', { name: 'Send report' }).click();
	await expect(page).toHaveURL(/\/defects\?saved=1$/);
	await expect(page.getByText('Defect #1 reported.')).toBeVisible();
	await expect(page.locator('.list-item', { hasText: '#1' }).first()).toContainText('awaiting assessment');
	await shoot(page, 'defects-pilot');
	await page.setViewportSize({ width: 1440, height: 900 });

	// Home shows the open defect; the dashboard needs attention.
	await page.goto('/home');
	await expect(page.getByText(/1 open defect — #1 Nose wheel shimmy/)).toBeVisible();
	await expect(page.getByText('1 defect waiting for assessment')).toBeVisible();
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('.chip.big')).toContainText('Needs attention');
	await expect(page.getByText('Defect #1 (Nose wheel shimmy above 40 kt) is awaiting assessment.')).toBeVisible();

	// The technical manager assesses it: grounds the aircraft.
	await page.goto('/airworthiness/OH-KML/defects');
	await expect(page.locator('table tbody tr', { hasText: '#1' })).toContainText('photo');
	await page.locator('table tbody tr', { hasText: '#1' }).getByRole('link', { name: 'Open' }).click();
	await expect(page.locator('.photos img')).toHaveCount(1);
	await hydrated(page);
	await page.getByLabel('Affects airworthiness — grounds the aircraft').check();
	await page.getByLabel('Assessment').fill('Nose gear shimmy damper suspected; not to be flown before inspection.');
	await page.getByRole('button', { name: 'Save assessment' }).click();
	await expect(page.getByText('Assessment saved.')).toBeVisible();
	await expect(page.getByText(/affects airworthiness — Nose gear shimmy damper suspected/)).toBeVisible();
	await shoot(page, 'defect-assessed');
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('.chip.big')).toContainText('Grounded');
	await expect(page.getByText('Defect #1 (Nose wheel shimmy above 40 kt) affects airworthiness — rectify before flight.')).toBeVisible();
	await expect(page.locator('.chip.danger.small')).toContainText('grounds the aircraft');
	await shoot(page, 'maintenance-dashboard-grounded');

	// Deferring a grounding defect is refused; a defect work order rectifies it.
	await page.goto('/airworthiness/OH-KML/defects');
	await page.locator('table tbody tr', { hasText: '#1' }).getByRole('link', { name: 'Open' }).click();
	await page.getByLabel('Assessed as not hazardous by').fill('someone');
	await page.getByLabel('Basis').fill('no');
	await page.getByLabel('Limit date').fill(daysAgo(-30));
	await page.getByRole('button', { name: 'Defer', exact: true }).click();
	await expect(page.locator('.alert.error').first()).toContainText('Only a defect assessed as not affecting airworthiness can be deferred');
	await page.getByRole('button', { name: 'Open a work order for this defect' }).click();
	await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}$/);
	await expect(page.locator('h1')).toContainText('Defect #1 — Nose wheel shimmy above 40 kt');
	await expect(page.locator('table tbody tr').first()).toContainText('#1 Nose wheel shimmy');
	await page.getByLabel('Released on').fill(daysAgo(0));
	await page.getByLabel('Hours at release').fill('1010.5');
	await page.getByLabel('Landings at release').fill('901');
	await page.getByLabel('CRS signed by').fill('Matti Mekaanikko');
	await page.getByRole('button', { name: 'Release', exact: true }).click();
	await expect(page.getByText('Released. The order is frozen')).toBeVisible();
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('.chip.big')).toContainText('Airworthy');
	await page.goto('/airworthiness/OH-KML/defects');
	await expect(page.locator('table tbody tr', { hasText: '#1' })).toContainText('Rectified');
	await shoot(page, 'defects-tm');

	// A second defect, assessed harmless and deferred with a limit: attention, not grounded.
	await page.goto('/defects/new?aircraft=OH-KML');
	await page.getByLabel('What is wrong').fill('Right nav light intermittent');
	await page.getByRole('button', { name: 'Send report' }).click();
	await expect(page.getByText('Defect #2 reported.')).toBeVisible();
	await page.goto('/airworthiness/OH-KML/defects');
	await page.locator('table tbody tr', { hasText: '#2' }).getByRole('link', { name: 'Open' }).click();
	await hydrated(page);
	await page.getByLabel('Does not affect airworthiness').check();
	await page.getByRole('button', { name: 'Save assessment' }).click();
	await expect(page.getByText('Assessment saved.')).toBeVisible();
	await page.getByLabel('Assessed as not hazardous by').fill('Matti Mekaanikko, FI.66.12345');
	await page.getByLabel('Basis').fill('Day VFR only; bulb on order');
	await page.getByLabel('Limit date').fill(daysAgo(-30));
	await page.getByRole('button', { name: 'Defer', exact: true }).click();
	await expect(page.getByText('Deferred. The dashboard shows the limit')).toBeVisible();
	await shoot(page, 'defect-deferred');
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('.chip.big')).toContainText('Needs attention');
	await expect(page.getByText(`Deferred defect #2 (Right nav light intermittent) — until ${daysAgo(-30)}`)).toBeVisible();

	// ---- pilot-owner release from the phone ----
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/pilot-owner');
	await page.getByRole('link', { name: 'New release' }).click();
	await expect(page).toHaveURL(/\/pilot-owner\/new$/);
	await hydrated(page);
	await expect(page.getByText('Signed as Juha Valkonen · pilot-owner · licence FI.FCL.TEST01')).toBeVisible();
	// Only OIL-50H is Appendix II in the sample programme.
	await expect(page.locator('.tasks label')).toHaveCount(1);
	await page.locator('.tasks label', { hasText: 'OIL-50H' }).locator('input').check();
	await page.getByLabel('Tacho reading').fill('1011.0');
	await page.getByLabel('Landings').fill('902');
	await page.getByLabel('Oil added (l)').fill('7.5');
	await page.getByLabel('Notes').fill('Aeroshell W100, filter CH48110');
	await shoot(page, 'pilot-owner-release');
	await page.getByRole('button', { name: 'Release to service' }).click();
	await expect(page).toHaveURL(/\/pilot-owner\?released=1$/);
	await expect(page.getByText('Released to service.')).toBeVisible();
	await expect(page.locator('.list-item', { hasText: 'OIL-50H' })).toContainText('1011.0 h · 902 ldg · oil added 7.5 l');
	await shoot(page, 'pilot-owner');
	await page.setViewportSize({ width: 1440, height: 900 });
	// OIL-50H's last done moved to the pilot-owner release (due at 1061.0 h; the calendar controls).
	await page.goto('/airworthiness/OH-KML');
	await expect(page.locator('table tbody tr', { hasText: 'OIL-50H' })).toContainText(`1011.0 h · ${daysAgo(0)}`);
	// The pilot-owner order is on the list, frozen, signed with the licence.
	await page.goto('/airworthiness/OH-KML/work-orders');
	const po = page.locator('table tbody tr', { hasText: 'Pilot-owner: OIL-50H' });
	await expect(po).toContainText('Juha Valkonen');
	await po.getByRole('link', { name: 'View' }).click();
	await expect(page.getByText('FI.FCL.TEST01')).toBeVisible();
	await expect(page.getByText('Pilot-owner maintenance (Part-ML Appendix II). I certify')).toBeVisible();

	// A member without a licence number on file sees the explanation, not the form.
	await logout(page);
	await login(page, ADMIN);
	await page.goto('/pilot-owner/new');
	await expect(page).toHaveURL(/\/pilot-owner$/);
	await expect(page.getByText('there is no licence number on your account')).toBeVisible();

	// Activity describes the releases with their hashes.
	await page.goto('/manage/activity?kind=airworthiness');
	await expect(page.getByText(/Released a OH-KML work order: .* at 1010 h \/ 900 landings \(Cirkus computed [0-9.]+ h\), 2 items, CRS Matti Mekaanikko, hash [0-9a-f]{64}/)).toBeVisible();
	await expect(page.getByText(/Pilot-owner release on OH-KML: OIL-50H on .* at 1011 h, signed Juha Valkonen \(FI.FCL.TEST01\), hash [0-9a-f]{64}/)).toBeVisible();
	await expect(page.getByText('Reported defect #1 on OH-KML: Nose wheel shimmy above 40 kt (1 photo)')).toBeVisible();
	await expect(page.getByText(/Assessed a OH-KML defect: affects airworthiness/)).toBeVisible();
	await shoot(page, 'activity-maintenance');
});
