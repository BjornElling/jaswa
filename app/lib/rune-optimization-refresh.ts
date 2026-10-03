/**
 * **A found build, read again against the account as it is now.**
 *
 * The table is an answer about six runes and the work they need. A player reading it
 * goes and does that work — moves a rune, puts a Gem on, grinds a line — and a live
 * sync brings the change back while the table is still open. Throwing the answer away
 * then would punish following it, so a build is kept and re-read instead:
 *
 * - a rune is shown and counted as it now is;
 * - a Gem or a Grindstone the build planned and the player has since applied counts
 *   as done, at whatever the game actually rolled, and stops being listed as work;
 * - one not applied yet is still counted at the value the search assumed;
 * - where the rune now sits decides whether it still has to move;
 * - the figures are summed again by `buildFigures`, the search's own arithmetic.
 *
 * "Applied" is read against the rune as it stood when the search ran, because the
 * end state alone cannot tell a Gem the player put on from a line that was already
 * there: a re-roll keeps its property, and only the change says it happened.
 *
 * What this cannot do is notice a *better* build that the change made possible.
 * The search did not see the new runes, so the page says the table can be searched
 * again; it does not pretend the old table is still the best one.
 */
import type { OptimizedBuild, PickedRune } from './compute/rune-optimization-protocol';
import type { GameRecord } from './game-data';
import type { EndStateLine } from './rune-craft-end-state';
import { buildFigures } from './rune-optimization-problem';
import type { Rune } from './runes';

/** A build as the page shows it: figures `null` where one of its runes has left the account. */
export type CurrentBuild = Omit<OptimizedBuild, 'figures'> & { figures: number[] | null };

const sameLine = (left: EndStateLine | undefined, right: EndStateLine | undefined) => left !== undefined && right !== undefined
  && left.statId === right.statId && left.value === right.value && left.gemmed === right.gemmed && left.grind === right.grind;

function sameRune(left: Rune, right: Rune): boolean {
  return left.mainValue === right.mainValue && left.occupiedId === right.occupiedId
    && left.subProperties.length === right.subProperties.length
    && left.subProperties.every((line, at) => sameLine(line, right.subProperties[at]));
}

/** One picked rune, re-read against what it has become since `before`. */
export function currentPick(picked: PickedRune, before: Rune, now: Rune, unitId: string): PickedRune {
  if (now === before || sameRune(before, now)) return picked;
  const lines: EndStateLine[] = now.subProperties.map((line) => ({ ...line }));

  let gemmedAt = -1;
  const at = picked.gemmedAt;
  if (at >= 0 && lines[at] && picked.lines[at]) {
    const was = before.subProperties[at];
    const is = now.subProperties[at];
    /* The line is untouched since the search, so the Gem is still to come. */
    if (was && was.statId === is.statId && was.value === is.value && was.gemmed === is.gemmed) {
      const planned = picked.lines[at];
      lines[at] = { statId: planned.statId, value: planned.value, gemmed: true, grind: planned.statId === is.statId ? is.grind : 0 };
      gemmedAt = at;
    }
  }

  const groundAt: number[] = [];
  for (const line of picked.groundAt) {
    const planned = picked.lines[line];
    const is = now.subProperties[line];
    if (!planned || !is || !lines[line] || lines[line].statId !== planned.statId) continue;
    const was = before.subProperties[line];
    /* A stone counts as applied where the line now carries a different one than the
       search saw on the same property — or, on a line a Gem has since turned into
       this property, any stone at all. */
    const applied = is.statId === planned.statId
      && (was?.statId === is.statId ? is.grind !== was.grind : is.grind > 0);
    if (applied || !(planned.grind > lines[line].grind)) continue;
    lines[line] = { ...lines[line], grind: planned.grind };
    groundAt.push(line);
  }

  /* A main counted at +15 stays counted there until the rune gets there itself. */
  const mainValue = picked.mainValue > before.mainValue ? Math.max(now.mainValue, picked.mainValue) : now.mainValue;
  const moves = !picked.locked && now.occupiedId !== unitId;
  return { ...picked, mainValue, lines, gemmedAt, groundAt, moves };
}

/**
 * Every build of an answer, re-read against `now` and the copy's record as it is now.
 * `before` is the runes the search read. With nothing synced since, the builds are
 * returned as found, so an untouched table keeps the search's own figures; after a
 * sync every build is counted again, since an artifact can change as well as a rune.
 */
export function currentBuilds(
  builds: readonly OptimizedBuild[], before: ReadonlyMap<string, Rune>, now: ReadonlyMap<string, Rune>,
  monster: GameRecord, unitId: string,
): CurrentBuild[] {
  if (now === before) return [...builds];
  return builds.map((build) => {
    const pieces: Array<{ picked: PickedRune; rune: Rune }> = [];
    for (const picked of build.runes) {
      const was = before.get(picked.runeId);
      const is = now.get(picked.runeId);
      if (!was || !is) return { ...build, figures: null };
      pieces.push({ picked: currentPick(picked, was, is, unitId), rune: is });
    }
    const runes = pieces.map((piece) => piece.picked);
    return {
      ...build,
      runes,
      moves: runes.filter((picked) => picked.moves).length,
      figures: buildFigures(monster, pieces.map(({ picked, rune }) => ({ rune, mainValue: picked.mainValue, lines: picked.lines }))),
    };
  });
}
