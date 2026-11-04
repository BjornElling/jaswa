import assert from 'node:assert/strict';
import { readRunes } from '../app/lib/runes.ts';
import { runeAdvice, withRuneSellProtection } from '../app/lib/rune-cleanup-advice.ts';
import { defaultRunePotentialSettings, blankPreferences, readPreferences } from '../app/lib/file-imports.ts';
import { readFileSync } from 'node:fs';
import { defaultReappTargets } from '../app/lib/rune-reapp-targets.ts';
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { prepareRuneCandidate, roleBuilds } from '../app/lib/rune-cleanup-model.ts';
import { maximumRoll, subPropertyTargetStat } from '../app/lib/rune-properties.ts';
import { maxRollScale } from '../app/lib/rune-substat-weights.ts';
import { runeStatName } from '../app/lib/runes.ts';
import { emptyRunePlacement, hasRunePlacementOutsideScenario, summarizeRunePlacement } from '../app/lib/rune-placement.ts';

const defaultCraftCredit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };

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

/* Re-app targets: one per slot, matched field by field, and an advice of their own. */
const reappSettings = { ...engravingSettings, neverSellEngravedPlacements: false };
const openTarget = { enabled: true, sets: [], minimumRarity: 'Normal', mains: [], requiresInnate: false };
const onlySlot = (target) => defaultReappTargets().map((entry, at) => (at === rune.slot - 1 ? target : { ...entry, enabled: false }));
const reappWith = (target, candidate = rune) =>
  withRuneSellProtection(candidate, original, { ...reappSettings, reappTargets: onlySlot(target) });
// Nothing filled in: an enabled target with no requirement takes every rune of its slot the engine would sell.
const open = reappWith(openTarget);
assert.equal(open.verdict, 'reapp');
assert.equal(open.reason, 'Re-app target');
assert.equal(open.maxValue, original.maxValue);
assert.equal(open.chance, original.chance);
assert.equal(withRuneSellProtection(rune, open, { ...reappSettings, neverSellReappTargets: false, reappTargets: onlySlot(openTarget) }).verdict, 'sell');
assert.equal(reappWith({ ...openTarget, enabled: false }).verdict, 'sell');
// Each requirement on its own, both sides of it.
const otherSet = rune.setName === 'Violent' ? 'Will' : 'Violent';
assert.equal(reappWith({ ...openTarget, sets: [rune.setName] }).verdict, 'reapp');
assert.equal(reappWith({ ...openTarget, sets: [otherSet] }).verdict, 'sell');
assert.equal(reappWith({ ...openTarget, minimumRarity: rune.rarity }).verdict, 'reapp');
assert.equal(reappWith({ ...openTarget, minimumRarity: 'Legend' }, { ...rune, rarity: 'Hero' }).verdict, 'sell');
// No level is asked, only all four lines shown: a Legend from +0, a lesser rune once its fourth line is added.
assert.equal(rune.subProperties.length, 4);
assert.equal(reappWith(openTarget, { ...rune, level: 0, rarity: 'Legend' }).verdict, 'reapp');
const threeLines = { ...rune, rarity: 'Hero', level: 9, subProperties: rune.subProperties.slice(0, 3) };
assert.equal(reappWith(openTarget, threeLines).verdict, 'sell');
assert.equal(reappWith(openTarget, { ...rune, rarity: 'Hero', level: 12 }).verdict, 'reapp');
assert.equal(reappWith({ ...openTarget, mains: [rune.mainStatId] }).verdict, 'reapp');
assert.equal(reappWith({ ...openTarget, mains: [rune.mainStatId === 8 ? 2 : 8] }).verdict, 'sell');
// Yes asks for an innate, whichever one; No asks nothing, so runes with and without one pass.
for (const prefixStatId of [1, 2, 8, 12]) {
  assert.equal(reappWith({ ...openTarget, requiresInnate: true }, { ...rune, prefixStatId, prefixValue: 5 }).verdict, 'reapp');
}
assert.equal(reappWith({ ...openTarget, requiresInnate: true }, { ...rune, prefixStatId: null, prefixValue: 0 }).verdict, 'sell');
// An empty list or No asks nothing: a rune with any innate, or none, and any main passes it.
assert.equal(reappWith(openTarget, { ...rune, prefixStatId: null, prefixValue: 0 }).verdict, 'reapp');
for (const prefixStatId of [1, 2, 8, 12]) {
  assert.equal(reappWith(openTarget, { ...rune, prefixStatId, prefixValue: 5 }).verdict, 'reapp');
}
for (const mainStatId of [1, 2, 4, 8]) {
  assert.equal(reappWith(openTarget, { ...rune, slot: 2, mainStatId }).verdict, 'sell'); // slot 2's target is off here
}
const slotTwoOpen = defaultReappTargets().map((entry, at) => (at === 1 ? openTarget : { ...entry, enabled: false }));
for (const mainStatId of [1, 2, 4, 8]) {
  assert.equal(withRuneSellProtection({ ...rune, slot: 2, mainStatId }, original,
    { ...reappSettings, reappTargets: slotTwoOpen }).verdict, 'reapp');
}
// Another slot's target never reaches this rune.
assert.equal(withRuneSellProtection({ ...rune, slot: rune.slot === 1 ? 2 : 1 }, original,
  { ...reappSettings, reappTargets: onlySlot(openTarget) }).verdict, 'sell');
