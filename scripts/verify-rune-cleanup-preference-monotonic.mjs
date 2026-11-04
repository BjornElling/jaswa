/**
 * Regression guard for Rune Clean-up preference sliders.
 *
 * A slider that makes one class more or less desirable may widen or narrow that
 * class only. It must not move the common floor and reverse the direction of the
 * resulting recommendations for the rest of the box.
 */
import assert from 'node:assert/strict';
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  newRuneAdviceScope, ordinarySample, prepareRuneCandidate, roleBuilds,
} from '../app/lib/rune-cleanup-model.ts';

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

/* Finished runes and fresh drops share the complete-funnel floor (§9.4).
   Exercise both certainty and counted futures so a preference cannot reverse
   either kind of recommendation. */
const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) =>
  [...ordinarySample(slot, 6, 12, 15), ...ordinarySample(slot, 6, 24, 0, 'drop', 80_000)].flatMap((rune) => [
    rune,
    { ...rune, id: `${rune.id}:violent`, setName: 'Violent' },
    { ...rune, id: `${rune.id}:intangible`, setName: 'Intangible' },
  ]));
const roles = defaultRuneRoles();
const noCraft = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const builds = roles.map((role) => [role, roleBuilds(role)]);

function hasCandidateAtRank(rune, wantedRank) {
  const scope = newRuneAdviceScope();
  return builds.some(([role, roleBuildsForRune]) => {
    const line = base.get(role.type);
    return line !== undefined && roleBuildsForRune.some((build) =>
      prepareRuneCandidate(rune, role, build, line, noCraft, scope)?.rank === wantedRank);
  });
}

function kept(advice) {
  return advice.verdict !== 'sell';
}

async function judged(settings) {
  return runeAdvice(runes, roles, settings, base);
}

async function assertOnlyGetsStricter(label, lenientSettings, strictSettings) {
  const [lenient, strict] = await Promise.all([judged(lenientSettings), judged(strictSettings)]);
  for (const rune of runes) {
    if (kept(strict.get(rune.id))) {
      assert.equal(
        kept(lenient.get(rune.id)), true,
        `${label}: ${rune.id} became sold when the setting was made more lenient`,
      );
    }
  }
  return [lenient, strict];
}

const accepted = await assertOnlyGetsStricter(
  'Accepted',
  { ...defaultRunePotentialSettings, acceptedRunes: 1 },
  { ...defaultRunePotentialSettings, acceptedRunes: 5 },
);
const broken = await assertOnlyGetsStricter(
  'Broken',
  { ...defaultRunePotentialSettings, brokenRunes: 1 },
  { ...defaultRunePotentialSettings, brokenRunes: 5 },
);

/* A preferred candidate is an offer, never an exclusive claim. An accepted or
   broken reading that is stronger may win when its own slider permits it. The
   old rank-priority shortcut silently discarded those readings before either
   gate was tried. */
const allRanksAllowed = await judged({
  ...defaultRunePotentialSettings, runeQuality: 1, powerUpPolicy: 1, acceptedRunes: 1, brokenRunes: 1,
});
for (const rank of ['acceptable', 'broken']) {
  const winner = runes.find((rune) =>
    hasCandidateAtRank(rune, 'preferred')
    && hasCandidateAtRank(rune, rank)
    && allRanksAllowed.get(rune.id)?.rank === rank
    && kept(allRanksAllowed.get(rune.id)));
  assert.ok(winner,
    `${rank} must be able to win even when the same rune has a preferred candidate`);
}

/* Broken = No removes only broken readings. A preferred or acceptable fallback
   remains visible and decisive whenever one exists. */
const brokenRejected = await judged({ ...defaultRunePotentialSettings, brokenRunes: 5 });
for (const rune of runes.filter((entry) =>
  hasCandidateAtRank(entry, 'broken')
  && (hasCandidateAtRank(entry, 'preferred') || hasCandidateAtRank(entry, 'acceptable')))) {
  assert.notEqual(brokenRejected.get(rune.id)?.rank, 'broken',
    `Broken = No must not let a broken reading hide another match (${rune.id})`);
}

await assertOnlyGetsStricter(
  'Power-up policy',
  { ...defaultRunePotentialSettings, powerUpPolicy: 3 },
  { ...defaultRunePotentialSettings, powerUpPolicy: 4 },
);
await assertOnlyGetsStricter(
  'Intangible',
  { ...defaultRunePotentialSettings, intangibleRunes: 5 },
  { ...defaultRunePotentialSettings, intangibleRunes: 1 },
);

console.log(`Preference monotonicity passed for ${runes.length} deterministic runes.`);
