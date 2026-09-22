import { monsterIdentity, monsterIdentityId } from './monster-identity';

export type MonsterSelectionRecord = {
  masterId: unknown;
  level: number | null;
  maxSkilled: boolean;
  /** How many copies this row represents, including a shrine stack. */
  copies: number;
};

export type MonsterSelectionRequirements = {
  alreadyHaveLevel40: boolean;
  familyFullySkilled: boolean;
  fodderMon: boolean;
  candidateLevel: number | null;
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
 * see only one of. The canonical identity helper keeps an unknown id on its own
 * raw key rather than making it unreachable or collapsing it into another
 * unknown monster.
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
  const level40CopiesByIdentity = new Map<string, number>();
  const copiesByIdentity = new Map<string, number>();
  const level40SecondAwakeningCopiesByIdentity = new Map<string, number>();
  const secondAwakeningCopiesByIdentity = new Map<string, number>();
  const unskilledLevel40FamilyTiers = new Map<number, Set<number | undefined>>();

  for (const record of records) {
    /* Skill-up fodder can be an unawakened form of the same monster, so the
       safety check follows the monster's identity across its awakening chain.
       Unknown ids keep their raw key instead of collapsing into one unknown
       bucket. */
    const canonical = monsterIdentity(record.masterId);
    const identity = canonical.identityId;
    const awakeningTier = canonical.awakeningTier;
    const copies = Number.isSafeInteger(record.copies) && record.copies > 0 ? record.copies : 1;
    copiesByIdentity.set(identity, (copiesByIdentity.get(identity) ?? 0) + copies);
    if (awakeningTier === 3) {
      secondAwakeningCopiesByIdentity.set(
        identity,
        (secondAwakeningCopiesByIdentity.get(identity) ?? 0) + copies,
      );
    }

    if (record.level === null || record.level < 40) continue;
    const knownIdentity = canonical.known ? canonical.identityId : undefined;
    if (knownIdentity) level40Identities.add(knownIdentity);
    level40CopiesByIdentity.set(identity, (level40CopiesByIdentity.get(identity) ?? 0) + copies);
    if (awakeningTier === 3) {
      level40SecondAwakeningCopiesByIdentity.set(
        identity,
        (level40SecondAwakeningCopiesByIdentity.get(identity) ?? 0) + copies,
      );
    }
    const familyId = canonical.skillFamilyId;
    if (familyId === undefined) continue;
    const state = level40Families.get(familyId) ?? { allMaxSkilled: true };
    state.allMaxSkilled &&= record.maxSkilled;
    level40Families.set(familyId, state);
    if (!record.maxSkilled) {
      const tiers = unskilledLevel40FamilyTiers.get(familyId) ?? new Set<number | undefined>();
      tiers.add(canonical.awakeningTier);
      unskilledLevel40FamilyTiers.set(familyId, tiers);
    }
  }

  return {
    matches(masterId, requirements) {
      const canonical = monsterIdentity(masterId);
      const identity = canonical.known ? canonical.identityId : undefined;
      const familyId = canonical.skillFamilyId;
      const candidateIdentity = canonical.identityId;
      const candidateTier = canonical.awakeningTier;
      const fodderTiers = familyId === undefined ? undefined : unskilledLevel40FamilyTiers.get(familyId);
      const candidateCopies = candidateTier === 3
        ? secondAwakeningCopiesByIdentity.get(candidateIdentity) ?? 0
        : copiesByIdentity.get(candidateIdentity) ?? 0;
      const level40Copies = candidateTier === 3
        ? level40SecondAwakeningCopiesByIdentity.get(candidateIdentity) ?? 0
        : level40CopiesByIdentity.get(candidateIdentity) ?? 0;
      /* The row being tested must not count as the "already have a Lv. 40"
         copy. A lower-level row can use one level-40 copy of the same monster
         line as evidence, while a level-40 row needs another level-40 copy;
         the separate-copy condition still applies to both. */
      const alreadyHaveAnotherLevel40 = requirements.candidateLevel !== null && requirements.candidateLevel >= 40
        ? level40Copies > 1
        : level40Copies > 0;
      const safeSpecificMonster = alreadyHaveAnotherLevel40
        || candidateCopies > 1;
      const hasNonSecondAwakeningTarget = fodderTiers !== undefined
        && [...fodderTiers].some((tier) => tier !== 3);
      const hasSecondAwakeningTarget = fodderTiers?.has(3) === true;
      const suitableForUnskilledTarget = hasNonSecondAwakeningTarget
        || (hasSecondAwakeningTarget && candidateTier === 3);
      return (!requirements.alreadyHaveLevel40 || (identity !== undefined && level40Identities.has(identity)))
        && (!requirements.familyFullySkilled || (familyId !== undefined && level40Families.get(familyId)?.allMaxSkilled === true))
        /* A 2A target can only take another 2A family member as skill-up. A
           non-2A target keeps the game's broader family rule and can take any
           awakening stage. The second gate protects the only copy of a
           monster line unless the account already has it at Lv. 40. */
        && (!requirements.fodderMon || (suitableForUnskilledTarget && safeSpecificMonster));
    },
  };
}
