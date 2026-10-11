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
 * where it is, it is excluded from this monster, another rune is locked into its slot on this monster, it now sits on
 * a monster whose runes the settings or the priority list keep, or the Gems and Grindstones still to come
 * need more of an item than the account holds. The row keeps its place, so the player
 * does not lose the one they were reading.
 *
 * The question is read the same way: a build is held to the requirements and settings
 * on screen, not those it was searched under. A choice that narrows the question —
 * broken sets refused, Intangible runes refused, a slot main or build taken away,
 * another monster's runes kept, a Gem or Grindstone the settings no longer offer —
 * names what the build now breaks; an unfinished main no longer projected is counted
 * as it stands.
 *
 * What this cannot do is notice a *better* build that the change made possible.
 * The search did not see the new runes, so the page says the table can be searched
 * again; it does not pretend the old table is still the best one.
 */
import type { OptimizedBuild, PickedRune } from './compute/rune-optimization-protocol';
import type { GameRecord } from './game-data';
import { intangibleSetId, targetFigureKeys } from './monster-stats';
import type { CraftSupply, EndStateLine } from './rune-craft-end-state';
import type { CraftItem } from './rune-craft-items';
import type { RuneLock } from './rune-locks';
import {
  buildFigures, countedMainValue, craftSupplies, figureIndex, mayTakeFrom, setRuleMissed, slotMainAllowed,
  targetCeilings, targetFloors,
} from './rune-optimization-problem';
import type { CraftSettings, RankFigure, RuneOptimizationRequirements } from './rune-optimization-problem';
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
  /** Excluded from this monster's builds since the search. */
  | { kind: 'excluded' }
  /** Engraved on another monster, whose runes the settings or the priority list keep. */
  | { kind: 'engraved-elsewhere'; engravedOn: string }
  /** A Gem or Grindstone still to come needs more of a held item than the account has left. */
  | { kind: 'items' }
  | { kind: 'slot-filled' }
  | { kind: 'changes-limit'; maximum: number }
  /** An Intangible rune, and the requirements no longer allow one. */
  | { kind: 'intangible' }
  /** Its main property is not among the slot mains the requirements allow. */
  | { kind: 'slot-main' }
  /** The Gem or Grindstone still to come is one the settings no longer offer. */
  | { kind: 'craft'; item: 'gem' | 'grindstone' };

export type CurrentPick = PickedRune & { issue: PickIssue | null };

/**
 * A build as the page shows it: figures `null` where one of its runes has left the
 * account, the issue per rune, the set rule its six runes break, the targets its
 * figures no longer reach and the ceilings they have since passed.
 */
export type CurrentBuild = Omit<OptimizedBuild, 'figures' | 'runes'> & {
  runes: CurrentPick[];
  figures: number[] | null;
  sets: 'broken' | 'build' | null;
  short: RankFigure[];
  over: RankFigure[];
};

/** Whether a build can still be followed as it stands. */
export const buildFollowable = (build: CurrentBuild): boolean => build.sets === null && build.runes.every((picked) => picked.issue === null);

/**
 * What a calculation was and what the account is now, for one re-reading. The
 * requirements, settings and spared copies are the ones **on screen**: a choice that
 * narrows the question after the search dims every build it now rules out, and one
 * that widens it rules nothing back in that the search never saw.
 */
