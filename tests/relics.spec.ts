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
  await expect(rowFor(page, '+3 % per 1,500')).toContainText('+15');
  await expect(rowFor(page, '+3 % per 1,500').getByText('At the maximum level')).toBeAttached();
  await expect(rowFor(page, '+2 % per 1,200').getByText('No power-up attempts left')).toBeAttached();
  await expect(rowFor(page, '+1 % per 240').getByText('Can still be powered up')).toBeAttached();
});

test('durability is stated as attempts left, all three pips present', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rowFor(page, '+1 % per 300').getByText('3 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, '+1 % per 240').getByText('2 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, '+3 % per 150').getByText('0 of 3 attempts left')).toBeAttached();
});

test('a finished relic is kept even though it can never reach +15', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The case that forces two recursions rather than one: P(+15) is 0 because
     the durability is gone, and the relic is still one of the best on the
     account. Judging it on P alone would have sold it. */
  const spent = rowFor(page, '+3 % per 150');
  await expect(spent.locator('td').nth(5)).toHaveText('0 %');
  await expect(spent.locator('td').nth(6)).toContainText('+12');
  await expect(spent.locator('td').nth(6)).toContainText('at least');
  await expect(spent).toContainText('Keep');
});

test('the landing column names a level the relic can realistically reach', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* The median, not the mode. The single likeliest outcome is +15 for every
     relic with an attempt left — it collects every path that gets there while
     the fourteen levels below split what is left — so a mode column would read
     "+15" down the page and repeat the To +15 column beside it. */
  const fresh = rowFor(page, '+1 % per 300');
  await expect(fresh.locator('td').nth(5)).toHaveText('28 %');
  await expect(fresh.locator('td').nth(6)).toContainText('+10');
  const halfway = rowFor(page, '+2 % per 260');
  await expect(halfway.locator('td').nth(6)).toContainText('+11');
});

test('the advice states the multiplication it was made from', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* A verdict nobody can check is a verdict nobody can argue with, so every
     reason is the arithmetic itself. */
  await expect(rowFor(page, '+1 % per 300')).toContainText('Merit 0.18 under 0.45');
  await expect(rowFor(page, '+1 % per 240')).toContainText('Second copy; 0.72 under 1.00');
});

test('the risk slider decides whether a second copy is worth the stones', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, '+1 % per 240');
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  /* An exceptional fit four levels' worth of luck behind the copy in front of
     it: 4 × 18 % = 0.72, which clears the bold bar and nothing above it. */
  await expect(challenger).toContainText('Sell');
  await expect(challenger).toContainText('Second copy; 0.72 under 1.00');

  await risk.fill('5');
  await expect(challenger).toContainText('Power up');
  await expect(challenger).toContainText('4 × 18 % past +12 = 0.72');

  await risk.fill('1');
  await expect(challenger).toContainText('Sell');
  await expect(challenger).toContainText('Second copy; 0.72 under 2.00');
});

test('a poor fit sells whatever room it has left', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Full durability and fifteen levels of headroom, and still a sell: a quarter
     of a finished relic's strength cannot clear the holding bar, however much
     room is left. No rule says poor fits sell; the multiplication does. */
  const mismatched = rowFor(page, '+1 % per 300');
  await expect(mismatched).toContainText('Poor');
  await expect(mismatched).toContainText('Sell');
  await expect(mismatched).toContainText('Merit 0.18 under 0.45');
});

test('a relic engraved on monsters counts them, and an unused one says so', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const engraved = rowFor(page, '+3 % per 150');
  await expect(engraved.locator('td').nth(7)).toHaveText('2');
  await expect(rowFor(page, '+1 % per 240').locator('td').nth(7)).toHaveText('—');
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
