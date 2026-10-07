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
 * - one not applied yet is still counted at the value the search assumed — unless it
 *   can no longer be applied: a rune that took a Gem on another line cannot take a
 *   second, and a rune locked to this monster is used as engraved, as the search uses it;
 * - where the rune now sits decides whether it still has to move;
 * - the figures are summed again by `buildFigures`, the search's own arithmetic, and
 *   a target the new figures no longer reach is named.
 *
 * "Applied" is read against the rune as it stood when the search ran, because the
 * end state alone cannot tell a Gem the player put on from a line that was already
 * there: a re-roll keeps its property, and only the change says it happened.
 *
 * Some changes leave a build that cannot be followed at all, and the build says so
 * rune by rune rather than leaving the table: the rune was sold or fed, it is locked
 * where it is, another rune is locked into its slot on this monster, it now sits on
 * a monster whose runes the settings or the priority list keep, or the Gems and Grindstones still to come
 * need more of an item than the account holds. The row keeps its place, so the player
 * does not lose the one they were reading.
 *
 * What this cannot do is notice a *better* build that the change made possible.
 * The search did not see the new runes, so the page says the table can be searched
 * again; it does not pretend the old table is still the best one.
 */
import type { OptimizedBuild, PickedRune } from './compute/rune-optimization-protocol';
import type { GameRecord } from './game-data';
import { criticalRateLift, targetFigureKeys } from './monster-stats';
import type { EndStateLine } from './rune-craft-end-state';
import type { CraftItem } from './rune-craft-items';
import type { RuneHolds } from './rune-holds';
import { buildFigures, figureIndex, mayTakeFrom, targetCeilings, targetFloors } from './rune-optimization-problem';
import type { RankFigure, RuneOptimizationRequirements } from './rune-optimization-problem';
import type { RuneOptimizationSettings } from './rune-optimization-settings';
import type { Rune } from './runes';

/** Why one rune of a build cannot be used as the build uses it. */
export type PickIssue =
  /** No longer in the account: sold, or fed to another rune. */
  | { kind: 'gone' }
  /** Locked where it is, which is not this monster. `engravedOn` is `null` for the inventory. */
  | { kind: 'locked-away'; engravedOn: string | null }
  /** Another rune is locked into this slot on this monster. */
  | { kind: 'slot-taken'; runeId: string }
  /** Engraved on another monster, whose runes the settings or the priority list keep. */
  | { kind: 'engraved-elsewhere'; engravedOn: string }
  /** A Gem or Grindstone still to come needs more of a held item than the account has left. */
  | { kind: 'items' }
  | { kind: 'slot-filled' }
  | { kind: 'changes-limit'; maximum: number };

export type CurrentPick = PickedRune & { issue: PickIssue | null };

/**
 * A build as the page shows it: figures `null` where one of its runes has left the
 * account, the issue per rune, the targets its figures no longer reach and the
 * ceilings they have since passed.
 */
export type CurrentBuild = Omit<OptimizedBuild, 'figures' | 'counted' | 'runes'> & {
  runes: CurrentPick[];
  figures: number[] | null;
  counted: number[] | null;
  short: RankFigure[];
  over: RankFigure[];
};

/** Whether a build can still be followed as it stands. */
export const buildFollowable = (build: CurrentBuild): boolean => build.runes.every((picked) => picked.issue === null);

/** What a calculation was and what the account is now, for one re-reading. */
export type RefreshContext = {
  unitId: string;
  /** The copy's record as it is now: its artifacts and relic are counted with its runes. */
  monster: GameRecord;
  requirements: Pick<RuneOptimizationRequirements, 'targets' | 'ceilings' | 'alwaysCrits' | 'alwaysElementAdvantage' | 'leads'>;
  settings: Pick<RuneOptimizationSettings, 'runesOnOtherMonsters' | 'fillEmptySlotsOnly' | 'limitChanges' | 'maxChanges'>;
  /** The copies whose runes the search was not allowed to take, as `RuneOptimizationInput.spared`. */
  spared: readonly string[];
  /** The runes and held items the search read. */
  before: { runes: ReadonlyMap<string, Rune>; items: ReadonlyMap<string, CraftItem> };
  now: { runes: ReadonlyMap<string, Rune>; items: ReadonlyMap<string, CraftItem>; holds: RuneHolds };
};