export type RefreshContext = {
  unitId: string;
  /** The copy's record as it is now: its artifacts and relic are counted with its runes. */
  monster: GameRecord;
  requirements: Pick<RuneOptimizationRequirements, 'targets' | 'ceilings' | 'alwaysCrits' | 'alwaysElementAdvantage' | 'leads'
    | 'builds' | 'slotMains' | 'allowBroken' | 'allowIntangible'>;
  settings: Pick<RuneOptimizationSettings, 'runesOnOtherMonsters' | 'fillEmptySlotsOnly' | 'limitChanges' | 'maxChanges'
    | 'unfinishedAtMaximum' | 'oddSlotsAtTwelve'> & CraftSettings;
  /** The copies whose runes may not be taken, as `RuneOptimizationInput.spared`. */
  spared: readonly string[];
  /** The runes and held items the search read. */
  before: { runes: ReadonlyMap<string, Rune>; items: ReadonlyMap<string, CraftItem> };
  /** `locks` as the search reads them (`RuneOptimizationInput.locks`). */
  now: { runes: ReadonlyMap<string, Rune>; items: ReadonlyMap<string, CraftItem>; locks: Readonly<Record<string, RuneLock>> };
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

/**
 * Which item still to come on one rune the settings no longer offer, if any. An item
 * is still offered where the settings give one of the same property reaching the
 * planned value — out of the same held stack, where the plan named one — so a
 * setting that only widens the choice never dims a build.
 */
function refusedCraft(
  picked: PickedRune, spends: readonly string[], supply: CraftSupply, offered: readonly CraftItem[],
  items: ReadonlyMap<string, CraftItem>,
): 'gem' | 'grindstone' | null {
  const heldId = (choice: { stock: number }) => offered[choice.stock]?.id;
  const gemLine = picked.gemmedAt >= 0 ? picked.lines[picked.gemmedAt] : undefined;
  if (gemLine) {
    const planned = spends.find((id) => items.get(id)?.kind === 'gem');
    const choices = supply.gem?.choices[gemLine.statId] ?? [];
    if (!choices.some((choice) => choice.value >= gemLine.value && (choice.stock < 0 || heldId(choice) === planned))) return 'gem';
  }
  for (const at of picked.groundAt) {
    const line = picked.lines[at];
    if (!line) continue;
    const stones = spends.filter((id) => items.get(id)?.kind === 'grindstone' && items.get(id)?.statId === line.statId);
    const choices = supply.grind?.choices[line.statId] ?? [];
    if (!choices.some((choice) => choice.value >= line.grind && (choice.stock < 0 || stones.includes(heldId(choice) ?? '')))) return 'grindstone';
  }
  return null;
}

function readBuild(build: OptimizedBuild, context: RefreshContext, lockedSlots: ReadonlyMap<number, string>,
  supplyOf: (rune: Rune) => CraftSupply, offered: readonly CraftItem[]): CurrentBuild {
  const { unitId, now, before, requirements, settings } = context;
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
    const locked = now.locks[found.runeId] === 'locked';
    const lockedHere = locked && is.occupiedId === unitId;
    let picked = currentPick(found, was, is, unitId, lockedHere);
    /* A projected main counts only while the settings still project it; one they
       would now project higher is not raised, as the search never counted it. */
    const mainValue = lockedHere ? picked.mainValue : Math.min(picked.mainValue, countedMainValue(settings, is));
    if (mainValue !== picked.mainValue) picked = { ...picked, mainValue };
    if (picked !== found) changed = true;
    const spends = stillSpends(found, picked, before.items);

    let issue: PickIssue | null = null;
    const taken = lockedSlots.get(picked.slot);
    const engraved = settings.fillEmptySlotsOnly
      ? [...now.runes.values()].find((rune) => rune.slot === picked.slot && rune.occupiedId === unitId) : undefined;
    /* A rune locked here, or the one an empty-slots-only search must keep, is its
       slot's answer whatever the filters say, as the search reads it (`admission`). */
    const held = lockedHere || engraved?.id === picked.runeId;
    if (locked && !lockedHere) issue = { kind: 'locked-away', engravedOn: is.occupiedId };
    else if (now.locks[found.runeId] === 'excluded') issue = { kind: 'excluded' };
    else if (taken !== undefined && taken !== found.runeId) issue = { kind: 'slot-taken', runeId: taken };
    else if (is.occupiedId !== null && is.occupiedId !== unitId && !mayTakeFrom(context, is.occupiedId)) {
      issue = { kind: 'engraved-elsewhere', engravedOn: is.occupiedId };
    } else if (engraved && !held) issue = { kind: 'slot-filled' };
    else if (!held && is.setId === intangibleSetId && !requirements.allowIntangible) issue = { kind: 'intangible' };
    else if (!held && !slotMainAllowed(requirements, is)) issue = { kind: 'slot-main' };
    else {
      const item = refusedCraft(picked, spends, supplyOf(was), offered, before.items);
      if (item !== null) issue = { kind: 'craft', item };
    }
    picks.push({ ...picked, issue });
    pieces.push({ rune: is, mainValue: picked.mainValue, lines: picked.lines });

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
  const sets = setRuleMissed(requirements, picks.map((picked) => picked.setId));
  if (gone) return { ...build, runes: picks, moves, figures: null, sets, short: [], over: [] };
  /* Untouched since the search: its own figures, exactly. After a sync every build is
     counted again, since gear can change as well as a rune. A range is judged on
     the figure the table shows beside it. */
  const figures = changed ? buildFigures(context.monster, pieces, context.requirements) : build.figures;
  const floors = targetFloors(context.requirements);
  const judged = (key: RankFigure) => figures[figureIndex(key)];
  const missed = targetFigureKeys.filter((key) => judged(key) < floors[figureIndex(key)]);
  const ceilings = targetCeilings(context.requirements);
  const past = targetFigureKeys.filter((key) => judged(key) > ceilings[figureIndex(key)]);
  return { ...build, runes: picks, moves, figures, sets, short: missed, over: past };
}

/**
 * Every build of an answer, re-read against the account, the holds and the held
 * items as they are now. With nothing changed since, each build keeps the search's
 * own figures.
 */
export function currentBuilds(builds: readonly OptimizedBuild[], context: RefreshContext): CurrentBuild[] {
  /* The slots a lock on this monster has already filled. */
  const lockedSlots = new Map<number, string>();
  for (const [runeId, lock] of Object.entries(context.now.locks)) {
    const rune = lock === 'locked' ? context.now.runes.get(runeId) : undefined;
    if (rune && rune.occupiedId === context.unitId) lockedSlots.set(rune.slot, runeId);
  }
  /* The held items as the search read them: whether one is still in stock is the
     item check's question, not the settings'. */
  const offered = [...context.before.items.values()];
  const supplyOf = craftSupplies(context.settings, offered);
  return builds.map((build) => readBuild(build, context, lockedSlots, supplyOf, offered));
}
