import { expect, test } from '@playwright/test';

test('The Math sits under Technical and explains the equipment recommendations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  await expect(page.locator('.rail-heading')).toHaveText([
    'General', 'Monsters', 'Runes', 'Artifacts', 'Relics', 'Technical',
  ]);
  const technical = page.locator('.rail-group').last();
  await expect(technical.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(technical.getByRole('button', { name: 'The Math', exact: true })).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'The Math', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Math', exact: true })).toBeVisible();
  await expect(page.locator('summary')).toHaveText(['›Rune Clean-up', '›Artifact Optimization', '›Relic Optimization']);

  await page.locator('summary').filter({ hasText: 'Artifact Optimization' }).click();
  await expect(page.locator('[aria-label="4 plus 1.5 plus 2 equals 7.5 points"]')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Relic Optimization' }).click();
  await expect(page.locator('[aria-label="0.30 times 0.14 plus 0.20 times 0.90 plus 0.50 times 1.00 equals 0.72 fit"]')).toBeVisible();
  /* The worked example is held to the realistic power-up range: `+15` is the
     scale's reference point and may be named as such, but no relic in an
     illustration is levelled past `+12`. */
  await expect(page.locator('.math-table-relics .math-relic-level')).toHaveText(['+6', '+12']);
});
