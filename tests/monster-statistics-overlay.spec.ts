import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The game's statistics for one monster, in an overlay of their own.
 *
 * They used to sit beside the fields they inform, on the profile and on Rune
 * Optimization; now both carry one button that opens them over the page, and
 * neither page shows a share of its own. What is held here: the panel says it
 * is the game's, it shows every panel the dataset carries, it stacks on the
 * profile without disturbing it, and a monster nobody captured says so instead
 * of showing an empty frame.
 */

const source = JSON.parse(readFileSync(new URL('./fixtures/monster-overlay-account.json', import.meta.url), 'utf8')) as {
  unit_list: Record<string, unknown>[];
};

/* Akhamamir: catalogued, and captured at no awakening tier. */
const uncapturedMasterId = 17113;

async function importAccount(page: Page, account: unknown = source) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'statistics-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('statistics-account.json').first()).toBeVisible();
}

async function openProfile(page: Page, index = 0) {
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.locator('.monster-link').nth(index).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
}

const statistics = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#monster-statistics-title') });

test('the profile opens the game statistics over itself, and keeps no shares of its own', async ({ page }, testInfo) => {
  await importAccount(page);
  await openProfile(page);
  const profile = page.getByRole('dialog').first();

  /* The shares left the profile; one button stands in for them. */
  await expect(profile.getByText('Most common')).toHaveCount(0);
  await expect(profile.getByText('Not captured')).toHaveCount(0);

  /* An edit in progress survives a look at the statistics. */
  await profile.locator('.stat-range-input').first().fill('20000');
  await expect(profile.getByRole('button', { name: 'Save changes' })).toBeEnabled();

  const opener = profile.getByRole('button', { name: 'Game statistics for Elucia (2A)' });
  await expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
  const atRest = await opener.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('profile.png') });
  await opener.click();

  const panel = statistics(page);
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await page.screenshot({ path: testInfo.outputPath('statistics.png') });

  /* It says whose figures these are before anything else. */
  await expect(panel.locator('.game-statistics-eyebrow')).toHaveText('Game statistics');
  await expect(panel.getByRole('heading', { name: 'Elucia (2A)' })).toBeVisible();
  /* The figures speak alone: no facts row, no counts, no bars. */
  await expect(panel.locator('.overlay-facts, .overlay-provenance')).toHaveCount(0);

  /* Every panel the dataset carries, the relic and the rune sub properties included. */
  await expect(panel.locator('.overlay-block-title')).toHaveText(['Runes', 'Artifacts', 'Relics']);
  await expect(panel.locator('.game-statistics-card-title')).toHaveText([
    'Builds', 'Slot 2', 'Slot 4', 'Slot 6', 'Sub properties', 'Attribute artifact', 'Type artifact', 'Relic',
  ]);
  /* Slot mains are named in the game's words, as the sub properties beside them are. */
  await expect(panel.getByRole('list', { name: 'Slot 2 main' }).getByRole('listitem').first()).toContainText('SPD');
  await expect(panel.getByRole('list', { name: 'Rune sub properties', exact: true }).getByRole('listitem')).toHaveCount(11);
  /* A long distribution keeps its leaders and folds the rest. */
  await expect(panel.getByRole('list', { name: 'Attribute artifact sub properties' }).getByRole('listitem').last()).toContainText('Others');
  await expect(panel.getByText('Not captured')).toHaveCount(0);

  /* Read at a glance: nothing overflows sideways, and the body does not scroll at 1080. */
  const fits = await panel.locator('.game-statistics-body').evaluate((element) => element.scrollHeight <= element.clientHeight);
  expect(fits).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  /* Escape closes the statistics only, and hands focus back to the button. */
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(opener).toBeFocused();
  expect(await opener.boundingBox()).toEqual(atRest);
  await expect(profile.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await expect(profile.locator('.stat-range-input').first()).toHaveValue('20000');
});

test('Rune Optimization offers the statistics beside the monster, and only once one is chosen', async ({ page }) => {
  await importAccount(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  const opener = page.locator('main').getByRole('button', { name: /^Game statistics/ });
  await expect(opener).toBeDisabled();
  const panel = page.locator('.rune-optimization-monster-panel');
  const before = await panel.boundingBox();

  await page.getByLabel('Monster', { exact: true }).selectOption('1');
  await expect(opener).toBeEnabled();
  await expect(opener).toHaveAccessibleName('Game statistics for Elucia (2A)');
  /* Choosing a monster enables the button; it moves nothing. */
  expect(await panel.boundingBox()).toEqual(before);
  /* The slots no longer carry the population's mains under them. */
  await expect(page.locator('.rune-optimization-slot .rune-optimization-provenance')).toHaveCount(0);

  await opener.click();
  await expect(statistics(page)).toBeVisible();
  await expect(statistics(page).getByRole('heading', { name: 'Elucia (2A)' })).toBeVisible();
  await statistics(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a monster nobody captured says so rather than showing an empty panel', async ({ page }, testInfo) => {
  const account = structuredClone(source);
  account.unit_list[1].unit_master_id = uncapturedMasterId;
  await importAccount(page, account);
  await openProfile(page, 1);
  await page.getByRole('dialog').getByRole('button', { name: /^Game statistics for / }).click();
  const panel = statistics(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/statistics for this monster have not been captured yet/)).toBeVisible();
  await expect(panel.locator('.game-statistics-card')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('uncaptured.png') });
});
