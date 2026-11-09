import assert from 'node:assert/strict';
import { readRunes, runeStatIds, slotAllowsSubStat, slotMainProperties } from '../app/lib/runes.ts';
import { runeAdvice, withRuneSellProtection } from '../app/lib/rune-cleanup-advice.ts';
import { defaultRunePotentialSettings, blankPreferences, readPreferences } from '../app/lib/file-imports.ts';
import { readFileSync } from 'node:fs';
import { defaultReappTargets, defaultRerollRules, newRerollRule, readRerollRules, rerollRuleProblems, isRerollTarget, rerollMainOptions, reappSetOptions } from '../app/lib/rune-reapp-targets.ts';
import { emptyRunePlacement, hasRunePlacementOutsideScenario, summarizeRunePlacement } from '../app/lib/rune-placement.ts';


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
  assert.equal(answer.reason, 'Pre-grind SPD protected');
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
assert.equal(both.reason, 'Pre-grind SPD protected');
assert.equal(withRuneSellProtection(rune, both, potentialSettings).reason, 'Potential value protected');
assert.equal(withRuneSellProtection(rune, both, { ...potentialSettings, neverSellPotentialValue: false }).verdict, 'sell');
console.log('PASS: potential protection boundaries, both conditions, independent safeguards and preference survival.');

const engravingSettings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false, neverSellPotentialValue: false };
const places = [
  { presetId: 'scenario', unitId: '1' },
  { presetId: 'arena-1', unitId: '1' },
  { presetId: 'arena-2', unitId: '1' },
];
const placements = [[], places.slice(0, 1), places.slice(1, 2), places.slice(1), places,
  [{ presetId: 'own:fixture', unitId: '2' }]].map(summarizeRunePlacement);
for (const level of [0, 9, 12, 13, 14, 15]) {
  const candidate = { ...rune, level };
  for (const placement of placements) {
    const protectedRune = hasRunePlacementOutsideScenario(placement);
    const answer = withRuneSellProtection(candidate, original, engravingSettings, placement);
    assert.equal(answer.verdict, protectedRune
      ? level === 12 || level === 15 ? 'keep' : 'power-up' : 'sell');
    assert.equal(answer.maxValue, original.maxValue);
    assert.equal(answer.chance, original.chance);
    assert.equal(answer.role, original.role);
    assert.equal(withRuneSellProtection(candidate, answer, { ...engravingSettings, neverSellEngravedPlacements: false }, placement).verdict, 'sell');
    assert.equal(withRuneSellProtection(candidate, answer, engravingSettings, emptyRunePlacement).verdict, 'sell');
    assert.equal(withRuneSellProtection(candidate, answer, engravingSettings, summarizeRunePlacement(places.slice(0, 1))).verdict, 'sell');
  }
}
for (const enabled of [true, false]) {
  const saved = readPreferences({ ...blank, runePotential: { ...engravingSettings, neverSellEngravedPlacements: enabled, powerUpPolicy: 2 } }, null);
  assert.equal(saved.runePotential.neverSellEngravedPlacements, enabled);
  assert.equal(saved.runePotential.powerUpPolicy, 2);
}
for (const invalid of [null, 0, 1, 'true', 'false', {}]) {
  const saved = readPreferences({ ...blank, runePotential: { ...engravingSettings, neverSellEngravedPlacements: invalid, powerUpPolicy: 2 } }, null);
  assert.equal(saved.runePotential.neverSellEngravedPlacements, true);
  assert.equal(saved.runePotential.powerUpPolicy, 2);
}
const missingEngraving = { ...engravingSettings, powerUpPolicy: 2, neverSellPreGrindSpeed: false };
delete missingEngraving.neverSellEngravedPlacements;
const retained = readPreferences({ ...blank, runePotential: missingEngraving }, null);
assert.equal(retained.runePotential.neverSellEngravedPlacements, true);
assert.equal(retained.runePotential.neverSellPreGrindSpeed, false);
assert.equal(retained.runePotential.powerUpPolicy, 2);
assert.equal(withRuneSellProtection(rune, original, engravingSettings, summarizeRunePlacement(places.slice(0, 1))).verdict, 'sell');
assert.equal(withRuneSellProtection(rune, original, engravingSettings, summarizeRunePlacement(places.slice(1, 2))).reason, 'Preset engraving protected');
console.log('PASS: any non-Scenario engraving protects a rune, Scenario alone does not, placement changes reverse protection, and saved choices survive independently.');

