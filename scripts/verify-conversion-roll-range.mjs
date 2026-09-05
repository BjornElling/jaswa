/**
 * A converted line's extra contribution raises its ceiling and not its floor
 * (`ARTIFACT-CANONICAL.md` §15.9).
 *
 * Doubling both ends of the range rejected ordinary converted lines, and
 * because one unreadable artifact fails the entire account under §0.1, a single
 * such line stopped the import with a message that could not name it. The
 * account settles the shape: no converted line exceeds `maxRoll × 2`, 142 of
 * 265 hold less than `minRoll × 2`, and none falls below a single roll.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true } });

try {
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  /* Captured from the active direct import. Sub-property 3 is the conversion:
     effect 221 rolls 25–40, the line stores no power-ups, and its value of 37
     is a perfectly ordinary single roll. Judging it against `25 × 2` rejected
     the artifact, and with it the account it was equipped on. */
  const record = {
    rid: 1213788120, type: 1, attribute: 4, unit_style: 0, natural_rank: 5,
    rank: 5, level: 15, pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 13, 2, 0, 0],
      [221, 37, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
    occupied_id: 16154924554, locked: 0, source: 50001,
    extra: [], date_add: '2026-08-28 17:22:22', date_mod: '2026-09-05 03:06:49',
  };

  const artifact = readArtifact(record);
  assert.ok(artifact, 'a conversion below twice the minimum roll is a valid line, not a corrupt record');
  assert.equal(artifact.convertedPropertyIndex, 2, 'the conversion stays on the line the export marks');

  /* The ceiling is the half of §10 that the account does confirm, so it has to
     keep rejecting: two contributions is the most a conversion can reach. */
  const aboveCeiling = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 13, 2, 0, 0],
      [221, 81, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.equal(readArtifact(aboveCeiling), null,
    'a converted line past maxRoll × 2 is still corrupt');

  /* Below a single roll stays corrupt too: the floor moved from two rolls to
     one, it did not disappear. */
  const belowSingleRoll = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 13, 2, 0, 0],
      [221, 12, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.equal(readArtifact(belowSingleRoll), null,
    'a converted line under one roll of its property is still corrupt');

  /* An unconverted line keeps the symmetric range its power-ups earned, so the
     relaxation cannot leak into lines that never had a conversion. */
  const unconvertedTooLow = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 4, 2, 0, 0],
      [221, 37, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.equal(readArtifact(unconvertedTooLow), null,
    'an unconverted line below minRoll × its own contributions is still corrupt');

  console.log('Converted lines are judged against an asymmetric roll range.');
} finally {
  await server.close();
}
