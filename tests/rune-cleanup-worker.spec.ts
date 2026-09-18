import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

/**
 * A box the size of a real account, built by repeating the fixture's own legal
 * runes at every power-up stop that still has events left. Variety is not the
 * point here — load is.
 */
function largeAccount(count: number): string {
  const account = JSON.parse(readFileSync(fixture, 'utf8'));
  const seeds = account.runes as Array<Record<string, unknown>>;
  const levels = [0, 3, 6, 9];
  const runes: unknown[] = [];
  for (let at = 0; at < count; at += 1) {
    runes.push({
      ...seeds[at % seeds.length], rune_id: 100_000 + at, occupied_type: 2, occupied_id: 0,
      upgrade_curr: levels[at % levels.length],
    });
  }
  const path = join(mkdtempSync(join(tmpdir(), 'jaswa-large-account-')), 'large-account.json');
  writeFileSync(path, JSON.stringify({ ...account, runes }));
  return path;
}

/**
 * The calculation runs off the main thread, and this is the only check that can
 * tell. Everything else about Rune Clean-up would pass just as well with the work
 * back on the main thread — the numbers would be the same and the table would be
 * the same. What would change is that the browser would stop painting, which is
 * the failure this worker exists to remove, so it is measured directly: count
 * animation frames while the calculation runs. A blocked main thread paints none.
 */
test('the page keeps painting while a large box is judged', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(largeAccount(3000));
  await expect(page.getByText('large-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const recommendations = page.locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Recommendations' }) });
  await expect(recommendations.getByText('Nothing calculated yet.')).toBeVisible();

  await page.evaluate(() => {
    const counter = window as unknown as { jaswaFrames: number };
    counter.jaswaFrames = 0;
    const tick = () => { counter.jaswaFrames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await recommendations.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.calculation-status'))
    .toContainText('3,001 runes judged against', { timeout: 60_000 });

  /* Generous on purpose: a live page at 60 Hz paints hundreds over a calculation
     this size, and a blocked one paints none. The margin is what keeps a busy
     machine from failing a check about a different thing entirely. */
  const frames = await page.evaluate(() => (window as unknown as { jaswaFrames: number }).jaswaFrames);
  expect(frames).toBeGreaterThan(10);
});