/* Rules are alternatives, conditions within one rule are intersections. */
const reappSettings = { ...engravingSettings, neverSellEngravedPlacements: false, rerollRules: [] };
const openRule = { ...newRerollRule('test'), minimumRarity: 'Normal' };
const best = original;
const refineConditions = { substats: [8, 9], minimumSubstats: 1 };
const answer = (rules, candidate = rune, advice = best) => withRuneSellProtection(candidate, advice, { ...reappSettings, rerollRules: rules });
assert.equal(answer([]).verdict, 'sell');
assert.equal(answer([openRule]).verdict, 'reapp');
assert.deepEqual(readRerollRules([{ ...openRule, enabled: false }]), []);
assert.deepEqual(readRerollRules([{ ...openRule, enabled: true }]), [openRule]);
assert.equal(answer([{ ...openRule, kind: 'refine', ...refineConditions }]).verdict, 'refine');
assert.equal(answer([{ ...openRule, kind: 'refine', ...refineConditions }], rune, original).verdict, 'refine');
const bothRules = [openRule, { ...openRule, id: 'refine', kind: 'refine', ...refineConditions }];
assert.equal(answer(bothRules).verdict, 'refine');
assert.equal(answer(bothRules, rune, original).verdict, 'refine');
assert.equal(answer(bothRules, { ...rune, ancient: true }).verdict, 'reapp');
const gemmed = { ...rune, subProperties: rune.subProperties.map((line, at) => at === 0 ? { ...line, gemmed: true } : line) };
assert.equal(answer(bothRules, gemmed).verdict, 'reapp');
for (const kind of ['reapp', 'refine']) for (const innate of ['yes', 'both', 'no']) for (const prefixStatId of [null, 8]) {
  const result = answer([{ ...openRule, ...refineConditions, kind, innate }], { ...rune, prefixStatId });
  const matches = innate === 'both' || (prefixStatId !== null) === (innate === 'yes');
  assert.equal(result.verdict, matches ? kind : 'sell', `${kind}, ${innate}, prefix ${prefixStatId}`);
}
for (const kind of ['refine', 'reapp']) {
  const rule = { ...openRule, ...refineConditions, kind };
  assert.equal(answer([rule], { ...rune, setName: 'Intangible' }).verdict, 'sell');
  assert.equal(answer([rule], { ...rune, subProperties: rune.subProperties.slice(0, 3) }).verdict, 'sell');
  assert.equal(answer([rule], { ...rune, level: 0 }).verdict, kind === 'reapp' ? 'reapp' : 'refine');
  for (const verdict of ['power-up', 'keep']) assert.equal(answer([rule], rune, { ...best, verdict }).verdict, verdict);
}
for (const rules of [[openRule, { ...openRule, id: 'other', kind: 'refine', ...refineConditions }], [{ ...openRule, id: 'other', kind: 'refine', ...refineConditions }, openRule]]) {
  assert.equal(answer(rules).verdict, 'refine');
  assert.equal(answer(rules, rune, original).verdict, 'refine');
}
for (const [field, value] of [['sets', ['Will']], ['slots', [1]], ['minimumRarity', 'Legend'], ['innate', 'yes']]) {
  const candidate = { ...rune, rarity: 'Hero', prefixStatId: null };
  assert.equal(answer([{ ...openRule, [field]: value }], candidate).verdict, 'sell');
  assert.equal(answer([{ ...openRule, [field]: value }, { ...openRule, id: 'alternative' }], candidate).verdict, 'reapp');
}
// Every legal slot/main pair passes; impossible pairs remain visible and never match.
const slotMains = { 1: [3], 2: [1, 2, 3, 4, 5, 6, 8], 3: [5], 4: [1, 2, 3, 4, 5, 6, 9, 10], 5: [1], 6: [1, 2, 3, 4, 5, 6, 11, 12] };
for (const slot of [1, 2, 3, 4, 5, 6]) for (const main of rerollMainOptions) {
  const rule = { ...openRule, slots: [slot], mains: [main] };
  const legal = slotMains[slot].includes(main);
  assert.equal(rerollRuleProblems(rule).length === 0, legal, `slot ${slot}, main ${main}`);
  assert.equal(isRerollTarget({ ...rune, slot, mainStatId: main }, [rule], 'reapp'), legal);
}
assert.ok(rerollRuleProblems({ ...openRule, slots: [], mains: [8] }).length);
assert.equal(rerollRuleProblems({ ...openRule, slots: [2], mains: [...rerollMainOptions] }).length, 0);
assert.equal(isRerollTarget({ ...rune, slot: 2, mainStatId: 8 }, [{ ...openRule, slots: [2], mains: [...rerollMainOptions] }], 'reapp'), true);
assert.ok(rerollRuleProblems({ ...openRule, slots: [2], mains: [8, 10] }).length);
assert.equal(rerollRuleProblems({ ...openRule, slots: [2, 4], mains: [8, 10] }).length, 0);
const full = { ...openRule, kind: 'refine', ...refineConditions, sets: [...reappSetOptions],
  slots: [1, 2, 3, 4, 5, 6], mains: [...rerollMainOptions], minimumRarity: 'Legend', innate: 'yes' };
