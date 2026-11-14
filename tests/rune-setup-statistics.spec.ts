import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/* One statistics calculation — 900 synthetic runes against every shipped role —
   measured about 10 s in a browser on its own, and twice that with the whole suite's
   browsers sharing the processor. The config's 15 s wait is for a page to arrive, not
   for this, so each wait on a finished calculation says how long it may take. */
const calculation = { timeout: 45_000 };

function percentage(value: string): number {
  return Number(value.replace('%', '').replace(',', '.'));
}

test('keeps the statistics box honest without an account reference', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  await expect(statistics.locator('.statistics-lead')).toContainText('Import an account with a level 40 monster');
  await expect(statistics.locator('dd')).toHaveText(['—', '—']);
  await expect(statistics.locator('.statistics-meta')).toHaveText('Waiting for an account');
  await page.screenshot({ path: testInfo.outputPath('rune-setup-empty.png'), fullPage: true });
});

test('shows the synthetic statistics and recalculates them after a setting changes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  /* Recalculation needs a populated tail: the stricter middle quality stop can
     legitimately leave this small sample at zero before and after a discount. */
  await page.locator('#rune-quality').fill('1');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const before = await values.allTextContents();
  expect(before.every((value) => /\d/.test(value))).toBe(true);
  expect(percentage(before[1] ?? '')).toBeLessThanOrEqual(percentage(before[0] ?? ''));

  const accepted = page.locator('#accepted-runes');
  await expect(accepted).toHaveValue('3');
  await accepted.fill('5');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const after = await values.allTextContents();
  expect(after.every((value) => /\d/.test(value))).toBe(true);
  expect(percentage(after[1] ?? '')).toBeLessThanOrEqual(percentage(after[0] ?? ''));
  expect(after).not.toEqual(before);
});

test('reuses completed and unfinished statistics across navigation and restored choices', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  let workers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('rune-statistics-worker')) workers += 1; });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const state = { requests: 0 };
    Object.assign(window, { statisticsWork: state });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('rune-statistics-worker')) return;
        const originalPost = this.postMessage.bind(this);
        this.postMessage = (message) => { state.requests += 1; originalPost(message); };
      }
    };
  });
  const requests = () => page.evaluate(() =>
    (window as typeof window & { statisticsWork: { requests: number } }).statisticsWork.requests);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const visit = async (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await visit('Rune Settings');
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();
  const status = page.locator('.statistics-meta');
  await expect(status).toContainText('Calculating…');
  await expect.poll(() => workers).toBe(1);
  await visit('Home');
  await visit('Rune Settings');
  await expect(status).toContainText('synthetic runes', { timeout: 90_000 });
  expect(workers).toBe(1);
  expect(await requests()).toBe(1);
  const values = await page.locator('.statistics dd').allTextContents();
  const box = await page.locator('.statistics').boundingBox();
  await page.screenshot({ path: testInfo.outputPath('statistics-before-navigation.png') });
  await visit('Home');
  await visit('Rune Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(await page.locator('.statistics').boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('statistics-after-navigation.png') });
  expect(workers).toBe(1);

  const original = await page.locator('#rune-quality').inputValue();
  await page.locator('#rune-quality').fill(original === '1' ? '2' : '1');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText('synthetic runes', { timeout: 90_000 });
  await page.locator('#rune-quality').fill(original);
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(workers).toBe(1); // The same worker served the one changed calculation.
  expect(await requests()).toBe(2);

  await visit('Rune Clean-up');
  await page.getByRole('textbox', { name: 'Minimum pre-grind SPD' }).fill('0');
  await visit('Rune Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await requests()).toBe(2);
  expect(await page.locator('.statistics dd').allTextContents()).not.toEqual(values);
  expect(await page.locator('.statistics').boundingBox()).toEqual(box);
  await visit('Rune Clean-up');
  await page.getByRole('textbox', { name: 'Minimum pre-grind SPD' }).fill('20');
  await visit('Rune Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(await requests()).toBe(2);
});

/* Rule 2: the box must not shrink while it calculates and grow when the figures
   arrive — a dash and a percentage get the same room. */
test('keeps the statistics box the same height while it calculates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics').first();
  const status = statistics.locator('.statistics-meta');
  const height = async () => (await statistics.boundingBox())?.height;
  await expect(status).toContainText(/synthetic runes/, calculation);
  const ready = await height();

  await page.locator('#accepted-runes').fill('5');
  await expect(status).toContainText('Calculating…');
  const calculating = await height();
  await expect(status).toContainText(/synthetic runes/, calculation);

  expect(ready).toBeDefined();
  expect(calculating).toBe(ready);
  expect(await height()).toBe(ready);

  /* No browser this suite drives has a graphics card, so the widest status the
     box can carry is written in by hand: it wraps to two lines, and the box must
     already have room for them. */
  await status.evaluate((meta) => { meta.textContent = '12,000 synthetic runes · Graphics card + processor'; });
  expect(await height()).toBe(ready);
});

test('gets stricter when broken runes are excluded', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  /* Isolate the gate from independent safeguards: a different Best role may
     legitimately cross the user's Potential protection threshold. */
  await page.evaluate(async () => {
    const defaultsPath = '/app/domain/profiles/preference-defaults.ts';
    const storagePath = '/app/platform/browser-storage.ts';
    const { blankPreferences } = await import(defaultsPath);
    const { savePreferences } = await import(storagePath);
    const preferences = blankPreferences();
    await savePreferences({ ...preferences, runePotential: { ...preferences.runePotential,
      neverSellPotentialValue: false, neverSellPreGrindSpeed: false, neverSellReappTargets: false,
      neverSellEngravedPlacements: false } });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();

  const statistics = page.locator('.statistics');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  const broken = page.locator('#broken-runes');
  await expect(status).toContainText(/synthetic runes/, calculation);
  await expect(broken).toHaveValue('3');
  const permissive = await values.allTextContents();
  await page.screenshot({ path: testInfo.outputPath('rune-setup-broken-permissive.png'), fullPage: true });

  await broken.fill('5');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText(/synthetic runes/, calculation);
  const strict = await values.allTextContents();
  await page.screenshot({ path: testInfo.outputPath('rune-setup-broken-strict.png'), fullPage: true });

  expect(percentage(strict[0] ?? '')).toBeLessThanOrEqual(percentage(permissive[0] ?? ''));
  expect(percentage(strict[1] ?? '')).toBeLessThanOrEqual(percentage(permissive[1] ?? ''));
});
