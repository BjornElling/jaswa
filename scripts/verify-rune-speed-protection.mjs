import assert from 'node:assert/strict';
import { readRunes } from '../app/lib/runes.ts';
import { runeAdvice, withPreGrindSpeedProtection } from '../app/lib/rune-cleanup-advice.ts';
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
  assert.deepEqual(withPreGrindSpeedProtection(candidate, answer, { ...settings, neverSellPreGrindSpeed: false }).verdict, original.verdict);
  assert.equal(answer.maxValue, original.maxValue);
  assert.equal(answer.chance, original.chance);
}
const ground = { ...rune, subProperties: rune.subProperties.map((line) => line.statId === 8 ? { ...line, grind: 5 } : line) };
for (const minimum of [7, 99, null]) {
  assert.equal(withPreGrindSpeedProtection(ground, original, { ...settings, preGrindSpeedMinimum: minimum }).verdict, 'sell');
}
const withoutSpeed = { ...rune, prefixStatId: 8, prefixValue: 6, subProperties: rune.subProperties.filter((line) => line.statId !== 8) };
assert.equal(withPreGrindSpeedProtection(withoutSpeed, original, { ...settings, preGrindSpeedMinimum: 0 }).verdict, 'sell');
assert.equal(withPreGrindSpeedProtection(rune, original, { ...settings, preGrindSpeedMinimum: 0 }).verdict, 'keep');
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

