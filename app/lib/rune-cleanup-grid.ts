/**
 * One row of the Rune Clean-up table: what it holds, how it sorts, what a search
 * matches on.
 *
 * It holds no arithmetic. Every figure comes from `rune-cleanup-advice.ts`, which
 * gets it from `rune-cleanup-model.ts`; this only decides how a row is read and
 * ordered, which is why a change of sort can never change a number.
 */
import { ancientSearchWord, withAncientMark } from './ancient-mark';
import { runeDefaultGradeOrder, runeLineText, runeStatName, runeSubValue } from './runes';
import type { Rune } from './runes';
import type { RuneAdvice } from './rune-cleanup-advice';
import { runeVerdictLabels } from './rune-cleanup-advice';
import { filteredRuneVerdict, runeHoldLabels } from './rune-holds';
import type { RuneHoldVerdict, ShownRuneVerdict } from './rune-holds';
import { lastSubPropertyLevel } from './rune-properties';
import type { Engraving } from './presets';

export type RuneCleanupRow = {
  rune: Rune;
  /** Its place in the import, which breaks every tie so a sort is stable. */
  index: number;
  advice: RuneAdvice;
  /**
   * Where the rune is: engraved on a monster in Default or a preset, in
   * inventory when on none, or sold since the calculation. A rune can be
   * engraved in many presets at once (`DECK-PRESETS.md` §1), so the places are
   * listed in `places`; the cell can name its Default monster without changing
   * the location used by filters and sorting.
   */
  location: 'Engraved' | 'Inventory' | 'Sold';
  places: readonly Engraving[];
  /** The places in words — "monster — preset" — so a search finds a rune by where it is. */
  placeText: string;
  /** Sold since the calculation: the row stays, as the rune last was, so the rows around it do not move. */
  gone: boolean;
  /** The user's own word over the advice. Read beside the held result rather than
      into it, so locking a rune changes its row at once without a recalculation. */
  hold: RuneHoldVerdict | null;
};

/** The advice the row prints: the user's hold where there is one, else the engine's verdict. */
export const shownRuneVerdict = (row: RuneCleanupRow): ShownRuneVerdict => row.hold ?? row.advice.verdict;

export const shownRuneVerdictLabel = (row: RuneCleanupRow): string =>
  row.hold ? runeHoldLabels[row.hold] : runeVerdictLabels[row.advice.verdict];

export type RuneCleanupSortKey =
  'set' | 'slot' | 'level' | 'main' | 'innate' | 'subs' | 'location' | 'role' | 'maxValue' | 'chance' | 'advice';

/**
 * The orderings the game's own Manage panel offers, reproduced rather than
 * reinterpreted.
 *
 * They are kept apart from the column keys above because they answer a different
 * question. A column sorts on something the table prints; these three sort the way
 * the game sorts, so a player who has just arranged their box in Summoners War can
 * arrange it the same way here and compare the two lists row for row. That is also
 * why none of them gets a column: the value is the *order*, not a fact worth an
 * eleventh column on an already wide table.
 *
 * Each option is one fixed arrangement rather than a direction to toggle, which
 * is how the game offers them: best, highest or newest first. `gameSortKey`
 * below states each one and the evidence behind it.
 */
export const runeGameSortKeys = ['gameGrade', 'gameLevel', 'gameObtained'] as const;

export type RuneGameSortKey = typeof runeGameSortKeys[number];

/** The game's own wording for each, as the dropdown prints it. */
export const runeGameSortLabels: Readonly<Record<RuneGameSortKey, string>> = {
  gameGrade: 'Grade',
  gameLevel: 'Power-up Lv.',
  gameObtained: 'Obtained',
};

/**
 * Which way a column opens. The two figures the page is for open at their best,
 * because the first question anyone asks a three-thousand-row table is "show me
 * the good ones"; the descriptive columns open alphabetically or lowest-first.
 */
export const defaultRuneCleanupSortDirections: Readonly<Record<RuneCleanupSortKey, boolean>> = {
  set: true, slot: true, level: true, main: true, innate: true, subs: true, location: true,
  role: true, maxValue: false, chance: false, advice: true,
};