// It outranks the other safeguards, and clears back to the engine's own answer.
const speedToo = withRuneSellProtection(rune, original, { ...settings, reappTargets: onlySlot(openTarget) });
assert.equal(speedToo.verdict, 'reapp');
assert.equal(withRuneSellProtection(rune, speedToo, { ...settings, neverSellReappTargets: false }).reason, 'Pre-grind SPD protected');

// The shipped six: slots 2, 4 and 6 on, Violent Legend with an innate.
const shipped = defaultReappTargets();
assert.deepEqual(shipped.map((target) => target.enabled), [false, true, false, true, false, true]);
assert.deepEqual(shipped.map((target) => target.mains), [[], [8, 4], [], [10, 2], [], [2, 4]]);
assert.ok(shipped.every((target) => target.requiresInnate === true));
assert.ok(shipped.every((target) => target.sets.join() === 'Violent' && target.minimumRarity === 'Legend'));
assert.ok(shipped.every((target) => !('minimumLevel' in target)));
assert.equal(defaultRunePotentialSettings.neverSellReappTargets, true);

// Everything filled in survives a reload as stated; one bad field costs only itself.
const full = shipped.map((target, at) => ({ ...target, enabled: true, sets: ['Violent', 'Will', 'Swift'],
  minimumRarity: 'Hero', requiresInnate: at % 2 === 0 }));
assert.deepEqual(readPreferences({ ...blank, runePotential: { ...reappSettings, reappTargets: full } }, null).runePotential.reappTargets, full);
const damaged = full.map((target) => ({ ...target }));
damaged[1].mains = [10];            // not a slot-2 main
damaged[2].minimumRarity = 'Mythic';
damaged[0].minimumLevel = 12;      // a choice the contract no longer has, left out
damaged[3].sets = ['Violent', 'Violent'];
damaged[5].requiresInnate = 'no';   // a word, not the choice
const reread = readPreferences({ ...blank, runePotential: { ...reappSettings, powerUpPolicy: 2, reappTargets: damaged } }, null).runePotential;
assert.equal(reread.powerUpPolicy, 2);
assert.deepEqual(reread.reappTargets[1], { ...full[1], mains: shipped[1].mains });
assert.deepEqual(reread.reappTargets[2], { ...full[2], minimumRarity: 'Legend' });
assert.deepEqual(reread.reappTargets[3], { ...full[3], sets: ['Violent'] });
assert.deepEqual(reread.reappTargets[5], { ...full[5], requiresInnate: true });
assert.deepEqual(reread.reappTargets[4], full[4]);
assert.deepEqual(reread.reappTargets[0], full[0]);
const missingReapp = { ...reappSettings, powerUpPolicy: 2 };
delete missingReapp.neverSellReappTargets;
delete missingReapp.reappTargets;
const restored = readPreferences({ ...blank, runePotential: missingReapp }, null).runePotential;
assert.equal(restored.powerUpPolicy, 2);
assert.equal(restored.neverSellReappTargets, true);
assert.deepEqual(restored.reappTargets, shipped);
console.log('PASS: re-app targets match slot by slot, outrank the other safeguards, and survive a reload one field at a time.');

