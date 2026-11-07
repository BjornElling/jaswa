/** The engraved main property belongs to the game's visible stat panel. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateMonsterTotals, combatStatBonus, monsterEffects, monsterStatSheet, monsterTargetFigures, completedTeamSets, teamSetBonuses,
} from '../app/lib/monster-stats.ts';
import { copyProfile, readMonsterPreferences, withProfile } from '../app/lib/monster-preferences.ts';
import { relicMonsterModel } from '../app/lib/relic-monster-value.ts';
import { noBuildingBonuses, readBuildingBonuses } from '../app/lib/account-buildings.ts';
import { fightAddition } from '../app/lib/figure-marks.ts';
import { combatSpeed } from '../app/lib/speed-tick.ts';

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

/* Element advantage is the fight's: it lifts CRI Rate, and DMG with it. */
const totals = calculateMonsterTotals(monster);
const plain = { alwaysCrits: false, alwaysElementAdvantage: false };
const own = monsterTargetFigures(monster, plain);
const statKeys = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];
const panelKeys = { hp: 'hp', atk: 'atk', def: 'def', spd: 'spd', criRate: 'criticalRate', criDmg: 'criticalDamage', res: 'resistance', acc: 'accuracy' };
for (const key of statKeys) assert.equal(own[key], totals[panelKeys[key]], `with no fight, ${key} is the panel's`);
const advantaged = monsterTargetFigures(monster, { ...plain, alwaysElementAdvantage: true });
assert.equal(advantaged.criRate, own.criRate + 15);
assert.equal(advantaged.dmg,
  Math.floor(totals.atk * (1 + Math.min(100, own.criRate + 15) / 100 * totals.criticalDamage / 100)));
assert.ok(advantaged.dmg > own.dmg);

/* Every figure is the fight's: a lead reaches its stat as a share of base summed
   with every other percentage and rounded once, and each composite reads the
   stats so counted — while the panel's sheet beside them does not move. */
const leads = { atk: 33, def: 20, hp: 30, criRate: 33 };
const ledSheet = monsterStatSheet(monster, { ...plain, leads });
const led = ledSheet.figures;
const effects = monsterEffects(monster);
const ledAtk = Math.ceil(monster.atk * (100 + effects[2] + 33) / 100) + effects[3];
const ledDef = Math.ceil(monster.def * (100 + effects[4] + 20) / 100) + effects[5];
const ledHp = Math.ceil(monster.con * 15 * (100 + effects[0] + 30) / 100) + effects[1];
assert.deepEqual([led.hp, led.atk, led.def, led.criRate], [ledHp, ledAtk, ledDef, own.criRate + 33]);
for (const key of statKeys) assert.equal(ledSheet.display[key], totals[panelKeys[key]], `a lead reached the panel's ${key}`);
assert.equal(led.dmg, Math.floor(ledAtk * (1 + Math.min(100, own.criRate + 33) / 100 * own.criDmg / 100)));
assert.equal(led.ehp, Math.floor(ledHp * (1142 + 3.572 * ledDef) / 1000));
assert.equal(led.ehpD, Math.floor(ledHp * (1142 + 3.572 * ledDef * 0.3) / 1000));

/* The owner's own example: 67 % CRI Rate and a 33-point crit lead fight at 100 %
   and deal their damage there — as a guaranteed crit does, which lifts 67 to 100. */
const keen = { ...monster, critical_rate: 67 };
const keenFigures = monsterTargetFigures(keen, { ...plain, leads: { criRate: 33 } });
assert.equal(keenFigures.criRate, 100);
assert.equal(keenFigures.dmg, Math.floor(own.atk * (1 + own.criDmg / 100)));
const certain = monsterTargetFigures(keen, { ...plain, alwaysCrits: true });
assert.equal(certain.criRate, 100);
assert.equal(certain.dmg, keenFigures.dmg);
assert.equal(monsterTargetFigures({ ...monster, critical_rate: 90 }, { ...plain, alwaysCrits: true, leads: { criRate: 24 } }).criRate, 114,
  'a guaranteed crit lifts to 100 and lowers nothing past it');
/* Past 100 % nothing more is dealt, though the figure still says so: the lead is
   added to the copy's own CRI Rate, and DMG caps the sum once, so 90 with the same
   lead and element advantage deals exactly what 67 does — and below the cap the
   lead still counts in full. */
const past = monsterTargetFigures({ ...monster, critical_rate: 90 }, { ...plain, alwaysElementAdvantage: true, leads: { criRate: 33 } });
assert.equal(past.criRate, 138);
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

/* A leader's CRI Dmg reaches CRI Dmg and DMG; its ACC and RES reach their own
   stat and no composite. */
const crushing = monsterTargetFigures(monster, { ...plain, leads: { criDmg: 25 } });
assert.equal(crushing.criDmg, own.criDmg + 25);
assert.equal(crushing.dmg, Math.floor(totals.atk * (1 + Math.min(100, own.criRate) / 100 * (own.criDmg + 25) / 100)));
assert.equal(combatStatBonus('acc', { ...plain, leads: { acc: 40 } }), 40);
assert.equal(combatStatBonus('res', { ...plain, leads: { res: 41 }, teammateSets: { Tolerance: 1 } }), 51);
const resolute = monsterTargetFigures(monster, { ...plain, leads: { acc: 40, res: 41 } });
assert.deepEqual({ ...resolute, acc: own.acc, res: own.res }, own, 'ACC and RES leads move no other figure');
assert.deepEqual([resolute.acc, resolute.res], [own.acc + 40, own.res + 41]);
/* RES counts the lead once, the copy's own Tolerance set and a teammate's beside
   it: 15 + 41 + 10 + 10 — Baleygr's 41 % lead was once counted twice. */
