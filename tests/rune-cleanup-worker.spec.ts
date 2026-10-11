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
  /* The calibrated slot population is deliberately substantial, and so is the box:
     judging it measured 42 s with this test alone and about a minute with the whole
     suite's browsers sharing the processor. What is asserted is painting, not speed,
     so the wait is sized to the calculation with room to spare. */
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(largeAccount(3000));
  await expect(page.getByText('large-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await expect(cleanup.getByText('Nothing calculated yet.')).toBeVisible();

  await page.evaluate(() => {
    const counter = window as unknown as { jaswaFrames: number };
    counter.jaswaFrames = 0;
    const tick = () => { counter.jaswaFrames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.calculation-status'))
    .toContainText('3,001 runes judged against', { timeout: 120_000 });

  /* Generous on purpose: a live page at 60 Hz paints hundreds over a calculation
     this size, and a blocked one paints none. The margin is what keeps a busy
     machine from failing a check about a different thing entirely. */
  const frames = await page.evaluate(() => (window as unknown as { jaswaFrames: number }).jaswaFrames);
  expect(frames).toBeGreaterThan(10);
});

/**
 * A late answer from an earlier request must never be committed.
 *
 * The failure this prevents is silent: a result computed against settings the user
 * has already moved on from, arriving after a newer one and overwriting the table
 * with figures nothing on screen explains. The page cannot currently produce two
 * overlapping requests — the Calculate button is disabled while one runs — so this
 * drives the client directly, which is also where the rule belongs. A second caller
 * would otherwise have to reinvent it.
 */
test('a superseded calculation cannot commit its result', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  const outcomes = await page.evaluate(async () => {
    // The page resolves the URL through the dev server; the type comes from the source file.
    const url: string = '/app/lib/compute/rune-advice-client.ts';
    const client = await import(url) as typeof import('../app/lib/compute/rune-advice-client');
    const request: import('../app/lib/compute/rune-advice-protocol').RuneAdviceRequest = {
      runes: [], roles: [], base: new Map(), preferWebGpu: false,
      settings: {
        powerUpPolicy: 3, runeQuality: 3, gemRoll: null, grindstoneRoll: null,
        gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
        intangibleRunes: 1, keepMoreForLargerSets: false,
        neverSellPreGrindSpeed: false, preGrindSpeedMinimum: null,
        neverSellPotentialValue: false, potentialValueMinimum: null,
      },
    };
    /* Both started in one tick, so the second is created before any worker message
       can be delivered — the first is superseded however fast the worker is. */
    const first = client.calculateRuneAdvice(request);
    const second = client.calculateRuneAdvice(request);
    return { first: (await first).status, second: (await second).status };
  });

  expect(outcomes.first).toBe('superseded');
  expect(outcomes.second).toBe('done');
});
