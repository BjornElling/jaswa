/**
 * The account's Glory buildings, read from the export's `deco_list`: the Sky
 * Tribe Totem, and the buildings that raise HP, ATK, DEF and CRI Dmg, for the
 * stats a fight is judged by and Speed Tuning's combat speeds.
 *
 * **The decoration ids.** `master_id` 4 Guardstone, 6 Sky Tribe Totem, 8 Crystal
 * Altar, 9 Ancient Sword, 15–19 the Fire, Water, Wind, Light and Dark
 * Sanctuaries, 31 Fallen Ancient Guardian. Three independent readers of the same
 * export agree on every one: RuneManager (`RuneClasses/swar/Deco.cs`, its
 * `Shrine` enum), swarm-api (`database/seeders/BuildingSeeder.php`, `game_id`)
 * and Swarfarm (`bestiary.building`, `com2us_id`), all read through GitHub on
 * October 19, 2026. The other decorations — Mana Fountain, the flags and the
 * rest — move no stat a composite reads, and are not read.
 *
 * **The levels.** Every Glory building now runs to level 20, and level 20 gives
 * what level 10 gave before (Com2uS notice for v6.2.7,
 * sw.com2us.com/en/skyarena/news/2593: "The MAX level (Lv. 20) building effects
 * of all buildings except the Sanctum of Energy will be the same as the previous
 * maximum level (Lv. 10) effects"). The tables below are the in-game upgrade
 * tables as the Fandom wiki states them (each building's own page, read through
 * its API on October 19, 2026); RuneManager's `ShrineStats` carries the same
 * twenty values for every stat building, and Spokland's and Swarfarm's ten-level
 * tables end on the same maxima. The totem's own table, which RuneManager
 * disputes, is `SPEED-TICK-CANONICAL.md` §2.1's.
 *
 * Every one applies wherever the account fights (Fandom *Buildings*: "including
 * Arena (both Offense and Defense)"); only RTA turns them off, and no preset is
 * an RTA team. The game's monster panel does not show them, so the display sheet
 * leaves them out and only the fight's figures count them (`monster-stats.ts`).
 */
import type { GameRecord } from './game-record';
import { totemMaximumLevel, totemPercentByLevel } from '../speed/speed-tick';

export const skyTribeTotemMasterId = 6;

/** The last level of every Glory building. */
export const buildingMaximumLevel = totemMaximumLevel;

/** What one building raises: a percentage of base HP, ATK or DEF, or CRI Dmg points. */
export type BuildingStat = 'hp' | 'atk' | 'def' | 'criDmg';

type StatBuilding = {
  masterId: number;
  name: string;
  stat: BuildingStat;
  /** The element whose monsters it raises, or `null` for every monster. */
  element: string | null;
  /** By level, index 0 being "not built". */
  bonusByLevel: readonly number[];
};

const onePerLevel: readonly number[] = Array.from({ length: buildingMaximumLevel + 1 }, (_, level) => level);
/* A Sanctuary climbs one per level and jumps two at its last, to the old
   level-10 21 %. */
const sanctuaryByLevel: readonly number[] = [...onePerLevel.slice(0, buildingMaximumLevel), 21];
const guardianByLevel: readonly number[] = [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 24, 25];

const sanctuary = (masterId: number, element: string): StatBuilding =>
  ({ masterId, name: `${element} Sanctuary`, stat: 'atk', element, bonusByLevel: sanctuaryByLevel });

export const statBuildings: readonly StatBuilding[] = [
  { masterId: 4, name: 'Guardstone', stat: 'def', element: null, bonusByLevel: onePerLevel },
  { masterId: 8, name: 'Crystal Altar', stat: 'hp', element: null, bonusByLevel: onePerLevel },
  { masterId: 9, name: 'Ancient Sword', stat: 'atk', element: null, bonusByLevel: onePerLevel },
  { masterId: 31, name: 'Fallen Ancient Guardian', stat: 'criDmg', element: null, bonusByLevel: guardianByLevel },
  sanctuary(15, 'Fire'), sanctuary(16, 'Water'), sanctuary(17, 'Wind'), sanctuary(18, 'Light'), sanctuary(19, 'Dark'),
];

