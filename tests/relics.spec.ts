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
});

test('the unique property carries the threshold its level and stat call for', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The threshold is what a power-up moves, and it steps every three levels:
     a SPD-reading property is 300 at +0, 150 at +9 and 125 at +12. */
  await expect(rowFor(page, 'per 300 SPD')).toContainText('+0');
  await expect(rowFor(page, 'per 150 SPD')).toContainText('+9');
  await expect(rowFor(page, 'per 125 SPD')).toContainText('+12');
});

test('the page states the rates it projects from', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(page.getByText('Power-up rates are the game')).toContainText('free to +3');
  await expect(page.getByText('Power-up rates are the game')).toContainText('10 % at +14');
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
  await expect(rowFor(page, 'per 300 SPD').getByText('3 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, 'per 250 SPD').getByText('2 of 3 attempts left')).toBeAttached();
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
  const fresh = rowFor(page, 'per 300 SPD');
  await expect(fresh.locator('td').nth(5)).toContainText('+7');
  const halfway = rowFor(page, 'per 250 SPD');
  await expect(halfway.locator('td').nth(5)).toContainText('+7');
});

test('the advice states the multiplication it was made from', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* A verdict nobody can check is a verdict nobody can argue with, so every
     reason is the arithmetic itself. */
  await expect(rowFor(page, 'per 300 SPD')).toContainText('Merit 0.05 under 0.26');
  await expect(rowFor(page, 'per 150 SPD')).toContainText('Second copy; 0.48 under 1.0');
});

test('the risk slider decides whether a second copy is worth the stones', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, 'per 150 SPD');
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  /* An exceptional fit three levels behind the copy in front of it, at rates
     of 35 % and worse: 10 × 5 % = 0.48, which clears the bold bar and nothing
     above it. */
  await expect(challenger).toContainText('Sell');
  await expect(challenger).toContainText('Second copy; 0.48 under 1.0');

  await risk.fill('5');
  await expect(challenger).toContainText('Power up');
  await expect(challenger).toContainText('10.0 × 5 % past +12 = 0.48');

  await risk.fill('1');
  await expect(challenger).toContainText('Sell');
  await expect(challenger).toContainText('Second copy; 0.48 under 2.5');
});

test('a poor fit sells whatever room it has left', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Full durability and fifteen levels of headroom, and still a sell: a quarter
     of a finished relic's strength cannot clear the holding bar, however much
     room is left. No rule says poor fits sell; the multiplication does. */
  const mismatched = rowFor(page, 'per 300 SPD');
  await expect(mismatched).toContainText('Poor');
  await expect(mismatched).toContainText('Sell');
  await expect(mismatched).toContainText('Merit 0.05 under 0.26');
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
