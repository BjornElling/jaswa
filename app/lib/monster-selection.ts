import swarfarmMonsterData from '../data/swarfarm-monsters.json';
import {
  hasMonsterCatalogEntry, highestAwakeningMasterId, monsterFamilyId,
} from './monster-catalog';
import { monsterSpeciesId } from './monster-species';

/**
 * The stable identity of one playable monster: awakening changes its form, and
 * a collaboration release changes its name and artwork, but neither creates a
 * different monster for ownership checks.
 */
export function monsterIdentityId(masterId: unknown): string {
  return monsterSpeciesId(highestAwakeningMasterId(masterId));
}

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
       catalogue id makes it deterministic, without assigning either release
       more importance than its twin. */
    if (leftRoot < rightRoot) this.parents.set(rightRoot, leftRoot);
    else this.parents.set(leftRoot, rightRoot);
  }

  ids(): number[] {
    return [...this.parents.keys()];
  }
}

/* The game's family id already groups every element and awakening of a release.
 * A collaboration re-release has a different numeric family id despite having
 * identical skills and stats. Each equivalent identity joins those two groups,
 * so every caller gets the complete family through one lookup. */
const selectionFamilyByCatalogueFamily = (() => {
  const groups = new FamilyGroups();
  const catalogueFamiliesByIdentity = new Map<string, number[]>();
  for (const { com2us_id: masterId } of swarfarmMonsterData.monsters as Array<{ com2us_id: number }>) {
    const familyId = monsterFamilyId(masterId);
    if (familyId === undefined) continue;
    groups.add(familyId);
    const identity = monsterIdentityId(masterId);
    const families = catalogueFamiliesByIdentity.get(identity) ?? [];
    families.push(familyId);
    catalogueFamiliesByIdentity.set(identity, families);
  }
  for (const families of catalogueFamiliesByIdentity.values()) {
    for (const familyId of families.slice(1)) groups.join(families[0], familyId);
  }
  return new Map(groups.ids().map((familyId) => [familyId, groups.find(familyId)]));
})();

function knownMonsterIdentity(masterId: unknown): string | undefined {
  return hasMonsterCatalogEntry(masterId) ? monsterIdentityId(masterId) : undefined;
}

function selectionFamilyId(masterId: unknown): number | undefined {
  const familyId = monsterFamilyId(masterId);
  return familyId === undefined ? undefined : selectionFamilyByCatalogueFamily.get(familyId);
}

export type MonsterSelectionRecord = {
  masterId: unknown;
  level: number | null;
  maxSkilled: boolean;
};

export type MonsterSelectionRequirements = {
  alreadyHaveLevel40: boolean;
  familyFullySkilled: boolean;
};

export type MonsterSelectionIndex = {
  matches: (masterId: unknown, requirements: MonsterSelectionRequirements) => boolean;
};

export type MonsterCopyRecord = {
  masterId: unknown;
  /* How many copies this record stands for: one for a monster, the export's
     quantity for a shrine stack. */
  copies: number;
};

export type MonsterCopyIndex = {
  copies: (masterId: unknown) => number;
};

/**
 * How many copies of one monster a set of records holds, under the same
 * identity rules as the conditions above: awakenings and a collaboration twin
 * are the same monster, an element sibling is not.
 *
 * Which records are counted is the caller's question, and Storage's answer is
 * the monsters Storage lists. "Have ≥ 2" is read against the table it stands
 * beside, so counting a copy on the active roster would mark a row the user can
 * see only one of. Identity is taken raw rather than through
 * `knownMonsterIdentity`: a monster the catalogue does not carry still counts
 * its own copies rather than being unreachable by the filter.
 */
export function createMonsterCopyIndex(records: readonly MonsterCopyRecord[]): MonsterCopyIndex {
  const copiesByIdentity = new Map<string, number>();
  for (const record of records) {
    const copies = Number.isSafeInteger(record.copies) && record.copies > 0 ? record.copies : 1;
    const identity = monsterIdentityId(record.masterId);
    copiesByIdentity.set(identity, (copiesByIdentity.get(identity) ?? 0) + copies);
  }
  return { copies: (masterId) => copiesByIdentity.get(monsterIdentityId(masterId)) ?? 0 };
}

/**
 * Index the account once, then answer every Storage filter against the same
 * identity rules. A family must contain at least one Lv. 40 monster: without
 * one, "all Lv. 40" would be true merely because there is nothing to inspect.
 */
export function createMonsterSelectionIndex(records: readonly MonsterSelectionRecord[]): MonsterSelectionIndex {
  const level40Identities = new Set<string>();
  const level40Families = new Map<number, { allMaxSkilled: boolean }>();

  for (const record of records) {
    if (record.level === null || record.level < 40) continue;
    const identity = knownMonsterIdentity(record.masterId);
    if (identity) level40Identities.add(identity);
    const familyId = selectionFamilyId(record.masterId);
    if (familyId === undefined) continue;
    const state = level40Families.get(familyId) ?? { allMaxSkilled: true };
    state.allMaxSkilled &&= record.maxSkilled;
    level40Families.set(familyId, state);
  }

  return {
    matches(masterId, requirements) {
      const identity = knownMonsterIdentity(masterId);
      const familyId = selectionFamilyId(masterId);
      return (!requirements.alreadyHaveLevel40 || (identity !== undefined && level40Identities.has(identity)))
        && (!requirements.familyFullySkilled || (familyId !== undefined && level40Families.get(familyId)?.allMaxSkilled === true));
    },
  };
}
