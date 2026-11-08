import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const profileAccount = fileURLToPath(new URL('./fixtures/monster-overlay-account.json', import.meta.url));
const optimizationAccount = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function importAccount(page: Page, path: string) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(path);
  await expect(page.getByText(basename(path), { exact: false }).first()).toBeVisible();
}

async function expectInvalidRange(range: Locator, page: Page, screenshot: string) {
  const lower = range.getByRole('spinbutton').nth(0);
  const upper = range.getByRole('spinbutton').nth(1);
  const before = await boxes(range);

  await lower.fill('300');
  await expect(lower).not.toHaveAttribute('aria-invalid', 'true');
  await expect(upper).not.toHaveAttribute('aria-invalid', 'true');
  expect(await boxes(range)).toEqual(before);

  await upper.fill('200');
  await expect(range).toHaveAttribute('data-invalid', 'true');
  await expect(lower).toHaveAttribute('aria-invalid', 'true');
  await expect(upper).toHaveAttribute('aria-invalid', 'true');
  await expect(lower).toHaveAttribute('title', /Minimum must not exceed maximum\./);
  await expect(upper).toHaveAttribute('title', /Minimum must not exceed maximum\./);
  const errorId = await lower.getAttribute('aria-describedby');
  if (errorId === null) throw new Error('The invalid range has no description.');
  expect(errorId).toBe(await upper.getAttribute('aria-describedby'));
  await expect(range.locator('.visually-hidden')).toHaveAttribute('id', errorId);
  await expect(range.locator('.visually-hidden')).toHaveText('Minimum must not exceed maximum.');
  expect(await boxes(range)).toEqual(before);
  await page.screenshot({ path: screenshot });

  await lower.fill('199');
  await expect(range).not.toHaveAttribute('data-invalid', 'true');
  await expect(lower).not.toHaveAttribute('aria-invalid', 'true');
  await expect(upper).not.toHaveAttribute('aria-invalid', 'true');
  expect(await boxes(range)).toEqual(before);
}

async function boxes(range: Locator) {
  return range.evaluate((field) => {
    const measure = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      field: measure(field),
      siblings: [...(field.parentElement?.children ?? [])].map(measure),
      contents: [...field.querySelectorAll('.overlay-stat-head, .stat-range-fields, .stat-range-input, .overlay-stat-current')].map(measure),
    };
  });
}

test('monster profile ranges mark both endpoints until the interval is repaired', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page, profileAccount);
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).first().click();
  const monster = page.locator('.monster-link').first();
  await monster.scrollIntoViewIfNeeded();
  await monster.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const range = dialog.locator('.stat-range[data-figure="hp"]');
  await expect(range.getByRole('spinbutton').nth(0)).toHaveValue('');
  await expect(range.getByRole('spinbutton').nth(1)).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('profile-range-empty.png') });
  await expectInvalidRange(range, page, testInfo.outputPath('profile-range-invalid.png'));
});

test('Rune Optimization ranges mark both endpoints until the interval is repaired', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await importAccount(page, optimizationAccount);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  const range = requirements.locator('.stat-range[data-figure="hp"]');
  await expect(range.getByRole('spinbutton').nth(0)).toHaveValue('');
  await expect(range.getByRole('spinbutton').nth(1)).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('optimization-range-empty.png'), fullPage: true });
  await expectInvalidRange(range, page, testInfo.outputPath('optimization-range-invalid.png'));
});
