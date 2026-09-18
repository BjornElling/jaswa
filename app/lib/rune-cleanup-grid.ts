/**
 * One row of the Rune Clean-up table: what it holds, how it sorts, what a search
 * matches on.
 *
 * It holds no arithmetic. Every figure comes from `rune-cleanup-advice.ts`, which
 * gets it from `rune-cleanup-model.ts`; this only decides how a row is read and
 * ordered, which is why a change of sort can never change a number.
 */
import { ancientSearchWord, withAncientMark } from './ancient-mark';
import { runeDefaultGradeOrder, runeStatName, runeSubValue } from './runes';
import type { Rune } from './runes';
import type { RuneAdvice } from './rune-cleanup-advice';
import { runeVerdictLabels } from './rune-cleanup-advice';

export type RuneCleanupRow = {
  rune: Rune;
  /** Its place in the import, which breaks every tie so a sort is stable. */
  index: number;
  advice: RuneAdvice;
  /**
   * Where the rune is: the wearer's name, `Inventory` when nothing wears it, and
   * `null` for a wearer this import does not contain — a gap in the import, which
   * must not read as an empty inventory.
   */
  location: string | null;
};

export type RuneCleanupSortKey =
  'set' | 'slot' | 'main' | 'subs' | 'level' | 'location' | 'preset' | 'maxValue' | 'chance' | 'advice';

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
  set: true, slot: true, main: true, subs: true, level: true, location: true,
  preset: true, maxValue: false, chance: false, advice: true,
};

/**
 * One row's place in a game ordering, as a tuple compared left to right. The
 * whole ordering is stated as a key rather than as a chain of `||` comparisons
 * so that the rule is legible as the thing being reproduced.
 *
 * **"Grade" in the panel means the rarity, not the star class.** The game's own
 * vocabulary calls the star class the grade (`RUNE-CANONICAL.md` §1), so the
 * heading invites exactly the wrong reading, and the tiles do not settle it
 * either — a tile's stars are its star class, while the *colour* of those stars
 * marks `+15` and nothing else, and Ancient is drawn as a white ring around the
 * rune icon rather than on the stars at all.
 *
 * What settles it is that 6★ and 5★ runes **interleave** at the top of a
 * Grade-sorted slot, which no star-class ordering can produce, while the two
 * detail panels read Legend at the top of the list and Rare at the bottom. The
 * `+15 Shield Rune` closing the slot-1 list is itself a 6★ — its `ATK +160` is
 * the six-star figure (§3) — so its position is owed to its rarity and not to
 * its stars.
 *
 * So Grade nests four keys, and nothing else enters it:
 *
 * 1. The rarity, highest first, which clumps all the Legends together.
 * 2. Inside a rarity, the Ancient runes and then the ordinary ones. The
 *    grouping sits *within* the rarity rather than above it — a Legend Ancient
 *    leads a Legend ordinary, and both still lead every Hero.
 * 3. Inside each of those groups, the power-up level from the top.
 * 4. Then the rune's own id, ascending, which is `obtainedOrder` here.
 *
 * The fourth key is what makes the ordering total: three Ancient Legend `+15`
 * runes of one set agree on everything above it, and the game still lists them
 * in one fixed sequence. The set plays no part — it looked briefly as though it
 * did, because an account's leading rows happened to climb through the set ids,
 * but that was the id key showing through.
 *
 * The star class orders nothing at all, under any of the three. That is why 6★
 * and 5★ runes interleave freely down a rarity block, which is also what ruled
 * out reading Grade as the star class in the first place.
 */
function gameSortKey(row: RuneCleanupRow, key: RuneGameSortKey): readonly number[] {
  const rune = row.rune;
  switch (key) {
    /* Rarity descending — Legend, Hero, Rare, Magic, Normal — then the Ancient
       runes of each rarity, then the power-up level, then the rune's own id. */
    case 'gameGrade': return [
      -runeDefaultGradeOrder(rune.defaultGrade), rune.ancient ? 0 : 1,
      -rune.level, rune.obtainedOrder,
    ];
    /* Power-up level descending. */
    case 'gameLevel': return [-rune.level];
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

/** The verdicts in the order they rank, so sorting by advice reads as a priority. */
const verdictRank: Readonly<Record<string, number>> = { 'power-up': 0, keep: 1, sell: 2 };

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
    .map((property) => `${runeStatName(property.statId) ?? '?'} ${runeSubValue(property)}`)
    .join('  ');
}

export function compareRuneCleanupRows(
  left: RuneCleanupRow, right: RuneCleanupRow, key: RuneCleanupSortKey,
): number {
  switch (key) {
    case 'set': return runeSetLabel(left.rune).localeCompare(runeSetLabel(right.rune));
    case 'slot': return left.rune.slot - right.rune.slot;
    case 'main': return (runeStatName(left.rune.mainStatId) ?? '').localeCompare(runeStatName(right.rune.mainStatId) ?? '');
    case 'subs': return runeSubText(left.rune).localeCompare(runeSubText(right.rune));
    case 'level': return left.rune.level - right.rune.level;
    case 'location': return (left.location ?? '').localeCompare(right.location ?? '');
    case 'preset': return (left.advice.preset?.name ?? '').localeCompare(right.advice.preset?.name ?? '');
    case 'maxValue': return left.advice.maxValue - right.advice.maxValue;
    case 'chance': return left.advice.chance - right.advice.chance;
    case 'advice': return (verdictRank[left.advice.verdict] ?? 3) - (verdictRank[right.advice.verdict] ?? 3);
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
    runeSubText(row.rune),
    row.advice.preset?.name ?? '',
    runeVerdictLabels[row.advice.verdict],
    row.location ?? '',
  ].join(' ').toLowerCase();
}
