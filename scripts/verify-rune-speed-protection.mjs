import assert from 'node:assert/strict';
import { readRunes } from '../app/lib/runes.ts';
import { runeAdvice, withRuneSellProtection } from '../app/lib/rune-cleanup-advice.ts';
import { defaultRunePotentialSettings, blankPreferences, readPreferences } from '../app/lib/file-imports.ts';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('../tests/fixtures/craft-account.json', import.meta.url), 'utf8'));
const rune = readRunes({ runes: account.unit_list[0].runes }).find((entry) => entry.id === '103');
assert.ok(rune);
const settings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: true, preGrindSpeedMinimum: 6 };
// No role can use these runes: the safeguard must still outrank Sell.
const original = (await runeAdvice([rune], [], defaultRunePotentialSettings, new Map())).get(rune.id);
assert.equal(original.verdict, 'sell');
for (const level of [0, 9, 12, 13, 14, 15]) {
  const candidate = { ...rune, level };
  const answer = (await runeAdvice([candidate], [], settings, new Map())).get(rune.id);
  assert.equal(answer.verdict, level === 12 || level === 15 ? 'keep' : 'power-up');
  assert.equal(answer.reason, 'Pre-grind speed protected');
  assert.deepEqual(withRuneSellProtection(candidate, answer, { ...settings, neverSellPreGrindSpeed: false }).verdict, original.verdict);
  assert.equal(answer.maxValue, original.maxValue);
  assert.equal(answer.chance, original.chance);
}
const ground = { ...rune, subProperties: rune.subProperties.map((line) => line.statId === 8 ? { ...line, grind: 5 } : line) };
for (const minimum of [7, 99, null]) {
  assert.equal(withRuneSellProtection(ground, original, { ...settings, preGrindSpeedMinimum: minimum }).verdict, 'sell');
}
const withoutSpeed = { ...rune, prefixStatId: 8, prefixValue: 6, subProperties: rune.subProperties.filter((line) => line.statId !== 8) };
assert.equal(withRuneSellProtection(withoutSpeed, original, { ...settings, preGrindSpeedMinimum: 0 }).verdict, 'sell');
assert.equal(withRuneSellProtection(rune, original, { ...settings, preGrindSpeedMinimum: 0 }).verdict, 'keep');
const blank = blankPreferences();
for (const minimum of [null, 0, 99]) {
  const read = readPreferences({ ...blank, runePotential: { ...settings, preGrindSpeedMinimum: minimum } }, null);
  assert.equal(read.runePotential.preGrindSpeedMinimum, minimum);
  assert.equal(read.runePotential.neverSellPreGrindSpeed, true);
}
for (const minimum of [-1, 100, '6', '', 6.5]) {
  const read = readPreferences({ ...blank, runePotential: { ...settings, powerUpPolicy: 2, preGrindSpeedMinimum: minimum } }, null);
  assert.equal(read.runePotential.preGrindSpeedMinimum, 20);
  assert.equal(read.runePotential.powerUpPolicy, 2);
  assert.equal(read.runePotential.neverSellPreGrindSpeed, true);
}
const storedWithoutSafeguard = { ...settings, powerUpPolicy: 2 };
delete storedWithoutSafeguard.neverSellPreGrindSpeed;
delete storedWithoutSafeguard.preGrindSpeedMinimum;
const preserved = readPreferences({ ...blank, runePotential: storedWithoutSafeguard }, null);
assert.equal(preserved.runePotential.powerUpPolicy, 2);
assert.equal(preserved.runePotential.neverSellPreGrindSpeed, true);
assert.equal(preserved.runePotential.preGrindSpeedMinimum, 20);
console.log('PASS: inclusive pre-grind speed protection, levels, empty input and independent preference survival.');


