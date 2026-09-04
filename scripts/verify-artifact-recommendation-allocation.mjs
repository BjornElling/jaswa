/**
 * The recommendation allocator has deliberately different goals from a
 * maximum-sum matching algorithm. These fixtures protect its actual contract:
 * ranked pairs lock in order, a monster has one slot per artifact category,
 * and an artifact cannot be recommended twice.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { allocateArtifactPlacements, assertArtifactAllocation } =
    await server.ssrLoadModule('/app/lib/artifact-recommendation-allocation.ts');

  const slots = [
    { monsterId: 'one', category: 'attribute' },
    { monsterId: 'one', category: 'type' },
    { monsterId: 'two', category: 'attribute' },
    { monsterId: 'two', category: 'type' },
  ];
  const candidate = (artifactId, category, monsterId, value, artifactOrder, monsterOrder) =>
    ({ artifactId, category, monsterId, value, artifactOrder, monsterOrder });

  /* The strongest pair wins even though a sum optimiser could choose another
     arrangement. The following pairs then fill the remaining legal slots. */
  const result = allocateArtifactPlacements([
    candidate('A', 'attribute', 'one', 99, 0, 0),
    candidate('A', 'attribute', 'two', 98, 0, 1),
    candidate('B', 'attribute', 'one', 97, 1, 0),
    candidate('B', 'attribute', 'two', 96, 1, 1),
    candidate('C', 'type', 'one', 95, 2, 0),
    candidate('D', 'type', 'two', 94, 3, 1),
    candidate('zero', 'type', 'two', 0, 4, 1),
  ].filter((entry) => entry.value > 0), slots);
  assert.deepEqual(result.placements.map((placement) => placement.artifactId), ['A', 'B', 'C', 'D'],
    'pairs must be locked in descending score order without assigning an artifact twice');
  assert.equal(result.unfilledSlots.length, 0, 'a usable artifact must fill every available category slot');
  assertArtifactAllocation(result.placements, slots);

  /* The score tie has one stated answer: artifact import order, then roster
     order. Repeating the calculation must not depend on sort implementation. */
  const tieCandidates = [
    candidate('later', 'attribute', 'two', 80, 1, 1),
    candidate('first', 'attribute', 'one', 80, 0, 0),
  ];
  const tied = allocateArtifactPlacements(tieCandidates, slots);
  assert.deepEqual(tied.placements.map((placement) => placement.artifactId), ['first', 'later'],
    'equal scores must use the stated stable order');

  /* A positive score can still leave a slot empty when every compatible
     artifact was correctly locked into an earlier, stronger pair. That is an
     explicit capacity shortfall, never a duplicate recommendation or a zero. */
  const short = allocateArtifactPlacements([
    candidate('only', 'attribute', 'one', 90, 0, 0),
    candidate('only', 'attribute', 'two', 89, 0, 1),
  ], slots);
  assert.equal(short.placements.length, 1, 'one physical artifact must have one destination');
  assert.deepEqual(short.unfilledSlots, [
    { monsterId: 'one', category: 'type' },
    { monsterId: 'two', category: 'attribute' },
    { monsterId: 'two', category: 'type' },
  ], 'every unfilled category slot must be reported explicitly');

  assert.throws(() => allocateArtifactPlacements([
    candidate('A', 'attribute', 'one', 50, 0, 0),
    candidate('A', 'attribute', 'one', 49, 0, 0),
  ], slots), /same artifact\/monster pair twice/,
  'duplicate score-matrix input must fail loudly instead of silently changing advice');

  console.log('Artifact recommendation allocation keeps ranked, exclusive category slots.');
} finally {
  await server.close();
}
