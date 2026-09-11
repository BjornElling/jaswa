import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Six relics chosen to reach every state the page can be in: an exceptional
   pair and a poor one, a relic at the ceiling, a relic whose durability ran out
   below it, a neutral fit, and two copies of one pair so the duplicate rule has
   something to decide. */
const relicAccount = fileURLToPath(new URL('./fixtures/relic-account.json', import.meta.url));

async function importAccount(page: Page, file: string) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText(basename(file))).toBeVisible();
}

async function openRelics(page: Page) {
  await page.getByRole('button', { name: 'Relics', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
}

const rows = (page: Page) => page.getByRole('table', { name: 'Relic library', exact: true }).locator('tbody tr');

/** The row for one relic, found by the effect line only that relic carries. */
const rowFor = (page: Page, effect: string) => rows(page).filter({ hasText: effect });

test('every relic in the import reaches the table', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByLabel('6 of 6 relics shown')).toBeVisible();
});

test('the unique property reads in the game’s own words', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The name is two rules — the family is what it grants, the prefix the stat
     it reads — so every one of the sixteen is a different pair. */
  const primal = rowFor(page, 'per 125 SPD');
  await expect(primal).toContainText('Nimble Primal');
  await expect(primal).toContainText('MAX HP +2 % per 125 SPD');
  await expect(rowFor(page, 'per 500 ATK')).toContainText('Sharp Conquest');
  await expect(rowFor(page, 'per 500 ATK')).toContainText('DMG dealt +1 % per 500 ATK');
  /* Named, never quantified: the main column is the stat and nothing else. */
  await expect(primal.locator('td').nth(1)).toHaveText('HP');
});

test('the unique property carries the threshold its level and stat call for', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The threshold is what a power-up moves, and it steps every three levels:
     an ATK-reading property is 2,500 at +0, 2,000 at +5 and 1,000 at +9, and a
     SPD-reading one is 150 at +9 and 125 at +12. */
  await expect(rowFor(page, 'per 2,500 ATK')).toContainText('+0');
  await expect(rowFor(page, 'per 2,000 ATK')).toContainText('+5');
  await expect(rowFor(page, 'per 1,000 ATK')).toContainText('+9');
  await expect(rowFor(page, 'per 125 SPD')).toContainText('+12');
});

test('the page claims nothing it cannot show', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Synergy is a table, not a measurement, and the power-up rates are the
     game's own — neither needs a paragraph on the page saying so. Both belong
     to `docs/RELIC-CANONICAL.md`, where they can be argued with. */
  await expect(page.getByText('Synergy is measured')).toHaveCount(0);
  await expect(page.getByText('Power-up rates are the game')).toHaveCount(0);
});

test('the table opens on synergy, best fit first', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The account has two exceptional pairs; its one weak pair closes the list. */
  await expect(rows(page).first()).toContainText('Exceptional');
  await expect(rows(page).last()).toContainText('Weak');
});

test('a level says why it is where it is', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* +15 and a spent relic are both dead ends, and the page has to tell them
     apart: one is finished, the other merely stopped. */
  await expect(rowFor(page, 'per 500 ATK')).toContainText('+15');
  await expect(rowFor(page, 'per 500 ATK').getByText('At the maximum level')).toBeAttached();
  await expect(rowFor(page, 'per 1,000 ATK').getByText('No power-up attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 150 SPD').getByText('Can still be powered up')).toBeAttached();
});

test('durability is stated as attempts left, all three pips present', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rowFor(page, 'per 2,500 ATK').getByText('3 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 2,000 ATK').getByText('2 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 125 SPD').getByText('0 of 3 attempts left')).toBeAttached();
});

test('a finished relic is kept even though it can never reach +15', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The case that forces two recursions rather than one: P(+15) is 0 because
     the durability is gone, and the relic is still one of the best on the
     account. Judging it on P alone would have sold it. */
  const spent = rowFor(page, 'per 125 SPD');
  await expect(spent.locator('td').nth(5)).toContainText('+12');
  await expect(spent.locator('td').nth(5)).toContainText('at least');
  await expect(spent).toContainText('Keep');
});

