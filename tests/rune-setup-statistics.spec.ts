import { expect, test } from './test-fixtures';
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
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();

  const statistics = page.locator('.statistics:not(.acceleration)');
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
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();

  const statistics = page.locator('.statistics:not(.acceleration)');
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
  await page.locator('#rune-quality').fill('5');
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
  page.on('worker', (worker) => { if (worker.url().includes('rune-advice-worker')) workers += 1; });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const state = { requests: 0 };
    Object.assign(window, { statisticsWork: state });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('rune-advice-worker')) return;
        const originalPost = this.postMessage.bind(this);
        this.postMessage = (message) => { if (message.request?.reuseOutcomeScores) state.requests += 1; originalPost(message); };
      }
    };
  });
  const requests = () => page.evaluate(() =>
    (window as typeof window & { statisticsWork: { requests: number } }).statisticsWork.requests);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const visit = async (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await visit('Settings');
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();
  const status = page.locator('.statistics-meta');
  await expect(status).toContainText('Calculating…');
  await expect.poll(() => workers).toBeGreaterThan(0);
  await visit('Home');
  await visit('Settings');
  await expect(status).toContainText('synthetic runes', { timeout: 90_000 });
  const poolSize = workers;
  const initialRequests = await requests();
  expect(initialRequests).toBeGreaterThan(0);
  const values = await page.locator('.statistics dd').allTextContents();
  const box = await page.locator('.statistics:not(.acceleration)').boundingBox();
  await page.screenshot({ path: testInfo.outputPath('statistics-before-navigation.png') });
  await visit('Home');
  await visit('Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(await page.locator('.statistics:not(.acceleration)').boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('statistics-after-navigation.png') });
  expect(workers).toBe(poolSize);

  const original = await page.locator('#rune-quality').inputValue();
  await page.locator('#rune-quality').fill(original === '1' ? '2' : '1');
  await expect(status).toContainText('Calculating…');
  await expect(status).toContainText('synthetic runes', { timeout: 90_000 });
  await page.locator('#rune-quality').fill(original);
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(workers).toBe(poolSize); // The same worker served the one changed calculation.
  expect(await requests()).toBe(initialRequests * 2);

  await visit('Rune Clean-up');
  await page.getByRole('textbox', { name: 'Minimum pre-grind SPD' }).fill('0');
  await visit('Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await requests()).toBe(initialRequests * 2);
  expect(await page.locator('.statistics dd').allTextContents()).not.toEqual(values);
  expect(await page.locator('.statistics:not(.acceleration)').boundingBox()).toEqual(box);
  await visit('Rune Clean-up');
  await page.getByRole('textbox', { name: 'Minimum pre-grind SPD' }).fill('20');
  await visit('Settings');
  await expect(status).toContainText('synthetic runes');
  expect(await page.locator('.statistics dd').allTextContents()).toEqual(values);
  expect(await requests()).toBe(initialRequests * 2);
});

/* A Gem is spent only where it gains, so assuming a better one can only help a rune.
   While the ruler followed the assumed Gem, Statistics kept 5.7 % with Legend, 6.0 %
   with Normal and 7.0 % with none: the better Gem lifted the drops a rune is ranked
   among further than it lifted the rune. */
test('never rolls or keeps less for a better assumed Gem', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();
  await page.locator('main summary').filter({ hasText: 'Gems & Grindstones' }).click();

  const statistics = page.locator('.statistics:not(.acceleration)');
  const status = statistics.locator('.statistics-meta');
  const values = statistics.locator('dd');
  const grade = page.locator('#craft-credit-gem-grade');
  await page.locator('#rune-quality').fill('1');
  const shares: number[][] = [];
  for (const choice of ['none', 'Normal', 'Legend']) {
    if (await grade.inputValue() !== choice) {
      await grade.selectOption(choice);
      await expect(status).toContainText('Calculating…');
    }
    await expect(status).toContainText(/synthetic runes/, calculation);
    shares.push((await values.allTextContents()).map(percentage));
    await page.screenshot({ path: testInfo.outputPath(`gem-credit-${choice}.png`), fullPage: true });
  }
  for (let at = 1; at < shares.length; at += 1) {
    expect(shares[at][0]).toBeGreaterThanOrEqual(shares[at - 1][0]);
    expect(shares[at][1]).toBeGreaterThanOrEqual(shares[at - 1][1]);
  }
});

/* Rule 2: the box must not shrink while it calculates and grow when the figures
   arrive — a dash and a percentage get the same room. */
test('keeps the statistics box the same height while it calculates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();

  const statistics = page.locator('.statistics:not(.acceleration)').first();
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
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();

  const statistics = page.locator('.statistics:not(.acceleration)');
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
