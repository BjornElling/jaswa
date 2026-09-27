/**
 * Regression guard for Rune Clean-up preference sliders.
 *
 * A slider that makes one class more or less desirable may widen or narrow that
 * class only. It must not move the common floor and reverse the direction of the
 * resulting recommendations for the rest of the box.
 */
import assert from 'node:assert/strict';
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  newRuneAdviceScope, ordinarySample, prepareRuneCandidate, presetBuilds,
} from '../app/lib/rune-cleanup-model.ts';

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) =>
  ordinarySample(slot, 6, 12, 15).flatMap((rune) => [
    rune,
    { ...rune, id: `${rune.id}:violent`, setName: 'Violent' },
    { ...rune, id: `${rune.id}:intangible`, setName: 'Intangible' },
  ]));
const presets = defaultRunePotentialPresets();
const noCraft = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const builds = presets.map((preset) => [preset, presetBuilds(preset)]);

function hasPreferredCandidate(rune) {
  const scope = newRuneAdviceScope();
  return builds.some(([preset, presetBuildsForRune]) => {
    const line = base.get(preset.type);
    return line !== undefined && presetBuildsForRune.some((build) =>
      prepareRuneCandidate(rune, preset, build, line, noCraft, scope)?.rank === 'preferred');
  });
}

function kept(advice) {
  return advice.verdict !== 'sell';
}

async function judged(settings) {
  return runeAdvice(runes, presets, settings, base);
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

for (const [label, [lenient, strict]] of [['Accepted', accepted], ['Broken', broken]]) {
  for (const rune of runes.filter(hasPreferredCandidate)) {
    assert.equal(
      lenient.get(rune.id)?.verdict,
      strict.get(rune.id)?.verdict,
      `${label}: changing the tolerance must not change a preferred rune's verdict (${rune.id})`,
    );
  }
}

await assertOnlyGetsStricter(
  'Enchanted gems',
  { ...defaultRunePotentialSettings, enchantedGems: 4 },
  { ...defaultRunePotentialSettings, enchantedGems: 1 },
);
await assertOnlyGetsStricter(
  'Grindstones',
  { ...defaultRunePotentialSettings, grindstones: 4 },
  { ...defaultRunePotentialSettings, grindstones: 1 },
);
await assertOnlyGetsStricter(
  'Four-set preference',
  { ...defaultRunePotentialSettings, keepMoreForLargerSets: true },
  { ...defaultRunePotentialSettings, keepMoreForLargerSets: false },
);
await assertOnlyGetsStricter(
  'Intangible',
  { ...defaultRunePotentialSettings, intangibleRunes: 5 },
  { ...defaultRunePotentialSettings, intangibleRunes: 1 },
);

console.log(`Preference monotonicity passed for ${runes.length} deterministic runes.`);
