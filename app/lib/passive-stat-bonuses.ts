import type { StatFigure } from './monster-stats';

/** A passive's direct addition to one of the eight figures JASWA calculates. */
export type PassiveStatEffect = {
  stat: StatFigure;
  amount: number;
  kind: 'basePercent' | 'points' | 'flat';
};

/** An always automatic stat rule whose value is read from another stat. */
export type PassiveStatRule =
  | { kind: 'defenseFromAttack'; percent: number; summary: string }
  | { kind: 'balanceAttackDefense'; summary: string };

/** Source text for one addition displayed inside the existing lead list. */
export type AutomaticStatLine = {
  sourceUnitId: string;
  sourceMasterId: string;
  stat: StatFigure;
  value: string;
  /** The same additive number folded into `Leads`; rules have no fixed amount. */
  contribution: number;
  description: string;
};

/** One passive source and everything it contributes to this monster's fight. */
export type PassiveStatBonus = {
  sourceUnitId: string;
  sourceMasterId: string;
  scope: 'personal' | 'team';
  effects: readonly PassiveStatEffect[];
  rules: readonly PassiveStatRule[];
  summary: string;
};

type PersonalPassive = Pick<PassiveStatBonus, 'effects' | 'rules' | 'summary'>;

const effect = (stat: StatFigure, amount: number, kind: PassiveStatEffect['kind']): PassiveStatEffect => ({ stat, amount, kind });

/*
 * A fixed addition stays useful without knowing the battle state. For mixed
 * passives, only that fixed part is listed; their HP-, turn-, attack- or target-
 * dependent part is left out. The source descriptions and exclusions are in
 * docs/ALWAYS-ON-PASSIVE-BONUSES.md.
 */
