/**
 * The Rune Clean-up "Sort by" dropdown must reproduce the game's own orderings.
 *
 *   Grade         slot ascending; then six-star before five-star; then rarity —
 *                 Legend, Hero, Rare, Magic, Normal; then Ancient before
 *                 ordinary; then the set by its export `set_id`; then
 *                 power-up level descending; then the rune's own id, oldest
 *                 first
 *   Power-up Lv.  power-up level descending, +15 down to +0
 *   Obtained      acquisition sequence, newest first
 *
 * "Grade" in the panel names the rarity, not the star class: `RUNE-CANONICAL.md`
 * §1 calls the star class the *grade* and the rarity the *default grade*, so the
 * heading reads like the star class and is not. Reading a tile misleads for the
 * same kind of reason — its stars are the star class, but the *colour* of those
 * stars marks `+15` and nothing else, and Ancient is a white ring around the
 * rune icon rather than anything on the stars.
 *
 * The `rank`/`class` mapping underneath is confirmed against a real 1,556-rune
 * export: every record carries `rank`, and its 202 Ancient runes are exactly the
 * 202 records at the Ancient ranks 13–15, which is §6's offset table.
 */
import assert from 'node:assert/strict';
import { compareRuneGameSort } from '../app/lib/rune-cleanup-grid.ts';

/** A row as the table builds one, with only the facts the orderings read. */
function row(index, {
  slot = 1, stars = 6, ancient = false, level = 0, defaultGrade = 'Legend',
  setId = 1, setName = 'Energy', obtainedOrder = index + 1,
} = {}) {
  return {
    rune: {
      id: String(index + 1), setId, setName, slot, stars, ancient,
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

/* Key 1: slot leads the whole Grade ordering. */
{
  const rows = [
    row(0, { slot: 6, defaultGrade: 'Legend', stars: 6 }),
    row(1, { slot: 1, defaultGrade: 'Normal', stars: 5 }),
    row(2, { slot: 3, defaultGrade: 'Hero', stars: 6 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.slot), [1, 3, 6],
    'the slot orders first, ahead of every other Grade key');
}

/* Key 2: the star class leads within one slot. */
{
  const rows = [
    row(0, { defaultGrade: 'Legend', stars: 5 }),
    row(1, { defaultGrade: 'Hero', stars: 6 }),
    row(2, { defaultGrade: 'Rare', stars: 6 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => `${rune.stars}★ ${rune.defaultGrade}`),
    ['6★ Hero', '6★ Rare', '5★ Legend'],
    'six-star runes lead five-star runes, even when the five-star rarity is higher');
}

/* Key 3: the rarity, Legend first. Built in ascending rarity so a stable sort
   cannot produce the expected answer by leaving the rows alone. */
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
    'the rarity orders Legend first, then Hero and so on');
}

/* Rarity is the group boundary: a lower-rarity Ancient must not jump ahead of
   a higher-rarity ordinary rune merely because it carries the Ancient mark. */
{
  const rows = [
    row(0, { defaultGrade: 'Rare', ancient: true }),
    row(1, { defaultGrade: 'Legend', ancient: false }),
    row(2, { defaultGrade: 'Hero', ancient: false }),
  ];
  assert.deepEqual(
    order(rows, 'gameGrade', (rune) => `${rune.defaultGrade}${rune.ancient ? ' Ancient' : ''}`),
    ['Legend', 'Hero', 'Rare Ancient'],
    'rarity groups precede Ancient/ordinary within the Grade ordering');
}

/* Key 4: Ancient before ordinary, below the rarity. */
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
    'Ancient leads inside each rarity, and the rarity still leads');
}

/* Key 5: the set, below star class, rarity and Ancient. */
{
  const rows = [
    row(0, { setId: 14, setName: 'Nemesis' }),
    row(1, { setId: 4, setName: 'Blade' }),
    row(2, { setId: 5, setName: 'Rage' }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.setName),
    ['Blade', 'Rage', 'Nemesis'],
    'the set orders by its export id within the observed bucket');
  const fiveStarEarlySet = row(3, { stars: 5, setId: 1, setName: 'Energy' });
  const sixStarLateSet = row(4, { stars: 6, setId: 25, setName: 'Intangible' });
  assert.ok(compareRuneGameSort(sixStarLateSet, fiveStarEarlySet, 'gameGrade') < 0,
    'the set never outranks the star class');
}

/* Key 6: power-up level descending, after the set. */
{
  const rows = [
    row(0, { setId: 5, setName: 'Rage', level: 9 }),
    row(1, { setId: 5, setName: 'Rage', level: 15 }),
    row(2, { setId: 4, setName: 'Blade', level: 0 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => `${rune.setName} +${rune.level}`),
    ['Blade +0', 'Rage +15', 'Rage +9'],
    'power-up level descends only after the set has been grouped');
}

/* Key 7: the rune's own id, oldest first, after equal visible keys. */
{
  const rows = [
    row(0, { obtainedOrder: 900 }),
    row(1, { obtainedOrder: 200 }),
    row(2, { obtainedOrder: 500 }),
  ];
  assert.deepEqual(order(rows, 'gameGrade', (rune) => rune.obtainedOrder), [200, 500, 900],
    'the id closes the ordering with the oldest rune first');
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

console.log('PASS: Grade orders by slot, star class, rarity, Ancient, set, level and rune');
console.log('      id; Power-up Lv. by level; Obtained by acquisition.');