/**
 * One row's place in a game ordering, as a tuple compared left to right. The
 * whole ordering is stated as a key rather than as a chain of `||` comparisons
 * so that the rule is legible as the thing being reproduced.
 *
 * **"Grade" in the panel means the rarity, not the star class.** The game's own
 * vocabulary calls the star class the grade (`RUNE-CANONICAL.md` §1), so the
 * heading invites exactly the wrong reading. The current game captures establish
 * that the tile's star class still leads the ordering, while the *colour* of
 * those stars marks `+15` and nothing else.
 *
 * Grade's current working keys, in order:
 *
 * 1. The rune slot, ascending.
 * 2. The star class: six-star runes before five-star ones.
 * 3. The rarity: Legend first, then Hero, Rare, Magic, Normal.
 * 4. Ancient before ordinary.
 * 5. The set, by the export's own `set_id`.
 * 6. The power-up level, highest first.
 * 7. The rune's own id, newest first.
 *
 * The order is intentionally kept as a small tuple: the player is comparing this
 * list against the game's Manage panel, so every newly observed tie-break belongs
 * here rather than being smuggled in through the table's import-order fallback.
 */
function gameSortKey(row: RuneCleanupRow, key: RuneGameSortKey): readonly number[] {
  const rune = row.rune;
  switch (key) {
    case 'gameGrade': return [
      rune.slot,
      -rune.stars,
      -runeDefaultGradeOrder(rune.defaultGrade),
      rune.ancient ? 0 : 1,
      rune.setId,
      -rune.level,
      -rune.obtainedOrder,
    ];
    /* Manage-panel captures put slot 1 +0 before slot 2 +15, and five-star
       +15 before Ancient six-star +12. Within a level, Ancient Rare precedes
       ordinary Legend; ordinary six-star Rare precedes five-star Legend.
       Equal groups follow Obtained, even when their main properties alternate.
       RUNE-CANONICAL.md §11.1 records the comparisons behind this order. */
    case 'gameLevel': return [
      rune.slot,
      -rune.level,
      -rune.stars,
      rune.ancient ? 0 : 1,
      -runeDefaultGradeOrder(rune.defaultGrade),
      rune.setId,
      -rune.obtainedOrder,
    ];
    /* Newest first, and unique per rune, so it needs no tiebreak of its own. */
    case 'gameObtained': return [-rune.obtainedOrder];
    default: return [];
  }
}

/**
 * Two rows in one of the game's own orderings. Ties fall through to the caller's
 * tiebreak exactly as a column comparison does.
 */
export function compareRuneGameSort(
  left: RuneCleanupRow, right: RuneCleanupRow, key: RuneGameSortKey,
): number {
  const leftKey = gameSortKey(left, key);
  const rightKey = gameSortKey(right, key);
  for (let at = 0; at < leftKey.length; at += 1) {
    const ordered = (leftKey[at] ?? 0) - (rightKey[at] ?? 0);
    if (ordered !== 0) return ordered;
  }
  return 0;
}

/** Whether the row prints a Max value: not where no role can use the rune. */
export const runeMaxValueShown = (row: RuneCleanupRow): boolean => row.advice.role !== null;

/**
 * Whether the row prints a Chance. A rune at `+12` has no substat upgrades left and no odds
 * to quote — its chance is a certainty, 1 or 0, which the verdict already states —
 * so it prints a dash, and a dash is not 100 %.
 */
export const runeChanceShown = (row: RuneCleanupRow): boolean =>
  row.advice.role !== null && row.rune.level < lastSubPropertyLevel;

/**
 * The chance as the column prints it: whole percentage points, **rounded down**.
 *
 * Every Power-up policy stop is a whole percentage, and the verdict is the chance
 * compared with it. Rounded to the nearest point, a 79.6 % rune printed `80 %` beside
 * a Sell under Take no chances; rounded down, the printed number clears the stop
 * exactly when the rune does. A real chance under one point says so rather than
 * reading `0 %`, which is kept for a rune that cannot get there at all.
 */
