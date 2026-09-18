/**
 * The Rune Clean-up "Sort by" dropdown must reproduce the game's own orderings.
 *
 * The three orderings were read off the game's Manage panel, and the one that
 * cannot be guessed is Grade — because the game's own vocabulary works against
 * the heading. `RUNE-CANONICAL.md` §1 calls the *star class* the grade and the
 * rarity the *default grade*, so "Grade" in the panel reads like the star class
 * and is not:
 *
 *   Grade         rarity descending — Legend, Hero, Rare, Magic, Normal — then
 *                 the Ancient runes of each rarity first, then the set by its
 *                 export `set_id` ascending
 *   Power-up Lv.  power-up level descending, +15 down to +0
 *   Obtained      acquisition sequence, newest first
 *
 * Reading a tile is what misleads. Its stars are its star class, but the
 * *colour* of those stars marks `+15` and nothing else, and Ancient is a white
 * ring around the rune icon rather than anything on the stars. So a screenshot
 * full of purple stars is a screenshot full of maxed runes, not of Ancients or
 * of Legends.
 *
 * Two observations settle Grade between the two candidates:
 *
 *   - 6★ and 5★ runes **interleave** at the top of a Grade-sorted slot. No
 *     ordering on star class can do that, whatever its direction or tiebreak.
 *   - The detail panel at the top of the list reads **Legend** and the one at
 *     the bottom reads **Rare**. The rune closing that list is a 6★ — its
 *     `ATK +160` is the six-star main value (§3) — so it is last on rarity, not
 *     on stars.
 *
 * Ancient is the second key under Grade, and only there: inside one rarity the
 * Ancient runes come first, then the ordinary ones. It is held *within* the
 * rarity rather than ranked against it — a Legend Ancient leads a Legend
 * ordinary, and both still lead every Hero.
 *
 * The star class orders nothing at all, under any of the three.
 *
 * The `rank`/`class` mapping underneath is confirmed against a real 1,556-rune
 * export: every record carries `rank`, and its 202 Ancient runes are exactly the
 * 202 records at the Ancient ranks 13–15, which is §6's offset table.
 */
import assert from 'node:assert/strict';
import { compareRuneGameSort } from '../app/lib/rune-cleanup-grid.ts';

