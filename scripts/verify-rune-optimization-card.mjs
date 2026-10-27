/**
 * **The Rune Optimization shader, run on this machine's own graphics card.**
 *
 * `verify-rune-optimization.mjs` proves the search exact on the processor, and proves
 * the machinery that drives a card exact with a stand-in card. What neither can do is
 * execute the shader. This does: Chromium in its new headless mode exposes the real
 * adapter to WebGPU where the headless shell Playwright uses by default exposes none,
 * so the modules are loaded from the dev server on `http://localhost:3000/` exactly
 * as the page loads them and run in the browser against the card.
 *
 * Three things are held:
 *
 * 1. **The agreement gate passes.** `runeOptimizationAgreement` is what the app asks
 *    before it takes one answer from a card; a card that fails it is never used, so a
 *    gate that fails here means the status line on this machine says Processor.
 * 2. **The card's search is the processor's search.** The same random accounts the
 *    processor was proved on against brute force, searched with the tail on the card,
 *    must give the same table pick for pick. Wider accounts too, compared search
 *    against search, where the blocks are big enough to span many lanes and passes.
 * 3. **Passes actually went to the card.** A search that fell back to the processor
 *    would agree trivially.
 *
 * It needs a running dev server and a graphics card, like `verify:library-layout`
 * needs an account, and is not part of `npm test`. Without a card it says so and
 * exits non-zero: it has measured nothing.
 *
 *   npm run verify:rune-optimization-card
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { craftedRangeScenarios, scenarioGenerator } from './rune-optimization-scenarios.mjs';

const origin = 'http://localhost:3000';

const narrow = scenarioGenerator(20260930);
const wide = scenarioGenerator(20261001, [14, 22]);
const inputs = [
  ...Array.from({ length: 60 }, (_, index) => ({ kind: 'narrow', input: narrow.scenario(index) })),
  ...Array.from({ length: 24 }, (_, index) => ({ kind: 'wide', input: wide.scenario(index) })),
  ...craftedRangeScenarios().map((input, index) => {
    input.requirements.ceilings = [{ spd: 180 }, { atk: 2000 }, { ehp: 150000 }][index % 3];
    return { kind: 'crafted ranges', input };
  }),
];

inputs.push(...inputs.slice(0, 18).map(({ input }, index) => ({
  kind: 'limited changes',
  input: { ...input, settings: { ...input.settings, limitChanges: true,
    maxChanges: index % 6 + 1, oddSlotsAtTwelve: index % 2 === 0 } },
})));

// Own team sets and external counts must travel through the card's same stat sheet.
inputs.push(...Array.from({ length: 11 }, (_, index) => {
  const input = scenarioGenerator(20261016 + index, [3, 3]).scenario(0);
  input.locks = {}; input.withheld = {};
  input.runes = input.runes.map((rune, at) => ({ ...rune, setId: 19 + (at % 3 === 0 ? (index + 1) % 5 : index % 5) }));
  Object.assign(input.requirements, {
    builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
    leads: { atk: 33, def: 20, hp: 30, criRate: 19 },
    teammateSets: { Fight: 3, Determination: 2, Enhance: 1, Accuracy: 4, Tolerance: 5 },
    targets: {}, ceilings: {}, rankBy: ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc', 'dmg', 'ehp', 'ehpD'][index],
  });
  Object.assign(input.settings, { gems: 'none', grinds: 'none', runesOnOtherMonsters: true, resultCount: 3 });
  return { kind: 'team sets', input };
}));

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/`);
  const report = await page.evaluate(async (cases) => {
    const { GpuContext } = await import('/app/lib/compute/gpu/gpu-context.ts');
    const { prepareRuneOptimization } = await import('/app/lib/rune-optimization-problem.ts');
    const { searchRuneBuilds, searchRuneBuildsInPasses } = await import('/app/lib/rune-optimization-search.ts');
    const backend = await import('/app/lib/compute/backends/webgpu-rune-optimization-backend.ts');
    const context = new GpuContext();
    if (!await context.ready()) return { card: false };
    const agrees = await backend.runeOptimizationAgreement(context);
    const results = [];
    for (const { kind, input } of cases) {
      const problem = prepareRuneOptimization(input);
      const processor = searchRuneBuilds(problem);
      let passes = 0;
      let pairs = 0;
      const { outcome, processorTook } = await searchRuneBuildsInPasses(problem, (question) => {
        const card = backend.tailCardOnGpu(question, context);
        return async (pass, bar) => { passes += 1; pairs += pass.pairs; return card(pass, bar); };
      }, kind === 'wide' ? { blocks: 64, pairs: 40000 } : backend.runeOptimizationPassLimits);
      const reading = (table) => table.builds.map((build) => [build.picks.join(','), build.figures.join(','), build.moves].join('|'));
      results.push({
        kind, passes, pairs, processorTook,
        same: JSON.stringify(reading(outcome)) === JSON.stringify(reading(processor)),
        rows: processor.builds.length,
        complete: outcome.complete && processor.complete,
      });
    }
    return { card: true, agrees, results };
  }, inputs);

  if (!report.card) {
    console.error('SKIPPED: this browser exposes no graphics card to WebGPU, so no shader was run.');
    process.exit(1);
  }
  assert.ok(report.agrees, 'the agreement gate refuses this card: the app would answer on the processor');
  for (const [index, result] of report.results.entries()) {
    const context = `${result.kind} account ${index}`;
    assert.ok(result.complete, `${context} did not finish`);
    assert.equal(result.processorTook, false, `${context}: the card refused a pass`);
    assert.ok(result.same, `${context}: the card's table differs from the processor's`);
  }
  const passes = report.results.reduce((total, result) => total + result.passes, 0);
  const pairs = report.results.reduce((total, result) => total + result.pairs, 0);
  const rows = report.results.reduce((total, result) => total + result.rows, 0);
  /* Most accounts are narrowed by their floors and builds to a pass or two; enough of
     the wide ones must span many passes that holding, splitting and the bar rising
     between passes all happened on the card. */
  assert.ok(report.results.filter((result) => result.kind === 'wide' && result.passes >= 10).length >= 5,
    'too few wide accounts spanned many passes to prove anything about splitting a search across them');
  console.log(`PASS: the card passes its agreement gate, and on ${report.results.length} accounts its search`
    + ` matches the processor's pick for pick (${rows} rows, ${passes} passes, ${pairs.toLocaleString('en')} pairs on the card).`);
} finally {
  await browser.close();
}
