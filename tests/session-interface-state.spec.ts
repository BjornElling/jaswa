import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

test('keeps navigation, disclosures, and table filters in the current tab only', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('session-state-before-interaction.png') });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
  await expect(page.getByText('synthetic-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Stats' }).click();
  await expect(page.getByRole('heading', { name: 'Monsters', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter monsters by name or set' }).fill('water');
  await page.locator('summary').filter({ hasText: 'Numbers' }).click();
  await page.getByRole('textbox', { name: 'Filter Numbers monsters by name' }).fill('fairy');
  await page.getByRole('navigation').getByRole('button', { name: 'Artifacts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter artifacts by monster or property' }).fill('hp');
  await page.screenshot({ path: testInfo.outputPath('session-state-after-interaction.png') });

  await expect.poll(() => page.evaluate(() => ({
    localPage: window.localStorage.getItem('jaswa.navigation.page'),
    localDisclosure: window.localStorage.getItem('jaswa.disclosures.monsters.stats'),
    localFilters: window.localStorage.getItem('jaswa.filters.monsters'),
    localStorageFilters: window.localStorage.getItem('jaswa.filters.monster-storage'),
    localArtifactFilters: window.localStorage.getItem('jaswa.filters.artifacts'),
    sessionPage: window.sessionStorage.getItem('jaswa.navigation.page'),
    sessionDisclosure: window.sessionStorage.getItem('jaswa.disclosures.monsters.stats'),
    sessionFilters: window.sessionStorage.getItem('jaswa.filters.monsters'),
    sessionStorageFilters: window.sessionStorage.getItem('jaswa.filters.monster-storage'),
    sessionArtifactFilters: window.sessionStorage.getItem('jaswa.filters.artifacts'),
  }))).toEqual({
    localPage: null,
    localDisclosure: null,
    localFilters: null,
    localStorageFilters: null,
    localArtifactFilters: null,
    sessionPage: '"artifact-list"',
    sessionDisclosure: 'true',
    sessionFilters: expect.any(String),
    sessionStorageFilters: expect.any(String),
    sessionArtifactFilters: expect.any(String),
  });

  await expect.poll(() => page.evaluate(() => ({
    monster: JSON.parse(window.sessionStorage.getItem('jaswa.filters.monsters') ?? '{}').search,
    storage: JSON.parse(window.sessionStorage.getItem('jaswa.filters.monster-storage') ?? '{}').search,
    artifact: JSON.parse(window.sessionStorage.getItem('jaswa.filters.artifacts') ?? '{}').search,
  }))).toEqual({ monster: 'water', storage: 'fairy', artifact: 'hp' });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Filter artifacts by monster or property' })).toHaveValue('hp');

  await page.getByRole('navigation').getByRole('button', { name: 'Monsters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monsters', exact: true })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'Stats' }).locator('..')).toHaveAttribute('open', '');
  await expect(page.getByRole('textbox', { name: 'Filter monsters by name or set' })).toHaveValue('water');
  await expect(page.getByRole('textbox', { name: 'Filter Numbers monsters by name' })).toHaveValue('fairy');

  const newTab = await page.context().newPage();
  try {
    await newTab.goto('/');
    await expect(newTab.getByText('Preparing your local workspace…')).toBeHidden();
    await expect(newTab.getByRole('heading', { name: 'Just Another Summoners War App' })).toBeVisible();
    await expect(newTab.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(newTab.locator('details[open]')).toHaveCount(0);
    await newTab.getByRole('navigation').getByRole('button', { name: 'Monsters', exact: true }).click();
    await expect(newTab.getByRole('heading', { name: 'Monsters', exact: true })).toBeVisible();
    await expect(newTab.locator('details[open]')).toHaveCount(0);
    await newTab.locator('summary').filter({ hasText: 'Stats' }).click();
    await expect(newTab.getByRole('textbox', { name: 'Filter monsters by name or set' })).toHaveValue('');
    await newTab.locator('summary').filter({ hasText: 'Numbers' }).click();
    await expect(newTab.getByRole('textbox', { name: 'Filter Numbers monsters by name' })).toHaveValue('');
    await newTab.getByRole('navigation').getByRole('button', { name: 'Artifacts', exact: true }).click();
    await expect(newTab.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
    await expect(newTab.getByRole('textbox', { name: 'Filter artifacts by monster or property' })).toHaveValue('');
    await newTab.getByRole('button', { name: 'Rune Potential', exact: true }).click();
    await expect(newTab.getByRole('heading', { name: 'Rune Potential', exact: true })).toBeVisible();
    await expect(newTab.locator('details[open]')).toHaveCount(0);
  } finally {
    await newTab.close();
  }
});