const potentialSettings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false };
for (const level of [0, 9, 12, 13, 14, 15]) {
  for (const [chance, maxValue, protectedRune] of [
    [0.01, 0.9, true], [1, 1.2, true], [0.009999, 0.9, false],
    [0.01, 0.899999, false], [0, 0.8, false],
  ]) {
    const raw = { ...original, chance, maxValue };
    const candidate = { ...rune, level };
    const answer = withRuneSellProtection(candidate, raw, potentialSettings);
    assert.equal(answer.verdict, protectedRune ? (level === 12 || level === 15 ? 'keep' : 'power-up') : 'sell');
    assert.equal(answer.chance, chance);
    assert.equal(answer.maxValue, maxValue);
    assert.equal(answer.role, raw.role);
    assert.equal(withRuneSellProtection(candidate, answer, { ...potentialSettings, neverSellPotentialValue: false }).verdict, 'sell');
    assert.equal(withRuneSellProtection(candidate, answer, { ...potentialSettings, potentialValueMinimum: null }).verdict, 'sell');
  }
}
for (const minimum of [null, 0, 90, 999]) {
  const saved = readPreferences({ ...blank, runePotential: { ...potentialSettings, potentialValueMinimum: minimum } }, null);
  assert.equal(saved.runePotential.potentialValueMinimum, minimum);
}
for (const minimum of [-1, 1000, '90', '', 90.5, NaN, Infinity]) {
  const saved = readPreferences({ ...blank, runePotential: { ...potentialSettings, potentialValueMinimum: minimum, powerUpPolicy: 2 } }, null);
  assert.equal(saved.runePotential.potentialValueMinimum, 90);
  assert.equal(saved.runePotential.powerUpPolicy, 2);
}
const missingPotential = { ...potentialSettings, powerUpPolicy: 2, neverSellPreGrindSpeed: false };
delete missingPotential.neverSellPotentialValue;
delete missingPotential.potentialValueMinimum;
const kept = readPreferences({ ...blank, runePotential: missingPotential }, null);
assert.equal(kept.runePotential.neverSellPotentialValue, true);
assert.equal(kept.runePotential.potentialValueMinimum, 90);
assert.equal(kept.runePotential.neverSellPreGrindSpeed, false);
assert.equal(kept.runePotential.powerUpPolicy, 2);
const both = withRuneSellProtection(rune, { ...original, chance: 0.01, maxValue: 0.9 }, { ...settings, ...potentialSettings, neverSellPreGrindSpeed: true, preGrindSpeedMinimum: 6 });
assert.equal(both.reason, 'Pre-grind speed protected');
assert.equal(withRuneSellProtection(rune, both, potentialSettings).reason, 'Potential value protected');
assert.equal(withRuneSellProtection(rune, both, { ...potentialSettings, neverSellPotentialValue: false }).verdict, 'sell');
console.log('PASS: potential protection boundaries, both conditions, independent safeguards and preference survival.');

const engravingSettings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false, neverSellPotentialValue: false };
const places = [
  { presetId: 'scenario', unitId: '1' },
  { presetId: 'arena-1', unitId: '1' },
  { presetId: 'arena-2', unitId: '1' },
];
for (const level of [0, 9, 12, 13, 14, 15]) {
  const candidate = { ...rune, level };
  for (const minimum of [null, 1, 2, 3, 4, 9]) {
    const thresholds = { ...engravingSettings, engravedPlacementsMinimum: minimum };
    const answer = withRuneSellProtection(candidate, original, thresholds, places);
    assert.equal(answer.verdict, minimum !== null && minimum <= places.length
      ? level === 12 || level === 15 ? 'keep' : 'power-up' : 'sell');
    assert.equal(answer.maxValue, original.maxValue);
    assert.equal(answer.chance, original.chance);
    assert.equal(withRuneSellProtection(candidate, answer, { ...thresholds, neverSellEngravedPlacements: false }, places).verdict, 'sell');
    assert.equal(withRuneSellProtection(candidate, answer, thresholds, []).verdict, 'sell');
  }
}
for (const minimum of [null, 1, 2, 9]) {
  const saved = readPreferences({ ...blank, runePotential: { ...engravingSettings, engravedPlacementsMinimum: minimum } }, null);
  assert.equal(saved.runePotential.engravedPlacementsMinimum, minimum);
}
for (const minimum of [0, -1, 10, '2', '', 2.5, NaN, Infinity]) {
  const saved = readPreferences({ ...blank, runePotential: { ...engravingSettings, engravedPlacementsMinimum: minimum, powerUpPolicy: 2 } }, null);
  assert.equal(saved.runePotential.engravedPlacementsMinimum, 2);
  assert.equal(saved.runePotential.powerUpPolicy, 2);
}
const missingEngraving = { ...engravingSettings, powerUpPolicy: 2, neverSellPreGrindSpeed: false };
delete missingEngraving.neverSellEngravedPlacements;
delete missingEngraving.engravedPlacementsMinimum;
const retained = readPreferences({ ...blank, runePotential: missingEngraving }, null);
assert.equal(retained.runePotential.neverSellEngravedPlacements, true);
assert.equal(retained.runePotential.engravedPlacementsMinimum, 2);
assert.equal(retained.runePotential.neverSellPreGrindSpeed, false);
assert.equal(retained.runePotential.powerUpPolicy, 2);
assert.equal(withRuneSellProtection(rune, original, engravingSettings, places.slice(0, 1)).verdict, 'sell');
assert.equal(withRuneSellProtection(rune, original, engravingSettings, places.slice(0, 2)).reason, 'Engraving count protected');
console.log('PASS: engraving protection counts every placement, including the same monster in several presets, updates reversibly, and preserves independent preferences.');
