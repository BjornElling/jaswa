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
 *                 the Ancient runes of each rarity first, then the power-up
 *                 level descending, then the rune's own id ascending
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
 * Grade's four keys, in order: rarity, then Ancient, then level, then id.
 * Ancient is held *within* the rarity rather than ranked against it — a Legend
 * Ancient leads a Legend ordinary, and both still lead every Hero — and it
 * enters neither of the other two orderings. The set plays no part; it looked
 * briefly as though it did, because an account's leading rows happened to climb
 * through the set ids, but that was the id key showing through.
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

/* Inside a rarity-and-Ancient group the power-up level leads, highest first,
   and the rune's own id settles what is left. The rows are fed in shuffled so a
   stable sort cannot pass this by leaving them be. */
{
  const rune = (index, level, obtainedOrder) => row(index, {
    level, obtainedOrder, ancient: true, defaultGrade: 'Legend',
  });
  const rows = [
    rune(0, 12, 300),
    rune(1, 15, 900),
    rune(2, 9, 100),
    rune(3, 15, 200),
    rune(4, 15, 500),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (r) => `+${r.level}/${r.obtainedOrder}`),
    ['+15/200', '+15/500', '+15/900', '+12/300', '+9/100'],
    'the level leads inside a group, and the id orders what ties on it');
}

/* The set plays no part. Three Ancient Legend +15 runes of one set are listed
   in one fixed sequence, and it is their ids that fix it — which is what the
   account's Rage runes show: the game reads Poseidon then Carcano, while a
   third Rage +15 of a higher id follows rather than leading them. */
{
  const rage = (index, who, obtainedOrder) => ({
    ...row(index, { setId: 5, setName: 'Rage', ancient: true, level: 15, obtainedOrder }),
    who,
  });
  const rows = [
    rage(0, 'Lyn #1', 900),
    rage(1, 'Poseidon', 200),
    rage(2, 'Carcano #2', 500),
  ];
  const sorted = [...rows]
    .sort((left, right) => compareRuneGameSort(left, right, 'gameGrade') || left.index - right.index)
    .map((entry) => entry.who);
  assert.deepEqual(sorted, ['Poseidon', 'Carcano #2', 'Lyn #1'],
    'runes of one set, rarity, Ancient state and level are ordered by id alone');
}

/* And a lower set id cannot jump a group: an Energy (1) rune of a lesser rarity
   still sorts below every Legend, however early its set comes. */
{
  const rows = [
    row(0, { setId: 1, setName: 'Energy', defaultGrade: 'Hero', level: 15 }),
    row(1, { setId: 25, setName: 'Intangible', defaultGrade: 'Legend', level: 0 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.setName),
    ['Intangible', 'Energy'],
    'the set never outranks the rarity');
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

/* Star class orders nothing under Grade. Held equal on every key the ordering
   does read — rarity, Ancient, level and id — two runes of different star class
   compare equal, which is what lets 6★ and 5★ interleave down a rarity block. */
{
  const same = { defaultGrade: 'Legend', ancient: false, level: 12, obtainedOrder: 400 };
  const four = row(0, { ...same, stars: 4 });
  const six = row(1, { ...same, stars: 6 });
  assert.equal(compareRuneGameSort(four, six, 'gameGrade'), 0,
    'the star class is not read by Grade at all');
  /* A lower star class with the earlier id still leads, so stars cannot be
     sneaking in below the id either. */
  const lateSix = row(2, { ...same, stars: 6, obtainedOrder: 401 });
  assert.ok(compareRuneGameSort(four, lateSix, 'gameGrade') < 0,
    'a 4-star with the earlier id leads a 6-star with the later one');
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

console.log('PASS: Grade orders by rarity, Ancient, level and id; Power-up Lv. by');
console.log('      level; Obtained by acquisition — the star class orders nothing.');
