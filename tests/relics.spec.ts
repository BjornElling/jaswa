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
  await expect(rowFor(page, '+1 % per 220').getByText('Can still be powered up')).toBeAttached();
});

test('durability is stated as attempts left, all three pips present', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  await expect(rowFor(page, '+1 % per 220').getByText('3 of 3 attempts left')).toBeAttached();
  await expect(rowFor(page, '+3 % per 150').getByText('0 of 3 attempts left')).toBeAttached();
});

test('the risk slider decides whether a second copy is worth the stones', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const challenger = rowFor(page, '+1 % per 220');
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  /* At the default appetite the low copy has a better than even chance of
     passing the kept one, so it earns the stones. */
  await expect(challenger).toContainText('Power up');
  await expect(challenger).toContainText('to pass the +12 copy');

  await risk.fill('1');
  await expect(challenger).toContainText('Sell');
  await expect(challenger).toContainText('Second copy behind a +12');

  await risk.fill('5');
  await expect(challenger).toContainText('Power up');
});

test('a poor fit sells whatever room it has left', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  /* Full durability and fifteen levels of headroom, and still a sell: the two
     halves of the relic pull against each other, which no power-up fixes. */
  const mismatched = rowFor(page, '+1 % per 300');
  await expect(mismatched).toContainText('Poor');
  await expect(mismatched).toContainText('Sell');
  await expect(mismatched).toContainText('Main and unique pull apart');
});

test('a relic engraved on monsters counts them, and an unused one says so', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const engraved = rowFor(page, '+3 % per 150');
  await expect(engraved.locator('td').nth(6)).toHaveText('2');
  await expect(rowFor(page, '+1 % per 220').locator('td').nth(6)).toHaveText('—');
});

test('filters narrow the table and Reset puts every one of them back', async ({ page }) => {
  await importAccount(page, relicAccount);
  await openRelics(page);
  const risk = page.getByRole('slider', { name: 'Power-up risk appetite, 1 cautious to 5 bold' });

  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Sell' }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('group', { name: 'Filter by main stat' }).getByRole('button', { name: 'HP' }).click();
  await expect(rows(page)).toHaveCount(1);
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
