/**
 * The Rune Clean-up "Sort by" dropdown must reproduce the game's own orderings.
 *
 * The three orderings were not designed here; they were read off the game's
 * Manage panel, and the two facts that cannot be guessed are the ones this
 * pins down. Both concern Ancient runes, which the panel treats as a *group*
 * rather than as a star class:
 *
 *   Grade         ordinary runes by star class descending, then every Ancient
 *                 rune after all of them. The bottom of the slot-1 Grade list
 *                 is a purple-starred `+15 Shield Rune` reading `ATK +160` —
 *                 the six-star figure (`RUNE-CANONICAL.md` §3) — sitting below
 *                 the 5★ runes, so it is a 6★ placed after 5★.
 *   Power-up Lv.  every Ancient rune first, then power-up level descending.
 *                 The Ancient runes lead the list and do *not* reappear at the
 *                 head of the +12 or +9 blocks, so it is one leading group and
 *                 not a tiebreak inside each level.
 *   Obtained      acquisition sequence, newest first.
 *
 * The two put the Ancient group at opposite ends. That is the game's own
 * inconsistency, and reproducing it is the point of the feature — a player who
 * has just arranged their box in Summoners War compares the two lists row for
 * row, so "tidying" either end would break the comparison.
 *
 * Rarity orders nothing under Grade: the top of that list is a Legend and the
 * bottom a Rare, yet every ordinary rune still precedes every Ancient one.
 *
 * **What is measured and what is not.** The Ancient grouping and the
 * `rank`/`class` mapping are confirmed against a real 1,556-rune export: every
 * record carries `rank`, and its 202 Ancient runes hold exactly the 202 records
 * at the Ancient ranks 13–15. That account owns nothing below six stars, so the
 * 6★ → 5★ → 4★ descent rests on the panel screenshot and on the `ATK +160`
 * reading that identifies the trailing rune as a 6★. Should a capture with
 * lower-star runes ever contradict it, that evidence wins and this is corrected.
 */
import assert from 'node:assert/strict';
import { compareRuneGameSort } from '../app/lib/rune-cleanup-grid.ts';

/** A row as the table builds one, with only the facts the orderings read. */
function row(index, { stars = 6, ancient = false, level = 0, obtainedOrder = index + 1 } = {}) {
  return {
    rune: {
      id: String(index + 1), setId: 1, setName: 'Rage', slot: 1, stars, ancient,
      defaultGrade: 'Legend', level, mainStatId: 3, mainValue: 0,
      prefixStatId: null, prefixValue: 0, subProperties: [], occupiedId: null,
      obtainedOrder,
    },
    index,
    advice: { verdict: 'sell', reason: '', maxValue: 0, chance: 0, preset: null, rank: 'broken' },
    location: 'Inventory',
  };
}

/** The rows in the order the ordering puts them, named for the report. */
function order(rows, key, name) {
  return [...rows]
    .sort((left, right) => compareRuneGameSort(left, right, key) || left.index - right.index)
    .map((entry) => name(entry.rune));
}

const starName = (rune) => `${rune.stars}${rune.ancient ? 'A' : ''}`;
const levelName = (rune) => `+${rune.level}${rune.ancient ? 'A' : ''}`;

/* Grade: ordinary by stars descending, Ancient after everything. The Ancient
   6★ is deliberately listed first so a stable sort cannot produce the expected
   answer by leaving it where it started. */
{
  const rows = [
    row(0, { stars: 6, ancient: true }),
    row(1, { stars: 4 }),
    row(2, { stars: 6 }),
    row(3, { stars: 5 }),
    row(4, { stars: 5, ancient: true }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', starName), ['6', '5', '4', '6A', '5A'],
    'Grade orders ordinary runes by star class descending, then the Ancient group');
}

/* The observation that fixes Grade: a 6★ Ancient sorts below a 5★ ordinary. */
{
  const rows = [row(0, { stars: 6, ancient: true }), row(1, { stars: 5 })];
  assert.deepEqual(order(rows, 'gameGrade', starName), ['5', '6A'],
    'a 6-star Ancient sorts below a 5-star ordinary rune, as the panel shows');
}

/* Rarity must not enter Grade: a Rare ordinary outranks a Legend Ancient. */
{
  const rare = row(0, { stars: 6, ancient: false });
  rare.rune.defaultGrade = 'Rare';
  const legendAncient = row(1, { stars: 6, ancient: true });
  assert.deepEqual(order([legendAncient, rare], 'gameGrade', starName), ['6', '6A'],
    'Grade reads the star class and the Ancient group, never the rarity');
}

/* Power-up Lv.: the Ancient group leads, then level descending. A low-level
   Ancient still precedes a +15 ordinary, which is what makes it a group. */
{
  const rows = [
    row(0, { level: 12 }),
    row(1, { level: 15 }),
    row(2, { level: 9, ancient: true }),
    row(3, { level: 15, ancient: true }),
    row(4, { level: 9 }),
  ];
  assert.deepEqual(order(rows, 'gameLevel', levelName), ['+15A', '+9A', '+15', '+12', '+9'],
    'Power-up Lv. puts the Ancient group first, then orders by level descending');
}

/* Obtained: newest first, and unique per rune so it needs no tiebreak. */
{
  const rows = [
    row(0, { obtainedOrder: 500, level: 9 }),
    row(1, { obtainedOrder: 1200, level: 15, ancient: true }),
    row(2, { obtainedOrder: 900, stars: 4 }),
  ];
  assert.deepEqual(order(rows, 'gameObtained', (rune) => rune.obtainedOrder), [1200, 900, 500],
    'Obtained is the acquisition sequence, newest first, ignoring level and grade');
}

/* An ordering must never reshuffle rows it cannot distinguish: equal rows fall
   through to the caller's tiebreak, which is the table's import order. */
{
  const rows = [row(0, { stars: 6 }), row(1, { stars: 6 }), row(2, { stars: 6 })];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.id), ['1', '2', '3'],
    'rows the ordering cannot separate keep their stated order');
  assert.equal(compareRuneGameSort(rows[0], rows[1], 'gameGrade'), 0,
    'two runes of one star class and group compare equal under Grade');
}

console.log('PASS: Grade, Power-up Lv. and Obtained reproduce the game\'s orderings,');
console.log('      including the Ancient group leading Power-up Lv. and trailing Grade.');
