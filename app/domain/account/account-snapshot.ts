import type { Artifact } from '../artifacts/artifacts';
import type { EngravedConversionStone } from '../artifacts/artifact-conversion-stones';
import type { BuildingBonuses, SkyTribeTotem } from './account-buildings';
import type { AccountCounts } from './account-counts';
import type { GameRecord } from './game-record';
import type { Preset } from '../placements/presets';
import type { Relic } from '../relics/relics';
import type { CraftItem } from '../runes/craft/rune-craft-items';
import type { Rune } from '../runes/runes';

export type AccountId = string;
export type MonsterCopyId = string;
export type MonsterSpeciesId = string;

/** The accepted monster contract. Unused export fields stay at the observation boundary. */
export type MonsterRecord = {
  unit_id: number;
  unit_master_id: number;
  con: number;
  atk: number;
  def: number;
  spd: number;
  critical_rate: number;
  critical_damage: number;
  resist: number;
  accuracy: number;
  name?: string;
  attribute?: number;
  unit_level?: number;
  class?: number;
  building_id?: number;
  skills?: readonly (readonly number[])[];
  /** Canonical physical records, each accepted by its item reader. */
  runes?: readonly GameRecord[];
  artifacts?: readonly GameRecord[];
  relics?: readonly GameRecord[];
};

/** A validated owned monster identity and the facts currently available for it. */
export type MonsterCopy = {
  id: MonsterCopyId;
  speciesId: MonsterSpeciesId;
  name: string | null;
  element: string | null;
  level: number | null;
  grade: number | null;
  record: MonsterRecord;
};

export type ShrineMonster = MonsterCopy;
export type SummonedStack = {
  speciesId: MonsterSpeciesId;
  quantity: number;
  grade: number | null;
  record: GameRecord;
};

export type CaptureCoverage = {
  complete: boolean;
  misses: readonly { command: string; cause: 'encrypted' | 'unread' }[];
};

export type AccountSnapshot = {
  accountId: AccountId | null;
  importedAt: string;
  source: { kind: 'file'; fileName: string } | { kind: 'helper'; instanceId: string; sessionId: number };
  monsters: readonly MonsterCopy[];
  normalShrine: readonly ShrineMonster[];
  summonedShrine: readonly SummonedStack[];
  runes: readonly Rune[];
  artifacts: readonly Artifact[];
  relics: readonly Relic[];
  craftItems: readonly CraftItem[];
  conversionStones: readonly EngravedConversionStone[];
  counts: AccountCounts;
  buildings: BuildingBonuses | undefined;
  skyTribeTotem: SkyTribeTotem;
  presets: readonly Preset[];
  scenario: Preset | null;
  coverage: CaptureCoverage;
};

export type AccountIndex = {
  monstersById: ReadonlyMap<MonsterCopyId, MonsterCopy>;
  runesById: ReadonlyMap<string, Rune>;
  artifactsById: ReadonlyMap<string, Artifact>;
  relicsById: ReadonlyMap<string, Relic>;
};

export function indexAccountSnapshot(snapshot: AccountSnapshot): AccountIndex {
  return {
    monstersById: new Map(snapshot.monsters.map((monster) => [monster.id, monster])),
    runesById: new Map(snapshot.runes.map((rune) => [rune.id, rune])),
    artifactsById: new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact])),
    relicsById: new Map(snapshot.relics.map((relic) => [relic.id, relic])),
  };
}

export const completeCoverage: CaptureCoverage = { complete: true, misses: [] };

/** A stored coverage record, read whole: a partial one would claim a completeness nobody observed. */
export function readCaptureCoverage(value: unknown): CaptureCoverage | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const coverage = value as Record<string, unknown>;
  if (typeof coverage.complete !== 'boolean' || !Array.isArray(coverage.misses)) return null;
  const misses: { command: string; cause: 'encrypted' | 'unread' }[] = [];
  for (const miss of coverage.misses) {
    if (typeof miss !== 'object' || miss === null || Array.isArray(miss)) return null;
    const entry = miss as Record<string, unknown>;
    if (typeof entry.command !== 'string' || entry.command.length === 0 || (entry.cause !== 'encrypted' && entry.cause !== 'unread')) return null;
    misses.push({ command: entry.command, cause: entry.cause });
  }
  if (coverage.complete !== (misses.length === 0)) return null;
  return { complete: coverage.complete, misses };
}
