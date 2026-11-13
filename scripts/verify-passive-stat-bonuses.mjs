import assert from 'node:assert/strict';
import { monsterSpeedParts, monsterStatSheet } from '../app/domain/combat/monster-stats.ts';
import { personalPassiveStatBonus } from '../app/domain/combat/passive-stat-bonuses.ts';
import { teamLeadsFor } from '../app/domain/combat/team-leads.ts';
import { combatSpeed } from '../app/domain/speed/speed-tick.ts';

const base = {
  con: 100,
  atk: 1000,
  def: 100,
  spd: 100,
  critical_rate: 15,
  critical_damage: 50,
  resist: 15,
  accuracy: 0,
  runes: [],
  artifacts: [],
  relics: [],
};

function setup(masterId, monster = base, teammates = [], kind = 'scenario') {
  const target = { ...monster, unit_id: 'target', unit_master_id: Number(masterId) };
  const members = [...teammates.map((unit) => unit.unit_id), 'target'];
  const preset = { id: 'test', kind, name: 'Test', number: null, members, leaderUnitId: null, content: null };
  const roster = new Map([...teammates, target].map((unit) => [String(unit.unit_id), unit]));
  const reading = teamLeadsFor(preset, [preset], 'target', roster);
  return { target, reading };
}

function figures(masterId, monster = base, teammates = [], kind = 'scenario') {
  const { target, reading } = setup(masterId, monster, teammates, kind);
  return monsterStatSheet(target, {
    alwaysCrits: false,
    alwaysElementAdvantage: false,
    leads: reading.bonuses,
    leadRules: reading.rules,
  }).figures;
}

assert.equal(figures('10812').criDmg, 100, 'Bremis adds 50 CRI Dmg points through Leads.');
assert.equal(figures('10915').res, 65, 'Rizak adds 50 RES points through Leads.');
assert.equal(figures('10915').acc, 50, 'Rizak adds 50 ACC points through Leads.');
assert.equal(figures('10615').spd, 115, 'Shumar adds the fixed 15 SPD before its HP scaling.');
assert.equal(figures('10635').spd, 125, 'Second awakening replaces Shumar’s 15 with 25 SPD.');
assert.equal(figures('11515').def, 150, 'Varus adds 50% of base DEF.');
assert.equal(figures('11535').def, 150, 'Second-awakened Varus keeps the 50% base DEF passive.');
assert.equal(figures('17713').atk, 1500, 'Eintau adds 50% of base ATK.');
assert.equal(figures('17715').atk, 2000, 'Kamatau adds the fixed 100% of base ATK.');
assert.equal(figures('32115').atk, 1300, 'Inosuke gets the battle-start ATK bonus.');
assert.equal(figures('32115').criRate, 35, 'Inosuke gets the battle-start CRI Rate bonus.');
assert.equal(figures('21912').acc, 25, 'Shaina’s own +25 ACC is folded into the Leads map.');
assert.equal(figures('10131').acc, 0, 'An unrelated monster receives no Shaina aura.');

const shaina = { unit_id: 'shaina', unit_master_id: 21912, ...base };
const boomerang = { unit_id: 'target', unit_master_id: 22012, ...base };
const { reading } = setup('22012', base, [shaina], 'game');
assert.equal(reading.bonuses.acc, 25, 'Shaina’s same-preset aura is in the existing Leads sum.');
assert.deepEqual(reading.leads.map((lead) => lead.automatic?.stat), ['acc']);
assert.equal(figures('22012', base, [shaina], 'game').acc, 25, 'A Boomerang Warrior receives the aura.');
assert.equal(figures('22013', base, [shaina], 'game').acc, 25, 'Every Boomerang Warrior receives one +25 bonus.');
assert.equal(figures('22012', base, [shaina], 'scenario').acc, 0, 'Scenario has no inferred Shaina team aura.');
assert.equal(boomerang.accuracy, 0, 'The fixture starts with no ACC.');

assert.equal(figures('25112').def, 300, 'Kaki adds 20% of battle-start ATK to DEF.');
assert.equal(figures('21815', { ...base, atk: 700, def: 900 }).atk, 900, 'Leona raises ATK to DEF when DEF is higher.');
assert.equal(figures('21815').def, 1000, 'Leona raises DEF to ATK when ATK is higher.');
const shumarSpeed = monsterSpeedParts({ ...base, unit_master_id: 10615 });
assert.equal(shumarSpeed.displaySpeed, 100, 'The game panel display speed does not include a battle passive.');
assert.equal(combatSpeed({ baseSpeed: 100, runeSpeed: 0, swift: false, percentOfBase: shumarSpeed.passiveSpeedPercent,
  passiveFlatSpeed: shumarSpeed.passiveFlatSpeed }), 115, 'Speed Tuning counts Shumar’s fixed passive SPD.');
assert.equal(personalPassiveStatBonus('target', 999999), undefined, 'Unknown monsters receive no invented passive.');

console.log('Automatic stat bonuses are part of the existing Leads reading and shared stat sheet.');