assert.equal(rerollRuleProblems(full).length, 0);
assert.deepEqual(readRerollRules([full]), [full]);
assert.deepEqual(readRerollRules([{ ...full, name: 'Former title', slots: [6, 2, 4] }]), [{ ...full, slots: [6, 2, 4] }]);
assert.deepEqual(readRerollRules([]), []);
assert.deepEqual(readRerollRules(undefined), defaultRerollRules());
assert.equal(readRerollRules([full, full])[1].id === full.id, false);
const damaged = readRerollRules([{ ...full, minimumRarity: 'Mythic' }])[0];
assert.deepEqual(damaged, { ...full, minimumRarity: 'Legend' });
assert.deepEqual(readRerollRules([{ ...full, mains: [999] }])[0], { ...full, mains: [] });
const saved = readPreferences({ ...blank, runePotential: { ...reappSettings, powerUpPolicy: 2, rerollRules: [full] } }, null);
assert.deepEqual(saved.runePotential.rerollRules, [full]);
assert.equal(saved.runePotential.powerUpPolicy, 2);
assert.deepEqual(readPreferences({ ...blank, runePotential: { ...reappSettings, rerollRules: [] } }, null).runePotential.rerollRules, []);
// Preserve active choices without enabling rules the user previously switched off.
const oldReapp = defaultReappTargets().map((rule, at) => ({ ...rule, enabled: at % 2 === 0, sets: ['Will'], minimumRarity: 'Hero' }));
const oldRefine = defaultReappTargets('refine').map((rule) => ({ ...rule, requiresInnate: true }));
const retainedSlots = readPreferences({ runePotential: { reappTargets: oldReapp, refineTargets: oldRefine, powerUpPolicy: 2 } }, null).runePotential;
const previouslyActive = [...oldReapp.map((rule, at) => ({ ...rule, kind: 'reapp', slots: [at + 1] })),
  ...oldRefine.map((rule, at) => ({ ...rule, kind: 'refine', slots: [at + 1] }))].filter((rule) => rule.enabled);
assert.equal(retainedSlots.rerollRules.length, previouslyActive.length);
for (const [at, rule] of retainedSlots.rerollRules.entries()) {
  for (const field of ['sets', 'minimumRarity', 'mains', 'slots', 'kind']) assert.deepEqual(rule[field], previouslyActive[at][field]);
  assert.equal('enabled' in rule, false);
  assert.equal('requiresInnate' in rule, false);
  assert.equal(rule.innate, previouslyActive[at].requiresInnate ? 'yes' : 'both');
}
const { innate: _innate, ...formerFields } = full;
const split = readRerollRules([{ ...formerFields, kind: 'both', requiresInnate: true }]);
assert.equal(split.length, 2);
assert.deepEqual(split.map((rule) => rule.kind), ['reapp', 'refine']);
assert.equal(new Set(split.map((rule) => rule.id)).size, 2);
for (const rule of split) {
  for (const field of ['sets', 'minimumRarity', 'mains', 'slots']) assert.deepEqual(rule[field], full[field]);
  assert.equal(rule.innate, 'yes');
}
assert.equal(readRerollRules([{ ...formerFields, requiresInnate: false }])[0].innate, 'both');
assert.equal(readRerollRules([{ ...full, innate: 'invalid' }])[0].innate, 'both');
assert.equal(newRerollRule('refine', 'refine').kind, 'refine');
const mixedRules = readPreferences({ runePotential: { rerollRules: [{ ...full, enabled: false }, { ...openRule, enabled: true }] } }, null).runePotential.rerollRules;
assert.deepEqual(mixedRules, [openRule]);
assert.equal('reappTargets' in retainedSlots, false);
assert.equal('refineTargets' in retainedSlots, false);
assert.equal(retainedSlots.powerUpPolicy, 2);
console.log('PASS: arbitrary reroll rules, all slot/main pairs, alternatives, both stones, exclusions, priority and preference survival.');

/* Construct actual four-line runes independently of the rule validator. A rule
   for one slot/main must be achievable by one of these. This catches the
   difference between a wanted pool
   of six and a physically impossible demand for six lines. */
