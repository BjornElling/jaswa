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
  /* Three exceptional pairs lead, and the two poor ones close the list. */
  await expect(rows(page).first()).toContainText('Exceptional');
  await expect(rows(page).last()).toContainText('Poor');
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

/** The advice cell, whose title carries the arithmetic behind the verdict. */
const adviceFor = (page: Page, effect: string) => rowFor(page, effect).locator('td').nth(7);

test('the advice shows the verdict and nothing else', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveText('Sell');
  await expect(adviceFor(page, 'per 500 ATK')).toHaveText('Keep');
});

test('the arithmetic behind a verdict is still there to be checked', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* A verdict nobody can check is a verdict nobody can argue with, so the
     working moved into the cell's title rather than off the page. */
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveAttribute('title', 'Merit 0.05 under 0.26');
  await expect(adviceFor(page, 'per 150 SPD')).toHaveAttribute('title', 'Second copy; 0.48 under 1.0');
});

test('the risk slider decides whether a second copy is worth the stones', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, 'per 150 SPD');
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  /* An exceptional fit three levels behind the copy in front of it, at rates
     of 35 % and worse: 10 × 5 % = 0.48, which clears the bold bar and nothing
     above it. */
  const advice = adviceFor(page, 'per 150 SPD');
  await expect(challenger).toContainText('Sell');
  await expect(advice).toHaveAttribute('title', 'Second copy; 0.48 under 1.0');

  await risk.fill('5');
  await expect(challenger).toContainText('Power up');
  await expect(advice).toHaveAttribute('title', '10.0 × 5 % past +12 = 0.48');

  await risk.fill('1');
  await expect(challenger).toContainText('Sell');
  await expect(advice).toHaveAttribute('title', 'Second copy; 0.48 under 2.5');
});

test('a poor fit sells whatever room it has left', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Full durability and fifteen levels of headroom, and still a sell: a tenth
     of a finished relic's strength cannot clear the holding bar, however much
     room is left. No rule says poor fits sell; the multiplication does. */
  const mismatched = rowFor(page, 'per 2,500 ATK');
  await expect(mismatched).toContainText('Poor');
  await expect(mismatched).toContainText('Sell');
  await expect(adviceFor(page, 'per 2,500 ATK')).toHaveAttribute('title', 'Merit 0.05 under 0.26');
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
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Sell' }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('group', { name: 'Filter by main stat' }).getByRole('button', { name: 'HP' }).click();
  await expect(rows(page)).toHaveCount(2);
  await risk.fill('5');

  await page.getByRole('button', { name: 'Reset relics filters' }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(risk).toHaveValue('3');
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
