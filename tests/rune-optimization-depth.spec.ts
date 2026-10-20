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
  for (const input of await page.getByRole('region', { name: 'Requirements for this calculation' }).locator('.stat-ranges input[type="number"]').all()) {
    await input.fill((await input.getAttribute('aria-label'))?.includes('at most') ? '999999999999' : '0');
  }
  await page.getByLabel('HP: at least', { exact: true }).fill('999999999998');
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('table', { name: 'Rune builds' })).toContainText('No build meets every requirement.');
  await page.screenshot({ path: testInfo.outputPath('depth-full-ranges.png'), fullPage: true });
});

test('a huge impossible pool gets measured without a false time warning or moving the panel', async ({ page }, testInfo) => {
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
  await expect(warning).toHaveAttribute('data-tone', 'neutral');
  await expect(warning).toContainText('Choose a monster');
  await page.screenshot({ path: testInfo.outputPath('depth-before-trial.png'), fullPage: true });
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  /* No profile names a figure, and the trial measures only a question that can be asked. */
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  const panel = page.locator('.rune-optimization-monster-panel');
  const panelBox = await box(panel);
  await page.getByLabel('Spd: at least', { exact: true }).fill('999999');
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('End');
  await expect(warning).toContainText('This search finished', { timeout: 30_000 });
  await expect(warning).toHaveAttribute('data-tone', 'neutral');
  await expect(warning).toContainText('Processor');
  await expect(warning).toHaveAttribute('title', /physical runes.*end states/);
  expect(await box(panel)).toEqual(panelBox);
  await page.screenshot({ path: testInfo.outputPath('depth-measured.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds', exact: true }).click();
  await expect(warning).toContainText('Last run finished', { timeout: 30_000 });
  expect(await box(panel)).toEqual(panelBox);
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('Home');
  await page.getByLabel('Monster', { exact: true }).selectOption('');
  await expect(warning).toHaveAttribute('data-tone', 'neutral');
  await expect(warning).toContainText('Choose a monster');
  expect(await box(panel)).toEqual(panelBox);
});

test('an unavailable trial leaves the real search usable and its boxes fixed', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('rune-optimization-work-worker')) throw new Error('Simulated trial refusal');
        super(url, options);
      }
    };
  });
  await start(page);
  await page.getByLabel('Use the graphics card for heavy calculations').uncheck();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await open(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  const warning = page.locator('#rune-optimization-work-warning');
  const panel = page.locator('.rune-optimization-monster-panel');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  const before = { panel: await box(panel), requirements: await box(requirements) };
  await expect(warning).toContainText('Search trial unavailable');
  await page.screenshot({ path: testInfo.outputPath('trial-unavailable.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds', exact: true }).click();
  await expect(warning).toContainText('Last run finished');
  expect(await box(panel)).toEqual(before.panel);
  expect(await box(requirements)).toEqual(before.requirements);
  await page.screenshot({ path: testInfo.outputPath('trial-unavailable-search-finished.png'), fullPage: true });
});
