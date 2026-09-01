/**
 * Conversion recommendations rank by preference band, then by observed share.
 *
 * The rule it defends, on both halves of a conversion: the band is what the
 * score weighs, so everything inside one band is worth exactly the same, and
 * the tie must be settled by how many players actually engrave the property —
 * never by the order the lines or the property vocabulary happen to be in.
 *
 * The line given up is the least wanted (unwanted before acceptable before
 * preferred), then the least engraved, then the weaker roll. The property
 * converted to is the most wanted and, among equals, the most engraved.
 *
 * Both fixtures and the real Triana capture that exposed the bug: her Type slot
 * has [Skill 1] Accuracy at 6.98% and [Skill 1] CRIT DMG at 5.06%, both
 * `acceptable`, and index order alone would recommend the weaker one.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { scoreArtifactOnMonster } = await server.ssrLoadModule('/app/lib/compute/artifact-score-core.ts');
  const { scoredArtifactProperties, artifactPropertyIndex } = await server.ssrLoadModule('/app/lib/compute/artifact-score-schema.ts');
  const { defaultPropertyPreferences } = await server.ssrLoadModule('/app/lib/artifact-preferences.ts');

  const request = {
    acceptableWorth: 50, conversionMode: 1, conversionValue: 1, ownedConversionPropertyIndexes: [],
  };

  // ---- Fixture: equal band, unequal share ---------------------------------
  /* Two candidates the artifact does not carry, both `acceptable`, the better
     supported one placed later in the vocabulary so index order would lose. */
  const candidates = scoredArtifactProperties
    .map((property, index) => ({ property, index }))
    .filter(({ property }) => property.availability !== 'attribute')
    .slice(4, 6);
  assert.equal(candidates.length, 2, 'the fixture needs two type-legal candidates');
  const [early, late] = candidates;

  const shares = new Array(scoredArtifactProperties.length).fill(0);
  shares[early.index] = 0.051;
  shares[late.index] = 0.070;
  const preferences = new Array(scoredArtifactProperties.length).fill(0);
  preferences[early.index] = 1;
  preferences[late.index] = 1;

  const artifact = {
    id: 'a', category: 2, restriction: 4, mainProperty: 0, convertedPropertyIndex: -1,
    subPropertyIndexes: [0, 1, 2, 3], subPropertyFractions: [0.2, 0.2, 0.2, 0.2],
  };
  const monster = {
    id: 'm', name: 'M', element: 4, archetype: 4,
    mainPreferences: [2, 0, 0], subPropertyPreferences: preferences, subPropertyShares: shares,
  };

  const scored = scoreArtifactOnMonster(artifact, monster, request);
  assert.ok(scored?.conversion, 'an equally weighted candidate must still be recommended');
  assert.equal(scored.conversion.propertyId, late.property.id,
    'the larger observed share must win a tie, even from later in the vocabulary');

  /* Reversing the shares must reverse the recommendation: this proves the share
     decides it, rather than the fixture merely preferring the later index. */
  const reversed = { ...monster, subPropertyShares: shares.map((_, index) => (
    index === early.index ? 0.070 : index === late.index ? 0.051 : 0)) };
  assert.equal(scoreArtifactOnMonster(artifact, reversed, request)?.conversion?.propertyId, early.property.id,
    'the share must decide the tie in both directions');

  // ---- A preferred candidate still outranks a better supported acceptable --
  /* The band remains the primary judgement: share orders within a band, and
     must never promote an acceptable property over a preferred one. */
  const banded = new Array(scoredArtifactProperties.length).fill(0);
  banded[early.index] = 2;
  banded[late.index] = 1;
  assert.equal(
    scoreArtifactOnMonster(artifact, { ...monster, subPropertyPreferences: banded }, request)?.conversion?.propertyId,
    early.property.id, 'a preferred candidate must outrank a better supported acceptable one');

  // ---- The source line: least wanted goes first ---------------------------
  /* The band decides which line is given up, ahead of how well it rolled: a
     preferred line at a poor roll must survive while an unwanted line at a
     perfect roll is converted away. */
  const sourceShares = new Array(scoredArtifactProperties.length).fill(0);
  const sourceBands = new Array(scoredArtifactProperties.length).fill(0);
  const target = scoredArtifactProperties.findIndex(
    (property, index) => index > 3 && property.availability !== 'attribute');
  assert.ok(target > 3, 'the fixture needs a type-legal conversion target');
  sourceBands[target] = 2;
  sourceShares[target] = 0.30;

  const sourceMonster = (bands, lineShares) => {
    const preferenceList = [...sourceBands];
    const shareList = [...sourceShares];
    bands.forEach((band, line) => { preferenceList[line] = band; });
    lineShares.forEach((share, line) => { shareList[line] = share; });
    return {
      id: 'm', name: 'M', element: 4, archetype: 4, mainPreferences: [2, 0, 0],
      subPropertyPreferences: preferenceList, subPropertyShares: shareList,
    };
  };
  const withRolls = (fractions) => ({
    id: 'a', category: 2, restriction: 4, mainProperty: 0, convertedPropertyIndex: -1,
    subPropertyIndexes: [0, 1, 2, 3], subPropertyFractions: fractions,
  });
  const chosenSource = (fractions, bands, lineShares) => scoreArtifactOnMonster(
    withRolls(fractions), sourceMonster(bands, lineShares), request)?.conversion?.sourceIndex;

  assert.equal(
    chosenSource([1, 0.05, 0.9, 0.9], [0, 1, 2, 2], [0.01, 0.06, 0.2, 0.2]), 0,
    'a perfectly rolled unwanted line is given up before a barely rolled acceptable one');
  assert.equal(
    chosenSource([0.9, 1, 0.05, 0.9], [1, 0, 2, 2], [0.06, 0.01, 0.2, 0.2]), 1,
    'the unwanted line is found wherever it sits, not by position');
  assert.equal(
    chosenSource([0.9, 0.9, 0.9, 0.9], [0, 0, 2, 2], [0.04, 0.01, 0.2, 0.2]), 1,
    'among unwanted lines at equal rolls, the least engraved is given up');

  /* A wanted line is judged on what it contributes, not on its share: score is
     a real difference the player can measure, and the share only stands in
     where score cannot tell two lines apart. */
  assert.equal(
    chosenSource([0.9, 0.9, 0.2, 0.9], [2, 2, 1, 1], [0.2, 0.2, 0.070, 0.055]), 2,
    'among acceptables, the smallest contribution is given up despite a larger share');
  assert.equal(
    chosenSource([0.2, 0.9, 0.9, 0.9], [2, 2, 2, 2], [0.30, 0.11, 0.25, 0.20]), 0,
    'among preferred lines, the smallest contribution is given up despite the largest share');
  /* Equal contribution inside a wanted band: the share must NOT break this tie,
     or a well engraved line would be sacrificed to keep a rare one of equal
     worth. Line order keeps it stable instead. */
  assert.equal(
    chosenSource([0.9, 0.9, 0.9, 0.9], [2, 2, 1, 1], [0.2, 0.2, 0.070, 0.055]), 2,
    'equal contributions in a wanted band are not reordered by share');

  /* Equal band and equal share: the weaker roll is the smaller loss, so it goes
     first. Two unwanted lines are where this genuinely decides the outcome —
     both weigh zero, so the score is identical however either one rolled, and
     without the roll the answer would fall to line order. */
  assert.equal(
    chosenSource([0.9, 0.9, 1.0, 0.1], [2, 2, 0, 0], [0.2, 0.2, 0.04, 0.04]), 3,
    'among equally engraved unwanted lines, the weaker roll is given up');
  assert.equal(
    chosenSource([0.9, 0.9, 0.1, 1.0], [2, 2, 0, 0], [0.2, 0.2, 0.04, 0.04]), 2,
    'the weaker roll is found wherever it sits, not by position');

  /* The band survives any difference in roll: an unwanted line weighs nothing,
     so giving up even a perfect one costs no score at all. */
  assert.equal(
    chosenSource([0.9, 0.9, 1.0, 0.1], [2, 2, 0, 1], [0.2, 0.2, 0.01, 0.070]), 2,
    'a perfectly rolled unwanted line still goes before a barely rolled acceptable one');

  /* A permanently converted slot is the only line a further stone may touch,
     so it stays the source even when a readier line sits beside it. */
  const pinned = { ...withRolls([0.9, 0.9, 0.9, 0.9]), convertedPropertyIndex: 2 };
  assert.equal(
    scoreArtifactOnMonster(pinned, sourceMonster([0, 0, 2, 2], [0.01, 0.01, 0.2, 0.2]), request)?.conversion?.sourceIndex,
    2, 'an already converted slot remains the source, whatever the other lines are');

  // ---- The real capture that exposed this ---------------------------------
  const triana = '21413';
  const trianaPreferences = defaultPropertyPreferences(triana, 'type');
  assert.ok(trianaPreferences, 'Triana must have a recorded Type distribution');

  const accuracy = 407;
  const critDamage = 400;
  assert.equal(trianaPreferences.sub.get(accuracy), 'acceptable', '[Skill 1] Accuracy is acceptable for Triana');
  assert.equal(trianaPreferences.sub.get(critDamage), 'acceptable', '[Skill 1] CRIT DMG is acceptable for Triana');
  assert.ok(trianaPreferences.subShares.get(accuracy) > trianaPreferences.subShares.get(critDamage),
    'more players engrave Accuracy than CRIT DMG on Triana');

  /* The artifact from the report: three of her four best lines already present,
     leaving Accuracy and CRIT DMG as the only acceptable candidates left. */
  const line = (id) => artifactPropertyIndex.get(id) ?? -1;
  const reported = {
    id: '1553', category: 2, restriction: 4, mainProperty: 0, convertedPropertyIndex: -1,
    subPropertyIndexes: [line(218), line(405), line(214), line(221)],
    subPropertyFractions: [0.85, 0.6, 0.667, 0.9],
  };
  const trianaMonster = {
    id: triana, name: 'Triana', element: 4, archetype: 4,
    mainPreferences: [2, 0, 0],
    subPropertyPreferences: scoredArtifactProperties.map((property) => {
      const preference = trianaPreferences.sub.get(property.id);
      return preference === 'preferred' ? 2 : preference === 'acceptable' ? 1 : 0;
    }),
    subPropertyShares: scoredArtifactProperties.map((property) => trianaPreferences.subShares.get(property.id) ?? 0),
  };

  const recommended = scoreArtifactOnMonster(reported, trianaMonster, request);
  assert.ok(recommended?.conversion, 'the reported artifact must still earn a conversion');
  assert.equal(recommended.conversion.propertyId, accuracy,
    'Triana must be recommended [Skill 1] Accuracy, the better supported of the two acceptables');
  assert.equal(recommended.conversion.sourceIndex, 0,
    'the unwanted line must remain the one converted away');

  console.log('Conversion sources and targets rank by band, then by observed share.');
} finally {
  await server.close();
}
