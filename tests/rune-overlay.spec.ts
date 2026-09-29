import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

async function openCleanup(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const links = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody .rune-link');
  await expect(links.first()).toBeVisible();
  return links;
}

test('the rune overlay states the rune and nothing else, and returns focus', async ({ page }, testInfo) => {
  await openCleanup(page);
  /* Chosen by what it is, not by where it sorts: the table opens in Obtained
     order, which a change to the fixture would reshuffle. */
  const firstRune = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ })
    .locator('.rune-link');
  await firstRune.click();

  const overlay = page.getByRole('dialog', { name: 'Violent' });
  await expect(overlay).toBeVisible();
  /* The stats need no headings; the reader knows which is which. */
  for (const heading of ['Main property', 'Innate property', 'Sub properties']) {
    await expect(overlay.getByText(heading, { exact: true })).toHaveCount(0);
  }
  await expect(overlay.getByText('No innate', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Legend', { exact: true })).toBeVisible();
  /* Four lines always, the unrevealed ones blank, so the box keeps its height. */
  await expect(overlay.locator('.rune-overlay-subs tbody tr')).toHaveCount(4);
  await expect(overlay.getByRole('table', { name: 'Sub properties' }).locator('tbody').getByRole('row')).toHaveCount(2);
  /* Below +12 the lines are not final, so no craft is named yet. */
  await expect(overlay.getByRole('columnheader', { name: 'Max stats' })).toHaveAttribute('title', /Decided at \+12/);
  await expect(overlay.getByText('Not revealed yet')).toHaveCount(0);
  await expect(overlay.getByText(/at \+15/)).toHaveCount(0);
  await expect(overlay.getByText('Rune', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText(/piece set/)).toHaveCount(0);
  /* The projection it used to carry belongs to the pages that judge a rune. */
  await expect(overlay.getByText('Substat potential at +15')).toHaveCount(0);
  await expect(overlay.getByText('What can still improve')).toHaveCount(0);
  await expect(overlay.getByText('Inventory', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-overlay-open.png') });

  /* One close control, the overlay's own. */
  await expect(overlay.getByRole('button', { name: 'Close', exact: true })).toHaveCount(1);
  await overlay.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(firstRune).toBeFocused();
});

test('Max stats names the Gem and the stones the verdict counted', async ({ page }) => {
  const links = await openCleanup(page);
  await links.filter({ hasText: 'Fatal' }).click();
  const overlay = page.getByRole('dialog', { name: 'Fatal' });
  const table = overlay.getByRole('table', { name: 'Sub properties' });
  await expect(table.getByRole('columnheader', { name: 'Max stats' })).toHaveAttribute('title', /Max value counts, for /);
  const maxOf = (line: RegExp) => table.locator('tbody tr').filter({ hasText: line }).locator('td').nth(3);
  /* The Gem goes where it gains most, which here is the HP line, into CRI Rate; the
     grindable lines carry the credited stone. Resistance takes no stone. */
  await expect(maxOf(/^HP/)).toHaveText('CRI Rate');
  await expect(maxOf(/^HP/).getByRole('img', { name: 'Enchanted Gem to' })).toBeVisible();
  await expect(maxOf(/^ATK/)).toHaveText('+6%');
  await expect(maxOf(/^SPD/)).toHaveText('+4');
  await expect(maxOf(/^Resistance/)).toHaveText('');
});

test('a worn rune names its wearer as a way into that monster', async ({ page }) => {
  const links = await openCleanup(page);
  await links.filter({ hasText: 'Fatal' }).click();
  const overlay = page.getByRole('dialog', { name: 'Fatal' });
  await overlay.getByRole('button', { name: 'Elucia (2A)' }).click();
  await expect(page.getByRole('dialog', { name: /Elucia/ })).toBeVisible();
});

test('while an overlay is up the page behind it neither scrolls nor keeps it open', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 700 });
  const links = await openCleanup(page);
  const opener = links.first();
  await opener.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolled = await page.evaluate(() => window.scrollY);
  const resting = await opener.boundingBox();

  const overlay = page.getByRole('dialog');
  await opener.click();
  await expect(overlay).toBeVisible();
  /* Locking the page must not move it: the stable gutter keeps the scrollbar's room. */
  expect(await opener.boundingBox()).toEqual(resting);
  await page.mouse.move(300, 650);
  await page.mouse.wheel(0, 600);
  await page.keyboard.press('End');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  await opener.click();
  await page.mouse.click(300, 60);
  await expect(overlay).toBeHidden();

  /* The mouse's back button closes the overlay rather than leaving the page. */
  await opener.click();
  const url = page.url();
  const box = (await overlay.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const at = { x: box.x + 40, y: box.y + box.height / 2 };
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'back', buttons: 8, clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'back', buttons: 0, clickCount: 1 });
  await expect(overlay).toBeHidden();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});