export function runeChanceText(chance: number): string {
  if (chance <= 0) return '0 %';
  const points = Math.floor(chance * 100 + 1e-9);
  return points >= 1 ? `${points} %` : '<1 %';
}

/** The verdicts in the order they rank, so sorting by advice reads as a priority.
    A held rune ranks as the Keep it stands for, then after the engine's own Keeps. */
const verdictRank: Readonly<Record<string, number>> = { 'power-up': 0, keep: 1, sell: 2 };
const holdRank: Readonly<Record<RuneHoldVerdict | 'none', number>> = { none: 0, unsellable: 1, locked: 2 };

function adviceRank(row: RuneCleanupRow): number {
  return (verdictRank[filteredRuneVerdict(shownRuneVerdict(row))] ?? 3) * 3 + holdRank[row.hold ?? 'none'];
}

/**
 * The set as the row names it, in plain text — the sort key, the search index
 * and what a reader would read aloud.
 *
 * An Ancient rune is judged exactly as an ordinary one and shares its set's filter
 * button, but it is not the same item in the hand: it takes Ancient gems and
 * grindstones and no others (`RUNE-CANONICAL.md` §7). Two rows reading `Fatal 4
 * CtD %` where one of them cannot take the grindstone you were about to spend is a
 * row that cannot be acted on, so the distinction stays — as the mark of
 * `ancient-mark.ts` rather than as a word in front of the set, which sorted the
 * Ancient half of every set under A and away from the ordinary half.
 * `craft-item-best-use.tsx` and the gem box name them the same way.
 */
export function runeSetLabel(rune: Rune): string {
  return withAncientMark(rune.setName, rune.ancient);
}

/** The sub properties said in one breath, which is also what a search matches. */
export function runeSubText(rune: Rune): string {
  return rune.subProperties
    .map((property) => runeLineText(property.statId, runeSubValue(property)))
    .join('  ');
}

/** The innate is a stat/value pair too, but unlike a sub property it is optional. */
function runeInnateText(rune: Rune): string {
  return rune.prefixStatId === null ? '' : runeLineText(rune.prefixStatId, rune.prefixValue);
}

export function compareRuneCleanupRows(
  left: RuneCleanupRow, right: RuneCleanupRow, key: RuneCleanupSortKey,
): number {
  switch (key) {
    case 'set': return runeSetLabel(left.rune).localeCompare(runeSetLabel(right.rune));
    case 'slot': return left.rune.slot - right.rune.slot;
    case 'level': return left.rune.level - right.rune.level;
    case 'main': return (runeStatName(left.rune.mainStatId) ?? '').localeCompare(runeStatName(right.rune.mainStatId) ?? '');
    case 'innate': return runeInnateText(left.rune).localeCompare(runeInnateText(right.rune));
    case 'subs': return runeSubText(left.rune).localeCompare(runeSubText(right.rune));
    case 'location': return left.location.localeCompare(right.location) || left.places.length - right.places.length;
    case 'role': return (left.advice.role?.name ?? '').localeCompare(right.advice.role?.name ?? '');
    case 'maxValue': return left.advice.maxValue - right.advice.maxValue;
    case 'chance': return left.advice.chance - right.advice.chance;
    case 'advice': return adviceRank(left) - adviceRank(right);
    default: return 0;
  }
}

/** Everything a search box should match on one row, lower-cased once. */
export function runeCleanupSearchText(row: RuneCleanupRow): string {
  return [
    runeSetLabel(row.rune),
    /* The mark no longer spells the word out, and "ancient" is what a player
       types when they want those rows. */
    row.rune.ancient ? ancientSearchWord : '',
    `slot ${row.rune.slot}`,
    `+${row.rune.level}`,
    runeStatName(row.rune.mainStatId) ?? '',
    runeInnateText(row.rune),
    runeSubText(row.rune),
    row.advice.role?.name ?? '',
    shownRuneVerdictLabel(row),
    row.location,
    row.placeText,
  ].join(' ').toLowerCase();
}
