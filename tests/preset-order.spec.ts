import { expect, test } from '@playwright/test';

async function openPresets(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Rune Set-up' }).click();
  await page.locator('summary').filter({ hasText: 'Presets' }).click();
}

test('preset arrows move one card at a time and stay in their fixed positions', async ({ page }) => {
  await openPresets(page);

  const cards = page.locator('.preset-card');
  const names = cards.locator('.preset-name');
  const initial = await names.allTextContents();
  expect(initial.length).toBeGreaterThan(1);

  const firstEarlier = page.getByRole('button', { name: `Move ${initial[0]} earlier` });
  const lastLater = page.getByRole('button', { name: `Move ${initial.at(-1)} later` });
  await expect(firstEarlier).toBeDisabled();
  await expect(lastLater).toBeDisabled();
  await expect(firstEarlier).toBeVisible();
  await expect(lastLater).toBeVisible();

  await page.getByRole('button', { name: `Move ${initial[0]} later` }).click();
  await expect(names).toHaveText([initial[1], initial[0], ...initial.slice(2)]);
  await expect(page.getByRole('button', { name: `Move ${initial[0]} earlier` })).toBeEnabled();

  await page.getByRole('button', { name: `Move ${initial[0]} earlier` }).click();
  await expect(names).toHaveText(initial);
});
