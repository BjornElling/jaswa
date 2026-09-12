import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));

test('confirms a JSON import in the viewport without moving the page', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  await page.locator('.drop-zone').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
  const confirmation = page.getByRole('status', { name: 'Game data loaded correctly' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('2 monsters · 0 runes · 4 artifacts');
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const confirmationBox = await confirmation.boundingBox();
  expect(confirmationBox).not.toBeNull();
  expect(confirmationBox?.y).toBeLessThan(viewport.height * .1);
  expect((confirmationBox?.x ?? 0) + (confirmationBox?.width ?? 0)).toBeGreaterThan(viewport.width - 64);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-visible.png') });

  const scrollWhileConfirmed = await page.evaluate(() => window.scrollY);

  await expect(confirmation).toBeHidden({ timeout: 5_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollWhileConfirmed);
  await page.screenshot({ path: testInfo.outputPath('import-confirmation-dismissed.png') });
});
