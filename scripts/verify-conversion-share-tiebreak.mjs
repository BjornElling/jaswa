/**
 * Conversion targets rank by preference band, then by observed share.
 *
 * The rule it defends, on both halves of a conversion: the band is what the
 * score weighs, so everything inside one band is worth exactly the same, and
 * the tie must be settled by how many players actually engrave the property —
 * never by the order the lines or the property vocabulary happen to be in.
 *
 * The one line given up is the least score-contributing one. When several
 * lines contribute zero, the weaker roll goes first. The property converted to
 * is the most wanted and, among equals, the most engraved.
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
  const { artifactScoreShader } = await server.ssrLoadModule('/app/lib/compute/webgpu/artifact-score-shader.ts');
  const { scoredArtifactProperties, artifactPropertyIndex } = await server.ssrLoadModule('/app/lib/compute/artifact-score-schema.ts');
  const { artifactConversionRollFraction, artifactProperty } = await server.ssrLoadModule('/app/lib/artifact-properties.ts');
  const { defaultPropertyPreferences } = await server.ssrLoadModule('/app/lib/artifact-preferences.ts');
  const { conversionDescription } = await server.ssrLoadModule('/app/lib/artifact-recommendations.ts');

  /* The GPU uses the same single-source conversion contract as the CPU.
     WebGPU is optional in the test runner, so keep this small structural guard
     beside the CPU behaviour fixtures. */
  assert.ok(artifactScoreShader.includes('var source: u32 = 0u;'),
    'the GPU scorer must choose one conversion source before evaluating candidates');
  assert.ok(artifactScoreShader.includes('source = u32(convertedIndex);'),
    'the GPU scorer must lock a permanent conversion to its own source line');
  assert.ok(!artifactScoreShader.includes('for (var source: u32 = 0u; source < 4u;'),
    'the GPU scorer must not offer conversions from every source line');

  assert.deepEqual(
    conversionDescription({ sourceIndex: 0, propertyId: 300, value: 0, gain: 0, preference: 'acceptable' },
      { category: 'attribute', equipClassCode: 1, grade: 'Rare', propertyId: 300, quantity: 1 }),
    { verb: 'Convert', source: 'sub 1', target: 'Damage Dealt on Fire', stone: 'Rare Water stone' },
    'a recommendation exposes its action, source, target and stone for distinct presentation');

  /* Slider words resolve against the target property’s normal-conversion
     maximum — `ceil(maxRoll × 1.5)`, the ceiling the game’s own Repeat
     Convert dialog names. The floor is a single minimum roll, not two, so it
     is a smaller share of that ceiling than the old two-roll model claimed;
     The two-roll floor and average are property-specific; "three quarters" is
     exactly 75 % for every property. */
  const bombDamage = artifactProperty(210);
  const dealtOnFire = artifactProperty(300);
  assert.equal(artifactConversionRollFraction(bombDamage, 1), 1 / 6,
    'minimum uses Bomb Damage’s own single-roll floor against its 6 % ceiling');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 1), 0.375,
    'minimum is one 3 % roll of an 8 % ceiling, not a shared estimate');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 2), 0.6875,
    'average is the midpoint between the single-roll floor and the ceiling');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 3), 0.75, 'three quarters is exactly 75 % of the maximum');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 4), 1, 'maximum is the conversion maximum');

  /* Conversion at full reach against a Legend-shaped ceiling, so the fixtures
     below test the ordering rules rather than the conversion ceiling. */
  const request = {
    acceptableWorth: 50, conversionMode: 1, conversionRollFractions: new Array(scoredArtifactProperties.length).fill(1), insignificantDifference: 0,
    ownedConversionPropertyIndexes: [], ownedConversionPropertyIndexesByClass: {},
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
    convertedSlotConversionFraction: -1, conversionCeilingFraction: 1,
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

  // ---- The source line: only the lowest contribution goes -----------------
  /* Only the line losing the least score may be converted. An unwanted line
     contributes zero, so it is still given up before any wanted line. */
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
    convertedSlotConversionFraction: -1, conversionCeilingFraction: 1,
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
    chosenSource([0.9, 0.9, 0.9, 0.9], [0, 0, 2, 2], [0.04, 0.01, 0.2, 0.2]), 0,
    'an exact zero-contribution tie keeps artifact order, not observed share');

  /* Preference bands do not choose the source. A smaller acceptable
     contribution goes before a larger preferred one. */
  assert.equal(
    chosenSource([0.1, 0.15, 0.9, 0.9], [2, 1, 2, 2], [0.2, 0.01, 0.2, 0.2]), 1,
    'the least-contributing line is chosen even when a preferred line rolled lower');
  assert.equal(
    chosenSource([0.9, 0.9, 0.2, 0.9], [2, 2, 1, 1], [0.2, 0.2, 0.070, 0.055]), 2,
    'among acceptables, the smallest contribution is given up despite a larger share');
  assert.equal(
    chosenSource([0.2, 0.9, 0.9, 0.9], [2, 2, 2, 2], [0.30, 0.11, 0.25, 0.20]), 0,
    'among preferred lines, the smallest contribution is given up despite the largest share');
  /* Equal nonzero contributions retain artifact order; observed share is never
     a source tiebreak. */
  assert.equal(
    chosenSource([0.9, 0.9, 0.9, 0.9], [2, 2, 1, 1], [0.2, 0.2, 0.070, 0.055]), 2,
    'equal contributions in a wanted band are not reordered by share');

  /* The lower roll breaks a zero-contribution tie, regardless of observed
     shares: neither line otherwise costs score to replace. */
  assert.equal(
    chosenSource([0.9, 0.9, 1.0, 0.1], [2, 2, 0, 0], [0.2, 0.2, 0.04, 0.04]), 3,
    'among zero-contribution lines, the weaker roll is given up');
  assert.equal(
    chosenSource([0.9, 0.9, 0.1, 1.0], [2, 2, 0, 0], [0.2, 0.2, 0.04, 0.04]), 2,
    'the weaker roll is found wherever it sits, not by position');

  /* A zero-contribution line stays the sole source even when it rolled better
     than another line, because replacing it still costs no score. */
  assert.equal(
    chosenSource([0.9, 0.9, 1.0, 0.1], [2, 2, 0, 1], [0.2, 0.2, 0.01, 0.070]), 2,
    'a perfectly rolled zero-contribution line still goes before an acceptable one');

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
    convertedSlotConversionFraction: -1, conversionCeilingFraction: 1,
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

  // ---- §17.4: a better existing conversion is never overwritten -----------
  /* The permanent lock means a further stone replaces the line already
     converted, so a slot holding more than the projection would produce keeps
     what it has. Both sides are fractions of the conversion ceiling. */
  /* Line 0 is the converted slot and holds a property the monster does not want,
     so converting it away costs nothing and only the stored value decides. */
  const convertedBands = [0, 2, 2, 2];
  const convertedShares = [0.01, 0.2, 0.2, 0.2];
  const convertedWell = {
    ...withRolls([0.9, 0.9, 0.9, 0.9]),
    convertedPropertyIndex: 0, convertedSlotConversionFraction: 0.95,
  };
  const halfReach = { ...request, conversionRollFractions: new Array(scoredArtifactProperties.length).fill(0.6) };
  assert.deepEqual(
    scoreArtifactOnMonster(convertedWell, sourceMonster(convertedBands, convertedShares), halfReach)?.conversions,
    [], 'a converted slot worth more than the projection is left alone');
  /* The converse, and the common case: a weak conversion is still worth
     replacing, and the recommendation must survive. */
  const convertedBadly = { ...convertedWell, convertedSlotConversionFraction: 0.2 };
  assert.ok(
    scoreArtifactOnMonster(convertedBadly, sourceMonster(convertedBands, convertedShares), halfReach)?.conversions.length,
    'a converted slot worth less than the projection is still recommended for re-conversion');

  // ---- §17.3: the significance band applies to conversions too -----------
  const lowGainPreferences = new Array(scoredArtifactProperties.length).fill(0);
  const bombDamageIndex = artifactPropertyIndex.get(210);
  assert.notEqual(bombDamageIndex, undefined, 'Bomb Damage must be a scored property');
  lowGainPreferences[bombDamageIndex] = 1;
  const lowGainArtifact = {
    id: 'threshold', category: 2, restriction: 4, mainProperty: 0, convertedPropertyIndex: -1,
    subPropertyIndexes: [-1, -1, -1, -1], subPropertyFractions: [0, 0, 0, 0],
    convertedSlotConversionFraction: -1, conversionCeilingFraction: 0.4,
  };
  const lowGainMonster = {
    id: 'threshold', name: 'Threshold', element: 4, archetype: 4,
    mainPreferences: [2, 0, 0], subPropertyPreferences: lowGainPreferences,
    subPropertyShares: new Array(scoredArtifactProperties.length).fill(0),
  };
  /* Three points, not the five this fixture once asserted: Bomb Damage’s
     floor is one minimum roll of a 6 % ceiling (1/6) where the old two-roll
     model claimed 2/8, so a floor conversion is worth correspondingly less. */
  const floorFractions = scoredArtifactProperties.map((property) => artifactConversionRollFraction(property, 1));
  assert.equal(scoreArtifactOnMonster(lowGainArtifact, lowGainMonster, {
    ...request, conversionRollFractions: floorFractions, insignificantDifference: 0,
  })?.conversions[0]?.gain, 3, 'the fixture must offer a three-point conversion without a band');
  assert.deepEqual(scoreArtifactOnMonster(lowGainArtifact, lowGainMonster, {
    ...request, conversionRollFractions: floorFractions, insignificantDifference: 3,
  })?.conversions, [], 'a conversion inside the selected band is not recommended');

  // ---- §17.5: one band, fully listed, in falling order --------------------
  const mixedBands = new Array(scoredArtifactProperties.length).fill(0);
  const typeLegal = scoredArtifactProperties
    .map((property, index) => ({ property, index }))
    .filter(({ property, index }) => property.availability !== 'attribute' && index > 3);
  assert.ok(typeLegal.length >= 3, 'the fixture needs three type-legal candidates');
  mixedBands[typeLegal[0].index] = 1;
  mixedBands[typeLegal[1].index] = 2;
  mixedBands[typeLegal[2].index] = 1;
  const listed = scoreArtifactOnMonster(
    withRolls([0.2, 0.2, 0.2, 0.2]),
    { id: 'm', name: 'M', element: 4, archetype: 4, mainPreferences: [2, 0, 0],
      subPropertyPreferences: mixedBands,
      subPropertyShares: new Array(scoredArtifactProperties.length).fill(0.1) },
    request,
  );
  assert.ok(listed?.conversions.length, 'a mixed-band monster must still offer conversions');
  assert.ok(listed.conversions.every((entry) => entry.sourceIndex === 0),
    'every offered target must replace the one worst source line, never a second-best alternative');
  assert.ok(listed.conversions.every((entry) => entry.preference === 'preferred'),
    'a preferred conversion displaces every accepted one rather than competing with it');
  for (let index = 1; index < listed.conversions.length; index += 1) {
    assert.ok(listed.conversions[index - 1].value >= listed.conversions[index].value,
      'conversions are listed in falling order of what they contribute');
  }
  /* An unwanted property is never suggested, whatever the arithmetic says. */
  assert.ok(listed.conversions.every((entry) => entry.preference !== 'unwanted'),
    'a property the monster neither prefers nor accepts is never offered');

  // ---- §17.1: every score is a whole percentage point ---------------------
  assert.ok(Number.isInteger(listed.conversions[0].value), 'a conversion value is whole percentage points');
  assert.ok(Number.isInteger(listed.conversions[0].gain), 'a conversion gain is whole percentage points');

  console.log('Conversion sources, targets, ceilings and lists follow the stated rules.');
} finally {
  await server.close();
}
