import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Rune Optimization's own contracts (`docs/RUNE-OPTIMIZATION.md` §8).
 *
 * The ones held here are the ones a reader of the code cannot see fail: that a
 * change made for one calculation never writes itself back into the monster's
 * profile; that the settings the page does own survive a reload; that the table
 * answers the question on screen and says when it no longer does; and that
 * choosing a build, or a requirement, moves nothing but what was chosen.
 */

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function openOptimization(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
}

/* In page coordinates, not the viewport's: Playwright scrolls a control into view
   before clicking it, and a box that moved only because the page scrolled has not
   moved under the user. */
async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  });
}

function storedPreferences(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('jaswa-preferences');
    return raw ? JSON.parse(raw) as Record<string, unknown> : undefined;
  });
}

test('without an import the page says what it needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openOptimization(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find builds' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('optimization-no-import.png'), fullPage: true });
});

test('finds builds from the profile, keeps the profile untouched, and moves nothing it did not choose', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);

  /* Nothing is chosen until a monster is: no requirements to show, nothing to find. */
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('optimization-empty.png'), fullPage: true });

  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  await expect(requirements).toBeVisible();
  /* This copy has no profile, so the builds are open and the figures are its own. */
  await expect(requirements.getByText('The profile names no build, so any will do')).toBeVisible();

  /* A requirement changed here changes that field's caption and nothing else. */
  const panelBefore = await box(requirements);
  await requirements.getByLabel('Allow Intangible runes').check();
  await expect(requirements.getByText('Changed for this calculation')).toBeVisible();
  expect(await box(requirements)).toEqual(panelBefore);

  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(table.getByRole('row')).not.toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toContainText('Processor');
  await expect(table.getByRole('row', { name: /^Now/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-results.png'), fullPage: true });

  /* Choosing a build opens its six runes below the table and leaves the table where it was. */
  const tableBefore = await box(table);
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const detail = page.getByRole('region', { name: 'Build 1' });
  await expect(detail.getByRole('listitem').filter({ hasText: /^Slot \d/ })).toHaveCount(6);
  expect(await box(table)).toEqual(tableBefore);
  await page.screenshot({ path: testInfo.outputPath('optimization-build.png'), fullPage: true });

  /* Every column sorts. */
  await table.getByRole('button', { name: 'E.HP', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'E.HP', exact: true })).toHaveAttribute('aria-sort', 'descending');

  /* The calculation's own changes never reach the profile. */
  const stored = await storedPreferences(page);
  /* A fresh workspace writes nothing until a choice is saved, so no document at all passes too. */
  expect((stored?.monsterPreferences as Record<string, unknown> | undefined)?.['11']).toBeUndefined();

  /* The page's settings are the user's and are kept; changing one says the table is stale. */
  const settings = page.getByRole('region', { name: 'How to search' });
  const gradeSelect = settings.getByLabel('Gems: grade');
  await expect(gradeSelect).toBeDisabled();
  const settingsBefore = await box(settings);
  await settings.getByRole('radio', { name: 'Theoretical' }).first().check();
  await expect(gradeSelect).toBeEnabled();
  expect(await box(settings)).toEqual(settingsBefore);
  await expect(page.getByText('Find builds again to refresh this table.', { exact: false })).toBeVisible();
  await expect.poll(async () => ((await storedPreferences(page))?.runeOptimization as Record<string, unknown>)?.gems).toBe('theoretical');
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(page.getByRole('region', { name: 'How to search' }).getByRole('radio', { name: 'Theoretical' }).first()).toBeChecked();
});

test('a target nothing can reach is answered with an empty table that says why', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('At least Spd').fill('999');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByText('No build meets every requirement.', { exact: false })).toBeVisible();
  /* The current build is still there to read against. */
  await expect(page.getByRole('table', { name: 'Rune builds' }).getByRole('row', { name: /^Now/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-unreachable.png'), fullPage: true });
});
