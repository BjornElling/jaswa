import swarfarmMonsterData from '../data/swarfarm-monsters.json';
import {
  hasMonsterCatalogEntry,
  highestAwakeningMasterId,
  monsterAwakeningLineageId,
  monsterAwakeningTier,
  monsterCatalogueFamilyId,
} from './monster-catalog';
import type { MonsterAwakeningTier } from './monster-catalog';
import { monsterSpeciesId } from './monster-species';

type CatalogueMonster = { com2us_id: number };

/* The catalogue carries two family ids for a collaboration release: one for
   the licensed copy and one for the generic re-release. They are one skill-up
   family only when their element-specific monster identities meet. A family
   union is built once here so every caller uses the same cross-release rule. */
class FamilyGroups {
  private readonly parents = new Map<number, number>();

  add(familyId: number) {
    if (!this.parents.has(familyId)) this.parents.set(familyId, familyId);
  }

  find(familyId: number): number {
    const parent = this.parents.get(familyId);
    if (parent === undefined || parent === familyId) return familyId;
    const root = this.find(parent);
    this.parents.set(familyId, root);
    return root;
  }

  join(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    /* A canonical family id is an implementation detail. Picking the smaller
       catalogue id makes it deterministic and does not privilege a release. */
    if (leftRoot < rightRoot) this.parents.set(rightRoot, leftRoot);
    else this.parents.set(leftRoot, rightRoot);
  }

  ids(): number[] {
    return [...this.parents.keys()];
  }
}

const skillFamilyByCatalogueFamily = (() => {
  const groups = new FamilyGroups();
  const familiesByIdentity = new Map<string, number[]>();

  for (const { com2us_id: masterId } of swarfarmMonsterData.monsters as CatalogueMonster[]) {
    const familyId = monsterCatalogueFamilyId(masterId);
    if (familyId === undefined) continue;
    groups.add(familyId);
    const identity = monsterIdentityId(masterId);
    const families = familiesByIdentity.get(identity) ?? [];
    families.push(familyId);
    familiesByIdentity.set(identity, families);
  }

  for (const families of familiesByIdentity.values()) {
    for (const familyId of families.slice(1)) groups.join(families[0], familyId);
  }

  return new Map(groups.ids().map((familyId) => [familyId, groups.find(familyId)]));
})();

function rawMasterId(masterId: unknown): string {
  return String(masterId ?? '');
}

/**
 * The stable identity of one owned monster line.
 *
 * Awakening stages and a collaboration re-release are the same monster for
 * ownership and skill-up questions. The element is deliberately preserved:
 * Madeleine Cookie (Fire), Madeleine Cookie (Water), and Madeleine Cookie
 * (Wind) are three identities that merely share one skill-up family.
 *
 * Unknown ids remain their own raw keys. They must never collapse into one
 * guessed monster merely because the catalogue does not know them yet.
 */
export function monsterIdentityId(masterId: unknown): string {
  const key = rawMasterId(masterId);
  if (!hasMonsterCatalogEntry(key)) return key;
  return monsterSpeciesId(highestAwakeningMasterId(key));
}

/** The identity above, only when the catalogue can prove what the id is. */
export function knownMonsterIdentityId(masterId: unknown): string | undefined {
  return hasMonsterCatalogEntry(masterId) ? monsterIdentityId(masterId) : undefined;
}

/**
 * The canonical skill-up family for a master id.
 *
 * This intentionally groups the five elements and equivalent collaboration
 * releases, while `monsterIdentityId` above remains element-specific. Keeping
 * the two keys separate is what prevents a Wind Praline from making a unique
 * Fire or Water Madeleine Cookie look like spare fodder.
 */
export function monsterSkillFamilyId(masterId: unknown): number | undefined {
  const familyId = monsterCatalogueFamilyId(masterId);
  return familyId === undefined ? undefined : skillFamilyByCatalogueFamily.get(familyId);
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
   canonical surface. `monsterIdentityId` is the right key for ownership;
   `monsterSpeciesId` is the right key when a dataset intentionally preserves
   the exact awakening tier but merges only licensed/generic names. */
export { isCollaborationSpecies, monsterSpeciesId, monsterSpeciesMemberIds } from './monster-species';
