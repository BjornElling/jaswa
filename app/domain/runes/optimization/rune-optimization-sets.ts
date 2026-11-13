/* The set rules every stage of the search shares: what a finished build must hold
   and how far a partial one may still get (`RUNE-OPTIMIZATION.md` §6.3). Kept apart
   from the problem's preparation so the shortlist and the search can read them
   without depending on the module that calls them. */
import { intangibleSetId, setIdBound } from '../../combat/monster-stats';
import type { BuildRequirement } from './rune-optimization-problem';

/**
 * Whether a finished set count holds one of the stated builds (§6.3). A build names
 * the sets it must hold and leaves the rest free, so more runes of a named set — a
 * second Will set beside `Will/Swift` — are free slots spent on it, not a mismatch.
 */
export function satisfiesBuild(build: BuildRequirement, counts: ArrayLike<number>, completes: number): boolean {
  for (const need of build.needs) {
    if (counts[need.setId] + (completes === need.setId ? 1 : 0) < need.pieces) return false;
  }
  return true;
}

/**
 * Whether a partly filled build can still become this one with `6 - placed` slots
 * left — the search's set pruning. It is allowed to be optimistic, never pessimistic:
 * the finished build is checked exactly by `satisfiesBuild`.
 */
export function canStillSatisfy(build: BuildRequirement, counts: ArrayLike<number>, placed: number, remaining?: ArrayLike<number>): boolean {
  let missing = 0;
  for (const need of build.needs) {
    const shortfall = Math.max(0, need.pieces - counts[need.setId]);
    if (remaining && shortfall > remaining[need.setId]
      && shortfall > remaining[need.setId] + Math.min(1, counts[intangibleSetId] + remaining[intangibleSetId])) return false;
    missing += shortfall;
  }
  return missing - Math.min(1, counts[intangibleSetId]) <= 6 - placed;
}

/**
 * Whether every rune of a finished build belongs to a completed set — what *Allow
 * broken sets* turned off asks. An Intangible counts only where it completes a set.
 */
export function noBrokenSets(counts: ArrayLike<number>, completes: number, setPieces: Int32Array): boolean {
  if (counts[intangibleSetId] > 0 && completes < 0) return false;
  for (let setId = 1; setId < setPieces.length; setId += 1) {
    if (setId === intangibleSetId) continue;
    const engraved = counts[setId] + (completes === setId ? 1 : 0);
    if (engraved > 0 && (setPieces[setId] === 0 || engraved % setPieces[setId] !== 0)) return false;
  }
  return true;
}

/**
 * Whether the open slots can still finish every set started so far — the pruning
 * for `noBrokenSets`, optimistic in the same way `canStillSatisfy` is.
 */
export function canStillFinishSets(counts: ArrayLike<number>, placed: number, setPieces: Int32Array, remaining?: ArrayLike<number>): boolean {
  let missing = 0;
  for (let setId = 1; setId < setPieces.length; setId += 1) {
    const engraved = counts[setId];
    if (engraved === 0 || setPieces[setId] === 0) continue;
    const shortfall = (setPieces[setId] - (engraved % setPieces[setId])) % setPieces[setId];
    if (remaining && shortfall > remaining[setId]
      && shortfall > remaining[setId] + Math.min(1, counts[intangibleSetId] + remaining[intangibleSetId])) return false;
    missing += shortfall;
  }
  return missing - Math.min(1, counts[intangibleSetId]) <= 6 - placed;
}

/** Each open slot can promise a set once; shared slots and the wildcard stay optimistic. */
export function remainingSetSupport(slots: readonly (readonly { setId: number }[])[], order: readonly number[]): Int32Array[] {
  const support = Array.from({ length: order.length + 1 }, () => new Int32Array(setIdBound));
  for (let depth = order.length - 1; depth >= 0; depth -= 1) {
    support[depth].set(support[depth + 1]);
    for (const setId of new Set(slots[order[depth]].map((candidate) => candidate.setId))) support[depth][setId] += 1;
  }
  return support;
}
