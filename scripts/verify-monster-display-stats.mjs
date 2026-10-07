/** The engraved main property belongs to the game's visible stat panel. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateMonsterTotals, monsterEffects, monsterTargetFigures } from '../app/lib/monster-stats.ts';
import { combatSpeed } from '../app/lib/speed-tick.ts';
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

/* Element advantage lifts the DMG a figure is shown with, never the CRI Rate. */
const totals = calculateMonsterTotals(monster);
const plain = { alwaysCrits: false, alwaysElementAdvantage: false };
const own = monsterTargetFigures(monster, plain);
const advantaged = monsterTargetFigures(monster, { ...plain, alwaysElementAdvantage: true });
assert.equal(advantaged.criRate, own.criRate);
assert.equal(advantaged.dmg,
  Math.floor(totals.atk * (1 + Math.min(100, own.criRate + 15) / 100 * totals.criticalDamage / 100)));
assert.ok(advantaged.dmg > own.dmg);

/* A lead is counted and never shown: every figure shown is the panel's own, and
   the counted ones carry each lead as a share of base summed with every other
   percentage and rounded once. */
const leads = { atk: 33, def: 20, spd: 24, hp: 30, criRate: 33 };
const led = { ...plain, leads };
assert.deepEqual(monsterTargetFigures(monster, led), own, 'a lead reached a figure shown as the copy\'s own');
const counted = monsterTargetFigures(monster, led, 'counted');
const effects = monsterEffects(monster);
assert.equal(counted.atk, Math.ceil(monster.atk * (100 + effects[2] + 33) / 100) + effects[3]);
assert.equal(counted.def, Math.ceil(monster.def * (100 + effects[4] + 20) / 100) + effects[5]);
assert.equal(counted.hp, Math.ceil(monster.con * 15 * (100 + effects[0] + 30) / 100) + effects[1]);
assert.equal(counted.criRate, own.criRate + 33);
assert.ok(counted.dmg > own.dmg && counted.ehp > own.ehp);
/* SPD with a lead is the dungeon speed `speed-tick.ts` states, for every
   combination of Swift and rune speed — one rule, held in two modules. */
for (const swift of [false, true]) {
  for (const runeSpeed of [0, 7, 41]) {
    for (const lead of [0, 15, 24, 33]) {
      const copy = { ...monster, artifacts: [], relics: [], runes: [
        ...(swift ? Array.from({ length: 4 }, () => ({ set_id: 3, pri_eff: [0, 0], prefix_eff: [0, 0], sec_eff: [] })) : []),
        { set_id: 0, pri_eff: [8, runeSpeed], prefix_eff: [0, 0], sec_eff: [] },
      ] };
      assert.equal(monsterTargetFigures(copy, { ...plain, leads: { spd: lead } }, 'counted').spd,
        combatSpeed({ baseSpeed: monster.spd, runeSpeed, swift, percentOfBase: lead }),
        `SPD with a ${lead} % lead, Swift ${swift}, ${runeSpeed} rune speed is not the dungeon speed`);
    }
  }
}

assert.deepEqual(readMonsterPreferences({ '1': {
  unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, critLead: 101, spdLead: 24,
} })['1'], { unitId: '1', alwaysElementAdvantage: true, alwaysCrits: true, spdLead: 24 },
'a lead out of range costs that lead alone');
assert.equal(readMonsterPreferences({ '1': { unitId: '1', critLead: 0 } })['1'].critLead, 0);

console.log('Monster display stats: Icaru DEF, empty gear, relic mains, hidden crit bonuses, leads counted as dungeon speed and never shown, and saved choices agree.');
