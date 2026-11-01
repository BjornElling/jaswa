/**
 * Intangible artifacts — the wildcard engrave class (`ARTIFACT-CANONICAL.md`
 * §15.1). Fixture-based, so it guards the rule without needing a real capture.
 *
 * The rule it defends: an Intangible artifact fills its category slot but
 * matches every class inside it, and an engrave class JASWA cannot name is
 * rejected rather than imported and hidden (`AGENTS.md` §0.1).
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

/* A Rare artifact: two power-ups spread over four legal lines. `type` picks
   which of `attribute`/`unit_style` carries the class, as §15.1 records. */
function artifact(id, { type, attribute = 0, unitStyle = 0 }) {
  const effects = type === 1
    ? [[206, 4, 0, 0, 0], [223, 8, 0, 0, 0], [304, 8, 1, 0, 0], [220, 6, 1, 0, 0]]
    : [[206, 4, 0, 0, 0], [223, 8, 0, 0, 0], [400, 8, 1, 0, 0], [220, 6, 1, 0, 0]];
  return {
    rid: id, type, attribute, unit_style: unitStyle, natural_rank: 3, rank: 5, level: 15,
    pri_effect: [101, 100, 15, 0, 0], sec_effects: effects,
    occupied_id: 0, locked: 0, source: 50001, extra: [], date_add: '2026-08-01T00:00:00Z',
  };
}

