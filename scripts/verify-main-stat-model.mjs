#!/usr/bin/env node

/**
 * Holds the main-stat model to `docs/MAIN-STAT-MODEL.md`.
 *
 * The model decides which of HP, ATK and DEF every artifact and relic should
 * carry, and nothing on screen fails when it drifts: a default simply starts
 * saying something else. So the rules are checked here, each against a case
 * worked by hand:
 *
 * - the bands: 80/10/10 is one preferred main and nothing accepted, 40/40/20 is
 *   two preferred and one accepted, and every captured species has at least
 *   one preferred main;
 * - the sources, in order: six runes, else HP/ATK/DEF floors, else statistics,
 *   with the fixed flat mains of slots 1, 3 and 5 never counted;
 * - an artifact's fixed main is worth more on a stat with a small base, and a
 *   relic's percentage is not;
 * - what counts as contradicting the model, and that `Any` never does.
 *
 * Usage: node scripts/verify-main-stat-model.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const {
    copyMainStatAdvice, copyMainStatNeed, speciesMainStatAdvice, contradictsAdvice, copyArtifactMainBands,
  } = await server.ssrLoadModule('/app/lib/main-stat-model.ts');
  const { defaultedMonsterSpeciesIds } = await server.ssrLoadModule('/app/lib/monster-defaults.ts');

  const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} is not ${expected}`);
  const blankMains = { 1: [3, 0], 2: [8, 0], 3: [5, 0], 4: [2, 0], 5: [1, 0], 6: [2, 0] };
  /* A finished build: the named runes in slots 2, 4 and 6, blanks elsewhere. */
  const build = (...named) => {
    const placed = named.map((rune, at) => ({ slot_no: [2, 4, 6][at], set_id: 0, ...rune }));
    const taken = new Set(placed.map((rune) => rune.slot_no));
    return [...placed, ...[1, 2, 3, 4, 5, 6].filter((slot) => !taken.has(slot))
      .map((slot) => ({ slot_no: slot, set_id: 0, pri_eff: blankMains[slot] }))];
  };
  /* Equal bases in percent terms: 1,500 HP, 100 ATK and 100 DEF are each 10 %. */
  const even = { con: 1000, atk: 1000, def: 1000 };
  const copy = (runes, extra = {}) => ({ ...even, runes, ...extra });
  const bands = (advice) => advice.bands;

  /* The documented examples. */
  const lopsided = copyMainStatAdvice(copy(build(
    { pri_eff: [2, 63], sec_eff: [[2, 17, 0, 0]] }, { pri_eff: [4, 10] }, { pri_eff: [6, 10] },
  )));
  assert.equal(lopsided.basis, 'runes');
  assert.deepEqual(lopsided.need, { HP: 80, ATK: 10, DEF: 10 });
  assert.deepEqual(bands(lopsided.relic), { HP: 'preferred', ATK: 'unwanted', DEF: 'unwanted' });
  assert.deepEqual(bands(lopsided.artifact), bands(lopsided.relic), 'With equal bases an artifact answers as a relic does');

  const shared = copyMainStatAdvice(copy(build({ pri_eff: [2, 40] }, { pri_eff: [6, 40] }, { pri_eff: [4, 20] })));
  assert.deepEqual(bands(shared.relic), { HP: 'preferred', ATK: 'acceptable', DEF: 'preferred' });
  near(shared.relic.worth.HP, 0.4, 'HP worth share');

  /* An artifact's fixed amount on a small base: 100 DEF on 400 DEF is 25 %,
     1,500 HP on 15,000 HP is 10 %, so DEF overtakes HP where a relic ranks them
     by need alone — 60 × 10 against 40 × 25. */
  const smallDef = copyMainStatAdvice({ con: 1000, atk: 1000, def: 400, runes: build({ pri_eff: [2, 60] }, { pri_eff: [6, 40] }) });
  assert.deepEqual(bands(smallDef.relic), { HP: 'preferred', ATK: 'unwanted', DEF: 'acceptable' });
  assert.deepEqual(bands(smallDef.artifact), { HP: 'acceptable', ATK: 'unwanted', DEF: 'preferred' });

  /* Fixed mains are ignored; sets are counted. */
  const withFixed = copyMainStatNeed(copy(build({ pri_eff: [2, 40] }).map((rune) => ({
    ...rune, ...(rune.slot_no === 1 ? { pri_eff: [3, 160] } : rune.slot_no === 5 ? { pri_eff: [1, 2448] } : {}),
  }))));
  assert.deepEqual(withFixed.need, { HP: 40, ATK: 0, DEF: 0 });
  const guarded = copyMainStatNeed(copy(build({ pri_eff: [2, 40] }).map((rune) => ({ ...rune, set_id: rune.slot_no <= 2 ? 2 : 0 }))));
  assert.deepEqual(guarded.need, { HP: 40, ATK: 0, DEF: 15 });

  /* The sources, in order. Five runes are not a build; targets speak then. */
  const unfinished = copy(build({ pri_eff: [4, 63] }).filter((rune) => rune.slot_no !== 3));
  assert.equal(copyMainStatNeed(unfinished), undefined, 'Five runes, no floor and no species say nothing');
  const floors = { unitId: '1', statTargets: { def: 2160, spd: 300 }, defLead: 20 };
  const fromTargets = copyMainStatNeed(unfinished, floors);
  assert.equal(fromTargets.basis, 'targets');
  near(fromTargets.need.DEF, (2160 - 160) / 1000 * 100 - 100 - 20, 'DEF floor');
  assert.equal(fromTargets.need.HP, 0, 'A stat without a floor needs nothing');
  assert.equal(copyMainStatNeed(copy(build({ pri_eff: [4, 63] })), floors).basis, 'runes', 'Six runes outrank targets');
  assert.equal(copyMainStatNeed(unfinished, { unitId: '1', statTargets: { ehp: 60000 } }), undefined,
    'A composite floor is not split into HP and DEF');
  assert.equal(copyMainStatNeed(unfinished, { unitId: '1', statTargets: { hp: 1000 } }), undefined,
    'A floor the base already clears needs nothing');

  /* Statistics: every captured species has at least one preferred main, and a
     copy with nothing of its own answers exactly as its species does. */
  let judged = 0;
  for (const speciesId of defaultedMonsterSpeciesIds) {
    const advice = speciesMainStatAdvice(speciesId);
    if (advice === undefined) continue;
    judged += 1;
    for (const piece of ['artifact', 'relic']) {
      assert.ok(Object.values(advice[piece].bands).includes('preferred'), `${speciesId} has no preferred ${piece} main`);
    }
    assert.deepEqual(advice.artifact.bands, advice.relic.bands, `${speciesId}: without a base the two pieces agree`);
  }
  /* Every captured species, not most: one left without an answer would default
     every copy of it to Any without anything saying so (`AGENTS.md` §0.1). */
  assert.equal(judged, defaultedMonsterSpeciesIds.length,
    `${defaultedMonsterSpeciesIds.length - judged} captured species have no statistics answer`);
  const someSpecies = Number(defaultedMonsterSpeciesIds.find((id) => speciesMainStatAdvice(id) !== undefined));
  const bare = copyMainStatAdvice({ ...even, unit_master_id: someSpecies, runes: [] });
  assert.equal(bare.basis, 'statistics');
  assert.deepEqual(bare.need, speciesMainStatAdvice(someSpecies).need);

  /* A stated answer replaces the model in scoring; the model fills in silence. */
  const hpBuild = copy(build({ pri_eff: [2, 63] }));
  assert.deepEqual(copyArtifactMainBands(hpBuild, undefined), { HP: 'preferred', ATK: 'unwanted', DEF: 'unwanted' });
  assert.deepEqual(copyArtifactMainBands(hpBuild, { unitId: '1', mainStat: { preferred: ['ATK'], acceptable: [] } }),
    { HP: 'unwanted', ATK: 'preferred', DEF: 'unwanted' });

  /* Contradiction: two bands apart, or two mains in opposite order. */
  const model = shared.relic; // HP and DEF preferred, ATK accepted
  const says = (preferred, acceptable = []) => contradictsAdvice({ preferred, acceptable }, model);
  assert.equal(says(['HP', 'DEF'], ['ATK']), false, 'The model\'s own answer');
  assert.equal(says(['HP'], ['DEF', 'ATK']), false, 'One main moved one band');
  assert.equal(says(['HP', 'DEF', 'ATK']), false, 'Accepting more is a judgement call');
  assert.equal(says(['ATK']), true, 'Preferring the weakest and dropping the strongest');
  assert.equal(says(['HP'], []), true, 'A preferred main left out altogether');
  assert.equal(says(['ATK'], ['HP', 'DEF']), true, 'Two mains in opposite order');
  assert.equal(says([], []), false, 'Any declines to narrow');

  console.log(`Main-stat model: bands, sources, fixed mains, artifact relief and contradictions hold;`
    + ` all ${judged} captured species have a preferred main.`);
} finally {
  await server.close();
}
