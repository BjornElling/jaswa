import type { Artifact } from '../artifacts/artifacts';
import type { EngravedConversionStone } from '../artifacts/artifact-conversion-stones';
import type { BuildingBonuses } from './account-buildings';
import type { GameRecord } from './game-record';
import type { Preset } from '../placements/presets';
import type { Relic } from '../relics/relics';
import type { CraftItem } from '../runes/craft/rune-craft-items';
import type { Rune } from '../runes/runes';

export type AccountId = string;
export type MonsterCopyId = string;
export type MonsterSpeciesId = string;

/** A validated owned monster identity and the facts currently available for it. */
export type MonsterCopy = {
  id: MonsterCopyId;
  speciesId: MonsterSpeciesId;
  name: string | null;
  element: string | null;
  level: number | null;
  grade: number | null;
  /** Kept behind the ingestion-owned snapshot while consumers move off raw export fields. */
  record: GameRecord;
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
  buildings: BuildingBonuses | undefined;
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

/** Storage boundary check: collection presence is required even when empty. */
export function isAccountSnapshot(value: unknown): value is AccountSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const source = snapshot.source;
  const coverage = snapshot.coverage;
  const sourceRecord = source && typeof source === 'object' && !Array.isArray(source) ? source as Record<string, unknown> : null;
  const coverageRecord = coverage && typeof coverage === 'object' && !Array.isArray(coverage) ? coverage as Record<string, unknown> : null;
  const sourceValid = sourceRecord !== null && (
    (sourceRecord.kind === 'file' && typeof sourceRecord.fileName === 'string' && sourceRecord.fileName.length > 0)
    || (sourceRecord.kind === 'helper' && typeof sourceRecord.instanceId === 'string' && sourceRecord.instanceId.length > 0
      && typeof sourceRecord.sessionId === 'number' && Number.isSafeInteger(sourceRecord.sessionId) && sourceRecord.sessionId > 0)
  );
  const coverageValid = coverageRecord !== null
    && typeof coverageRecord.complete === 'boolean'
    && Array.isArray(coverageRecord.misses)
    && coverageRecord.misses.every((miss) => {
      if (typeof miss !== 'object' || miss === null || Array.isArray(miss)) return false;
      const entry = miss as Record<string, unknown>;
      return typeof entry.command === 'string' && entry.command.length > 0
        && (entry.cause === 'encrypted' || entry.cause === 'unread');
    });
  const monster = (entry: unknown) => typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    && typeof (entry as Record<string, unknown>).id === 'string'
    && typeof (entry as Record<string, unknown>).speciesId === 'string'
    && typeof (entry as Record<string, unknown>).record === 'object'
    && (entry as Record<string, unknown>).record !== null;
  const stack = (entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return typeof record.speciesId === 'string'
      && typeof record.quantity === 'number'
      && Number.isSafeInteger(record.quantity)
      && record.quantity > 0
      && typeof record.record === 'object'
      && record.record !== null;
  };
  return typeof snapshot.importedAt === 'string'
    && Number.isFinite(Date.parse(snapshot.importedAt))
    && (snapshot.accountId === null || (typeof snapshot.accountId === 'string' && snapshot.accountId.length > 0))
    && sourceValid
    && coverageValid
    && Array.isArray(snapshot.monsters) && snapshot.monsters.every(monster)
    && Array.isArray(snapshot.normalShrine) && snapshot.normalShrine.every(monster)
    && Array.isArray(snapshot.summonedShrine) && snapshot.summonedShrine.every(stack)
    && Array.isArray(snapshot.runes)
    && Array.isArray(snapshot.artifacts)
    && Array.isArray(snapshot.relics)
    && Array.isArray(snapshot.craftItems)
    && Array.isArray(snapshot.conversionStones)
    && Array.isArray(snapshot.presets)
    && (snapshot.scenario === null || (typeof snapshot.scenario === 'object' && snapshot.scenario !== null));
}
