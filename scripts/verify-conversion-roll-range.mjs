/**
 * Roll ranges steer conversion projections; they do not reject game-issued
 * data. The game is authoritative when it sends a converted artifact, while
 * the planner keeps its own range model for suggesting future conversions.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true } });

try {
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  /* Captured from the active direct import. Sub-property 3 is the conversion:
     effect 221 rolls 25–40, the line stores no power-ups, and its value of 37
     is a perfectly ordinary single roll. Judging it against `25 × 2` rejected
     the artifact, and with it the account it was engraved on. */
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

  /* A received value beyond the local planning ceiling remains readable. */
  const aboveCeiling = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 13, 2, 0, 0],
      [221, 81, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.ok(readArtifact(aboveCeiling),
    'a converted line past the local planning ceiling remains authoritative input');

  /* The same holds below the local planning floor. */
  const belowSingleRoll = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 13, 2, 0, 0],
      [221, 12, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.ok(readArtifact(belowSingleRoll),
    'a converted line below the local planning floor remains authoritative input');

  /* Ordinary lines follow the same import principle. */
  const unconvertedTooLow = {
    ...record,
    sec_effects: [
      [215, 7, 0, 0, 0], [222, 4, 2, 0, 0],
      [221, 37, 0, 0, 5], [218, 0.8999999999999999, 2, 0, 0],
    ],
  };
  assert.ok(readArtifact(unconvertedTooLow),
    'an ordinary line below the local planning floor remains authoritative input');

  console.log('Conversion ranges guide planning without refusing game-issued artifacts.');
} finally {
  await server.close();
}
