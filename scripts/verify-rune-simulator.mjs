import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const {
    defaultRuneSimulationConfig, powerUpRune, simulateRunes, simulationGradeForSlot,
  } = await server.ssrLoadModule('/app/lib/rune-simulator.ts');

  /* The grade distribution is a locked game assumption, not a page option. */
  assert.equal(simulationGradeForSlot(1, () => 0), 'Hero');
  assert.equal(simulationGradeForSlot(1, () => 0.749999), 'Hero');
  assert.equal(simulationGradeForSlot(1, () => 0.75), 'Legend');
  assert.equal(simulationGradeForSlot(2, () => 0), 'Rare');
  assert.equal(simulationGradeForSlot(2, () => 0.249999), 'Rare');
  assert.equal(simulationGradeForSlot(2, () => 0.25), 'Hero');
  assert.equal(simulationGradeForSlot(2, () => 0.749999), 'Hero');
  assert.equal(simulationGradeForSlot(2, () => 0.75), 'Legend');

  /* Gems and Grindstones credited at three quarters; step 1 of either slider is "none". */
  const craftedSettings = {
    powerUpPolicy: 3, runeQuality: 3, enchantedGems: 3, grindstones: 3,
    gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3,
    brokenRunes: 3, intangibleRunes: 1, keepMoreForLargerSets: false,
  };
  const makeRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17; state >>>= 0;
      state ^= state << 5; state >>>= 0;
      return state / 0x1_0000_0000;
    };
  };

  const makeRune = (defaultGrade, count) => ({
    id: `grade-${defaultGrade}`, setName: null, slot: 2, stars: 6,
    ancient: false, defaultGrade, level: 0, mainStatId: 3, prefixStatId: null,
    prefixValue: 0,
    subProperties: Array.from({ length: count }, (_, index) => ({
      statId: [1, 2, 4][index], value: 5, gemmed: false, grind: 0, rolls: 0,
    })),
  });
  const magic = powerUpRune(makeRune('Magic', 1), 12, () => 0);
  assert.equal(magic.subProperties.length, 4);
  assert.equal(magic.subProperties.reduce((sum, property) => sum + property.rolls, 0), 1,
    'Magic improves its born line once before it adds the remaining lines');
  const hero = powerUpRune(makeRune('Hero', 3), 12, () => 0);
  assert.equal(hero.subProperties.length, 4);
  assert.equal(hero.subProperties.reduce((sum, property) => sum + property.rolls, 0), 3,
    'Hero improves its three born lines before adding its fourth line');

  const result = await simulateRunes({
    ...defaultRuneSimulationConfig,
    count: 25,
    slot: 2,
    stars: 6,
    gates: { 0: { policy: 'keep-all' }, 9: { policy: 'keep-all' }, 12: { policy: 'keep-all' } },
  }, {
    presets: [],
    settings: craftedSettings,
    base: null,
  }, () => 0.1);
  assert.equal(result.stages[0].entries.length, 25);
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.setName === null), true,
    'None leaves the generated rune without a rune type');
  assert.equal(result.stages[0].entries.every(({ rune }) => !('ancient' in rune)), true,
    'the simulator generates ordinary runes only');
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.subProperties.every((property) => property.rolls === 0)), true,
    'natural substats do not count as power-up rolls');
  assert.equal(result.stages[0].entries.every(({ verdict, sold }) => verdict === null && sold === false), true,
    'with nothing to judge by, no verdict is invented and Keep all sells nothing');
  assert.equal(result.summary.kept, null, 'no keeper count is claimed without a verdict');
  assert.equal(result.stages[12].entries.length, 25, 'Keep all carries the whole batch to +12');
  assert.equal(result.stages[12].entries.every(({ rune }) =>
    rune.subProperties.every((property) => !property.gemmed && property.grind === 0)), true,
  'with no role to judge by, no Gem or Grindstone is spent');
  await assert.rejects(simulateRunes({
    ...defaultRuneSimulationConfig, count: 1,
  }, { presets: [], settings: craftedSettings, base: null }, () => 0.1),
  'a recommendation gate with nothing to judge by fails rather than keeping everything');

  /* The rune that exposed the craft defect: SPD, HP % and DEF % for a support role,
     with Resistance arriving at +12. Every grindable line is ground, and the Gem takes
     Resistance — the line worth least to the role — rather than DEF %. */
  const { runeAdvice } = await server.ssrLoadModule('/app/lib/rune-cleanup-advice.ts');
  const { defaultRunePotentialPresets } = await server.ssrLoadModule('/app/lib/rune-potential-presets.ts');
  const { isGrindableStatId } = await server.ssrLoadModule('/app/lib/rune-craft-end-state.ts');
  const support = defaultRunePotentialPresets().filter((preset) => preset.id === 'support');
  assert.equal(support.length, 1, 'the shipped Support preset exists');
  const supportBase = new Map([['Support type',
    { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }]]);
  const reported = {
    id: 'reported', setId: 0, setName: 'No rune type', slot: 5, stars: 6, ancient: false,
    defaultGrade: 'Hero', level: 12, mainStatId: 1, mainValue: 2448, prefixStatId: null, prefixValue: 0,
    subProperties: [
      { statId: 8, value: 14, gemmed: false, grind: 0 },
      { statId: 2, value: 15, gemmed: false, grind: 0 },
      { statId: 6, value: 16, gemmed: false, grind: 0 },
      { statId: 11, value: 4, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  };
  const reportedAdvice = (await runeAdvice([reported], support, craftedSettings, supportBase)).get('reported');
  const crafted = reportedAdvice.craftedLines;
  assert.ok(crafted, 'a +12 rune a preset can use reports the line-up its verdict assumed');
  assert.deepEqual(crafted.slice(0, 3).map((line) => [line.statId, line.value, line.gemmed]),
    [[8, 14, false], [2, 15, false], [6, 16, false]], 'the Gem leaves SPD, HP % and DEF % alone');
  assert.equal(crafted[3].gemmed, true, 'the Gem replaces Resistance');
  assert.notEqual(crafted[3].statId, 11, 'the Gem changes Resistance into something the role values more');
  for (const line of crafted) {
    assert.equal(line.grind > 0, isGrindableStatId(line.statId),
      `stat ${line.statId} is ground exactly when a Grindstone can touch it`);
  }

  /* The simulator spends what the verdict counted, on every rune it takes to +12. */
  const supported = await simulateRunes({ ...defaultRuneSimulationConfig, count: 40, slot: 5, stars: 6 },
    { presets: support, settings: craftedSettings, base: supportBase }, makeRandom(0x5eed));
  for (const { rune } of supported.stages[12].entries) {
    assert.ok(rune.subProperties.filter((property) => property.gemmed).length <= 1, `${rune.id} carries one Gem at most`);
    for (const property of rune.subProperties) {
      assert.equal(property.grind > 0, isGrindableStatId(property.statId),
        `${rune.id}: stat ${property.statId} is ground exactly when it can be`);
      if (property.gemmed) assert.equal(property.rolls, 0, `${rune.id}: a Gemmed line keeps none of its rolls`);
    }
  }

  console.log('Verified the locked rune-grade distribution, roll counters and the +12 craft.');
} finally {
  await server.close();
}
