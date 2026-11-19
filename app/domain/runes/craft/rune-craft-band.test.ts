import { describe, expect, it } from 'vitest';
import {
  canonicalCraftCredit, craftPlan, craftedScore, craftedScoreAgainst, gemOptions, noCraftCredit,
} from './rune-craft-end-state';
import type { CraftCredit, EndStateLine } from './rune-craft-end-state';
import { nextUp, referenceBodies } from '../cleanup/rune-quality-reference';

const below = (value: number) => (value <= 0 ? -Number.MIN_VALUE : -nextUp(-value));

/* Broad, SPD-only and a flat-heavy list, so the Gem's choice and the weakest line move. */
const priceLists = [
  Float64Array.of(0, 0.002, 0.13, 0.006, 0.11, 0.005, 0.03, 0, 0.17, 0.12, 0.07, 0.02, 0.05),
  Float64Array.from({ length: 13 }, (_, id) => (id === 8 ? 0.17 : 0)),
  Float64Array.of(0, 0.004, 0.01, 0.05, 0.02, 0.06, 0.01, 0, 0.03, 0.01, 0.02, 0.09, 0.08),
];
/* The reference credit takes the exact path; any other re-prices the Gem and must
   fall back on the looser bound. */
const credits: CraftCredit[] = [
  canonicalCraftCredit, noCraftCredit,
  { gem: 'maximum', gemGrade: 'Hero', grind: 'minimum', grindGrade: 'Hero' },
];

describe('craftedScoreAgainst', () => {
  it('answers every bar at, around and away from the exact end state as craftedScore does', () => {
    let compared = 0;
    for (const [slot, main] of [[1, 3], [2, 8], [4, 10], [5, 1], [6, 4]] as const) {
      const bodies = referenceBodies(slot, 6, main, 256);
      for (const prices of priceLists) for (const credit of credits) for (const lineage of ['standard', 'ancient'] as const) {
        const plan = craftPlan(lineage, credit);
        for (let row = 0; row < bodies.count; row += 1) {
          const id = bodies.prefixStatId[row];
          const prefix = id < 0 ? null : id;
          const options = gemOptions(plan, prices, slot, main, prefix);
          const lines: EndStateLine[] = Array.from({ length: bodies.lineCount[row] }, (_, at) => ({
            statId: bodies.lines[row * 8 + at * 2],
            value: bodies.lines[row * 8 + at * 2 + 1],
            /* Stones above the credit and one converted line exercise rules 2 and 3. */
            grind: row % 5 === at ? 9 : 0,
            gemmed: row % 7 === at,
          }));
          const innate = prefix === null ? 0 : bodies.prefixValue[row] * prices[prefix];
          /* A lower-star main makes the fixed part negative (`runeFixedScore`). */
          for (const prefixScore of [innate, innate - 1.5]) {
            const exact = craftedScore(plan, options, prices, lines, prefixScore);
            const values = new Float64Array(lines.length);
            for (const bar of [exact, nextUp(exact), below(exact), exact * 0.9, exact * 1.1, exact * 0.5, exact * 2, Number.MIN_VALUE]) {
              for (const [one, other] of [[bar, bar], [bar * 0.8, bar], [bar, bar * 1.25]]) {
                const lowest = Math.min(one, other);
                const highest = Math.max(one, other);
                const shortcut = craftedScoreAgainst(plan, options, prices, lines, prefixScore, values, lowest, highest);
                for (const probe of [lowest, highest]) {
                  expect(shortcut >= probe).toBe(exact >= probe);
                  compared += 1;
                }
              }
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(100_000);
  }, 60_000);
});