/** A row as the table builds one, with only the facts the orderings read. */
function row(index, {
  stars = 6, ancient = false, level = 0, defaultGrade = 'Legend',
  setId = 1, setName = 'Energy', obtainedOrder = index + 1,
} = {}) {
  return {
    rune: {
      id: String(index + 1), setId, setName, slot: 1, stars, ancient,
      defaultGrade, level, mainStatId: 3, mainValue: 0,
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

/* Grade: rarity descending. The rows are deliberately built in ascending rarity
   so a stable sort cannot produce the expected answer by leaving them alone. */
{
  const rows = [
    row(0, { defaultGrade: 'Normal' }),
    row(1, { defaultGrade: 'Magic' }),
    row(2, { defaultGrade: 'Rare' }),
    row(3, { defaultGrade: 'Hero' }),
    row(4, { defaultGrade: 'Legend' }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.defaultGrade),
    ['Legend', 'Hero', 'Rare', 'Magic', 'Normal'],
    'Grade orders by rarity, highest first');
}

/* The set breaks the remaining ties, in the export's own `set_id` order. The
   five runes the game puts first in a slot-6 Grade sort are all Ancient, 6★ and
   +15, and read Blade (4), Rage (5), Rage (5), Despair (10), Nemesis (14).

   The same five rule out both rivals: by name the order would be Blade,
   Despair, Nemesis, Rage, Rage, and their substat totals (51, 57, 72, 63, 54)
   are in no order at all. The rows are fed in shuffled so a stable sort cannot
   pass this by leaving them be. */
{
  const rows = [
    row(0, { setId: 14, setName: 'Nemesis', ancient: true, level: 15 }),
    row(1, { setId: 5, setName: 'Rage', ancient: true, level: 15 }),
    row(2, { setId: 10, setName: 'Despair', ancient: true, level: 15 }),
    row(3, { setId: 4, setName: 'Blade', ancient: true, level: 15 }),
    row(4, { setId: 5, setName: 'Rage', ancient: true, level: 15 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.setName),
    ['Blade', 'Rage', 'Rage', 'Despair', 'Nemesis'],
    'the set orders runes that tie on rarity and Ancient, by set id and not by name');
}

/* Inside one rarity the Ancient runes lead, and the grouping is held within the
   rarity: a Legend ordinary still outranks a Hero Ancient. */
{
  const rows = [
    row(0, { defaultGrade: 'Hero', ancient: false }),
    row(1, { defaultGrade: 'Legend', ancient: false }),
    row(2, { defaultGrade: 'Hero', ancient: true }),
    row(3, { defaultGrade: 'Legend', ancient: true }),
  ];
  assert.deepEqual(
    order(rows, 'gameGrade', (rune) => `${rune.defaultGrade}${rune.ancient ? ' Ancient' : ''}`),
    ['Legend Ancient', 'Legend', 'Hero Ancient', 'Hero'],
    'inside each rarity the Ancient runes come first, and rarity still leads');
}

/* The observation that rules out the star class: a 5★ of the better rarity
   outranks a 6★ of the worse one, which is what puts 6★ and 5★ side by side at
   the top of a real Grade-sorted slot. */
{
  const rows = [
    row(0, { stars: 6, defaultGrade: 'Hero' }),
    row(1, { stars: 5, defaultGrade: 'Legend' }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => `${rune.stars}★ ${rune.defaultGrade}`),
    ['5★ Legend', '6★ Hero'],
    'a 5-star Legend outranks a 6-star Hero, so Grade is not the star class');
}

/* Star class orders nothing under Grade: two runes of one rarity and one Ancient
   state compare equal however their stars differ, and keep the order the table
   gave them. This is what lets 6★ and 5★ interleave down a rarity block. */
{
  const rows = [
    row(0, { stars: 4, defaultGrade: 'Legend', ancient: false }),
    row(1, { stars: 6, defaultGrade: 'Legend', ancient: false }),
  ];
  assert.equal(compareRuneGameSort(rows[0], rows[1], 'gameGrade'), 0,
    'two Legends compare equal under Grade whatever their star class');
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.stars), [4, 6],
    'so their stated order stands rather than being re-ranked by stars');
}

/* Ancient is Grade's own second key and enters nothing else: under Power-up Lv.
   and Obtained two runes differing only in it compare equal. */
{
  const ordinary = row(0, { ancient: false, defaultGrade: 'Hero', level: 9, obtainedOrder: 7 });
  const ancient = row(1, { ancient: true, defaultGrade: 'Hero', level: 9, obtainedOrder: 7 });
  assert.ok(compareRuneGameSort(ancient, ordinary, 'gameGrade') < 0,
    'under Grade the Ancient rune of a rarity leads the ordinary one');
  for (const key of ['gameLevel', 'gameObtained']) {
    assert.equal(compareRuneGameSort(ordinary, ancient, key), 0,
      `Ancient is not part of the ${key} ordering`);
  }
}

/* Power-up Lv.: level descending, and nothing else enters it. */
{
  const rows = [
    row(0, { level: 0, defaultGrade: 'Legend' }),
    row(1, { level: 15, defaultGrade: 'Normal' }),
    row(2, { level: 9, ancient: true, defaultGrade: 'Hero' }),
    row(3, { level: 12, defaultGrade: 'Rare' }),
  ];
  assert.deepEqual(order(rows, 'gameLevel', (rune) => rune.level), [15, 12, 9, 0],
    'Power-up Lv. orders by level descending, ignoring rarity, stars and Ancient');
}

/* Obtained: newest first, and unique per rune so it needs no tiebreak. */
{
  const rows = [
    row(0, { obtainedOrder: 500, level: 9 }),
    row(1, { obtainedOrder: 1200, level: 15, ancient: true }),
    row(2, { obtainedOrder: 900, stars: 4, defaultGrade: 'Normal' }),
  ];
  assert.deepEqual(order(rows, 'gameObtained', (rune) => rune.obtainedOrder), [1200, 900, 500],
    'Obtained is the acquisition sequence, newest first, ignoring level and grade');
}

/* An ordering must never reshuffle rows it cannot distinguish: equal rows fall
   through to the caller's tiebreak, which is the table's import order. */
{
  const rows = [row(0), row(1), row(2)];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.id), ['1', '2', '3'],
    'rows the ordering cannot separate keep their stated order');
}

console.log('PASS: Grade orders by rarity, then Ancient, then set id; Power-up Lv. by');
console.log('      level; Obtained by acquisition — and the star class orders nothing.');
