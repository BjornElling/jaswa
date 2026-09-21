import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const {
    defaultRuneSimulationConfig, simulateRunes, simulationGradeForSlot,
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

  const result = simulateRunes({
    ...defaultRuneSimulationConfig,
    count: 25,
    slot: 2,
    stars: 6,
  }, () => 0.1);
  assert.equal(result.stages[0].entries.length, 25);
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.setName === null), true,
    'None leaves the generated rune without a rune type');
  assert.equal(result.stages[0].entries.every(({ rune }) => rune.subProperties.every((property) => property.rolls === 0)), true,
    'natural substats do not count as power-up rolls');

  console.log('Verified the locked rune-grade distribution and roll counters.');
} finally {
  await server.close();
}
