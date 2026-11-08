import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('updates changed standards in place and recalculates only affected sets', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  let workers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('rune-advice-worker')) workers += 1; });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const requests: string[][] = [];
    Object.assign(window, { runeRequests: requests });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('rune-advice-worker')) return;
        const originalPost = this.postMessage.bind(this);
        this.postMessage = (message) => {
          requests.push(message.request.runes.map((rune: { id: string }) => rune.id));
          originalPost(message);
        };
      }
    };
  });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const visit = async (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const requests = () => page.evaluate(() => (window as typeof window & { runeRequests: string[][] }).runeRequests);
  const raw = JSON.parse(readFileSync('tests/fixtures/craft-account.json', 'utf8'));
  raw.runes[0].set_id = 25; // One Intangible, two ordinary four-piece sets, one two-piece set.
  raw.runes[2].set_id = 1;
  const input = page.locator('input[type="file"][accept="application/json,.json"]');
  await input.setInputFiles({ name: 'mixed-sets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await visit('Rune Clean-up');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const rowNames = () => rows.locator('td:first-child').allTextContents();
  const originalOrder = await rowNames();
  const controls = () => page.locator('.rune-filter-strip').boundingBox();
  const beforeBox = await controls();
  await page.screenshot({ path: testInfo.outputPath('before-settings-change.png') });
  await visit('Rune Settings');
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();
  await page.locator('#intangible-runes').fill('5');
  await visit('Rune Clean-up');
  const updating = page.getByText('Standards changed. Updating the affected rune verdicts…');
  await expect.poll(async () => (await requests()).length).toBe(2);
  await expect(updating).toBeHidden();
  expect((await requests())[1]).toEqual(['101']);
  expect(workers).toBe(1);
  expect(await rowNames()).toEqual(originalOrder);
  expect(await controls()).toEqual(beforeBox);
  await page.screenshot({ path: testInfo.outputPath('after-settings-change.png') });

  // A global quality change affects the shared calibration, including other sets.
  await visit('Rune Settings');
  await page.locator('#rune-quality').fill('1');
  await visit('Rune Clean-up');
  await expect.poll(async () => (await requests()).length).toBe(3);
  await expect(updating).toBeHidden();
  expect((await requests())[2].slice().sort()).toEqual(['101', '102', '103', '104']);
  const incremental = (await rows.allTextContents()).sort();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeEnabled();
  expect((await rows.allTextContents()).sort()).toEqual(incremental);

  const count = (await requests()).length;
  await page.getByRole('checkbox', { name: 'Pre-grind SPD ≥' }).uncheck();
  await visit('Home');
  await visit('Rune Clean-up');
  await expect(rows).toHaveCount(4);
  expect((await requests()).length).toBe(count);
  expect(workers).toBe(1);
});
