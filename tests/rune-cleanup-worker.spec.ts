import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('an empty workspace keeps the calculation status hidden', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await expect(cleanup.getByText('Nothing to judge until account data is imported.')).toBeVisible();
  await expect(cleanup.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(cleanup.locator('.rune-filter-actions .calculation-note[data-busy]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('progress-no-import.png') });
});

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
      ...seeds[at % seeds.length], class: at % 2 ? 5 : 6,
      rune_id: 100_000 + at, occupied_type: 2, occupied_id: 0,
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
test('the page keeps painting while a large box is judged', async ({ page }, testInfo) => {
  /* The calibrated slot population is deliberately substantial, and so is the box:
     judging it measured 42 s with this test alone and about a minute with the whole
     suite's browsers sharing the processor. What is asserted is painting, not speed,
     so the wait is sized to the calculation with room to spare. */
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const counter = window as unknown as { calculationPhases: string[] };
    counter.calculationPhases = [];
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        /* The calibration is counted on the shared pool, and the advice worker only
           judges; one that still calibrated on its own would report `calibration`. */
        if (String(url).includes('rune-calibration-worker')) {
          this.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
            counter.calculationPhases.push(event.data.type === 'result' ? 'calibrated' : 'calibrating');
          });
        }
        if (!String(url).includes('rune-advice-worker')) return;
        this.addEventListener('message', (event: MessageEvent<{ type: string; fraction?: number | null }>) => {
          if (event.data.type === 'calibration') counter.calculationPhases.push('advice-worker-calibrating');
          if (event.data.type === 'progress') counter.calculationPhases.push('calculating');
        });
      }
    };
  });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(largeAccount(3000));
  await expect(page.getByText('large-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  await expect(cleanup.getByText('Nothing calculated yet.')).toBeVisible();
  /* The report slot under Calculate; progress is the note it holds while busy. */
  const progress = cleanup.locator('.rune-filter-actions .calculation-actions-status');
  const working = progress.locator('.calculation-note[data-busy]');
  await expect(working).toHaveCount(0);
  const boxes = () => cleanup.locator('.rune-filter-strip').evaluate((strip) =>
    Array.from(strip.querySelectorAll('.filter-group, .rune-filter-actions .calculate-button, .rune-filter-actions .calculation-actions-status')).map((control) => {
      const { x, y, width, height } = control.getBoundingClientRect();
      return { x, y, width, height };
    }));
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('progress-before.png') });

  await page.evaluate(() => {
    const counter = window as unknown as { jaswaFrames: number };
    counter.jaswaFrames = 0;
    const tick = () => { counter.jaswaFrames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const progress = document.querySelector('.rune-filter-actions .calculation-actions-status')!;
    /* Calibration counts its own way through before the calculation starts its own. */
    const percentages: number[] = [];
    const calibration: number[] = [];
    Object.assign(window, { jaswaProgress: percentages, jaswaCalibration: calibration });
    new MutationObserver(() => {
      if (!progress.querySelector('.calculation-note[data-busy]')) return;
      const [, phase, digits] = progress.textContent?.match(/(Calibrating|Calculating)…\s*(\d+)\s*%/) ?? [];
      const value = Number(digits);
      if (!Number.isFinite(value)) return;
      (phase === 'Calibrating' ? calibration : percentages).push(value);
    }).observe(progress, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(working).toBeVisible();
  await expect(working).toHaveText(/^Calibrating… \d+ %\nOnly needed once\.$/);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('progress-calibrating.png') });
  await expect(progress).toContainText(/Calculating… \d+ %/);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('progress-running.png') });
  await expect(page.locator('.calculation-status'))
    .toContainText('3,001 runes judged against', { timeout: 120_000 });
  await expect(working).toHaveCount(0);
  expect(await boxes()).toEqual(before);
  const { percentages, calibration } = await page.evaluate(() => {
    const seen = window as unknown as { jaswaProgress: number[]; jaswaCalibration: number[] };
    return { percentages: seen.jaswaProgress, calibration: seen.jaswaCalibration };
  });
  for (const run of [percentages, calibration]) {
    expect(run.some((value) => value > 0 && value < 100)).toBe(true);
    expect(run.every((value, at) => value >= 0 && value <= 100 && (at === 0 || value >= run[at - 1]))).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('progress-finished.png') });

  /* Generous on purpose: a live page at 60 Hz paints hundreds over a calculation
     this size, and a blocked one paints none. The margin is what keeps a busy
     machine from failing a check about a different thing entirely. */
  const frames = await page.evaluate(() => (window as unknown as { jaswaFrames: number }).jaswaFrames);
  expect(frames).toBeGreaterThan(10);
  const phases = await page.evaluate(() => (window as unknown as { calculationPhases: string[] }).calculationPhases);
  /* Calibration reports its way through on the pool, and only once it is over does
     the calculation count; the advice worker adopts it rather than calibrating again. */
  const firstCount = phases.indexOf('calculating');
  expect(phases.filter((phase) => phase === 'calibrating').length).toBeGreaterThan(1);
  expect(firstCount).toBeGreaterThan(phases.lastIndexOf('calibrated'));
  expect(phases).not.toContain('advice-worker-calibrating');
  expect(phases.slice(firstCount).every((phase) => phase === 'calculating')).toBe(true);
  await page.evaluate(() => { (window as unknown as { calculationPhases: string[] }).calculationPhases = []; });
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(progress).toContainText(/Calculating… \d+ %/);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('progress-warm.png') });
  await expect(working).toHaveCount(0);
  const warmPhases = await page.evaluate(() => (window as unknown as { calculationPhases: string[] }).calculationPhases);
  expect(warmPhases.length).toBeGreaterThan(0);
  expect(warmPhases.every((phase) => phase === 'calculating')).toBe(true);
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
        powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 3, brokenRunes: 3,
        intangibleRunes: 1,
        neverSellPreGrindSpeed: false, preGrindSpeedMinimum: null,
        neverSellPotentialValue: false, potentialValueMinimum: null,
        neverSellEngravedPlacements: false,
        neverSellReappTargets: false, rerollRules: [],
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