const sameLine = (left: EndStateLine | undefined, right: EndStateLine | undefined) => left !== undefined && right !== undefined
  && left.statId === right.statId && left.value === right.value && left.gemmed === right.gemmed && left.grind === right.grind;

function sameRune(left: Rune, right: Rune): boolean {
  return left.mainValue === right.mainValue && left.occupiedId === right.occupiedId && left.setId === right.setId
    && left.subProperties.length === right.subProperties.length
    && left.subProperties.every((line, at) => sameLine(line, right.subProperties[at]));
}

/**
 * One picked rune, re-read against what it has become since `before`. `lockedHere`
 * is whether it is now locked on this monster: the search counts such a rune as
 * engraved, with nothing spent on it, and so does the re-reading.
 */
export function currentPick(picked: PickedRune, before: Rune, now: Rune, unitId: string, lockedHere = picked.locked): PickedRune {
  if (lockedHere) {
    if (picked.locked && (now === before || sameRune(before, now))) return picked;
    return {
      ...picked, setId: now.setId, mainValue: now.mainValue, lines: now.subProperties.map((line) => ({ ...line })),
      gemmedAt: -1, groundAt: [], moves: false, locked: true,
    };
  }
  if (!picked.locked && (now === before || sameRune(before, now))) return picked;
  const lines: EndStateLine[] = now.subProperties.map((line) => ({ ...line }));

  let gemmedAt = -1;
  const at = picked.gemmedAt;
  if (at >= 0 && lines[at] && picked.lines[at]) {
    const was = before.subProperties[at];
    const is = now.subProperties[at];
    /* The line is untouched since the search, so the Gem is still to come — unless
       the rune took a Gem on another line meanwhile, and a rune holds one. */
    const gemmedElsewhere = now.subProperties.some((line, index) => index !== at && line.gemmed);
    if (was && was.statId === is.statId && was.value === is.value && was.gemmed === is.gemmed && !gemmedElsewhere) {
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

  /* A projected main stays counted at its planned level until the rune gets there itself. */
  const mainValue = picked.mainValue > before.mainValue ? Math.max(now.mainValue, picked.mainValue) : now.mainValue;
  const moves = now.occupiedId !== unitId;
  return { ...picked, setId: now.setId, mainValue, lines, gemmedAt, groundAt, moves, locked: false };
}

/**
 * The held items the work still to come on one rune spends: the Gem's while a Gem
 * is still planned, and a Grindstone of each stone still planned. The search named
 * the stacks; which of them are still needed is read off what is left to do.
 */
function stillSpends(found: PickedRune, current: PickedRune, items: ReadonlyMap<string, CraftItem>): string[] {
  const stones = current.groundAt.map((at) => current.lines[at]?.statId);
  const needed: string[] = [];
  for (const id of found.spends) {
    const item = items.get(id);
    if (!item) continue;
    if (item.kind === 'gem') {
      if (current.gemmedAt >= 0) needed.push(id);
      continue;
    }
    const at = stones.indexOf(item.statId);
    if (at === -1) continue;
    stones.splice(at, 1);
    needed.push(id);
  }
  return needed;
}

function readBuild(build: OptimizedBuild, context: RefreshContext, lockedSlots: ReadonlyMap<number, string>): CurrentBuild {
  const { unitId, now, before } = context;
  const changedAccount = now.runes !== before.runes;
  let changed = changedAccount;
  const picks: CurrentPick[] = [];
  const pieces: Array<{ rune: Rune; mainValue: number; lines: readonly EndStateLine[] }> = [];
  const spending = new Map<string, number>();
  const spendsBySlot = new Map<number, string[]>();
  let gone = false;

  for (const found of build.runes) {
    const was = before.runes.get(found.runeId);
    const is = now.runes.get(found.runeId);
    if (!was || !is) {
      gone = true;
      picks.push({ ...found, issue: { kind: 'gone' } });
      continue;
    }
    const locked = now.holds[found.runeId]?.locked === true;
    const lockedHere = locked && is.occupiedId === unitId;
    const picked = currentPick(found, was, is, unitId, lockedHere);
    if (picked !== found) changed = true;

    let issue: PickIssue | null = null;
    const taken = lockedSlots.get(picked.slot);
    if (locked && !lockedHere) issue = { kind: 'locked-away', engravedOn: is.occupiedId };
    else if (taken !== undefined && taken !== found.runeId) issue = { kind: 'slot-taken', runeId: taken };
    else if (is.occupiedId !== null && is.occupiedId !== unitId && !mayTakeFrom(context, is.occupiedId)) {
      issue = { kind: 'engraved-elsewhere', engravedOn: is.occupiedId };
    }
    if (issue === null && context.settings.fillEmptySlotsOnly) {
      const engraved = [...now.runes.values()].find((rune) => rune.slot === picked.slot && rune.occupiedId === unitId);
      if (engraved && engraved.id !== picked.runeId) issue = { kind: 'slot-filled' };
    }
    picks.push({ ...picked, issue });
    pieces.push({ rune: is, mainValue: picked.mainValue, lines: picked.lines });

    const spends = stillSpends(found, picked, before.items);
    spendsBySlot.set(picked.slot, spends);
    for (const id of spends) spending.set(id, (spending.get(id) ?? 0) + 1);
  }

  /* Items are counted over the whole build, since two of its runes can draw on one stack. */
  const short = new Set([...spending].filter(([id, count]) => (now.items.get(id)?.amount ?? 0) < count).map(([id]) => id));
  if (short.size > 0) {
    for (let at = 0; at < picks.length; at += 1) {
      if (picks[at].issue === null && (spendsBySlot.get(picks[at].slot) ?? []).some((id) => short.has(id))) {
        picks[at] = { ...picks[at], issue: { kind: 'items' } };
      }
    }
  }

  const moves = picks.filter((picked) => picked.moves).length;
  if (context.settings.limitChanges && context.settings.maxChanges !== undefined && moves > context.settings.maxChanges) {
    for (const picked of picks) if (picked.moves && picked.issue === null) {
      picked.issue = { kind: 'changes-limit', maximum: context.settings.maxChanges };
    }
  }
  if (gone) return { ...build, runes: picks, moves, figures: null, counted: null, short: [], over: [] };
  /* Untouched since the search: its own figures, exactly. After a sync every build is
     counted again, since gear can change as well as a rune. Ranges are judged
     on the figures counted with the leads, never on the ones shown. */
  const { figures, counted } = changed
    ? buildFigures(context.monster, pieces, context.requirements)
    : build;
  const floors = targetFloors(context.requirements);
  const judged = (key: RankFigure) => counted[figureIndex(key)]
    + (key === 'criRate' ? criticalRateLift(context.requirements) : 0);
  const missed = targetFigureKeys.filter((key) => judged(key) < floors[figureIndex(key)]);
  const ceilings = targetCeilings(context.requirements);
  const past = targetFigureKeys.filter((key) => judged(key) > ceilings[figureIndex(key)]);
  return { ...build, runes: picks, moves, figures, counted, short: missed, over: past };
}

/**
 * Every build of an answer, re-read against the account, the holds and the held
 * items as they are now. With nothing changed since, each build keeps the search's
 * own figures.
 */
export function currentBuilds(builds: readonly OptimizedBuild[], context: RefreshContext): CurrentBuild[] {
  /* The slots a lock on this monster has already filled. */
  const lockedSlots = new Map<number, string>();
  for (const [runeId, hold] of Object.entries(context.now.holds)) {
    const rune = hold.locked ? context.now.runes.get(runeId) : undefined;
    if (rune && rune.occupiedId === context.unitId) lockedSlots.set(rune.slot, runeId);
  }
  return builds.map((build) => readBuild(build, context, lockedSlots));
}
