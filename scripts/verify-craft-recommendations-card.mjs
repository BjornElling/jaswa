import { isolatePersonalization } from './verification-browser.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await isolatePersonalization(page.context());
  await page.goto('http://localhost:3000/');
  const report = await page.evaluate(async (large) => {
    const { GpuContext } = await import('/app/platform/gpu/gpu-context.ts');
    const { craftScoreAgreement, scoreCraftJobs } = await import('/app/platform/compute/craft-score-engine.ts');
    const { recommendRuneCraft } = await import('/app/domain/runes/craft-advice/rune-craft-recommendations.ts');
    const { readCraftItem } = await import('/app/domain/runes/craft/rune-craft-items.ts');
    const { ordinarySample } = await import('/app/domain/runes/cleanup/rune-cleanup-model.ts');
    const { defaultRuneRoles } = await import('/app/domain/profiles/rune-roles.ts');
    const { defaultRunePotentialSettings } = await import('/app/domain/profiles/preference-defaults.ts');
    const context = new GpuContext();
    if (!await context.ready()) throw new Error('No graphics card is available; shader verification was not done.');
    if (!await craftScoreAgreement(context)) throw new Error('The craft score agreement gate failed.');
    const base = new Map(['Attack type', 'Support type', 'Defence type', 'HP type', 'No type'].map((type) =>
      [type, { hp: 11000, atk: 700, def: 650, spd: 104, criRate: 15, criDmg: 50, res: 15, acc: 0 }]));
    const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) => ordinarySample(slot, 6, large ? 500 : 12, 12)
      .map((rune, at) => ({ ...rune, setId: 13, setName: 'Violent', ancient: at % 3 === 0 })));
    let id = 0;
    const items = [1, 2, 5, 6].flatMap((type) => [2, 4, 6, 8].map((stat) => readCraftItem({
      craft_item_id: ++id, craft_type: type, craft_type_id: 130000 + stat * 100 + (type >= 5 ? 15 : 5), amount: 1,
    })));
    const results = [];
    for (const kind of ['gem', 'grindstone']) {
      const request = { runes, items: items.filter((item) => item.kind === kind), missing: [], roles: defaultRuneRoles(),
        settings: defaultRunePotentialSettings, base, roll: 'two-thirds' };
      const cpu = await recommendRuneCraft({ ...request, preferGpu: false }, scoreCraftJobs);
      const gpu = await recommendRuneCraft({ ...request, preferGpu: true }, scoreCraftJobs);
      const reading = (result) => JSON.stringify(result.candidates);
      results.push({ kind, backend: gpu.backend, same: reading(cpu) === reading(gpu), comparisons: gpu.comparisons,
        runes: runes.length, processorMs: Math.round(cpu.durationMs), cardMs: Math.round(gpu.durationMs) });
    }
    return results;
  }, process.argv.includes('--large'));
  for (const result of report) {
    assert.equal(result.backend, 'webgpu', `${result.kind}: the processor answered instead of the card`);
    assert.equal(result.same, true, `${result.kind}: card ranking differs from processor ranking`);
  }
  console.log(`PASS: craft shader agreement and exact processor/card rankings for ${report.reduce((sum, row) => sum + row.comparisons, 0)} build comparisons.`);
  if (process.argv.includes('--large')) console.log(JSON.stringify(report));
} finally { await browser.close(); }