function fours(values, start = 0, held = []) {
  if (held.length === 4) return [held];
  return values.slice(start).flatMap((value, offset) => fours(values, start + offset + 1, [...held, value]));
}
const refineRule = { ...newRerollRule('manual', 'refine'), minimumRarity: 'Normal' };
let checked = 0;
for (const slot of [1, 2, 3, 4, 5, 6]) for (const main of slotMainProperties[slot]) {
  const legal = runeStatIds.filter((stat) => stat !== main && slotAllowsSubStat(slot, stat));
  const candidates = fours(legal);
  for (const substats of [[], [main], [8, 9], [2, 4, 6, 8, 9, 10], legal]) {
    for (const minimumSubstats of ['all', ...Array.from({ length: Math.max(0, substats.length - 1) }, (_, at) => at + 1)]) {
      const rule = { ...refineRule, slots: [slot], mains: [main], substats, minimumSubstats };
      const minimum = minimumSubstats === 'all' ? substats.length : minimumSubstats;
      const possible = substats.length > 0
        && candidates.some((lines) => lines.filter((stat) => substats.includes(stat)).length >= minimum);
      assert.equal(rerollRuleProblems(rule).length === 0, possible, JSON.stringify(rule));
      for (const lines of [candidates[0], candidates.at(-1)]) {
        const candidate = { ...rune, slot, mainStatId: main, subProperties: lines.map((statId) => ({ statId, value: 1, grind: 0, gemmed: false })) };
        assert.equal(isRerollTarget(candidate, [rule], 'refine'), possible && lines.filter((stat) => substats.includes(stat)).length >= minimum);
      }
      checked += 1;
    }
  }
}
const flexible = { ...refineRule, slots: [2], mains: [4, 8], substats: [4, 8], minimumSubstats: 1 };
assert.equal(rerollRuleProblems(flexible).length, 0);
assert.ok(rerollRuleProblems({ ...flexible, substats: [4], minimumSubstats: 'all' }).length, 'ATK % main cannot carry the sole requested ATK % substat');
assert.ok(rerollRuleProblems({ ...flexible, minimumSubstats: 'all' }).length, 'every admitted main must be feasible');
assert.ok(rerollRuleProblems({ ...flexible, minimumSubstats: 0 }).length);
assert.ok(rerollRuleProblems({ ...flexible, minimumSubstats: 1.5 }).length);
assert.ok(rerollRuleProblems({ ...flexible, minimumSubstats: 3 }).length);
const innateOnly = { ...refineRule, slots: [4], mains: [10], substats: [9], minimumSubstats: 'all' };
assert.equal(isRerollTarget({ ...rune, prefixStatId: 9 }, [innateOnly], 'refine'), false, 'an innate is not a substat');
const heldRule = { ...refineRule, slots: [4], mains: [10], substats: [2, 4, 8, 11], minimumSubstats: 'all' };
assert.equal(isRerollTarget(rune, [heldRule], 'refine'), true);
assert.equal((await runeAdvice([rune], [], { ...reappSettings, rerollRules: [heldRule] }, new Map())).get(rune.id).verdict, 'refine', 'manual criteria need no role or build');
assert.equal(answer([heldRule], { ...rune, subProperties: rune.subProperties.map((line, at) => at === 0 ? { ...line, statId: 9 } : line) }).verdict, 'sell');

const missingNewFields = { ...heldRule };
delete missingNewFields.substats; delete missingNewFields.minimumSubstats;
assert.deepEqual(readRerollRules([missingNewFields]), [{ ...heldRule, substats: [], minimumSubstats: 'all' }]);
assert.deepEqual(readRerollRules([{ ...heldRule, substats: [999] }]), [{ ...heldRule, substats: [] }]);
assert.deepEqual(readRerollRules([{ ...heldRule, minimumSubstats: '3' }]), [{ ...heldRule, minimumSubstats: 'all' }]);
assert.deepEqual(readRerollRules([{ ...heldRule, minimumSubstats: Number.NaN }]), [{ ...heldRule, minimumSubstats: 'all' }]);
assert.deepEqual(readRerollRules([{ ...openRule, ...refineConditions }]), [openRule], 'Re-app stores no refinement criteria');
const partialSurvival = readPreferences({ ...blank, runePotential: { ...reappSettings, powerUpPolicy: 2,
  rerollRules: [missingNewFields, openRule] } }, null);
assert.deepEqual(partialSurvival.runePotential.rerollRules, [{ ...heldRule, substats: [], minimumSubstats: 'all' }, openRule]);
assert.equal(partialSurvival.runePotential.powerUpPolicy, 2);
console.log(`PASS: ${checked} manual refine criteria checked against legal four-line runes, main/slot conflicts, innates, role independence and field-by-field preference survival.`);
