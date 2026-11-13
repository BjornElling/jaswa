import {
  hasMonsterCatalogEntry,
  highestAwakeningMasterId,
  monsterAwakeningLineageId,
  monsterAwakeningTier,
  monsterCatalogueFamilyId,
} from './monster-catalog';
import type { MonsterAwakeningTier } from './monster-catalog';
import { monsterSpeciesId } from './monster-species';

function rawMasterId(masterId: unknown): string {
  return String(masterId ?? '');
}

/**
 * The stable identity of one owned monster line.
 *
 * Awakening stages in one catalogue lineage are the same monster for ownership
 * and skill-up questions. Collaboration names are deliberately not folded into
 * that identity: a licensed monster and a generic monster may look related in
 * a data table while still being separate monsters in the player's collection.
 *
 * Unknown ids remain their own raw keys. They must never collapse into one
 * guessed monster merely because the catalogue does not know them yet.
 */
export function monsterIdentityId(masterId: unknown): string {
  const key = rawMasterId(masterId);
  if (!hasMonsterCatalogEntry(key)) return key;
  return highestAwakeningMasterId(key);
}

/** The captured-statistics key for a monster, including its finished awakening. */
export function monsterStatisticsId(masterId: unknown): string {
  const key = rawMasterId(masterId);
  return hasMonsterCatalogEntry(key)
    ? monsterSpeciesId(highestAwakeningMasterId(key))
    : key;
}

/** The identity above, only when the catalogue can prove what the id is. */
export function knownMonsterIdentityId(masterId: unknown): string | undefined {
  return hasMonsterCatalogEntry(masterId) ? monsterIdentityId(masterId) : undefined;
}

/**
 * The canonical skill-up family for a master id.
 *
 * This groups the elements that the catalogue itself assigns to one skill-up
 * family: a skill-up takes any member of the family whatever its element, so
 * a Fire copy feeds a Water one. It deliberately does not infer a relationship from a collaboration
 * table: every collaboration family keeps its own raw catalogue family.
 */
export function monsterSkillFamilyId(masterId: unknown): number | undefined {
  return monsterCatalogueFamilyId(masterId);
}

export type MonsterIdentity = {
  masterId: string;
  identityId: string;
  skillFamilyId: number | undefined;
  awakeningLineageId: string;
  awakeningTier: MonsterAwakeningTier | undefined;
  known: boolean;
};

/** All canonical keys for one master id, calculated together. */
export function monsterIdentity(masterId: unknown): MonsterIdentity {
  const key = rawMasterId(masterId);
  return {
    masterId: key,
    identityId: monsterIdentityId(key),
    skillFamilyId: monsterSkillFamilyId(key),
    awakeningLineageId: monsterAwakeningLineageId(key),
    awakeningTier: monsterAwakeningTier(key),
    known: hasMonsterCatalogEntry(key),
  };
}

/** One monster's place in its own element-specific awakening chain. */
export type MonsterAwakeningPosition = {
  lineageId: string;
  tier: MonsterAwakeningTier;
};

export function monsterAwakeningPosition(masterId: unknown): MonsterAwakeningPosition | undefined {
  const identity = monsterIdentity(masterId);
  return identity.awakeningTier === undefined
    ? undefined
    : { lineageId: identity.awakeningLineageId, tier: identity.awakeningTier };
}

/** Whether `candidate` is the reference form or a more awakened form of it. */
export function isSameOrHigherAwakening(candidate: unknown, reference: unknown): boolean {
  const referencePosition = monsterAwakeningPosition(reference);
  const candidatePosition = monsterAwakeningPosition(candidate);
  /* Outside the awakening scheme there is no chain to walk, so identity is the
     only honest answer. Compared as strings because exports use both numbers
     and strings for master ids. */
  if (!referencePosition || !candidatePosition) {
    return rawMasterId(candidate) === rawMasterId(reference);
  }
  return candidatePosition.lineageId === referencePosition.lineageId
    && candidatePosition.tier >= referencePosition.tier;
}

/** Widen seeds to same-or-higher awakenings actually present in `available`. */
export function withHigherAwakenings(
  seeds: Iterable<unknown>,
  available: Iterable<unknown>,
): Set<string> {
  const floorByLineage = new Map<string, MonsterAwakeningTier>();
  const accepted = new Set<string>();
  for (const seed of seeds) {
    const key = rawMasterId(seed);
    accepted.add(key);
    const position = monsterAwakeningPosition(key);
    if (!position) continue;
    const floor = floorByLineage.get(position.lineageId);
    if (floor === undefined || position.tier < floor) floorByLineage.set(position.lineageId, position.tier);
  }

  for (const candidate of available) {
    const key = rawMasterId(candidate);
    const position = monsterAwakeningPosition(key);
    if (!position) continue;
    const floor = floorByLineage.get(position.lineageId);
    if (floor !== undefined && position.tier >= floor) accepted.add(key);
  }
  return accepted;
}

/* These lower-level collaboration mappings remain available from this
   canonical surface for statistics and scoring datasets. `monsterStatisticsId`
   is the finished-form statistics key; the ownership keys are deliberately
   separate and answer row-merging and fodder questions. */
export { isCollaborationSpecies, monsterSpeciesId, monsterSpeciesMemberIds } from './monster-species';
