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
  /* Below +12 a stone may already go on and a Gem may not, so Improvements names the
     stones the verdict counted and no Gem. */
  await expect(overlay.getByRole('columnheader', { name: 'Improvements' })).toHaveAttribute('title', /Gem is decided at \+12/);
  const improvements = overlay.getByRole('table', { name: 'Sub properties' }).locator('tbody tr td:nth-child(4)');
  await expect(improvements.filter({ hasText: /^\+\d+%?$/ })).toHaveCount(2);
  await expect(overlay.locator('.rune-overlay-subs').getByRole('img', { name: 'Enchanted Gem to' })).toHaveCount(0);
  await expect(overlay.getByText('Not revealed yet')).toHaveCount(0);
  /* The stats box states the rune as it is; only Evaluation speaks of +15. */
  await expect(overlay.locator('.rune-overlay-stats').getByText(/at \+15/)).toHaveCount(0);
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

test('Improvements names the Gem and the stones the verdict counted', async ({ page }) => {
  const links = await openCleanup(page);
  await links.filter({ hasText: 'Fatal' }).click();
  const overlay = page.getByRole('dialog', { name: 'Fatal' });
  const table = overlay.getByRole('table', { name: 'Sub properties' });
  await expect(table.getByRole('columnheader', { name: 'Improvements' })).toHaveAttribute('title', /Max value counts, for /);
  const maxOf = (line: RegExp) => table.locator('tbody tr').filter({ hasText: line }).locator('td').nth(3);
  /* The Gem goes where it gains most, which here is the HP line, into CRI Rate; the
     grindable lines carry the credited stone. Resistance takes no stone. */
  /* The Gem is named with the roll Max value counts for it, unsigned: it is what the
     line becomes, not something added to it. */
  await expect(maxOf(/^HP/)).toHaveText(/^CRI Rate\s*6%$/);
  await expect(maxOf(/^HP/).getByRole('img', { name: 'Enchanted Gem to' })).toBeVisible();
  await expect(maxOf(/^ATK/)).toHaveText('+6%');
  await expect(maxOf(/^SPD/)).toHaveText('+4');
  await expect(maxOf(/^Resistance/)).toHaveText('');
});

test('Evaluation explains Best preset with every preset\'s reading, at one height', async ({ page }) => {
  await openCleanup(page);
  const row = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ });
  await row.locator('.rune-link').click();
  const overlay = page.getByRole('dialog', { name: 'Violent' });
  const evaluation = overlay.getByRole('region', { name: 'Evaluation' });
  const readings = evaluation.getByRole('table', { name: 'Every preset\'s reading' });
  /* Every preset has a row before the answer lands, so the box does not grow under it. */
  await expect(readings.locator('tbody tr')).toHaveCount(10);
  const early = await evaluation.boundingBox();
  const best = readings.locator('tbody tr[aria-current="true"]');
  await expect(best).toHaveCount(1);
  expect(await evaluation.boundingBox()).toEqual(early);
  /* Ranked the way Best preset is chosen, so the choice leads the list. */
  await expect(readings.locator('tbody tr').first()).toHaveAttribute('aria-current', 'true');

  /* The starred row is the preset the verdict table names, with the same Max value. */
  const presetName = (await best.getByRole('rowheader').textContent())!;
  await expect(best.getByRole('img', { name: 'Best preset' })).toBeVisible();
  await expect(evaluation.getByText(presetName, { exact: true }).first()).toBeVisible();
  await expect(row).toContainText(presetName);
  const bestMax = (await best.locator('td').nth(1).textContent())!;
  /* A preset that prefers or accepts the rune says so; one that cannot read it, nothing. */
  await expect(readings.getByRole('img', { name: /^(Preferred|Accepted)$/ }).first()).toBeVisible();
  await expect(readings.locator('tbody tr').last().locator('td').first()).toBeEmpty();
  await expect(row).toContainText(`${Math.round(Number.parseFloat(bestMax))} %`);
  const facts = evaluation.locator('.rune-overlay-evaluation-facts dd');
  await expect(facts.nth(1)).toHaveText(/^(Preferred|Accepted|Broken)$/);
  /* The build the reading assumed, one main per choosing slot in the editor's words. */
  await expect(facts.nth(2)).toHaveText(/^[A-Za-z]+%? \/ [A-Za-z]+%? \/ [A-Za-z]+%?$/);
  await expect(facts.nth(3)).toHaveText(/^\d+\.\d %$/);
  await expect(facts.nth(4)).toHaveText(/^(\d+\.\d %|None)$/);
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
