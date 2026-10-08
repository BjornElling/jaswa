/** The engraved main property belongs to the game's visible stat panel. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateMonsterTotals, monsterEffects, monsterTargetFigures } from '../app/lib/monster-stats.ts';
import { readMonsterPreferences } from '../app/lib/monster-preferences.ts';
import { relicMonsterModel } from '../app/lib/relic-monster-value.ts';

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
assert.deepEqual(readMonsterPreferences({ '1': {
  unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, critLead: 101, hpLead: 24, spdLead: 24,
} })['1'], { unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, hpLead: 24 },
'a lead out of range, or one no calculation reads, costs that lead alone');
assert.equal(readMonsterPreferences({ '1': { unitId: '1', critLead: 0 } })['1'].critLead, 0);

console.log('Monster display stats: Icaru DEF, empty gear, relic mains, crit bonuses and leads in the composites only, and saved choices agree.');