const personal: Readonly<Record<string, PersonalPassive>> = {
  '10812': { effects: [effect('criDmg', 50, 'points')], rules: [], summary: 'CRI Dmg +50' }, // Bremis
  '10915': { effects: [effect('res', 50, 'points'), effect('acc', 50, 'points')], rules: [], summary: 'RES +50 · ACC +50' }, // Rizak
  '10605': { effects: [effect('spd', 15, 'flat')], rules: [], summary: 'SPD +15' }, // Dark Hellhound before awakening
  '10615': { effects: [effect('spd', 15, 'flat')], rules: [], summary: 'SPD +15' }, // Shumar
  '10635': { effects: [effect('spd', 25, 'flat')], rules: [], summary: 'SPD +25' }, // Shumar, second awakening replaces +15
  '14811': { effects: [effect('criRate', 15, 'points'), effect('criDmg', 30, 'points')], rules: [], summary: 'CRI Rate +15 · CRI Dmg +30' }, // Huga
  '11504': { effects: [effect('res', 20, 'points')], rules: [], summary: 'RES +20' }, // Light Griffon before awakening
  '11514': { effects: [effect('res', 20, 'points')], rules: [], summary: 'RES +20' }, // Shamann
  '11534': { effects: [effect('res', 20, 'points')], rules: [], summary: 'RES +20' }, // Shamann, second awakening
  '11505': { effects: [effect('def', 50, 'basePercent')], rules: [], summary: 'DEF +50% of base' }, // Dark Griffon before awakening
  '11515': { effects: [effect('def', 50, 'basePercent')], rules: [], summary: 'DEF +50% of base' }, // Varus
  '11535': { effects: [effect('def', 50, 'basePercent')], rules: [], summary: 'DEF +50% of base' }, // Second-awakened Varus
  '17804': { effects: [effect('criRate', 20, 'points'), effect('criDmg', 20, 'points')], rules: [], summary: 'CRI Rate +20 · CRI Dmg +20' }, // Light Lizardman before awakening
  '17814': { effects: [effect('criRate', 20, 'points'), effect('criDmg', 20, 'points')], rules: [], summary: 'CRI Rate +20 · CRI Dmg +20' }, // Glinodon
  '15403': { effects: [effect('criRate', 25, 'points')], rules: [], summary: 'CRI Rate +25' }, // Wind Magical Archer before awakening
  '15413': { effects: [effect('criRate', 25, 'points')], rules: [], summary: 'CRI Rate +25' }, // Ardella
  '17703': { effects: [effect('atk', 50, 'basePercent')], rules: [], summary: 'ATK +50% of base' }, // Wind Minotauros before awakening
  '17713': { effects: [effect('atk', 50, 'basePercent')], rules: [], summary: 'ATK +50% of base' }, // Eintau
  '17705': { effects: [effect('atk', 100, 'basePercent')], rules: [], summary: 'ATK +100% of base' }, // Dark Minotauros before awakening
  '17715': { effects: [effect('atk', 100, 'basePercent')], rules: [], summary: 'ATK +100% of base' }, // Kamatau
  '13501': { effects: [effect('res', 50, 'points')], rules: [], summary: 'RES +50' }, // Water Ninja before awakening
  '13511': { effects: [effect('res', 50, 'points')], rules: [], summary: 'RES +50' }, // Susano
  '14105': { effects: [effect('criDmg', 100, 'points')], rules: [], summary: 'CRI Dmg +100' }, // Dark Phantom Thief before awakening
  '14115': { effects: [effect('criDmg', 100, 'points')], rules: [], summary: 'CRI Dmg +100' }, // Guillaume
  '21902': { effects: [effect('acc', 25, 'points')], rules: [], summary: 'ACC +25' }, // Fire Chakram Dancer before awakening
  '21912': { effects: [effect('acc', 25, 'points')], rules: [], summary: 'ACC +25' }, // Shaina
  '25102': { effects: [], rules: [{ kind: 'defenseFromAttack', percent: 20, summary: 'DEF +20% of ATK at battle start' }], summary: 'DEF +20% of ATK' }, // Onimusha before awakening
  '25112': { effects: [], rules: [{ kind: 'defenseFromAttack', percent: 20, summary: 'DEF +20% of ATK at battle start' }], summary: 'DEF +20% of ATK' }, // Kaki
  '21805': { effects: [], rules: [{ kind: 'balanceAttackDefense', summary: 'ATK and DEF balance to the higher stat at battle start' }], summary: 'ATK/DEF balance' }, // Paladin before awakening
  '21815': { effects: [], rules: [{ kind: 'balanceAttackDefense', summary: 'ATK and DEF balance to the higher stat at battle start' }], summary: 'ATK/DEF balance' }, // Leona
  '32105': { effects: [effect('atk', 30, 'basePercent'), effect('criRate', 20, 'points')], rules: [], summary: 'ATK +30% of base · CRI Rate +20' }, // Inosuke before awakening
  '32115': { effects: [effect('atk', 30, 'basePercent'), effect('criRate', 20, 'points')], rules: [], summary: 'ATK +30% of base · CRI Rate +20' }, // Inosuke Hashibira
  '32805': { effects: [effect('atk', 30, 'basePercent'), effect('criRate', 20, 'points')], rules: [], summary: 'ATK +30% of base · CRI Rate +20' }, // White Tiger Blade Master before awakening
  '32815': { effects: [effect('atk', 30, 'basePercent'), effect('criRate', 20, 'points')], rules: [], summary: 'ATK +30% of base · CRI Rate +20' }, // White Tiger Blade Master
};

/** Personal, automatic stat passives. An unawakened form can have the same passive. */
export function personalPassiveStatBonus(unitId: string, masterId: unknown): PassiveStatBonus | undefined {
  const id = String(masterId ?? '');
  const entry = personal[id];
  return entry === undefined ? undefined : { sourceUnitId: unitId, sourceMasterId: id, scope: 'personal', ...entry };
}

const shainaMasterIds = new Set(['21902', '21912']);
const boomerangWarriorFamily = 22000;

export function grantsBoomerangWarriorAccuracy(masterId: unknown): boolean {
  const id = Number(masterId);
  return Number.isInteger(id) && Math.floor(id / 100) * 100 === boomerangWarriorFamily;
}

export function grantsShainaPassive(masterId: unknown): boolean {
  return shainaMasterIds.has(String(masterId ?? ''));
}

/** Shaina's team effect is per Boomerang Warrior, never shared by the rest of the team. */
export function shainaAccuracyBonus(sourceUnitId: string, masterId: unknown = '21912'): PassiveStatBonus {
  return {
    sourceUnitId,
    sourceMasterId: String(masterId ?? '21912'),
    scope: 'team',
    effects: [effect('acc', 25, 'points')],
    rules: [],
    summary: 'ACC +25',
  };
}

export const noPassiveStatBonuses: readonly PassiveStatBonus[] = [];
