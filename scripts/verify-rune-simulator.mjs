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

  const makeRune = (defaultGrade, count) => ({
    id: `grade-${defaultGrade}`, setName: null, setBonus: null, slot: 2, stars: 6,
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
  }, {
    presets: [],
    settings: {
      powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1,
      gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3,
      brokenRunes: 3, intangibleRunes: 1, keepMoreForLargerSets: false,
    },
    base: null,
  }, () => 0.1);
  assert.equal(result.stages[0].entries.length, 25);
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.setName === null), true,
    'None leaves the generated rune without a rune type');
  assert.equal(result.stages[0].entries.every(({ rune }) => !('ancient' in rune)), true,
    'the simulator generates ordinary runes only');
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.subProperties.every((property) => property.rolls === 0)), true,
    'natural substats do not count as power-up rolls');

  console.log('Verified the locked rune-grade distribution and roll counters.');
} finally {
  await server.close();
}
