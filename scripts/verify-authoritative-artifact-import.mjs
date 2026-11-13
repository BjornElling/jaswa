import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { readArtifact } = await server.ssrLoadModule('/app/domain/artifacts/artifacts.ts');

  /* These wire shapes exposed the old import bug: a converted Hero whose
     stored power-ups no longer mirror the original distribution, and a Skill 3
     Accuracy line at +8. The game issued both values; the reader preserves
     them and leaves roll tables to planning. */
  const convertedHero = {
    rid: 1, type: 2, unit_style: 1, natural_rank: 4, level: 15,
    pri_effect: [101, 100, 15, 0, 0],
    sec_effects: [[410, 9, 1, 0, 0], [215, 13, 1, 0, 0], [401, 6, 0, 0, 5], [223, 8, 0, 0, 0]],
    occupied_id: 10, date_add: '2026-08-27 16:33:10',
  };
  const convertedRare = {
    rid: 2, type: 2, unit_style: 1, natural_rank: 3, level: 15,
    pri_effect: [101, 100, 15, 0, 0],
    sec_effects: [[225, 4, 1, 0, 0], [408, 11, 1, 0, 0], [411, 6, 0, 0, 0], [409, 8, 0, 1, 0]],
    occupied_id: 11, date_add: '2026-09-06 04:03:38',
  };

  const hero = readArtifact(convertedHero);
  const rare = readArtifact(convertedRare);
  assert.ok(hero, 'a converted artifact whose power-up encoding changed must import');
  assert.ok(rare, 'a converted artifact outside the ordinary roll range must import');
  assert.equal(hero.convertedPropertyIndex, 2, 'the documented conversion-lock field still informs planning');
  assert.equal(rare.convertedPropertyIndex, 3, 'the current conversion marker locks the game-marked fourth sub-property');
  assert.equal(rare.subProperties[3].valueHundredths, 800, 'the game-issued conversion value remains exact');
  assert.equal(readArtifact({ ...convertedHero, sec_effects: convertedHero.sec_effects.slice(0, 3) }), null,
    'the structural four-line contract still protects rendering');

  console.log('Game-issued conversion values import intact while malformed artifact shapes still fail.');
} finally {
  await server.close();
}
