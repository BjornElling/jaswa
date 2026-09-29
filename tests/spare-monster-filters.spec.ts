import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/spare-monsters-account.json', import.meta.url));

async function openMonsters(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
}

test('Stats hides Rainbowmons and Devilmons until asked, without moving its filters', async ({ page }) => {
  await openMonsters(page);
  await page.locator('summary').filter({ hasText: 'Stats' }).click();
  const include = page.getByRole('group', { name: 'Choose which monsters to include' });
  const rainbowmon = include.getByRole('button', { name: 'Rainbowmons and Devilmons' });
  const body = page.getByRole('table', { name: 'Monster stats' }).locator('tbody');
  const summary = page.locator('.filter-summary').first();

  await expect(rainbowmon).toHaveAttribute('aria-pressed', 'false');
  await include.getByRole('button', { name: 'Lvl. < 40' }).click();
  await expect(summary).toContainText('3 of 5');
  await expect(body).not.toContainText('Rainbowmon');
  await expect(body).not.toContainText('Devilmon');

  const buttons = include.getByRole('button');
  const before = await buttons.evaluateAll((all) => all.map((each) => each.getBoundingClientRect().toJSON()));
  await rainbowmon.click();
  await expect(rainbowmon).toHaveAttribute('aria-pressed', 'true');
  await expect(summary).toContainText('5 of 5');
  await expect(body).toContainText('Rainbowmon');
  await expect(body).toContainText('Devilmon');
  expect(await buttons.evaluateAll((all) => all.map((each) => each.getBoundingClientRect().toJSON()))).toEqual(before);
});

test('Not needed finds the copies an account has already levelled and finished', async ({ page }) => {
  await openMonsters(page);
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();
  const conditions = page.getByRole('group', { name: 'Only show Numbers monsters if' });
  const body = page.getByRole('table', { name: 'Monster numbers' }).locator('tbody');

  await conditions.getByRole('checkbox', { name: 'Not needed' }).check();
  /* Elucia is the finished Lv. 40 the verdict rests on, and the Fire Fairy has
     no levelled copy of its own, so the Water Fairy is the one spare row. */
  await expect(body.locator('tr')).toHaveCount(1);
  await expect(body).toContainText('Fairy (Water)');

  /* Nothing in the family still needs a skill-up, so nothing is fodder, and the
     two together ask for nothing. */
  await conditions.getByRole('checkbox', { name: 'Fodder mon' }).check();
  await expect(page.locator('.storage-filter-strip .filter-summary')).toContainText('0 of 5');
});
