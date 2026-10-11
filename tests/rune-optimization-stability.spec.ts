import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
const sets = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const templates = Array.from({ length: 6 }, (_, slot) => fixture.runes.find((rune: { slot_no: number; pri_eff: number[] }) =>
  rune.slot_no === slot + 1 && rune.pri_eff[0] === [3, 8, 5, 4, 1, 4][slot]));
if (templates.some((rune) => !rune)) throw new Error('The broad-search fixture needs a legal main in every slot.');
const wideAccount = {
  ...fixture,
  runes: templates.flatMap((rune, slot) => sets.flatMap((set, at) => Array.from({ length: 4 }, (_, copy) => ({
    ...rune, rune_id: 100000 + slot * 1000 + at * 4 + copy, set_id: set, occupied_id: 0,
  })))),
};

async function open(page: Page, wide = false) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByLabel('Use the graphics card for heavy calculations').uncheck();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'open-sets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(wide ? wideAccount : fixture)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('Home');
  await page.getByLabel('Rank by', { exact: true }).selectOption('dmg');
}

const box = (locator: Locator) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
});

async function twoSets(page: Page) {
  await page.getByRole('button', { name: /^Desired rune builds/ }).click();
  const menu = page.getByRole('dialog', { name: 'Desired rune builds' });
  await menu.getByRole('list', { name: 'Sets', exact: true }).getByRole('button', { name: 'Shield', exact: true }).hover();
  await menu.getByRole('list', { name: 'After Shield', exact: true }).getByRole('button', { name: 'Will', exact: true }).click();
}

test('an open two-set search at depth 1 stops with its builds and leaves controls in place', async ({ page }, testInfo) => {
  await open(page, true);
  await twoSets(page);
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  for (const input of await requirements.locator('.stat-ranges input[type="number"]').all()) {
    await input.fill((await input.getAttribute('aria-label'))?.includes('at most') ? '999999999999' : '0');
  }
  const panel = page.locator('.rune-optimization-monster-panel');
  const before = await box(panel); const requiredBefore = await box(requirements);
  await page.screenshot({ path: testInfo.outputPath('open-sets-before.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.locator('.rune-optimization-searching')).toContainText('Searching…');
  await page.getByRole('button', { name: 'Stop the search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await expect(page.getByText('The search was stopped.', { exact: false })).toBeVisible();
  expect(await box(panel)).toEqual(before);
  expect(await box(requirements)).toEqual(requiredBefore);
  await expect(page.getByText('could not search rune builds', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('open-sets-stopped.png'), fullPage: true });
});

test('worker allocation failures retry once and preserve the previous table', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 });
    const NativeWorker = window.Worker;
    let created = 0;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('rune-optimization-work-worker')) { super(url, options); return; }
        document.documentElement.dataset.workerAllocations = String(++created);
        if (created === 2) throw new Error('Simulated worker allocation failure');
        super(url, options);
      }
    };
  });
  await open(page);
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toContainText('Processor');
  expect(await page.locator('html').getAttribute('data-worker-allocations')).toBe('3');
  const table = page.getByRole('table', { name: 'Rune builds' });
  const panel = page.locator('.rune-optimization-monster-panel');
  const before = { table: await box(table), panel: await box(panel), rows: await table.getByRole('row').count() };
  await page.screenshot({ path: testInfo.outputPath('before-worker-refusal.png'), fullPage: true });
  await page.evaluate(() => {
    window.Worker = class extends Worker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.terminate();
        throw new Error('Simulated total worker refusal');
      }
    };
  });
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'could not hand this account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
  expect(await table.getByRole('row').count()).toBe(before.rows);
  expect(await box(table)).toEqual(before.table);
  expect(await box(panel)).toEqual(before.panel);
  await page.screenshot({ path: testInfo.outputPath('after-worker-refusal.png'), fullPage: true });
});

test('a time limit keeps guide builds and never calls the unfinished search impossible', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        const request = message as { type?: string; request?: { problem: { timeLimitMs: number } } };
        // A completed trial can supply the prepared pool without a prepare message.
        if (request.type === 'calculate' && request.request) request.request.problem.timeLimitMs = -1;
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
      addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        if (type !== 'message' || !listener) return super.addEventListener(type, listener as EventListenerOrEventListenerObject, options);
        super.addEventListener(type, (event: MessageEvent) => {
          if (event.data.type === 'prepared') event.data.problem.timeLimitMs = -1;
          if (typeof listener === 'function') listener.call(this, event);
          else listener.handleEvent(event);
        }, options);
      }
    };
  });
  await open(page, true);
  await twoSets(page);
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await expect(page.getByText('The search reached its time limit.', { exact: false })).toBeVisible();
  await expect(page.getByText('No build meets every requirement.', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('open-sets-time-limit.png'), fullPage: true });
});
