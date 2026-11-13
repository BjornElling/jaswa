import type { MonsterArchetype } from './monster-catalog';
import type { GameRecord } from '../account/game-record';
import { artifactMainProperties, artifactsPerMonster } from '../artifacts/artifact-properties';

export type GearPrimaryType = 'HP' | 'ATK' | 'DEF';
export type GearPrimaryTypeSlot = GearPrimaryType | null;
export type NumericSortKey = 'level' | 'hp' | 'atk' | 'def' | 'spd' | 'criticalRate' | 'criticalDamage' | 'resistance' | 'accuracy' | 'ehp' | 'ehpD' | 'dmg';
export type GearSortKey = 'artifactTypes' | 'relicTypes';
export type SortKey = 'index' | 'name' | 'sets' | GearSortKey | NumericSortKey;
export type MonsterGridColumn = { key: SortKey; label: string };

export type MonsterRow = {
  unitId: string;
  /* The monster this row *is*, as opposed to the copy it is. Awakening carries
     on this id and not on the name — every stage has a different name — so it
     is what a search compares to reach a row's awakened forms (`ACCOUNT-TABLES.md` §3). */
  masterId: string;
  name: string;
  /* Names the row answers to in search but never shows — the twin release's
     name, or a former name after a rename. See `monster-catalog.ts`. */
  searchAliases?: string[];
  element?: string;
  archetype?: MonsterArchetype;
  imageFilename?: string;
  initial: string;
  sets: Array<{ name: string; abbreviation: string }>;
  artifactTypes: GearPrimaryTypeSlot[];
  relicTypes: GearPrimaryTypeSlot[];
  index: number;
  /** In Monster Storage; its complement is the roster the game calls Inventory. */
  inStorage: boolean;
  level: number | null;
  hp: number | null;
  atk: number | null;
  def: number | null;
  spd: number | null;
  criticalRate: number | null;
  criticalDamage: number | null;
  resistance: number | null;
  accuracy: number | null;
  ehp: number | null;
  ehpD: number | null;
  dmg: number | null;
};

export const monsterArchetypeLabels: Record<MonsterArchetype, string> = {
  Attack: 'ATK', Defense: 'DEF', HP: 'HP', Support: 'SUP', Material: 'MAT', none: 'NONE',
};

export const monsterFilterArchetypes: MonsterArchetype[] = ['Attack', 'Defense', 'HP', 'Support'];

export const monsterNameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const defaultMonsterSortDirections: Record<SortKey, boolean> = {
  index: true, name: true, sets: true,
  artifactTypes: true, relicTypes: true,
  level: false, hp: false, atk: false, def: false, spd: false,
  criticalRate: false, criticalDamage: false, resistance: false, accuracy: false,
  ehp: false, ehpD: false, dmg: false,
};

export function numericOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/* The game export marks storage through `building_id`: zero is the active
   roster, while a non-zero building identifies a monster put away. Missing
   data remains visible rather than being guessed as stored. */
export function isStoredMonster(monster: GameRecord): boolean {
  const buildingId = numericOrNull(monster.building_id);
  return buildingId !== null && buildingId !== 0;
}

/* Artifacts and relics encode their main property with the same three codes,
   so both columns read the one table the artifact reader names them from. */
const gearPrimaryTypes: Readonly<Record<number, GearPrimaryType>> = artifactMainProperties;

function primaryGearType(item: unknown): GearPrimaryTypeSlot {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const effect = (item as GameRecord).pri_effect;
  if (!Array.isArray(effect) || typeof effect[0] !== 'number' || !Number.isFinite(effect[0])) return null;
  return gearPrimaryTypes[effect[0]] ?? null;
}

export function engravedGearTypes(monster: GameRecord, key: 'artifacts' | 'relics'): GearPrimaryTypeSlot[] {
  if (!Array.isArray(monster[key])) return [];
  return monster[key].map(primaryGearType);
}

export const artifactSlotCount = artifactsPerMonster;

/**
 * What a copy has engraved: runes and artifacts as the slots they fill, the relic as
 * engraved or not, since a monster carries one at most.
 */
export function engravedCounts(monster: GameRecord): { runes: number; artifacts: number; relic: boolean } {
  const engraved = (value: unknown) => (Array.isArray(value)
    ? value.filter((entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : []) as GameRecord[];
  return {
    runes: engraved(monster.runes).length,
    artifacts: engraved(monster.artifacts).length,
    relic: engraved(monster.relics).some((relic) => numericOrNull(relic.rid) !== null),
  };
}

export function displayArtifactTypes(types: GearPrimaryTypeSlot[]): string {
  if (!types.some((type) => type !== null)) return '—';
  return [types[0] ?? '-', types[1] ?? '-'].join('/');
}

export function displayRelicType(types: GearPrimaryTypeSlot[]): string {
  return types.find((type): type is GearPrimaryType => type !== null) ?? '—';
}

export function compareNumbersWithBlanks(left: number | null, right: number | null, direction: number): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return (left - right) * direction;
}

export function compareTextWithBlanks(left: string | null, right: string | null, direction: number): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return monsterNameCollator.compare(left, right) * direction;
}