/* Refine targets: the game's own exclusions, the four best line types of some build, and Refine first. */
const shippedRefine = defaultReappTargets('refine');
assert.deepEqual(defaultRunePotentialSettings.refineTargets, shippedRefine);
// Re-app's slots, grade and mains, with no innate asked, over seven sets.
assert.deepEqual(shippedRefine.map(({ enabled, minimumRarity, mains }) => ({ enabled, minimumRarity, mains })),
  shipped.map(({ enabled, minimumRarity, mains }) => ({ enabled, minimumRarity, mains })));
assert.ok(shippedRefine.every((target) => !target.requiresInnate));
assert.deepEqual(shippedRefine[0].sets, ['Despair', 'Fight', 'Rage', 'Swift', 'Vampire', 'Violent', 'Will']);
const withRefine = (target, extra = {}) => ({ ...reappSettings, reappTargets: onlySlot({ ...openTarget, enabled: false }),
  refineTargets: onlySlot(target), ...extra });
const best = { ...original, bestLineTypes: true };
assert.equal(withRuneSellProtection(rune, best, withRefine(openTarget)).verdict, 'refine');
assert.equal(withRuneSellProtection(rune, best, withRefine(openTarget)).reason, 'Refine target');
assert.equal(withRuneSellProtection(rune, original, withRefine(openTarget)).verdict, 'sell');
assert.equal(withRuneSellProtection({ ...rune, ancient: true }, best, withRefine(openTarget)).verdict, 'sell');
assert.equal(withRuneSellProtection({ ...rune, subProperties: rune.subProperties.map((line, at) => at === 0 ? { ...line, gemmed: true } : line) },
  best, withRefine(openTarget)).verdict, 'sell');
assert.equal(withRuneSellProtection({ ...rune, setName: 'Intangible' }, best, withRefine(openTarget)).verdict, 'sell');
assert.equal(withRuneSellProtection({ ...rune, setName: 'Intangible' }, best, { ...reappSettings, reappTargets: onlySlot(openTarget) }).verdict, 'sell');
// Below +12 is allowed on purpose: the rune is kept while it climbs to where the stone works.
assert.equal(withRuneSellProtection({ ...rune, level: 0 }, best, withRefine(openTarget)).verdict, 'refine');
assert.equal(withRuneSellProtection(threeLines, best, withRefine(openTarget)).verdict, 'sell');
// A grindstone does not bar refinement; only a gem does.
assert.equal(withRuneSellProtection({ ...rune, subProperties: rune.subProperties.map((line) => ({ ...line, grind: 3 })) },
  best, withRefine(openTarget)).verdict, 'refine');
// Both describe the rune: Refine is asked first, and Re-app answers where refinement does not.
assert.equal(withRuneSellProtection(rune, best, withRefine(openTarget, { reappTargets: onlySlot(openTarget) })).verdict, 'refine');
assert.equal(withRuneSellProtection(rune, original, withRefine(openTarget, { reappTargets: onlySlot(openTarget) })).verdict, 'reapp');
assert.equal(withRuneSellProtection(rune, best, withRefine(openTarget, { neverSellReappTargets: false })).verdict, 'sell');
// A design rule, not a preference: a stone is only ever offered instead of a sale.
// A rune the engine would power up or keep is left as the engine said, by both kinds.
for (const verdict of ['power-up', 'keep']) {
  const worthKeeping = { ...best, verdict, reason: 'engine' };
  const both = withRefine(openTarget, { reappTargets: onlySlot(openTarget) });
  assert.equal(withRuneSellProtection(rune, worthKeeping, both).verdict, verdict);
  assert.equal(withRuneSellProtection(rune, { ...worthKeeping, bestLineTypes: false }, both).verdict, verdict);
  assert.equal(withRuneSellProtection(rune, worthKeeping, both).unprotectedAdvice, undefined);
}

