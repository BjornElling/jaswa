import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRunePotentialSettings } from '../app/ingest/preferences.ts';
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { referenceLines } from '../app/lib/rune-reference-stats.ts';
import { readRunes } from '../app/lib/runes.ts';
import { runeCalculationKey, runeCalculationKeyForRune } from '../app/lib/rune-calculation-inputs.ts';
import { calculateRuneCleanupStatistics, withRuneStatisticsProtection } from '../app/lib/rune-cleanup-statistics.ts';
import { rememberRuneAdvice, rememberedRuneAdvice } from '../app/lib/compute/rune-advice-memory.ts';

const account = JSON.parse(readFileSync(new URL('../tests/fixtures/craft-account.json', import.meta.url), 'utf8'));
const base = new Map([...referenceLines(account)].map(([type, line]) => [type, line.stats]));
const inputs = { roles: defaultRuneRoles(), settings: defaultRunePotentialSettings, base };
const key = runeCalculationKey(inputs);
assert.equal(runeCalculationKey(structuredClone(inputs)), key);
assert.equal(runeCalculationKey({ ...inputs, base: new Map([...base].reverse()) }), key);
for (const update of [
  { neverSellPreGrindSpeed: false }, { preGrindSpeedMinimum: null },
  { neverSellPotentialValue: false }, { potentialValueMinimum: 0 }, { neverSellEngravedPlacements: false },
]) assert.equal(runeCalculationKey({ ...inputs, settings: { ...inputs.settings, ...update } }), key);
for (const update of [
  { powerUpPolicy: 1 }, { runeQuality: 1 }, { acceptedRunes: 1 },
  { brokenRunes: 1 }, { intangibleRunes: 5 },
]) assert.notEqual(runeCalculationKey({ ...inputs, settings: { ...inputs.settings, ...update } }), key);
assert.notEqual(runeCalculationKey({ ...inputs, roles: [...inputs.roles].reverse() }), key);
const usedType = inputs.roles[0].type;
assert.notEqual(runeCalculationKey({ ...inputs,
  base: new Map(base).set(usedType, { ...base.get(usedType), hp: base.get(usedType).hp + 1 }) }), key);
const unused = { ...inputs, roles: [inputs.roles[0]] };
const unusedType = [...base.keys()].find((type) => type !== usedType);
assert.equal(runeCalculationKey(unused), runeCalculationKey({ ...unused,
  base: new Map(base).set(unusedType, { ...base.get(unusedType), hp: 99999 }) }));

const rune = readRunes(account)[0];
for (const setName of ['Energy', 'Violent', 'Intangible']) {
  const body = { ...rune, setName };
  const before = runeCalculationKeyForRune(inputs, body);
  const intangible = runeCalculationKeyForRune({ ...inputs,
    settings: { ...inputs.settings, intangibleRunes: 5 } }, body);
  assert.equal(before === intangible, setName !== 'Intangible');
}

// Projection must equal asking the real engine again, including blank and zero safeguards.
const count = async (jobs) => { assert.equal(jobs.length, 0); return new Float64Array(); };
const statistics = await calculateRuneCleanupStatistics([], inputs.settings, base, count);
for (const update of [
  { neverSellPreGrindSpeed: false, neverSellPotentialValue: false },
  { preGrindSpeedMinimum: null }, { preGrindSpeedMinimum: 0 }, { preGrindSpeedMinimum: 99 },
]) {
  const settings = { ...inputs.settings, ...update };
  const projected = withRuneStatisticsProtection(statistics, settings);
  const fresh = await calculateRuneCleanupStatistics([], settings, base, count);
  assert.equal(projected.percentToRoll, fresh.percentToRoll);
  assert.equal(projected.percentToKeep, fresh.percentToKeep);
}
assert.ok(withRuneStatisticsProtection(statistics, { ...inputs.settings, preGrindSpeedMinimum: 0 }).percentToRoll > 0);

const advice = statistics.checkpoints[0][0].advice;
rememberRuneAdvice({ data: account, ...inputs }, [rune], new Map([[rune.id, advice]]));
const copy = structuredClone(account);
assert.ok(rememberedRuneAdvice({ data: copy, ...inputs }, structuredClone(rune)));
assert.equal(rememberedRuneAdvice({ data: copy, ...inputs }, { ...rune, level: rune.level + 1 }), undefined);
const protectedAnswer = rememberedRuneAdvice({ data: copy, roles: inputs.roles,
  settings: { ...inputs.settings, preGrindSpeedMinimum: 0 } },
  { ...rune, occupiedId: 'another-monster' });
assert.ok(protectedAnswer);
console.log('PASS: calculation dependencies, set-local invalidation, live safeguard projection and content-based overlay reuse.');
