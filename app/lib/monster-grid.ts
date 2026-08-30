import type { MonsterArchetype } from './monster-catalog';
import type { GameRecord } from './game-data';

export type EquipmentPrimaryType = 'HP' | 'ATK' | 'DEF';
export type EquipmentPrimaryTypeSlot = EquipmentPrimaryType | null;
export type NumericSortKey = 'level' | 'hp' | 'atk' | 'def' | 'spd' | 'criticalRate' | 'criticalDamage' | 'resistance' | 'accuracy' | 'ehp' | 'ehpD' | 'dmg';
export type EquipmentSortKey = 'artifactTypes' | 'relicTypes';
export type SortKey = 'index' | 'name' | 'sets' | EquipmentSortKey | NumericSortKey;
export type MonsterGridColumn = { key: SortKey; label: string };

export type MonsterRow = {
  unitId: string;
  name: string;
  secondaryName?: string;
  element?: string;
  archetype?: MonsterArchetype;
  imageFilename?: string;
  initial: string;
  sets: Array<{ name: string; abbreviation: string }>;
  artifactTypes: EquipmentPrimaryTypeSlot[];
  relicTypes: EquipmentPrimaryTypeSlot[];
  index: number;
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
  isRainbowmon: boolean;
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

const equipmentPrimaryTypes: Record<number, EquipmentPrimaryType> = { 100: 'HP', 101: 'ATK', 102: 'DEF' };

function primaryEquipmentType(item: unknown): EquipmentPrimaryTypeSlot {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const effect = (item as GameRecord).pri_effect;
  if (!Array.isArray(effect) || typeof effect[0] !== 'number' || !Number.isFinite(effect[0])) return null;
  return equipmentPrimaryTypes[effect[0]] ?? null;
}

export function equippedEquipmentTypes(monster: GameRecord, key: 'artifacts' | 'relics'): EquipmentPrimaryTypeSlot[] {
  if (!Array.isArray(monster[key])) return [];
  return monster[key].map(primaryEquipmentType);
}

export function displayArtifactTypes(types: EquipmentPrimaryTypeSlot[]): string {
  if (!types.some((type) => type !== null)) return '—';
  return [types[0] ?? '-', types[1] ?? '-'].join('/');
}

export function displayRelicType(types: EquipmentPrimaryTypeSlot[]): string {
  return types.find((type): type is EquipmentPrimaryType => type !== null) ?? '—';
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
