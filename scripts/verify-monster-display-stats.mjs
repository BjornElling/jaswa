/** The engraved main property belongs to the game's visible stat panel. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateMonsterTotals, combatStatBonus, monsterEffects, monsterTargetFigures, completedTeamSets, teamSetBonuses } from '../app/lib/monster-stats.ts';
import { copyProfile, readMonsterPreferences, withProfile } from '../app/lib/monster-preferences.ts';
import { relicMonsterModel } from '../app/lib/relic-monster-value.ts';
import { noBuildingBonuses, readBuildingBonuses } from '../app/lib/account-buildings.ts';

const monster = {
  con: 659, atk: 637, def: 736, spd: 108,
  critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
  runes: Array.from({ length: 6 }, (_, index) => ({
    set_id: 2,
    pri_eff: [index < 3 ? 6 : 0, index < 3 ? 63 : 0],
    prefix_eff: [0, 0],
    sec_eff: [[5, 70, 0, 0], [index < 4 ? 6 : 0, index < 4 ? 8 : 0, 0, 0]],
  })),
  artifacts: [],
  relics: [],
};

assert.equal(calculateMonsterTotals(monster).def, 3114);
assert.equal(calculateMonsterTotals({ ...monster, relics: [{ pri_effect: [102, 12] }] }).def, 3203);
assert.equal(calculateMonsterTotals({ ...monster, runes: [], relics: [] }).def, 736);
assert.equal(calculateMonsterTotals({ ...monster, runes: [], relics: [{ pri_effect: [102, 12] }] }).def, 825);
assert.equal(calculateMonsterTotals({ ...monster, runes: [], relics: [{ pri_effect: [100, 12] }] }).hp,
  Math.ceil(monster.con * 15 * 1.12));
assert.equal(calculateMonsterTotals({ ...monster, runes: [], relics: [{ pri_effect: [101, 12] }] }).atk,
  Math.ceil(monster.atk * 1.12));

/* Relic advice compares each candidate with an unengraved sheet. An engraved relic
   on the imported copy must not give the candidate a second main bonus. */
const account = JSON.parse(readFileSync(new URL('../tests/fixtures/monster-overlay-account.json', import.meta.url), 'utf8'));
const engraved = account.unit_list[0];
const unengraved = { ...engraved, relics: [] };
const model = relicMonsterModel(engraved);
const sheet = calculateMonsterTotals(unengraved);
assert.deepEqual(model.totals, { HP: sheet.hp, ATK: sheet.atk, DEF: sheet.def, SPD: sheet.spd });
assert.ok(calculateMonsterTotals(engraved).hp > sheet.hp);

/* Element advantage lifts the DMG a figure is shown with, never the CRI Rate. */
const totals = calculateMonsterTotals(monster);
const plain = { alwaysCrits: false, alwaysElementAdvantage: false };
const own = monsterTargetFigures(monster, plain);
const advantaged = monsterTargetFigures(monster, { ...plain, alwaysElementAdvantage: true });
assert.equal(advantaged.criRate, own.criRate);
assert.equal(advantaged.dmg,
  Math.floor(totals.atk * (1 + Math.min(100, own.criRate + 15) / 100 * totals.criticalDamage / 100)));
assert.ok(advantaged.dmg > own.dmg);

/* A stat is the copy's own and a composite is the fight's: no lead reaches one of
   the eight stats, and each composite counts every lead as a share of base summed
   with every other percentage and rounded once. */
const leads = { atk: 33, def: 20, hp: 30, criRate: 33 };
const led = monsterTargetFigures(monster, { ...plain, leads });
const statKeys = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];
for (const key of statKeys) assert.equal(led[key], own[key], `a lead reached ${key}, which is the copy's own`);
const effects = monsterEffects(monster);
const ledAtk = Math.ceil(monster.atk * (100 + effects[2] + 33) / 100) + effects[3];
const ledDef = Math.ceil(monster.def * (100 + effects[4] + 20) / 100) + effects[5];
const ledHp = Math.ceil(monster.con * 15 * (100 + effects[0] + 30) / 100) + effects[1];
assert.equal(led.dmg, Math.floor(ledAtk * (1 + Math.min(100, own.criRate + 33) / 100 * own.criDmg / 100)));
assert.equal(led.ehp, Math.floor(ledHp * (1142 + 3.572 * ledDef) / 1000));
assert.equal(led.ehpD, Math.floor(ledHp * (1142 + 3.572 * ledDef * 0.3) / 1000));

/* The owner's own example: 67 % CRI Rate and a 33-point crit lead show 67 and deal
   their damage at 100 %. */
const keen = { ...monster, critical_rate: 67 };
const keenFigures = monsterTargetFigures(keen, { ...plain, leads: { criRate: 33 } });
assert.equal(keenFigures.criRate, 67);
assert.equal(keenFigures.dmg, Math.floor(own.atk * (1 + own.criDmg / 100)));
assert.equal(keenFigures.dmg, monsterTargetFigures(keen, { ...plain, alwaysCrits: true }).dmg);
/* Past 100 % nothing more is dealt: the lead is added to the copy's own CRI Rate
   first and the sum capped once, so 90 with the same lead and element advantage
   deals exactly what 67 does — and below the cap the lead still counts in full. */