/* The four best types, read in the engine's own prices, for any build that takes the main. */
/* A real level-40 line for every family: the fixture's own reference lines are all
   zero, which prices every HP, ATK and DEF line at nothing. */
const referenceLine = { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 };
const fixtureBase = new Map(['Attack type', 'Support type', 'Defence type', 'HP type', 'No type'].map((type) => [type, referenceLine]));
const roles = defaultRuneRoles();
const fastDd = roles.find((role) => role.id === 'fast-dd');
const support = roles.find((role) => role.id === 'support');
const speedRune = (statIds) => ({ ...rune, id: 'refine-probe', slot: 2, mainStatId: 8, mainValue: 42, setName: 'Violent', setId: 13,
  ancient: false, stars: 6, rarity: 'Legend', level: 12, prefixStatId: null, prefixValue: 0,
  subProperties: statIds.map((statId) => ({ statId, value: 1, gemmed: false, grind: 0 })) });
const legal = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12];
function ranked(role) {
  const build = roleBuilds(role).find((entry) => entry.mains[2] === 8);
  const candidate = prepareRuneCandidate(speedRune([4, 9, 10, 3]), role, build, fixtureBase.get(role.type), defaultCraftCredit);
  // First what the build still lacks, then the size of a max roll for a stat the role names.
  const named = new Set(candidate.weights.rows.map((row) => row.stat));
  const base = fixtureBase.get(role.type);
  const worth = (id) => [candidate.valuation.value(id, maximumRoll(id, 6)),
    named.has(subPropertyTargetStat[id]) ? maximumRoll(id, 6) * maxRollScale(id, base, 6) : 0];
  return [...legal].sort((left, right) => worth(right)[0] - worth(left)[0] || worth(right)[1] - worth(left)[1]);
}
const attackRanked = ranked(fastDd);
const attackFour = attackRanked.slice(0, 4);
const supportFour = ranked(support).slice(0, 4);
console.log(`Fast DD's four for a slot-2 SPD rune: ${attackFour.map(runeStatName).join(', ')}; Support's: ${supportFour.map(runeStatName).join(', ')}`);
const engineSays = async (statIds, chosenRoles, prefixStatId = null) =>
  (await runeAdvice([{ ...speedRune(statIds), prefixStatId, prefixValue: prefixStatId === null ? 0 : 1 }],
    chosenRoles, defaultRunePotentialSettings, fixtureBase)).get('refine-probe').bestLineTypes;
assert.equal(await engineSays(attackFour, [fastDd]), true);
assert.equal(await engineSays(supportFour, [support]), true);
// Either build is enough: the support rune is still a candidate beside the attack role.
assert.equal(await engineSays(supportFour, [fastDd, support]), true);
assert.equal(await engineSays(attackFour, [fastDd, support]), true);
// One of the four swapped for the type the build wants least is no candidate.
const swapped = [...attackFour.slice(0, 3), legal.find((id) => !attackFour.includes(id) && !supportFour.includes(id))];
assert.equal(await engineSays(swapped, [fastDd]), false);
// Three lines have not shown their fourth type yet.
assert.equal(await engineSays(attackFour.slice(0, 3), [fastDd]), false);
// The best four are counted after the main alone: an innate holding one of them
// leaves the rune's lines short of the best four, while one outside them costs nothing.
assert.equal(await engineSays([...attackFour.slice(0, 3), attackRanked[4]], [fastDd], attackFour[3]), false);
assert.equal(await engineSays(attackFour, [fastDd], attackRanked.at(-1)), true);
console.log('PASS: refine targets need the four best line types of some build and pass only runes the game lets through the stone.');
