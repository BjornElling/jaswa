import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));
async function start(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}
const box = (locator: Locator) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
});
async function open(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
}

test('all ten depths keep their box, expose their value, and survive a reload', async ({ page }, testInfo) => {
  await start(page);
  await page.getByLabel('Use the graphics card for heavy calculations').check();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await open(page);
  const depth = page.getByRole('slider', { name: 'Depth', exact: true });
  await expect(depth).toHaveValue('4');
  await page.screenshot({ path: testInfo.outputPath('depth-no-monster.png'), fullPage: true });
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const panel = page.locator('.rune-optimization-monster-panel');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  const panelBox = await box(panel); const requirementsBox = await box(requirements);
  await depth.press('Home');
  await page.screenshot({ path: testInfo.outputPath('depth-1.png'), fullPage: true });
  for (let step = 1; step <= 10; step += 1) {
    await expect(depth).toHaveValue(String(step));
    await expect(depth).toHaveAttribute('aria-valuetext', new RegExp(`^${step} of 10`));
    expect(await box(panel)).toEqual(panelBox);
    expect(await box(requirements)).toEqual(requirementsBox);
    if (step < 10) await depth.press('ArrowRight');
  }
  await page.screenshot({ path: testInfo.outputPath('depth-10.png'), fullPage: true });
  await depth.press('ArrowLeft'); await depth.press('ArrowLeft');
  await page.reload(); await open(page);
  await expect(page.getByRole('slider', { name: 'Depth', exact: true })).toHaveValue('8');
  // Every numeric range stated, including a deliberate zero and an unreachable floor.
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  for (const input of await page.getByRole('region', { name: 'Requirements for this calculation' }).locator('input[type="number"]').all()) {
    await input.fill((await input.getAttribute('aria-label'))?.includes('at most') ? '999999999999' : '0');
  }
  await page.getByLabel('HP: at least', { exact: true }).fill('999999999998');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('table', { name: 'Rune builds' })).toContainText('No build meets every requirement.');
  await page.screenshot({ path: testInfo.outputPath('depth-full-ranges.png'), fullPage: true });
});

test('processor and excessive-work warnings are yellow and red without moving the panel', async ({ page }, testInfo) => {
  await start(page);
  await page.getByLabel('Use the graphics card for heavy calculations').uncheck();
  const data = JSON.parse(readFileSync(account, 'utf8'));
  const templates = data.runes;
  data.runes = Array.from({ length: 60 }, (_, copy) => templates.map((rune: Record<string, unknown>, at: number) => ({
    ...rune, rune_id: 100000 + copy * templates.length + at, occupied_id: 0,
  }))).flat();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'large-depth-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await open(page);
  const warning = page.locator('#rune-optimization-work-warning');
  await expect(warning).toHaveAttribute('data-tone', 'warn');
  await expect(warning).toContainText('Graphics card use is off');
  await page.screenshot({ path: testInfo.outputPath('depth-yellow.png'), fullPage: true });
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const panel = page.locator('.rune-optimization-monster-panel');
  const panelBox = await box(panel);
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('End');
  await expect(warning).toHaveAttribute('data-tone', 'bad');
  await expect(warning).toContainText('Very large search');
  expect(await box(panel)).toEqual(panelBox);
  await page.screenshot({ path: testInfo.outputPath('depth-red.png'), fullPage: true });
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('Home');
  await page.getByLabel('Monster', { exact: true }).selectOption('');
  await expect(warning).toHaveAttribute('data-tone', 'warn');
  expect(await box(panel)).toEqual(panelBox);
});