const past = monsterTargetFigures({ ...monster, critical_rate: 90 }, { ...plain, alwaysElementAdvantage: true, leads: { criRate: 33 } });
assert.equal(past.criRate, 90);
assert.equal(past.dmg, keenFigures.dmg);
const below = monsterTargetFigures({ ...monster, critical_rate: 40 }, { ...plain, leads: { criRate: 33 } });
assert.equal(below.dmg, Math.floor(own.atk * (1 + 0.73 * own.criDmg / 100)));
assert.deepEqual(readMonsterPreferences({ scenario: { '1': {
  unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, critLead: 101, hpLead: 24, spdLead: 24,
} } }).scenario['1'], { unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, hpLead: 24 },
'a lead out of range, or one no calculation reads, costs that lead alone');
assert.equal(readMonsterPreferences({ scenario: { '1': { unitId: '1', critLead: 0 } } }).scenario['1'].critLead, 0);
/* Outside Scenario a preset's leads are its leaders': a stated one is dropped
   alone, and a profile that stated nothing else is no profile. */
assert.deepEqual(readMonsterPreferences({ 'content:arena-attack': {
  '1': { unitId: '1', alwaysCrits: true, critLead: 19, hpLead: 24 },
  '2': { unitId: '2', atkLead: 33 },
} }), { 'content:arena-attack': { '1': { unitId: '1', alwaysCrits: true } } });
assert.deepEqual(withProfile({}, 'content:arena-attack', '1', { unitId: '1', label: 'Nuker', atkLead: 33 }),
  { 'content:arena-attack': { '1': { unitId: '1', label: 'Nuker' } } }, 'an area other than Scenario saves no lead');
assert.deepEqual(copyProfile({ unitId: '1', label: 'Nuker', critLead: 19 }, '1', 'content:rift-raid'), { unitId: '1', label: 'Nuker' },
  'a lead copied from Scenario into an area is left behind');
assert.deepEqual(copyProfile({ unitId: '1', critLead: 19 }, '1', 'scenario'), { unitId: '1', critLead: 19 });

/* A leader's CRI Dmg reaches DMG; its ACC and RES reach no composite, and are
   the battle value beside the stat, as the Accuracy and Tolerance sets are. */
const crushing = monsterTargetFigures(monster, { ...plain, leads: { criDmg: 25 } });
for (const key of statKeys) assert.equal(crushing[key], own[key], `a CRI Dmg lead reached ${key}`);
assert.equal(crushing.dmg, Math.floor(totals.atk * (1 + Math.min(100, own.criRate) / 100 * (own.criDmg + 25) / 100)));
assert.equal(combatStatBonus('acc', { ...plain, leads: { acc: 40 } }), 40);
assert.equal(combatStatBonus('res', { ...plain, leads: { res: 41 }, teammateSets: { Tolerance: 1 } }), 51);
assert.deepEqual(monsterTargetFigures(monster, { ...plain, leads: { acc: 40, res: 41 } }), own, 'ACC and RES leads move no figure');

console.log('Monster display stats: Icaru DEF, empty gear, relic mains, crit bonuses and leads in the composites only, and saved choices agree.');

// Own completed sets are counted once; teammate entries are additional sets, not team totals.
for (const set of teamSetBonuses) {
  const bare = { ...monster, runes: [] };
  const holder = { ...bare, runes: [{ set_id: set.setId }, { set_id: set.setId }] };
  const triple = { ...bare, runes: Array.from({ length: 6 }, () => ({ set_id: set.setId })) };
  assert.deepEqual(calculateMonsterTotals(holder), calculateMonsterTotals(bare), 'own team sets are battle-only');
  assert.deepEqual(calculateMonsterTotals(triple), calculateMonsterTotals(bare));
  assert.equal(completedTeamSets(holder.runes)[set.name], 1);
  assert.equal(completedTeamSets(triple.runes)[set.name], 3);
  assert.equal(completedTeamSets([{ set_id: set.setId }, { set_id: 25 }])[set.name], 1);
  const withTeam = { ...plain, teammateSets: { [set.name]: 2 } };
  const figures = monsterTargetFigures(holder, withTeam);
  const self = monsterTargetFigures(holder, plain);
  for (const key of statKeys) assert.equal(figures[key], self[key]);
  assert.equal(combatStatBonus(set.stat, withTeam), set.value * 2);
  if (set.stat === 'atk') assert.equal(figures.dmg, Math.floor(Math.ceil(monster.atk * 124 / 100) * 1.075));
  if (set.stat === 'hp' || set.stat === 'def') assert.ok(figures.ehp > self.ehp);
}
const saved = readMonsterPreferences({ scenario: { '1': {
  unitId: '1', label: 'Keep me', hpLead: 24, accLead: 40,
  teammateSets: { Fight: 0, Enhance: 15, Accuracy: -1, Determination: 1.5, Tolerance: '2', Unknown: 2 },
} } }).scenario['1'];
assert.deepEqual(saved, { unitId: '1', label: 'Keep me', hpLead: 24 });
console.log('Team sets: holder, stacking, Intangible completion, teammate-only counts, ACC and independent preference survival agree.');

