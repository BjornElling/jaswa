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
 * - the sources, in order: a stated answer with a preferred main, else six
 *   runes, else statistics — stat targets never — with the fixed flat mains of
 *   slots 1, 3 and 5 never counted, and unfinished even-slot mains at +15;
 * - an artifact's fixed main is worth more on a stat with a small base, and a
 *   relic's percentage is not;
 * - what counts as contradicting the model, and that accepted mains with none
 *   preferred, or two cleared bands, are no answer at all.
 *
 * Usage: node scripts/verify-main-stat-model.mjs
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const {
    copyMainStatAdvice, copyMainStatNeed, speciesMainStatAdvice, contradictsAdvice, copyArtifactMainBands,
    honouredMainStat, mainStatStatement, chosenMainWeight,
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

  /* The documented examples. A slot-2/4/6 main counts `chosenMainWeight` (2)
     times, every other line once. */
  assert.equal(chosenMainWeight, 2);
  const lopsided = copyMainStatAdvice(copy(build(
    { pri_eff: [2, 63], sec_eff: [[2, 17, 0, 0]] }, { pri_eff: [4, 10] }, { pri_eff: [6, 10] },
  )));
  assert.equal(lopsided.basis, 'runes');
  assert.deepEqual(lopsided.need, { HP: 143, ATK: 20, DEF: 20 });
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
  assert.deepEqual(withFixed.need, { HP: 80, ATK: 0, DEF: 0 });
  const guarded = copyMainStatNeed(copy(build({ pri_eff: [2, 40] }).map((rune) => ({ ...rune, set_id: rune.slot_no <= 2 ? 2 : 0 }))));
  assert.deepEqual(guarded.need, { HP: 80, ATK: 0, DEF: 15 }, 'A set bonus is a line, not a chosen main');

  /* A chosen main outweighs a stack of rolled lines: an ATK % slot-6 main and
     three ATK % subs (131 % at face value) against five HP % subs (111 %) is
     the build of a damage dealer, and reads as one. */
  const dealer = copyMainStatAdvice(copy(build(
    { pri_eff: [8, 42], sec_eff: [[2, 32, 0, 0], [6, 16, 0, 0]] },
    { pri_eff: [10, 80], sec_eff: [[4, 22, 0, 0], [2, 13, 0, 0]] },
    { pri_eff: [4, 63], sec_eff: [[2, 27, 0, 0], [6, 13, 0, 0], [4, 19, 0, 0]] },
  ).map((rune) => (rune.slot_no === 3 ? { ...rune, sec_eff: [[2, 25, 0, 0], [6, 15, 0, 0]] }
    : rune.slot_no === 5 ? { ...rune, sec_eff: [[2, 14, 0, 0], [4, 27, 0, 0]] } : rune))));
  assert.deepEqual(dealer.need, { HP: 111, ATK: 194, DEF: 44 });
  assert.deepEqual(bands(dealer.relic), { HP: 'acceptable', ATK: 'preferred', DEF: 'unwanted' });

  /* Only the deterministic remainder of an unfinished even-slot main is
     projected. Star class, including Ancient, decides its +15 value. */
  const partlyLeveled = copy(build(
    { class: 6, upgrade_curr: 9, pri_eff: [2, 40], sec_eff: [[4, 7, 0, 3]] },
    { class: 5, upgrade_curr: 12, pri_eff: [4, 30] },
    { class: 16, upgrade_curr: 14, pri_eff: [5, 100] },
  ));
  assert.deepEqual(copyMainStatNeed(partlyLeveled).need, { HP: 126, ATK: 112, DEF: 32 });
  assert.deepEqual(copyMainStatAdvice(partlyLeveled).relic.bands,
    { HP: 'preferred', ATK: 'preferred', DEF: 'unwanted' });
  const finished = copy(build(
    { class: 6, upgrade_curr: 15, pri_eff: [2, 63], sec_eff: [[4, 7, 0, 3]] },
    { class: 5, upgrade_curr: 15, pri_eff: [4, 51] },
    { class: 16, upgrade_curr: 15, pri_eff: [5, 160] },
  ));
  assert.deepEqual(copyMainStatNeed(partlyLeveled), copyMainStatNeed(finished));
  assert.deepEqual(copyArtifactMainBands(partlyLeveled, undefined), copyArtifactMainBands(finished, undefined));
  assert.equal(partlyLeveled.runes[0].pri_eff[1], 40, 'The imported rune remains at its actual level');

  /* Five runes are not a build, and stat targets are never a source. */
  const unfinished = copy(build({ pri_eff: [4, 63] }).filter((rune) => rune.slot_no !== 3));
  assert.equal(copyMainStatNeed(unfinished), undefined, 'Five runes and no species say nothing');
  const floored = { ...unfinished, unit_master_id: undefined };
  assert.equal(copyArtifactMainBands(floored, { unitId: '1', statTargets: { def: 2160 } }), undefined,
    'A DEF floor says nothing about which main a copy is for');

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
  /* Accepted mains with none preferred, and two cleared bands, are no answer:
     the model decides, and only the first is flagged. */
  const onlyAccepted = { unitId: '1', mainStat: { preferred: [], acceptable: ['DEF'] } };
  const cleared = { unitId: '1', mainStat: { preferred: [], acceptable: [] } };
  assert.equal(mainStatStatement(onlyAccepted), 'no-preferred');
  assert.equal(mainStatStatement(cleared), 'silent');
  assert.equal(mainStatStatement(undefined), 'silent');
  for (const statement of [onlyAccepted, cleared]) {
    assert.equal(honouredMainStat(statement), undefined);
    assert.deepEqual(copyArtifactMainBands(hpBuild, statement), copyArtifactMainBands(hpBuild, undefined));
  }

  /* Contradiction: two bands apart, or two mains in opposite order. */
  const model = shared.relic; // HP and DEF preferred, ATK accepted
  const says = (preferred, acceptable = []) => contradictsAdvice({ preferred, acceptable }, model);
  assert.equal(says(['HP', 'DEF'], ['ATK']), false, 'The model\'s own answer');
  assert.equal(says(['HP'], ['DEF', 'ATK']), false, 'One main moved one band');
  assert.equal(says(['HP', 'DEF', 'ATK']), false, 'Accepting more is a judgement call');
  assert.equal(says(['ATK']), true, 'Preferring the weakest and dropping the strongest');
  assert.equal(says(['HP'], []), true, 'A preferred main left out altogether');
  assert.equal(says(['ATK'], ['HP', 'DEF']), true, 'Two mains in opposite order');

  console.log(`Main-stat model: bands, sources, projected even-slot mains, fixed mains, artifact relief and contradictions hold;`
    + ` all ${judged} captured species have a preferred main.`);
} finally {
  await server.close();
}
