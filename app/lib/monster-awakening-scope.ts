import {
  monsterAwakeningLineageId, monsterAwakeningTier,
} from './monster-catalog';
import type { MonsterAwakeningTier } from './monster-catalog';

/**
 * "This monster, or a more awakened form of it."
 *
 * A monster's awakening is a one-way step: Poison Master becomes Kyle, and Kyle
 * is still the same monster with the same place in an account. Several questions
 * the app asks are therefore about a *floor* rather than an exact form — the
 * ones phrased "…of this mon", where a more awakened copy is a better answer
 * than none and a less awakened one is not an answer at all.
 *
 * Searching is the first of them (`ARTIFACT-CANONICAL.md` §17.15): typing
 * `poison master` is a request to see what became of it, so the awakened Kyle
 * belongs in the results; typing `kyle` names a form the account has already
 * reached, so the unawakened Poison Master does not.
 *
 * Direction is what makes this different from `monsterIdentityId` in
 * `monster-selection.ts`. That folds a whole lineage into one identity, which is
 * right for counting copies — three awakening stages are three copies of one
 * monster. Here the stages stay distinct and ordered, because the question is
 * which of them is far enough along.
 *
 * Scope is one element's chain, not the family. `monsterAwakeningLineageId`
 * keeps the element digit, so Kyle (Water) never satisfies a question asked
 * about Todd (Fire): they are separate monsters that merely awaken alike, and
 * element decides which artifacts a monster may even wear.
 */

/** One monster's place in its own awakening chain. */
export type MonsterAwakeningPosition = {
  /** Names the chain: every form of this monster in this element shares it. */
  lineageId: string;
  tier: MonsterAwakeningTier;
};

/**
 * Where this master id sits in its awakening chain, or `undefined` for an id the
 * game does not awaken through — a material, a fusion piece, or anything whose
 * penultimate digit is not an awakening step. Such an id has no "higher form",
 * so callers treat it as matching only itself rather than guessing a chain.
 */
export function monsterAwakeningPosition(masterId: unknown): MonsterAwakeningPosition | undefined {
  const tier = monsterAwakeningTier(masterId);
  if (tier === undefined) return undefined;
  return { lineageId: monsterAwakeningLineageId(masterId), tier };
}

/**
 * Whether `candidate` is `reference` itself or a more awakened form of it.
 *
 * False for a less awakened form, and false across two different monsters —
 * including two elements of one family, and including an id the catalogue does
 * not awaken through, which matches only itself.
 */
export function isSameOrHigherAwakening(candidate: unknown, reference: unknown): boolean {
  const referencePosition = monsterAwakeningPosition(reference);
  const candidatePosition = monsterAwakeningPosition(candidate);
  /* Outside the awakening scheme there is no chain to walk, so identity is the
     only honest answer. Compared as strings because a master id arrives from the
     export as either a number or a string. */
  if (!referencePosition || !candidatePosition) {
    return String(candidate ?? '') === String(reference ?? '');
  }
  return candidatePosition.lineageId === referencePosition.lineageId
    && candidatePosition.tier >= referencePosition.tier;
}

/**
 * Widen a set of master ids to include every same-or-higher awakening of each,
 * drawn from `available` — the ids actually present in whatever the caller is
 * looking at, so nothing is invented that the account does not hold.
 *
 * Returns the ids to accept, the seeds included. Given a search's own name
 * matches as `seeds`, this is the full result set that search should show.
 */
export function withHigherAwakenings(
  seeds: Iterable<unknown>,
  available: Iterable<unknown>,
): Set<string> {
  /* The lowest tier per lineage is the floor to compare against: if a search
     matched both Poison Master and Kyle by name, the floor is Poison Master, so
     Kyle is kept for matching its own name and for standing above the floor
     alike. Taking the highest instead would let one matched 2A exclude the
     awakened form the same search had already found by name. */
  const floorByLineage = new Map<string, MonsterAwakeningTier>();
  const accepted = new Set<string>();
  for (const seed of seeds) {
    accepted.add(String(seed ?? ''));
    const position = monsterAwakeningPosition(seed);
    if (!position) continue;
    const floor = floorByLineage.get(position.lineageId);
    if (floor === undefined || position.tier < floor) floorByLineage.set(position.lineageId, position.tier);
  }

  for (const candidate of available) {
    const position = monsterAwakeningPosition(candidate);
    if (!position) continue;
    const floor = floorByLineage.get(position.lineageId);
    if (floor !== undefined && position.tier >= floor) accepted.add(String(candidate ?? ''));
  }
  return accepted;
}
