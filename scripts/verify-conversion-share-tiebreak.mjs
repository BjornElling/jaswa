/**
 * Conversion targets rank by preference band, then by observed share.
 *
 * The rule it defends, on both halves of a conversion: the band is what the
 * score weighs, so everything inside one band is worth exactly the same, and
 * the tie must be settled by how many players actually engrave the property —
 * never by the order the lines or the property vocabulary happen to be in.
 *
 * The one line given up is the least score-contributing one. When two lines
 * contribute the same score, the weaker natural roll goes first. The property converted to
 * is the most wanted and, among equals, the most engraved.
 *
 * Both fixtures and the real Triana capture that exposed the bug: her Type slot
 * has [Skill 1] Accuracy at 6.98% and [Skill 1] CRIT DMG at 5.06%, both
 * `acceptable`, and index order alone would recommend the weaker one.
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

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
  assert.ok(artifactScoreShader.includes('if (exists && !isSourceProperty) { continue; }'),
    'the GPU scorer must allow a source property to be rerolled in place');
  assert.ok(!artifactScoreShader.includes('for (var source: u32 = 0u; source < 4u;'),
    'the GPU scorer must not offer conversions from every source line');

  assert.deepEqual(
    conversionDescription({ sourceIndex: 0, equivalentSourceIndexes: [0], propertyId: 300, value: 0, gain: 0, preference: 'acceptable' },
      { category: 'attribute', engraveClassCode: 1, grade: 'Rare', propertyId: 300, quantity: 1 }),
    { action: 'Convert to', source: 'Sub 1', target: 'Damage Dealt on Fire', stone: 'Rare Water stone' },
    'a recommendation exposes its action, source, target and stone for distinct presentation');

  /* Lines the monster ranks alike are named together and in numeric order,
     whatever order they reach the description in: the recommendation is
     indifferent between them, so it offers the choice rather than making it. */
  assert.equal(
    conversionDescription({ sourceIndex: 3, equivalentSourceIndexes: [3, 0, 1], propertyId: 300, value: 0, gain: 0, preference: 'acceptable' }).source,
    'Sub 1/2/4',
    'equally ranked source lines are all named, in numeric order');

  /* A permanently converted slot offers no such choice: the scorer sends its
     own line alone, and that line is the one re-converted. */
  assert.deepEqual(
    conversionDescription({ sourceIndex: 2, equivalentSourceIndexes: [2], propertyId: 300, value: 0, gain: 0, preference: 'acceptable' },
      undefined, 2),
    { action: 'Re-convert to', source: 'Sub 3', target: 'Damage Dealt on Fire' },
    'a locked slot re-converts its own line and names no other');

  assert.deepEqual(
    conversionDescription({ sourceIndex: 2, equivalentSourceIndexes: [2], propertyId: 300, value: 0, gain: 0, preference: 'acceptable' },
      undefined, 2, 300),
    { action: 'Improve roll in', source: 'Sub 3', target: 'Damage Dealt on Fire' },
    'a locked slot improving the same property names the higher roll rather than a new conversion');

  assert.deepEqual(
    conversionDescription({ sourceIndex: 2, equivalentSourceIndexes: [2], propertyId: 300, value: 0, gain: 0, preference: 'acceptable' },
      undefined, undefined, 300),
    { action: 'Improve roll in', source: 'Sub 3', target: 'Damage Dealt on Fire' },
    'a natural same-property reroll names the higher roll rather than a new conversion');

  /* Slider words resolve against the target property’s normal-conversion
     maximum — `ceil(maxRoll × 1.5)`, the ceiling the game’s own Repeat
     Convert dialog names. The floor is a single minimum roll, not two, so it
     is a smaller share of that ceiling than the old two-roll model claimed.
     The floor and average are property-specific; "three quarters" is exactly
     75 % for every property. */
  const bombDamage = artifactProperty(210);
  const dealtOnFire = artifactProperty(300);
  assert.equal(artifactConversionRollFraction(bombDamage, 'minimum'), 1 / 3,
    'minimum uses Bomb Damage’s own single 2 % roll against its 6 % ceiling');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'minimum'), 0.375,
    'minimum is one 3 % roll of an 8 % ceiling, not a shared estimate');
  assert.equal(artifactConversionRollFraction(bombDamage, 'one-third'), 1 / 3, 'one third is exactly one third of the maximum');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'one-third'), 0.375,
    'one third never assumes less than the floor a stop to its left already assumes');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'average'), 0.6875,
    'average is the midpoint between the single-roll floor and the ceiling');
  assert.equal(artifactConversionRollFraction(bombDamage, 'two-thirds'), 2 / 3, 'two thirds is exactly two thirds of the maximum');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'two-thirds'), 0.6875,
    'two thirds never assumes less than the midpoint a stop to its left already assumes');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'three-quarters'), 0.75, 'three quarters is exactly 75 % of the maximum');
  assert.equal(artifactConversionRollFraction(dealtOnFire, 'maximum'), 1, 'maximum is the conversion maximum');

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
    subPropertyIndexes: [0, 1, 2, 3], subPropertyRollPoints: [1, 1, 1, 1],
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

  /* Potential follows the action JASWA would actually recommend. Even if an
     acceptable candidate would score more highly, it cannot inflate potential
     while a preferred candidate clears the selected band. */
  const preferenceFirstFractions = new Array(scoredArtifactProperties.length).fill(1);
  preferenceFirstFractions[early.index] = 0.2;
  const preferredPotential = scoreArtifactOnMonster(artifact, {
    ...monster,
    subPropertyPreferences: banded,
  }, { ...request, conversionRollFractions: preferenceFirstFractions });
  assert.equal(preferredPotential?.conversion?.propertyId, early.property.id,
    'the preferred target remains the recommended action when an acceptable target has a stronger roll');
  assert.equal(preferredPotential?.value, (preferredPotential?.conversion?.value ?? 0) / 100,
    'potential is the recommended preferred action, not the hidden accepted maximum');

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
    /* Keep the source rolls below a perfect conversion so these fixtures test
       source choice rather than manufacture an impossible improvement. */
    subPropertyIndexes: [0, 1, 2, 3], subPropertyRollPoints: fractions.map((fraction) => fraction * 1.5),
  });
  const samePropertyMonster = {
    id: 'm', name: 'M', element: 4, archetype: 4, mainPreferences: [2, 0, 0],
    subPropertyPreferences: new Array(scoredArtifactProperties.length).fill(0).map((_, index) => index < 4 ? 2 : 0),
    subPropertyShares: new Array(scoredArtifactProperties.length).fill(0),
  };
  const sameProperty = scoreArtifactOnMonster(
    withRolls([0.2, 0.9, 0.9, 0.9]), samePropertyMonster, request,
  );
  assert.equal(sameProperty?.conversion?.propertyId, scoredArtifactProperties[0].id,
    'a low source roll may be rerolled into the same property');
  assert.deepEqual(sameProperty?.conversion?.equivalentSourceIndexes, [0],
    'a same-property reroll stays attached to its specific source line');
  assert.ok((sameProperty?.conversion?.gain ?? 0) > 0,
    'the same-property reroll must actually improve the score');
  const convertedSameProperty = scoreArtifactOnMonster(
    { ...withRolls([0.2, 0.9, 0.9, 0.9]), convertedPropertyIndex: 0 },
    samePropertyMonster, request,
  );
  assert.equal(convertedSameProperty?.conversion?.propertyId, scoredArtifactProperties[0].id,
    'a weak converted source may also be rerolled into the same property');
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
    'equal zero-contribution rolls keep artifact order, not observed share');

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
  /* Equal nonzero contributions use the lower natural roll, then artifact
     order; observed share is never a source tiebreak. */
  assert.equal(
    chosenSource([0.9, 0.9, 0.9, 0.9], [2, 2, 1, 1], [0.2, 0.2, 0.070, 0.055]), 2,
    'equal contributions in a wanted band are not reordered by share');
  assert.equal(
    chosenSource([0.5, 1, 0.9, 0.9], [2, 1, 2, 2], [0.2, 0.2, 0.2, 0.2]), 0,
    'an equal weighted contribution gives up the lower natural roll');

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

  // ---- The lines the recommendation is indifferent between -----------------
  /* One line is converted, but the user chooses which when the monster ranks
     several the same: replacing any of them costs it nothing it wanted. The
     equivalents are reported beside the source, always including it. */
  const equivalents = (fractions, bands, lineShares) => scoreArtifactOnMonster(
    withRolls(fractions), sourceMonster(bands, lineShares), request)?.conversion?.equivalentSourceIndexes;

  assert.deepEqual(
    equivalents([0.2, 0.9, 0.5, 0.7], [0, 2, 0, 0], [0.01, 0.2, 0.01, 0.01]), [0, 2, 3],
    'every unwanted line is offered, in numeric order, whatever it rolled');
  assert.deepEqual(
    equivalents([0.9, 0.9, 0.9, 0.9], [1, 2, 2, 1], [0.06, 0.2, 0.2, 0.06]), [0, 3],
    'the band groups the lines, so two acceptables are offered together');
  assert.deepEqual(
    equivalents([0.2, 0.9, 0.9, 0.9], [0, 2, 2, 2], [0.01, 0.2, 0.2, 0.2]), [0],
    'a line alone in its band is offered alone');

  /* The roll separates the lines the scorer converts but must not narrow what
     it offers: both are unwanted, so both remain the user's to choose. */
  const rolledApart = equivalents([0.9, 0.9, 1.0, 0.1], [2, 2, 0, 0], [0.2, 0.2, 0.04, 0.04]);
  assert.deepEqual(rolledApart, [2, 3],
    'unequal rolls in one band are still offered together');

  /* An empty slot is nothing the monster wanted either, so it joins the
     unwanted lines rather than forming a band of its own. */
  const withEmptyLine = {
    ...withRolls([0.9, 0.9, 0.9, 0.9]),
    subPropertyIndexes: [0, 1, 2, -1],
  };
  assert.deepEqual(
    scoreArtifactOnMonster(withEmptyLine, sourceMonster([0, 2, 2, 0], [0.01, 0.2, 0.2, 0.01]), request)?.conversion?.equivalentSourceIndexes,
    [0, 3], 'an empty slot is grouped with the unwanted lines');

  /* A locked slot offers no choice at all: a further stone overwrites that one
     line and no other, however the rest are ranked. */
  assert.deepEqual(
    scoreArtifactOnMonster(pinned, sourceMonster([0, 0, 2, 2], [0.01, 0.01, 0.2, 0.2]), request)?.conversion?.equivalentSourceIndexes,
    [2], 'a converted slot is offered alone, never grouped with the unwanted lines');

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
    subPropertyRollPoints: [4.25, 3, 3.335, 4.5],
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

  // ---- §17.4: re-conversion improves the whole artifact -------------------
  /* Line 0 is the converted slot and holds a property the monster does not want.
     Its high roll does not protect it from a conversion that raises the whole
     artifact's score for this monster. */
  const convertedBands = [0, 2, 2, 2];
  const convertedShares = [0.01, 0.2, 0.2, 0.2];
  const convertedWell = {
    ...withRolls([0.9, 0.9, 0.9, 0.9]),
    convertedPropertyIndex: 0,
  };
  const halfReach = { ...request, conversionRollFractions: new Array(scoredArtifactProperties.length).fill(0.6) };
  assert.ok(
    scoreArtifactOnMonster(convertedWell, sourceMonster(convertedBands, convertedShares), halfReach)?.conversions.length,
    'a high but unwanted converted line is replaced when the artifact score improves');

  // ---- §17.3: the significance band applies to conversions too -----------
  const lowGainPreferences = new Array(scoredArtifactProperties.length).fill(0);
  const bombDamageIndex = artifactPropertyIndex.get(210);
  assert.notEqual(bombDamageIndex, undefined, 'Bomb Damage must be a scored property');
  lowGainPreferences[bombDamageIndex] = 1;
  const lowGainArtifact = {
    id: 'threshold', category: 2, restriction: 4, mainProperty: 0, convertedPropertyIndex: -1,
    subPropertyIndexes: [-1, -1, -1, -1], subPropertyRollPoints: [0, 0, 0, 0],
  };
  const lowGainMonster = {
    id: 'threshold', name: 'Threshold', element: 4, archetype: 4,
    mainPreferences: [2, 0, 0], subPropertyPreferences: lowGainPreferences,
    subPropertyShares: new Array(scoredArtifactProperties.length).fill(0),
  };
  /* One point: a conversion assumed to land a sixth of the way to its ceiling,
     halved by the acceptable band, at one and a half max-roll points a full
     conversion — 0.125 points against the `2 + 4 + 3a` benchmark, which moves
     the artifact from 27 % to 28 %. Small enough for the band to swallow, which
     is what this fixture is for. The fraction is stated rather than read off a
     property's floor: every floor is now at least a third of its ceiling, and
     the check is about the band, not about any one property's range. */
  const floorFractions = scoredArtifactProperties.map(() => 1 / 6);
  const lowGainBanded = (insignificantDifference) => scoreArtifactOnMonster(lowGainArtifact, lowGainMonster, {
    ...request, conversionRollFractions: floorFractions, insignificantDifference,
  });
  assert.equal(lowGainBanded(0)?.conversions[0]?.gain, 1, 'the fixture must offer a one-point conversion without a band');
  assert.deepEqual(lowGainBanded(1)?.conversions, [], 'a conversion inside the selected band is not recommended');
  /* The artifact carries no sub property this monster wants, so once the band
     removes the conversion its potential falls back to what it already holds:
     the preferred main property and nothing else. Since the main is a term
     rather than a factor (§16.1) that is a real score, not zero. */
  const lowGainCurrent = scoreArtifactOnMonster(lowGainArtifact, lowGainMonster, {
    ...request, conversionMode: 0, conversionRollFractions: floorFractions,
  })?.value;
  /* The conversion path reports potential in whole percentage points (§17.1)
     where `conversionMode: 0` returns the raw ratio, so the fall-back is
     compared on the scale the interface shows. */
  assert.equal(lowGainBanded(1)?.value, Math.round(lowGainCurrent * 100) / 100,
    'the recommendation band removes an action the player would not take from potential');
  assert.ok(lowGainCurrent > 0,
    'an artifact on a preferred main scores on that main even when no sub property matches');

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