assert.deepEqual(readMonsterPreferences({ scenario: { '2': { unitId: '2', teammateSets: { Fight: 0 } } } }), {},
  'removed manual fields do not form a profile');

// Numerical regression from the deck panel and matching export, without account identifiers.
const fran = {
  con: 681, atk: 670, def: 461, spd: 103,
  critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
  runes: [
    { set_id: 13, pri_eff: [3,160], sec_eff: [[12,9,0,0],[2,8,1,6],[4,27,0,7],[8,5,0,3]] },
    { set_id: 13, pri_eff: [8,42], sec_eff: [[4,13,1,7],[6,13,0,8],[12,21,0,0],[2,15,0,5]] },
    { set_id: 19, pri_eff: [5,160], prefix_eff: [6,7], sec_eff: [[12,9,1,0],[9,6,0,0],[8,21,0,4],[1,320,0,447]] },
    { set_id: 13, pri_eff: [4,63], sec_eff: [[3,29,0,21],[2,20,0,7],[6,10,1,7],[8,12,0,4]] },
    { set_id: 13, pri_eff: [1,2448], prefix_eff: [2,6], sec_eff: [[4,11,1,7],[8,23,0,4],[9,6,0,0],[3,17,0,20]] },
    { set_id: 25, pri_eff: [4,63], prefix_eff: [12,8], sec_eff: [[1,369,0,319],[8,17,0,3],[5,17,0,19],[2,5,0,0]] },
  ], artifacts: [{ pri_effect: [100,1500] },{ pri_effect: [101,100] }], relics: [{ pri_effect: [100,14] }],
};
assert.deepEqual(calculateMonsterTotals(fran), {
  hp: 24403, atk: 2344, def: 865, spd: 241,
  criticalRate: 27, criticalDamage: 50, resistance: 15, accuracy: 47,
});
assert.equal(monsterTargetFigures(fran, { ...plain, teammateSets: { Fight: 2 } }).dmg, 2843);
const bladeFight = { ...fran, runes: [{ set_id: 4 }, { set_id: 4 }, { set_id: 19 }, { set_id: 19 }] };
assert.equal(calculateMonsterTotals(bladeFight).criticalRate, 27);
assert.equal(calculateMonsterTotals(bladeFight).atk, 770);
assert.ok(monsterTargetFigures(bladeFight, plain).dmg > Math.floor(770 * 1.135));
console.log('Fran: all eight game display stats match; own Fight + two teammate Fight sets enter battle DMG once. Blade remains a display bonus.');

/* The Glory buildings are the fight's, never the panel's: at level 20 they add
   20 % of base HP, ATK and DEF, 21 % ATK on their Sanctuary's element and 25 CRI
   Dmg, summed with every other percentage and rounded once — and no stat moves. */
const buildings = readBuildingBonuses({ deco_list: [4, 8, 9, 31, 15, 16, 17, 18, 19].map((master_id) => ({ master_id, level: 20 })) });
const water = { ...monster, attribute: 1 };
const built = monsterTargetFigures(water, { ...plain, buildings });
const bare = monsterTargetFigures(water, plain);
for (const key of statKeys) assert.equal(built[key], bare[key], `a building reached ${key}, which the panel does not show`);
const builtAtk = Math.ceil(monster.atk * (100 + effects[2] + 20 + 21) / 100) + effects[3];
const builtDef = Math.ceil(monster.def * (100 + effects[4] + 20) / 100) + effects[5];
const builtHp = Math.ceil(monster.con * 15 * (100 + effects[0] + 20) / 100) + effects[1];
assert.equal(built.dmg, Math.floor(builtAtk * (1 + own.criRate / 100 * (own.criDmg + 25) / 100)));
assert.equal(built.ehp, Math.floor(builtHp * (1142 + 3.572 * builtDef) / 1000));
assert.equal(built.ehpD, Math.floor(builtHp * (1142 + 3.572 * builtDef * 0.3) / 1000));
const fire = monsterTargetFigures({ ...monster, attribute: 2 }, { ...plain, buildings: { ...buildings, elementAtk: { Water: 21 } } });
assert.equal(fire.dmg, Math.floor((Math.ceil(monster.atk * (100 + effects[2] + 20) / 100) + effects[3]) * (1 + own.criRate / 100 * (own.criDmg + 25) / 100)),
  'a Sanctuary reaches its own element only');
assert.deepEqual(monsterTargetFigures(water, { ...plain, buildings: noBuildingBonuses }), bare, 'no building counts nothing');
console.log('Buildings: HP, ATK, DEF, a Sanctuary on its element and CRI Dmg reach the composites only.');