try {
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');
  const { artifactEngraveClass, artifactEngraveClassLabel } = await server.ssrLoadModule('/app/lib/artifact-grid.ts');
  const { artifactIntangibleEngraveClass, artifactIntangibleLabel } = await server.ssrLoadModule('/app/lib/artifact-properties.ts');
  const { scoreArtifactOnMonster } = await server.ssrLoadModule('/app/lib/compute/artifact-score-core.ts');
  const { intangibleRestrictionCode } = await server.ssrLoadModule('/app/lib/compute/artifact-score-protocol.ts');

  // ---- Reading ------------------------------------------------------------
  const intangibleAttribute = readArtifact(artifact(1, { type: 1, attribute: artifactIntangibleEngraveClass }));
  assert.ok(intangibleAttribute, 'an Intangible attribute artifact must import');
  assert.equal(intangibleAttribute.intangible, true);
  assert.equal(intangibleAttribute.category, 'attribute', 'the category still binds');
  assert.equal(artifactEngraveClass(intangibleAttribute), null, 'it names no single class');
  assert.equal(artifactEngraveClassLabel(intangibleAttribute), artifactIntangibleLabel);

  const intangibleType = readArtifact(artifact(2, { type: 2, unitStyle: artifactIntangibleEngraveClass }));
  assert.ok(intangibleType, 'an Intangible type artifact must import');
  assert.equal(intangibleType.intangible, true);
  assert.equal(intangibleType.category, 'type');
  assert.equal(artifactEngraveClassLabel(intangibleType), artifactIntangibleLabel);

  const dark = readArtifact(artifact(3, { type: 1, attribute: 5 }));
  assert.ok(dark);
  assert.equal(dark.intangible, false, 'a named class is not Intangible');
  assert.equal(artifactEngraveClassLabel(dark), 'Dark');

  /* §15.1: the field `type` does not name is always 0, so a stray value there
     must not become this artifact's class. */
  const strayField = readArtifact(artifact(4, { type: 2, attribute: artifactIntangibleEngraveClass, unitStyle: 1 }));
  assert.ok(strayField);
  assert.equal(strayField.intangible, false, 'the unused field must not decide the class');
  assert.equal(artifactEngraveClassLabel(strayField), 'Attack');

  // ---- Parity: an unnameable class is rejected, never hidden --------------
  for (const code of [7, 42, 99, 200]) {
    assert.equal(readArtifact(artifact(5, { type: 1, attribute: code })), null,
      `attribute ${code} names no class, so the record must be rejected (AGENTS.md §0.1)`);
    assert.equal(readArtifact(artifact(6, { type: 2, unitStyle: code })), null,
      `unit_style ${code} names no class, so the record must be rejected`);
  }
  assert.equal(readArtifact(artifact(7, { type: 1, attribute: 0 })), null,
    'a missing engrave class is a rejection, not an Intangible');

  // ---- Scoring: the wildcard fits every class in its category -------------
  const request = {
    acceptableWorth: 50, conversionMode: 0, conversionRollFractions: [], insignificantDifference: 0,
    ownedConversionPropertyIndexes: [], ownedConversionPropertyIndexesByClass: {},
  };
  const packed = (category, restriction) => ({
    id: 'a', category, restriction, mainProperty: 1, convertedPropertyIndex: -1,
    subPropertyIndexes: [0, 1, 2, 3], subPropertyRollPoints: [2.5, 2.5, 2.5, 2.5],
  });
  const monster = (element, archetype) => ({
    id: 'm', name: 'M', element, archetype,
    mainPreferences: [0, 2, 0], subPropertyPreferences: new Array(64).fill(2),
    subPropertyShares: new Array(64).fill(0),
  });

  for (const element of [1, 2, 3, 4, 5]) {
    assert.ok(scoreArtifactOnMonster(packed(1, intangibleRestrictionCode), monster(element, 1), request),
      `an Intangible attribute artifact must fit element ${element}`);
  }
  for (const archetype of [1, 2, 3, 4]) {
    assert.ok(scoreArtifactOnMonster(packed(2, intangibleRestrictionCode), monster(1, archetype), request),
      `an Intangible type artifact must fit archetype ${archetype}`);
  }

  /* A restricted artifact still requires an exact class, so the wildcard code
     did not become a general "matches anything" on both sides. */
  assert.equal(scoreArtifactOnMonster(packed(1, 5), monster(3, 1), request), undefined,
    'a Dark artifact must not fit a Wind monster');
  assert.equal(scoreArtifactOnMonster(packed(2, 1), monster(1, 3), request), undefined,
    'an Attack artifact must not fit an HP monster');
  assert.equal(scoreArtifactOnMonster(packed(2, 1), monster(1, 0), request), undefined,
    'a restricted artifact must not fit a monster whose own class is unresolved');

  // ---- §10.1: an Intangible artifact cannot be converted ------------------
  /* The wildcard that makes it fit every monster is the same fact that leaves
     it no class for a stone to match, so no conversion may ever be projected
     for one — in any conversion mode. Scoring it otherwise would rank these
     above artifacts that can genuinely be improved, on a gain the game will
     never let the user collect. */
  const convertible = (restriction) => ({
    ...packed(1, restriction),
    /* Room for a conversion to land: one weak line, and a preference profile
       below that leaves properties the artifact does not already hold. */
    subPropertyRollPoints: [2.5, 2.5, 2.5, 0.5],
  });
  const conversionRequest = (mode) => ({
    ...request,
    conversionMode: mode,
    conversionRollFractions: new Array(64).fill(1),
  });

  for (const mode of [1, 2]) {
    const wildcard = scoreArtifactOnMonster(
      convertible(intangibleRestrictionCode), monster(1, 1), conversionRequest(mode));
    assert.ok(wildcard, 'an Intangible artifact must still be scored');
    assert.deepEqual(wildcard.conversions, [],
      `an Intangible artifact must be offered no conversion in mode ${mode} (§10.1)`);
    assert.equal(wildcard.conversion, undefined,
      `an Intangible artifact must name no best conversion in mode ${mode}`);

    /* And the value it reports is the value of the lines it holds — the rule
       removes the projection, it does not merely hide the recommendation. */
    const unconverted = scoreArtifactOnMonster(
      convertible(intangibleRestrictionCode), monster(1, 1), { ...conversionRequest(mode), conversionMode: 0 });
    assert.equal(wildcard.value, unconverted.value,
      `an Intangible artifact must score as unconverted in mode ${mode}`);
  }

  /* The rule is about the wildcard, not about conversion generally: a
     restricted artifact on the same lines is still offered its conversion, so
     the guard above cannot pass by disabling the feature. */
  const restricted = scoreArtifactOnMonster(convertible(1), monster(1, 1), conversionRequest(1));
  assert.ok(restricted.conversions.length > 0,
    'a restricted artifact must still be offered conversions');

  console.log('Verified Intangible artifact import, naming, rejection, eligibility and the §10.1 conversion ban.');
} finally {
  await server.close();
}
