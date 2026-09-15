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
  await expect(page.locator('summary')).toHaveText(['›Rune Optimization', '›Artifact Optimization', '›Relic Optimization']);

  await page.locator('summary').filter({ hasText: 'Artifact Optimization' }).click();
  await expect(page.locator('[aria-label="2 plus 4 plus 1.5 equals 7.5 points"]')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Relic Optimization' }).click();
  await expect(page.locator('[aria-label="30 percent times 100 percent plus 20 percent times 50 percent plus 50 percent times 75 percent equals 77.5 percent"]')).toBeVisible();
});
