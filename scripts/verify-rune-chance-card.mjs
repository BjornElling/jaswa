import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { isolatePersonalization } from './verification-browser.mjs';

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await isolatePersonalization(page.context());
  await page.goto('http://localhost:3000/');
  const result = await page.evaluate(async () => {
    const { GpuContext } = await import('/app/platform/gpu/gpu-context.ts');
    const { countJobsOnGpu, runeChanceAgreement } = await import('/app/platform/gpu/backends/webgpu-rune-chance-backend.ts');
    const context = new GpuContext();
    if (!await context.ready() || !await runeChanceAgreement(context)) return false;
    const { qualityBar, nextUp, allowanceDenominator } = await import('/app/domain/runes/cleanup/rune-quality-reference.ts');
    const { ordinarySample } = await import('/app/domain/runes/cleanup/rune-cleanup-model.ts');
    const { defaultCraftCredit, craftPlan } = await import('/app/domain/runes/craft/rune-craft-end-state.ts');
    const { countJobs, endStateScoring, playForward, runeFuture, runScore } = await import('/app/domain/runes/rune-power-up-outcomes.ts');
    /* Settings' starting credit and one a user might choose instead: the card now
       answers for whatever the user assumes, not only for one fixed credit. */
    const credits = [defaultCraftCredit, {
      gem: { grade: 'Hero', roll: 'two-thirds', rounding: 'down' },
      grind: { grade: 'Rare', roll: 'maximum', rounding: 'up' },
    }];
    const jobs = [];
    for (const credit of credits) for (const rarity of ['Rare', 'Hero', 'Legend']) {
      const body = ordinarySample(4, 6, 60, 0, 'drop').find((rune) => rune.rarity === rarity);
      if (!body) throw new Error('The chance fixture needs every reference rarity.');
      const rune = { ...body, ancient: rarity === 'Legend' };
      const future = runeFuture(rune);
      const lineage = rune.ancient ? 'ancient' : 'standard';
      const valuation = { key: 'card-sampled-boundary', value: (id, raw) => raw * (id === 8 ? 0.17 : 0) };
      const scoring = endStateScoring(rune, valuation, craftPlan(lineage, credit));
      const atom = runScore(playForward(future, 1), scoring, 0);
      const floor = qualityBar({ scores: Float64Array.of(0, atom) }, allowanceDenominator, scoring.prices);
      jobs.push({ future, scoring, wanted: nextUp(atom), runs: 4096 }, { future, scoring, wanted: floor, runs: 4096 });
    }
    const result = await countJobsOnGpu(jobs, context);
    const replayed = new Set(result.uncertain);
    const cpu = countJobs(jobs);
    return jobs.every((_, at) => (at % 2 !== 0 || replayed.has(at))
      && (replayed.has(at) || result.shares[at] === cpu[at]));
  });
  assert.notEqual(result, null, 'No WebGPU card was available for verification.');
  assert.equal(result, true, 'The card did not agree on the rune chance fixture.');
  console.log('PASS: the rune chance card agrees on unambiguous counts and flags sampled score atoms for processor replay.');
} finally {
  await browser.close();
}
