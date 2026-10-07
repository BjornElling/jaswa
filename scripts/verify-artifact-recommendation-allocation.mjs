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
  const { canonicalArtifactScoreMonsterIds } =
    await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { collaborationSpecies } = await server.ssrLoadModule('/app/lib/monster-species.ts');

  const slots = [
    { monsterId: 'one', category: 'attribute' },
    { monsterId: 'one', category: 'type' },
    { monsterId: 'two', category: 'attribute' },
    { monsterId: 'two', category: 'type' },
  ];
  const candidate = (artifactId, category, monsterId, value, artifactOrder, monsterOrder, exclusiveGroup) =>
    ({ artifactId, category, monsterId, value, artifactOrder, monsterOrder, exclusiveGroup });

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

  /* The reported Talia shape: a 35 % pair cannot take Talia's slot while its
     37 % competitor remains available. It may do so only after that physical
     artifact has genuinely been locked to a stronger pair, which must appear
     as its own recommendation. */
  const taliaSlots = [
    { monsterId: 'talia', category: 'attribute' },
    { monsterId: 'other', category: 'attribute' },
  ];
  const keepsTaliaBest = allocateArtifactPlacements([
    candidate('thirty-seven', 'attribute', 'talia', 37, 0, 0),
    candidate('thirty-seven', 'attribute', 'other', 36, 0, 1),
    candidate('thirty-five', 'attribute', 'talia', 35, 1, 0),
    candidate('thirty-five', 'attribute', 'other', 34, 1, 1),
  ], taliaSlots);
  assert.equal(keepsTaliaBest.placements.find((placement) => placement.monsterId === 'talia')?.artifactId, 'thirty-seven',
    'a 35 % artifact must not lock Talia while the 37 % artifact remains available');
  const movesTaliaBest = allocateArtifactPlacements([
    candidate('thirty-seven', 'attribute', 'talia', 37, 0, 0),
    candidate('thirty-seven', 'attribute', 'other', 38, 0, 1),
    candidate('thirty-five', 'attribute', 'talia', 35, 1, 0),
  ], taliaSlots);
  assert.deepEqual(movesTaliaBest.placements.map((placement) => [placement.monsterId, placement.artifactId]), [
    ['other', 'thirty-seven'], ['talia', 'thirty-five'],
  ], 'a lower Talia score is legal only when the higher artifact is visibly locked to a stronger pair');

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

  /* Intangible is a cross-category exception: the winning one may fill either
     slot, but a monster cannot take a second Intangible in the other slot. */
  const intangibles = allocateArtifactPlacements([
    candidate('attribute-intangible', 'attribute', 'one', 100, 0, 0, 'intangible'),
    candidate('type-intangible', 'type', 'one', 99, 1, 0, 'intangible'),
    candidate('ordinary-type', 'type', 'one', 98, 2, 0),
    candidate('type-intangible', 'type', 'two', 97, 1, 1, 'intangible'),
  ], slots);
  assert.deepEqual(intangibles.placements.map((placement) => [placement.monsterId, placement.artifactId]), [
    ['one', 'attribute-intangible'], ['one', 'ordinary-type'], ['two', 'type-intangible'],
  ], 'one monster may receive only one Intangible artifact across its two slots');
  assert.throws(() => assertArtifactAllocation([
    candidate('attribute-intangible', 'attribute', 'one', 100, 0, 0, 'intangible'),
    candidate('type-intangible', 'type', 'one', 99, 1, 0, 'intangible'),
  ], slots), /exclusive group member/,
  'a manual allocation with two Intangible artifacts on one monster must fail loudly');

  assert.throws(() => allocateArtifactPlacements([
    candidate('A', 'attribute', 'one', 50, 0, 0),
    candidate('A', 'attribute', 'one', 49, 0, 0),
  ], slots), /same artifact\/monster pair twice/,
  'duplicate score-matrix input must fail loudly instead of silently changing advice');

  /* Every matrix lookup resolves a roster copy through `monsterSpeciesId`, so
     the input boundary has to normalise every collaboration member first. The
     table verifier proves the mappings; this covers their use in artifacts. */
  const everyCollaborationMasterId = Object.entries(collaborationSpecies)
    .flatMap(([speciesId, entry]) => [speciesId, ...entry.members]);
  assert.deepEqual(
    canonicalArtifactScoreMonsterIds(everyCollaborationMasterId),
    Object.keys(collaborationSpecies),
    'every collaboration master id must collapse to its score-matrix species id',
  );
  assert.deepEqual(canonicalArtifactScoreMonsterIds(['1000111', '99999']), ['1000111', '99999'],
    'ordinary and atypically long master ids must remain their own score species');

  console.log('Artifact recommendations keep ranked slots and canonical monster species.');
} finally {
  await server.close();
}