test('the landing column names a level the relic can realistically reach', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* A fresh relic is free to +3 and then fights a falling rate, so it lands
     around +7 — not at +15, which the published rates make a lottery. */
  const fresh = rowFor(page, 'per 2,500 ATK');
  await expect(fresh.locator('td').nth(5)).toContainText('+7');
  const halfway = rowFor(page, 'per 2,000 ATK');
  await expect(halfway.locator('td').nth(5)).toContainText('+7');
});

/** The advice cell, whose visible second line carries the arithmetic. */
const adviceFor = (page: Page, effect: string) => rowFor(page, effect).locator('td').nth(7);

test('the advice shows a verdict with its short calculation', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText('Power upFree +1: 100%');
  await expect(adviceFor(page, 'per 500 ATK')).toHaveText('KeepCannot power up.');
});

test('the visible calculation distinguishes a score from a chance', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(adviceFor(page, 'per 150 SPD')).toHaveText('SellBeat +12: 4.8%×4=19% < 80%');
});

test('the score threshold decides whether a second copy is worth the stones', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, 'per 150 SPD');
  const threshold = page.getByRole('slider', { name: 'Power-up score threshold, 1 cautious to 5 bold' });

  /* An exceptional challenger has a 4.8 % chance to pass +12. Its ×4 fit
     creates a 19 % score, still below even the bold 20 % threshold. */
  const advice = adviceFor(page, 'per 150 SPD');
  await expect(challenger).toContainText('Sell');
  await expect(advice).toHaveText('SellBeat +12: 4.8%×4=19% < 80%');

  await threshold.fill('5');
  await expect(challenger).toContainText('Sell');
  await expect(advice).toHaveText('SellBeat +12: 4.8%×4=19% < 20%');

  await threshold.fill('1');
  await expect(challenger).toContainText('Sell');
  await expect(advice).toHaveText('SellBeat +12: 4.8%×4=19% < 180%');
});

test('changing the score threshold leaves the table geometry fixed', async ({ page }, testInfo) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const table = page.getByRole('table', { name: 'Relic library', exact: true });
  const threshold = page.getByRole('slider', { name: 'Power-up score threshold, 1 cautious to 5 bold' });
  const before = await table.locator('tbody tr').evaluateAll((cells) => cells.map((cell) => {
    const { x, y, width, height } = cell.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await page.screenshot({ path: testInfo.outputPath('relic-threshold-before.png') });

  await threshold.fill('5');
  await expect(adviceFor(page, 'per 2,000 ATK')).toHaveText('Power upNext +1: 60%×.5=30%');
  await page.screenshot({ path: testInfo.outputPath('relic-threshold-after.png') });

  const after = await table.locator('tbody tr').evaluateAll((cells) => cells.map((cell) => {
    const { x, y, width, height } = cell.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(after).toEqual(before);
});

test('a free level always powers up before a stone decision exists', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const fresh = rowFor(page, 'per 2,500 ATK');
  await expect(fresh).toContainText('Neutral');
  await expect(fresh).toContainText('Power up');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText('Power upFree +1: 100%');
});

test('a relic engraved on monsters counts them, and an unused one says so', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const engraved = rowFor(page, 'per 125 SPD');
  await expect(engraved.locator('td').nth(6)).toHaveText('2');
  await expect(rowFor(page, 'per 150 SPD').locator('td').nth(6)).toHaveText('—');
});

test('filters narrow the table and Reset puts every one of them back', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const threshold = page.getByRole('slider', { name: 'Power-up score threshold, 1 cautious to 5 bold' });

  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Sell' }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('group', { name: 'Filter by main stat' }).getByRole('button', { name: 'HP' }).click();
  await expect(rows(page)).toHaveCount(1);
  await threshold.fill('5');

  await page.getByRole('button', { name: 'Reset relics filters' }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(threshold).toHaveValue('3');
});

test('the headings say what their column holds', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const heading = page.getByRole('table', { name: 'Relic library columns' });
  await expect(heading.getByRole('button', { name: 'Level it lands on or above half the time' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'Monsters it is engraved on' })).toBeVisible();
  await expect(heading.locator('th')).toHaveCount(8);
});

test('a filter click never moves the columns under the user', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const heading = page.getByRole('table', { name: 'Relic library columns' });
  const before = await heading.locator('th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));

  await page.getByRole('group', { name: 'Filter by synergy' }).getByRole('button', { name: 'EXC' }).click();
  await expect(rows(page)).toHaveCount(3);

  const after = await heading.locator('th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(after).toEqual(before);
});
