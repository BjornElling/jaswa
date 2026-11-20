import { expect, test } from './test-fixtures';
import { readFileSync } from 'node:fs';

/**
 * Only Calculate calculates. A changed standard or a changed rune empties the table
 * rather than re-judging anything behind the reader's back; setting the standards
 * back shows the held list again, because it then answers them once more.
 */
test('a changed standard empties the table and nothing recalculates until Calculate', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
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
          if (!message.request.reuseOutcomeScores) requests.push(message.request.runes.map((rune: { id: string }) => rune.id));
          originalPost(message);
        };
      }
    };
  });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const visit = async (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const requests = () => page.evaluate(() => (window as typeof window & { runeRequests: string[][] }).runeRequests.length);
  const raw = JSON.parse(readFileSync('tests/fixtures/craft-account.json', 'utf8'));
  raw.runes[0].set_id = 25; // One Intangible rune, so the Intangible setting reaches the list.
  const input = page.locator('input[type="file"][accept="application/json,.json"]');
  await input.setInputFiles({ name: 'mixed-sets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await visit('Rune Clean-up');
  const calculateButton = page.getByRole('button', { name: 'Calculate', exact: true });
  await calculateButton.click();
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr:not(:has(.table-empty-state))');
  await expect(rows).toHaveCount(4);
  const held = await rows.allTextContents();
  const calculated = await requests();
  const controls = () => page.locator('.rune-filter-strip').boundingBox();
  const beforeBox = await controls();
  await page.screenshot({ path: testInfo.outputPath('before-settings-change.png') });

  await visit('Settings');
  await page.locator('main summary').filter({ hasText: 'Runes' }).click();
  const intangible = page.locator('#intangible-runes');
  const original = await intangible.inputValue();
  await intangible.fill(original === '5' ? '1' : '5');
  await visit('Rune Clean-up');
  const changed = page.getByText('Something changed since the last calculation.');
  await expect(changed).toBeVisible();
  await expect(rows).toHaveCount(0);
  /* Long enough for any automatic work to have started; none may. */
  await page.waitForTimeout(1500);
  expect(await requests()).toBe(calculated);
  expect(await controls()).toEqual(beforeBox);
  await page.screenshot({ path: testInfo.outputPath('after-settings-change.png') });

  // Setting the standard back shows the held list again, uncounted.
  await visit('Settings');
  await intangible.fill(original);
  await visit('Rune Clean-up');
  await expect(rows).toHaveCount(4);
  expect(await rows.allTextContents()).toEqual(held);
  expect(await requests()).toBe(calculated);

  // A changed standard is judged by the next Calculate, and by nothing else.
  await visit('Settings');
  await page.locator('#rune-quality').fill('1');
  await visit('Rune Clean-up');
  await expect(rows).toHaveCount(0);
  expect(await requests()).toBe(calculated);
  await calculateButton.click();
  await expect(rows).toHaveCount(4);
  expect(await requests()).toBeGreaterThan(calculated);

  // A safeguard changes no input: the list stays and nothing is calculated.
  const count = await requests();
  await page.getByRole('checkbox', { name: 'Pre-grind SPD ≥' }).uncheck();
  await visit('Home');
  await visit('Rune Clean-up');
  await expect(rows).toHaveCount(4);
  expect(await requests()).toBe(count);

  // A change in the game keeps the table: only the changed rune is judged again.
  const order = await rows.locator('td:first-child').allTextContents();
  raw.runes[1].upgrade_curr += 1;
  await visit('Home');
  await input.setInputFiles({ name: 'powered-up.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await page.getByRole('button', { name: 'Replace data' }).click();
  await visit('Rune Clean-up');
  await expect(changed).toBeHidden();
  await expect(rows).toHaveCount(4);
  await expect.poll(requests).toBe(count + 1);
  const asked = await page.evaluate(() => (window as typeof window & { runeRequests: string[][] }).runeRequests.at(-1));
  expect(asked).toEqual([String(raw.runes[1].rune_id)]);
  expect(await rows.locator('td:first-child').allTextContents()).toEqual(order);
});
