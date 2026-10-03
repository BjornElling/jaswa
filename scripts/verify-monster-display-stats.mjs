/** The engraved main property belongs to the game's visible stat panel. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateMonsterTotals, monsterTargetFigures } from '../app/lib/monster-stats.ts';
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

/* Relic advice compares each candidate with an unengraved sheet. A worn relic
   on the imported copy must not give the candidate a second main bonus. */
const account = JSON.parse(readFileSync(new URL('../tests/fixtures/monster-overlay-account.json', import.meta.url), 'utf8'));
const equipped = account.unit_list[0];
const unengraved = { ...equipped, relics: [] };
const model = relicMonsterModel(equipped);
const sheet = calculateMonsterTotals(unengraved);
assert.deepEqual(model.totals, { HP: sheet.hp, ATK: sheet.atk, DEF: sheet.def, SPD: sheet.spd });
assert.ok(calculateMonsterTotals(equipped).hp > sheet.hp);

const bonuses = { alwaysCrits: false, alwaysElementAdvantage: true, critLead: 33 };
const own = monsterTargetFigures(calculateMonsterTotals(monster), {
  alwaysCrits: false, alwaysElementAdvantage: false,
});
const withBonuses = monsterTargetFigures(calculateMonsterTotals(monster), bonuses);
assert.equal(withBonuses.criRate, own.criRate);
assert.equal(withBonuses.dmg,
  Math.floor(calculateMonsterTotals(monster).atk * (1 + Math.min(100, own.criRate + 48) / 100
    * calculateMonsterTotals(monster).criticalDamage / 100)));
assert.ok(withBonuses.dmg > own.dmg);
assert.deepEqual(readMonsterPreferences({ '1': {
  unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, critLead: 101,
} })['1'], { unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true });
assert.equal(readMonsterPreferences({ '1': { unitId: '1', critLead: 0 } })['1'].critLead, 0);

console.log('Monster display stats: Icaru DEF, empty gear, relic mains, hidden crit bonuses and saved choices agree.');