/**
 * What the account's buildings add to one fight, before the monster's element
 * picks its Sanctuary: HP, ATK, DEF and — the Sky Tribe Totem — SPD in percent of
 * base, CRI Dmg in points.
 */
export type BuildingBonuses = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  criDmg: number;
  /** A Sanctuary's ATK percent, by the element it raises. */
  elementAtk: Readonly<Partial<Record<string, number>>>;
};

export const noBuildingBonuses: BuildingBonuses = { hp: 0, atk: 0, def: 0, spd: 0, criDmg: 0, elementAtk: {} };

export type SkyTribeTotem =
  | { state: 'built'; level: number; percent: number }
  /** The export lists the island's decorations and the totem is not among them. */
  | { state: 'not-built' }
  /** The export carries no decoration list at all, so the totem cannot be known. */
  | { state: 'unknown' };

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBuildingLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= buildingMaximumLevel;
}

const readBuildings: ReadonlyArray<{ masterId: number; name: string }> = [
  { masterId: skyTribeTotemMasterId, name: 'Sky Tribe Totem' }, ...statBuildings,
];

/**
 * Why a decoration list cannot be read, or `undefined` when it can. The import
 * rejects on this rather than guessing a level, because a building read as
 * absent would shift every combat speed or composite it touches without a word.
 * A file with no decoration list at all is read; the buildings are then unknown.
 */
export function accountBuildingsProblem(data: GameRecord): string | undefined {
  if (data.deco_list === undefined) return undefined;
  if (!Array.isArray(data.deco_list) || !data.deco_list.every(isRecord)) {
    return 'This file contains a building list JASWA cannot read.';
  }
  const decorations = data.deco_list;
  for (const { masterId, name } of readBuildings) {
    const found = decorations.filter((deco) => deco.master_id === masterId);
    if (found.length > 1) return `This file lists more than one ${name}.`;
    if (found.length === 1 && !isBuildingLevel(found[0].level)) return `This file contains a ${name} JASWA cannot read.`;
  }
  return undefined;
}

function buildingLevel(data: GameRecord, masterId: number): number {
  const deco = (data.deco_list as unknown[]).find((entry) => isRecord(entry) && entry.master_id === masterId);
  return isRecord(deco) && isBuildingLevel(deco.level) ? deco.level : 0;
}

export function readSkyTribeTotem(data: GameRecord | undefined): SkyTribeTotem {
  if (!data || !Array.isArray(data.deco_list)) return { state: 'unknown' };
  const level = buildingLevel(data, skyTribeTotemMasterId);
  return level === 0 ? { state: 'not-built' } : { state: 'built', level, percent: totemPercentByLevel[level] };
}

/** The totem's percentage of base speed, where the page must count something. */
export function totemPercent(totem: SkyTribeTotem): number {
  return totem.state === 'built' ? totem.percent : 0;
}

/**
 * The stat buildings' bonuses, or `undefined` where the export carries no
 * decoration list, so a caller can say the buildings are not in the import
 * rather than count them as unbuilt.
 */
export function readBuildingBonuses(data: GameRecord | undefined): BuildingBonuses | undefined {
  if (!data || !Array.isArray(data.deco_list)) return undefined;
  const bonuses = {
    hp: 0, atk: 0, def: 0, spd: totemPercent(readSkyTribeTotem(data)), criDmg: 0,
    elementAtk: {} as Partial<Record<string, number>>,
  };
  for (const building of statBuildings) {
    const bonus = building.bonusByLevel[buildingLevel(data, building.masterId)];
    if (building.element === null) bonuses[building.stat] += bonus;
    else bonuses.elementAtk[building.element] = (bonuses.elementAtk[building.element] ?? 0) + bonus;
  }
  return bonuses;
}