const tolerant = { ...monster, resist: 15, runes: [{ set_id: 23 }, { set_id: 23 }] };
const tolerantBonuses = { ...plain, leads: { res: 41 }, teammateSets: { Tolerance: 1 } };
const tolerantSheet = monsterStatSheet(tolerant, tolerantBonuses);
assert.deepEqual([tolerantSheet.display.res, tolerantSheet.figures.res], [15, 76]);
const resAddition = fightAddition('res', tolerantSheet.display.res, tolerantSheet.figures.res, tolerantBonuses, completedTeamSets(tolerant.runes), undefined);
assert.equal(resAddition.amount, 61);
assert.equal(resAddition.reading, 'RES lead +41%. 2 × Tolerance +20%.');

/* What a page says the fight adds: the figure less the panel's, every source named. */
const totemBuildings = { ...noBuildingBonuses, spd: 15, atk: 20, elementAtk: { Water: 21 } };
const quick = monsterStatSheet({ ...monster, attribute: 1 }, { ...plain, leads: { spd: 24 }, buildings: totemBuildings });
const quickSpd = fightAddition('spd', quick.display.spd, quick.figures.spd, { ...plain, leads: { spd: 24 }, buildings: totemBuildings }, {}, 'Water');
assert.equal(quickSpd.amount, quick.figures.spd - quick.display.spd);
assert.equal(quickSpd.reading, 'SPD lead +24%. Sky Tribe Totem +15%.');
assert.equal(fightAddition('atk', quick.display.atk, quick.figures.atk, { ...plain, buildings: totemBuildings }, { Fight: 1 }, 'Water').reading,
  '1 × Fight +8%. Ancient Sword +20%. Water Sanctuary +21%.');
const lifted = fightAddition('criRate', 15, 100, { ...plain, alwaysCrits: true, alwaysElementAdvantage: true }, {}, undefined);
assert.deepEqual(lifted, { amount: 85, raisedTo: 100, reading: 'Element advantage +15%. Always crits: at least 100%.' });
assert.deepEqual(fightAddition('acc', 0, 0, plain, {}, undefined), { amount: 0, raisedTo: null, reading: '' });

/* The fight's SPD is `speed-tick.ts`'s combat speed, written over the accumulators. */
for (const [baseSpeed, runeSpeed, swift, percent] of [[101, 64, true, 14.5], [99, 87, false, 39], [122, 40, true, 0], [100, 0, true, 2.5]]) {
  const runes = [{ set_id: swift ? 3 : 1, pri_eff: [8, runeSpeed] }, ...Array.from({ length: swift ? 3 : 0 }, () => ({ set_id: 3 }))];
  const copy = { ...monster, spd: baseSpeed, runes, artifacts: [], relics: [] };
  assert.equal(monsterTargetFigures(copy, { ...plain, buildings: { ...noBuildingBonuses, spd: percent } }).spd,
    combatSpeed({ baseSpeed, runeSpeed, swift, percentOfBase: percent }), `combat speed of ${baseSpeed} + ${runeSpeed}`);
}

console.log('Monster display stats: Icaru DEF, empty gear, relic mains, every fight bonus in the fight\'s figures and none on the panel, and saved choices agree.');

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
  const bareFigures = monsterTargetFigures(bare, plain);
  for (const key of statKeys) if (key !== set.stat) assert.equal(figures[key], self[key]);
  if (set.stat === 'acc' || set.stat === 'res') {
    assert.equal(self[set.stat], bareFigures[set.stat] + set.value, 'the holder\'s own set reaches its fight');
    assert.equal(figures[set.stat], self[set.stat] + 2 * set.value);
  } else assert.ok(figures[set.stat] > self[set.stat] && self[set.stat] > bareFigures[set.stat]);
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
   Dmg, summed with every other percentage and rounded once, and the totem 15 %
   of base SPD. */
const buildings = readBuildingBonuses({ deco_list: [4, 6, 8, 9, 31, 15, 16, 17, 18, 19].map((master_id) => ({ master_id, level: 20 })) });
assert.equal(buildings.spd, 15);
const water = { ...monster, attribute: 1 };
const builtSheet = monsterStatSheet(water, { ...plain, buildings });
const built = builtSheet.figures;
const bare = monsterTargetFigures(water, plain);
for (const key of statKeys) assert.equal(builtSheet.display[key], bare[key], `a building reached the panel's ${key}`);
for (const key of ['res', 'acc', 'criRate']) assert.equal(built[key], bare[key], `no building reaches ${key}`);
assert.equal(built.spd, Math.ceil(monster.spd * (100 + 15) / 100));
assert.equal(built.criDmg, bare.criDmg + 25);
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
console.log('Buildings: HP, ATK, DEF, SPD, a Sanctuary on its element and CRI Dmg reach the fight, never the panel.');
