import { expect, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

test('opens an empty local workspace and preserves navigation layout', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Just Another Summoners War App' })).toBeVisible();

  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monster Overview', exact: true })).toBeVisible();

  await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-monsters.png') });

  const rail = page.locator('.rail');
  const before = await rail.boundingBox();
  await page.getByRole('navigation').getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  const bars = page.locator('main summary');
  await expect(bars).toHaveText(['›Recommendations', '›Best monster for this artifact', '›Best artifact for this monster', '›Overview']);
  const overview = bars.last();
  const headerBefore = await overview.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('overview-closed.png') });
  await overview.click();
  expect(await overview.boundingBox()).toEqual(headerBefore);
  const after = await rail.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after).toEqual(before);
  await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-artifacts.png') });

  await page.getByRole('navigation').getByRole('button', { name: 'Relic Optimization', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Relic Optimization', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-relics.png') });
});

test('imports a complete synthetic account into the artifact library', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
  await expect(page.getByText('synthetic-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  const overview = page.locator('main summary').filter({ hasText: 'Overview' });
  await expect(overview).toBeVisible();
  const rail = page.getByRole('navigation');
  const before = await rail.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('imported-overview-closed.png') });
  await overview.click();
  await expect(page.locator('.artifact-grid tbody tr')).toHaveCount(4);
  expect(await rail.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('imported-artifacts.png') });
});