test('a refresh reuses an idle worker and cannot cancel a concurrent whole calculation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const outcomes = await page.evaluate(async () => {
    const OriginalWorker = window.Worker;
    let constructed = 0;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('rune-advice-worker')) constructed += 1;
      }
    };
    const clientUrl: string = '/app/lib/compute/rune-advice-client.ts';
    const settingsUrl: string = '/app/ingest/preferences.ts';
    const client = await import(clientUrl) as typeof import('../app/lib/compute/rune-advice-client');
    const { defaultRunePotentialSettings } = await import(settingsUrl) as typeof import('../app/ingest/preferences');
    const request = { runes: [], roles: [], base: new Map(), preferWebGpu: false, settings: defaultRunePotentialSettings };
    const initial = await client.calculateRuneAdvice(request);
    client.cancelRuneAdvice(); // There is no unfinished work to abandon.
    const warm = await client.refreshRuneAdvice(request);
    const whole = client.calculateRuneAdvice(request);
    const refresh = client.refreshRuneAdvice(request);
    client.cancelRuneAdviceRefresh();
    const parallel = { whole: (await whole).status, refresh: (await refresh).status };
    const borrowed = client.refreshRuneAdvice(request);
    const replacement = client.calculateRuneAdvice(request);
    client.cancelRuneAdviceRefresh();
    return { initial: initial.status, warm: warm.status, ...parallel,
      borrowed: (await borrowed).status, replacement: (await replacement).status, constructed };
  });
  /* One advice worker: every request waits a tick for the shared calibration before it
     reaches a worker, so the two cancelled here never reached one, and cancelling them
     had no work in flight to throw away — nothing was terminated, nothing rebuilt. */
  expect(outcomes).toEqual({ initial: 'done', warm: 'done', whole: 'done', refresh: 'superseded',
    borrowed: 'superseded', replacement: 'done', constructed: 1 });
});

/**
 * Calculate is also the stop. While it works it names itself *Cancel
 * calculation*, offers that wording under the pointer in one unchanged box, and
 * pressing it leaves the answer from before it started — here a finished
 * table, whose verdicts must survive the cancelled recalculation.
 */
test('Calculate cancels its own work and keeps the answer from before', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(fixture);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  const calculate = cleanup.locator('.rune-filter-actions .calculate-button');
  const box = () => calculate.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
  });
  await calculate.click();
  const summary = cleanup.locator('.rune-filter-actions .calculation-status-line').first();
  await expect(summary).toContainText('runes judged against', { timeout: 120_000 });
  const answer = await cleanup.locator('.rune-filter-actions .calculation-actions-status').textContent();
  const rows = await cleanup.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr').count();
  const idle = await box();

  /* Hold the worker's answer back, so the cancel is certain to land mid-flight. */
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker['postMessage']>) {
      (window as unknown as { held: unknown[] }).held = [...((window as unknown as { held?: unknown[] }).held ?? []), args[0]];
      void original;
    } as Worker['postMessage'];
  });
  await calculate.click();
  await expect(calculate).toHaveAttribute('aria-busy', 'true');
  await expect(calculate).toHaveAccessibleName('Cancel calculation');
  await page.mouse.move(0, 0);
  await expect(calculate.locator('[data-face="busy"]')).toBeVisible();
  await expect(calculate.locator('[data-face="cancel"]')).toBeHidden();
  await calculate.hover();
  await expect(calculate.locator('[data-face="cancel"]')).toBeVisible();
  await expect(calculate.locator('[data-face="busy"]')).toBeHidden();
  expect(await box()).toEqual(idle);
  await calculate.click();
  await expect(calculate).not.toHaveAttribute('aria-busy', 'true');
  await expect(calculate).toHaveAccessibleName('Calculate');
  expect(await box()).toEqual(idle);
  await expect(cleanup.locator('.rune-filter-actions .calculation-actions-status')).toHaveText(answer ?? '');
  await expect(cleanup.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')).toHaveCount(rows);
});

/**
 * The helper behind every cancellable worker. A worker cannot drop one request
 * it is busy with, so a cancel replaces it — and the requests that were waiting
 * beside the cancelled one must still be answered, by the new worker.
 */
test('cancelling one worker request answers the others from a fresh worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const outcome = await page.evaluate(async () => {
    const url: string = '/app/platform/cancellable-worker.ts';
    const { cancellableWorker, isCalculationCancelled } = await import(url) as typeof import('../app/platform/cancellable-worker');
    /* Answers every request after a pause, echoing its value back. */
    const source = `onmessage = (event) => setTimeout(() => postMessage({ type: 'result', requestId: event.data.requestId, result: event.data.value }), 200);`;
    let started = 0;
    const ask = cancellableWorker<number>(() => {
      started += 1;
      return new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    }, 'could not start');
    const controller = new AbortController();
    const cancelled = ask({ value: 1 }, controller.signal).then(() => 'answered', (error) => isCalculationCancelled(error) ? 'cancelled' : 'failed');
    const kept = ask({ value: 2 });
    controller.abort();
    return { cancelled: await cancelled, kept: await kept, started };
  });
  expect(outcome).toEqual({ cancelled: 'cancelled', kept: 2, started: 2 });
});
