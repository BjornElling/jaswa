import { describe, expect, it } from 'vitest';
import { allStatIds, bornSubPropertyCount, remainingEvents, slotMainProperties, subPropertyRange } from '../rune-properties';
import { slotAllowsSubStat } from '../runes';
import type { Rune, RuneRarity, RuneSubProperty } from '../runes';
import {
  canonicalCraftCredit, craftItemRange, craftItemRoll, craftPlan, craftedLines, craftedScore, gemLineContribution, gemOptions,
  groundValue, noCraftCredit, priceList,
} from '../craft/rune-craft-end-state';
import type { CraftLineage } from '../craft/rune-craft-items';
import { add, compare, complement, divide, multiply, ONE, percentileRankBounds, probabilityBounds, rational, rationalFromDecimal, rationalFromNumber, roundRationalDown, roundRationalUp, toNumber, ZERO } from './probability';
import type { PercentileReading, ReferenceDistribution, ReferenceTail } from './percentile-types';
import { allocationMass, combinations, compositions, lineRollSupport } from './finite-support';
import { ScoreDistribution } from './score-distribution';
import { buildReferenceDistribution } from './reference-distribution';
import { runeBirthRarityMasses, runeInnateFrequency } from '../rune-birth-model';
import { solveRuneFuture } from './rune-future';

const makeRune = ({ level = 0, rarity = 'Legend', stars = 6, lines }: {
  level?: number;
  rarity?: Rune['rarity'];
  stars?: number;
  lines: RuneSubProperty[];
}): Rune => ({
  id: 'candidate', setId: 1, setName: 'Energy', slot: 2, stars, ancient: false, rarity,
  level, mainStatId: 1, mainValue: 1, prefixStatId: null, prefixValue: 0,
  subProperties: lines, occupiedId: null, obtainedOrder: 1,
});

const spdRune = (level = 0): Rune => makeRune({ level, lines: [
  { statId: 8, value: 4, grind: 0, gemmed: false },
  { statId: 2, value: 5, grind: 0, gemmed: false },
  { statId: 4, value: 5, grind: 0, gemmed: false },
  { statId: 9, value: 4, grind: 0, gemmed: false },
] });

const fixedReference = (readingId: string, threshold: number, stars = 6): ReferenceDistribution => ({
  slot: 2,
  stars,
  readingId,
  async query(cutoff: number): Promise<ReferenceTail> {
    const tail = cutoff >= threshold ? rational(1, 20) : rational(1, 10);
    return {
      status: 'complete', cutoff,
      tail: probabilityBounds(tail),
      rank: percentileRankBounds(tail, tail),
      passes: cutoff >= threshold,
    };
  },
});

const reading = (id: string, statId: number): PercentileReading => ({
  id, roleId: `role-${id}`, buildKey: `build-${id}`, permitted: true, mainStatId: 1,
  alpha: 0.05,
  weightsByStatId: Object.fromEntries(allStatIds.map((id) => [id, id === statId ? 1 : 0])),
  score: (body) => body.mainStatId === 1 ? body.subProperties.find((line) => line.statId === statId)?.value ?? null : null,
});

const awkwardWeights: Readonly<Record<number, number>> = {
  1: 0.1, 2: 0.2, 3: 0.3, 4: 0.7, 5: 0.11, 6: 0.13,
  8: 0.31, 9: 0.17, 10: 0.23, 11: 0.29, 12: 0.37,
};

function pricesFor(lineage: CraftLineage, onlySpeed = false): Float64Array {
  return priceList({
    key: `percentile-fixture:${lineage}:${onlySpeed ? 'spd' : 'all'}`,
    value: (statId, raw) => raw * (onlySpeed ? (statId === 8 ? 1 : 0) : (awkwardWeights[statId] ?? 0)),
  });
}

function canonicalScore(body: Rune, lineage: CraftLineage, prices: Float64Array): number {
  const plan = craftPlan(lineage, canonicalCraftCredit);
  const options = gemOptions(plan, prices, body.slot, body.mainStatId, body.prefixStatId);
  const prefixScore = body.prefixStatId === null ? 0 : body.prefixValue * prices[body.prefixStatId];
  return craftedScore(plan, options, prices, body.subProperties, prefixScore);
}

function canonicalReading(id: string, body: Rune, lineage: CraftLineage, prices: Float64Array): PercentileReading {
  const plan = craftPlan(lineage, canonicalCraftCredit);
  return {
    id, permitted: true, mainStatId: body.mainStatId, alpha: 0.05,
    weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, prices[statId]])),
    score: candidate => canonicalScore(candidate, lineage, prices),
    utilityPrefix: candidate => candidate.prefixStatId === null ? 0 : candidate.prefixValue * prices[candidate.prefixStatId],
    utilityLineComponents(candidate, index) {
      const options = gemOptions(plan, prices, candidate.slot, candidate.mainStatId, candidate.prefixStatId);
      const { statId, value, grind } = candidate.subProperties[index];
      return {
        grounded: groundValue(plan, statId, value, grind) * prices[statId],
        gem: gemLineContribution(plan, options, prices, candidate.subProperties, index),
      };
    },
  };
}

function oneUpgradeOracle(rune: Rune, score: (body: Rune) => number, threshold: number) {
  let chance = ZERO;
  let expectedUtility = 0;
  const bodies: Array<{ score: number; mass: ReturnType<typeof rational> }> = [];
  for (let target = 0; target < rune.subProperties.length; target += 1) {
    const line = rune.subProperties[target];
    const interval = subPropertyRange(rune.stars, line.statId, 'upgrade');
    if (!interval) throw new Error(`Missing upgrade interval for stat ${line.statId}.`);
    const width = interval.maximum - interval.minimum + 1;
    for (let roll = interval.minimum; roll <= interval.maximum; roll += 1) {
      const subProperties = rune.subProperties.map((property, index) => index === target
        ? { ...property, value: property.value + roll }
        : { ...property });
      const terminal = { ...rune, level: 15, subProperties };
      const value = score(terminal);
      const mass = rational(1, rune.subProperties.length * width);
      bodies.push({ score: value, mass });
      expectedUtility += value * toNumber(mass);
      if (value >= threshold) chance = add(chance, mass);
    }
  }
  return { chance, bodies, expectedUtility };
}

function scoreRankReference(readingId: string, stars: number, threshold: number): ReferenceDistribution {
  return {
    slot: 2, stars, readingId,
    async query(cutoff) {
      const tail = divide(ONE, add(ONE, rationalFromDecimal(cutoff)));
      return {
        status: 'complete', cutoff, tail: probabilityBounds(tail),
        rank: percentileRankBounds(tail, tail), passes: cutoff >= threshold,
      };
    },
  };
}

function craftedFixture(lineage: CraftLineage): Rune {
  const ancient = lineage === 'ancient';
  const lines = [8, 2, 4, 9].map((statId) => {
    const range = subPropertyRange(6, statId, 'initial', ancient);
    if (!range) throw new Error(`Missing ${lineage} initial interval for stat ${statId}.`);
    return { statId, value: range.minimum, grind: statId === 8 ? 2 : 0, gemmed: false };
  });
  return { ...makeRune({ level: 9, rarity: 'Legend', stars: 6, lines }), ancient };
}

function exactChance(bounds: { lowFraction: { numerator: string; denominator: string } }): ReturnType<typeof rational> {
  return rational(BigInt(bounds.lowFraction.numerator), BigInt(bounds.lowFraction.denominator));
}

type OrderedBirthState = {
  prefixStatId: number | null;
  prefixValue: number;
  lines: Array<{ statId: number; value: number }>;
  mass: ReturnType<typeof rational>;
};

function orderedStateKey(state: OrderedBirthState): string {
  return `${state.prefixStatId ?? '-'}:${state.prefixValue}|${state.lines.map(line => `${line.statId}:${line.value}`).join(',')}`;
}

function addOrderedState(target: Map<string, OrderedBirthState>, state: OrderedBirthState): void {
  const key = orderedStateKey(state);
  const prior = target.get(key);
  target.set(key, prior ? { ...prior, mass: add(prior.mass, state.mass) } : state);
}

/** A separate event-by-event oracle; irrelevant values are integrated out, not sampled. */
function orderedBirthScoreMasses(
  slot: number, stars: number, mainStatId: number, prices: Float64Array,
  score: (body: Rune) => number,
): Map<number, ReturnType<typeof rational>> {
  const legal = allStatIds.filter(id => id !== mainStatId && slotAllowsSubStat(slot, id));
  const weighted = (statId: number) => prices[statId] !== 0;
  const mainMass = rational(1, slotMainProperties[slot].length);
  const innate = rationalFromDecimal(runeInnateFrequency);
  const total = new Map<number, ReturnType<typeof rational>>();

  const includeRarity = (rarity: RuneRarity, rarityMass: ReturnType<typeof rational>) => {
    const born = bornSubPropertyCount(rarity);
    const events = remainingEvents(0, rarity).events;
    const prefixes: Array<{ id: number | null; mass: ReturnType<typeof rational> }> = [
      { id: null, mass: complement(innate) },
      ...legal.map(id => ({ id, mass: divide(innate, rational(legal.length)) })),
    ];
    const states = new Map<string, OrderedBirthState>();
    for (const prefix of prefixes) {
      const available = legal.filter(id => id !== prefix.id);
      const subsets = combinations(available, born);
      const subsetMass = rational(1, subsets.length);
      for (const subset of subsets) {
        const baseMass = multiply(mainMass, multiply(rarityMass, multiply(prefix.mass, subsetMass)));
        const prefixRange = prefix.id !== null && weighted(prefix.id)
          ? subPropertyRange(stars, prefix.id, 'initial') : undefined;
        const initialPrefixValues = prefixRange
          ? Array.from({ length: prefixRange.maximum - prefixRange.minimum + 1 }, (_, at) => prefixRange.minimum + at)
          : [0];
        for (const prefixValue of initialPrefixValues) {
          let partial: OrderedBirthState[] = [{
            prefixStatId: prefix.id, prefixValue, lines: [],
            mass: prefixRange ? divide(baseMass, rational(initialPrefixValues.length)) : baseMass,
          }];
          for (const statId of subset) {
            const range = weighted(statId) ? subPropertyRange(stars, statId, 'initial') : undefined;
            const values = range
              ? Array.from({ length: range.maximum - range.minimum + 1 }, (_, at) => range.minimum + at)
              : [0];
            partial = partial.flatMap(state => values.map(value => ({
              ...state,
              lines: [...state.lines, { statId, value }],
              mass: range ? divide(state.mass, rational(values.length)) : state.mass,
            })));
          }
          for (const state of partial) addOrderedState(states, state);
        }
      }
    }

    let current = states;
    for (const event of events) {
      const next = new Map<string, OrderedBirthState>();
      for (const state of current.values()) {
        if (event === 'add') {
          const held = new Set(state.lines.map(line => line.statId));
          const unused = legal.filter(id => id !== state.prefixStatId && !held.has(id));
          for (const statId of unused) {
            const range = weighted(statId) ? subPropertyRange(stars, statId, 'initial') : undefined;
            const values = range
              ? Array.from({ length: range.maximum - range.minimum + 1 }, (_, at) => range.minimum + at)
              : [0];
            for (const value of values) addOrderedState(next, {
              ...state,
              lines: [...state.lines, { statId, value }].sort((left, right) => left.statId - right.statId),
              mass: divide(state.mass, rational(unused.length * values.length)),
            });
          }
        } else {
          for (let at = 0; at < state.lines.length; at += 1) {
            const line = state.lines[at];
            const range = weighted(line.statId) ? subPropertyRange(stars, line.statId, 'upgrade') : undefined;
            const values = range
              ? Array.from({ length: range.maximum - range.minimum + 1 }, (_, index) => range.minimum + index)
              : [line.value];
            for (const roll of values) {
              const lines = state.lines.map((entry, index) => index === at
                ? { ...entry, value: entry.value + (range ? roll : 0) }
                : entry);
              addOrderedState(next, {
                ...state, lines,
                mass: divide(state.mass, rational(state.lines.length * values.length)),
              });
            }
          }
        }
      }
      current = next;
    }

    for (const state of current.values()) {
      const body: Rune = {
        id: 'ordered-oracle', setId: 1, setName: 'Energy', slot, stars, ancient: false,
        rarity, level: 12, mainStatId, mainValue: 0,
        prefixStatId: state.prefixStatId, prefixValue: state.prefixValue,
        subProperties: state.lines.map(line => ({ ...line, gemmed: false, grind: 0 })),
        occupiedId: null, obtainedOrder: 0,
      };
      const value = score(body);
      addOrderedMass(total, value, state.mass);
    }
  };

  for (const { rarity, mass } of runeBirthRarityMasses(slot)) includeRarity(rarity, mass);
  return total;
}

function addOrderedMass(
  target: Map<number, ReturnType<typeof rational>>, value: number, mass: ReturnType<typeof rational>,
): void {
  target.set(value, add(target.get(value) ?? ZERO, mass));
}

function orderedUpgradeTree(rune: Rune, favorable: (body: Rune) => boolean): ReturnType<typeof rational> {
  let result = ZERO;
  const initial = rune.subProperties.map((line) => line.value);
  const visit = (at: number, values: number[], mass: ReturnType<typeof rational>): void => {
    if (at === 4) {
      if (favorable({ ...rune, subProperties: rune.subProperties.map((line, index) => ({ ...line, value: values[index] })) })) {
        result = add(result, mass);
      }
      return;
    }
    for (let target = 0; target < rune.subProperties.length; target += 1) {
      const line = rune.subProperties[target];
      const range = subPropertyRange(rune.stars, line.statId, 'upgrade');
      if (!range) throw new Error(`Missing oracle range for stat ${line.statId}.`);
      const width = range.maximum - range.minimum + 1;
      for (let roll = range.minimum; roll <= range.maximum; roll += 1) {
        const next = [...values];
        next[target] += roll;
        const nextMass = multiply(mass, rational(1, rune.subProperties.length * width));
        visit(at + 1, next, nextMass);
      }
    }
  };
  visit(0, initial, ONE);
  return result;
}

describe('rune percentile exact finite kernel', () => {
  it('convolves a roll line exactly and matches an independent ordered target tree', async () => {
    const rune = spdRune();
    const spdRange = subPropertyRange(6, 8, 'upgrade')!;
    const support = lineRollSupport({ minimum: 4, maximum: 4 }, spdRange, 4);
    expect(support.total).toBe(BigInt(81));
    expect(support.values.filter((value) => value >= 27)
      .reduce((count, value) => count + (support.counts[support.values.indexOf(value)] ?? BigInt(0)), BigInt(0))).toBe(BigInt(5));
    expect(compositions(4, 4)).toHaveLength(35);
    expect(allocationMass([4, 0, 0, 0], 4, 4)).toEqual(rational(1, 256));

    const independentlyCounted = new Map<number, bigint>();
    const countSums = (at: number, sum: number) => {
      if (at === 3) {
        independentlyCounted.set(sum, (independentlyCounted.get(sum) ?? BigInt(0)) + BigInt(1));
        return;
      }
      for (let roll = 2; roll <= 3; roll += 1) countSums(at + 1, sum + roll);
    };
    countSums(0, 1);
    const shortSupport = lineRollSupport({ minimum: 1, maximum: 1 }, { minimum: 2, maximum: 3 }, 3);
    expect(shortSupport.values.map((value, index) => [value, shortSupport.counts[index].toString()]))
      .toEqual([...independentlyCounted].sort((left, right) => left[0] - right[0]).map(([value, count]) => [value, count.toString()]));

    const spd = reading('spd', 8);
    const reference = fixedReference('spd', 27);
    const future = await solveRuneFuture({ rune, readings: [spd], references: new Map([['spd', reference]]) });
    const oracle = orderedUpgradeTree(rune, (body) => (body.subProperties.find((line) => line.statId === 8)?.value ?? 0) >= 27);
    const exactFixture = rational(5, 20_736);
    expect(compare(oracle, exactFixture)).toBe(0);
    expect(future.status).toBe('complete');
    expect(future.unionChance?.lowFraction).toEqual({ numerator: '5', denominator: '20736' });
    expect(future.unionChance?.highFraction).toEqual({ numerator: '5', denominator: '20736' });
    expect(future.readings[0].chance.lowFraction).toEqual({ numerator: '5', denominator: '20736' });
    expect(future.readings[0].chance.highFraction).toEqual({ numerator: '5', denominator: '20736' });
  });

  it('unions same-body reading events once and preserves disjoint specialists', async () => {
    const rune = spdRune();
    const spd = reading('spd', 8);
    const duplicate = reading('spd-copy', 8);
    const hp = reading('hp', 2);
    const same = await solveRuneFuture({
      rune, readings: [spd, duplicate],
      references: new Map([['spd', fixedReference('spd', 27)], ['spd-copy', fixedReference('spd-copy', 27)]]),
    });
    expect(same.unionChance?.lowFraction).toEqual({ numerator: '5', denominator: '20736' });
    const union = await solveRuneFuture({
      rune, readings: [spd, hp],
      references: new Map([['spd', fixedReference('spd', 27)], ['hp', fixedReference('hp', 37)]]),
    });
    const hpOnly = rational(1, 65_536);
    const expected = add(rational(5, 20_736), hpOnly);
    expect(union.status).toBe('complete');
    expect(union.unionChance?.lowFraction).toEqual({
      numerator: expected.numerator.toString(), denominator: expected.denominator.toString(),
    });
    expect(union.readings[0].chance.lowFraction).toEqual({ numerator: '5', denominator: '20736' });
    expect(union.readings[1].chance.lowFraction).toEqual({ numerator: '1', denominator: '65536' });
  });

  it('handles finished bodies and a Normal +0 body with no held lines', async () => {
    const finished = makeRune({ level: 12, lines: [
      { statId: 8, value: 28, grind: 0, gemmed: false },
      { statId: 2, value: 5, grind: 0, gemmed: false },
      { statId: 4, value: 5, grind: 0, gemmed: false },
      { statId: 9, value: 4, grind: 0, gemmed: false },
    ] });
    const spd = reading('spd', 8);
    const deterministic = await solveRuneFuture({
      rune: finished, readings: [spd], references: new Map([['spd', fixedReference('spd', 27)]]),
    });
    expect(deterministic.status).toBe('complete');
    expect(deterministic.unionChance).toEqual(probabilityBounds(ONE));
    expect(deterministic.readings[0].chance).toEqual(probabilityBounds(ONE));

    const normal = makeRune({ level: 0, rarity: 'Normal', lines: [] });
    const constant = reading('any', 8);
    const constantReading: PercentileReading = {
      ...constant,
      weightsByStatId: Object.fromEntries(allStatIds.map((id) => [id, 0])),
      score: () => 1,
    };
    const generated = await solveRuneFuture({
      rune: normal, readings: [constantReading], references: new Map([['any', fixedReference('any', 1)]]),
    });
    expect(generated.status).toBe('complete');
    expect(generated.unionChance).toEqual(probabilityBounds(ONE));
  });

  it('keeps invalid states unavailable and preserves a sound interval on limits', async () => {
    const invalid = makeRune({ level: 0, lines: [] });
    const result = await solveRuneFuture({
      rune: invalid,
      readings: [reading('spd', 8)],
      references: new Map([['spd', fixedReference('spd', 27)]]),
    });
    expect(result.status).toBe('invalid');
    expect(result.unionChance).toBeNull();

    const overflowing = spdRune();
    overflowing.subProperties[0].value = Number.MAX_SAFE_INTEGER;
    const tooLarge = await solveRuneFuture({
      rune: overflowing,
      readings: [reading('spd', 8)],
      references: new Map([['spd', fixedReference('spd', 27)]]),
    });
    expect(tooLarge.status).toBe('invalid');
    expect(tooLarge.unionChance).toBeNull();

    const limited = await solveRuneFuture({
      rune: spdRune(), readings: [reading('spd', 8)],
      references: new Map([['spd', fixedReference('spd', 27)]]), stateLimit: 1,
    });
    expect(limited.status).toBe('incomplete');
    expect(limited.readings[0].potential?.score).toBe(28);
    expect(limited.unionChance).not.toBeNull();
    expect(compare(
      rational(BigInt(limited.unionChance!.lowFraction.numerator), BigInt(limited.unionChance!.lowFraction.denominator)),
      rational(5, 20_736),
    )).toBeLessThanOrEqual(0);
    expect(compare(
      rational(BigInt(limited.unionChance!.highFraction.numerator), BigInt(limited.unionChance!.highFraction.denominator)),
      rational(5, 20_736),
    )).toBeGreaterThanOrEqual(0);
  });

  it('reuses a reference decision across bodies without merging different allowances', async () => {
    const queries: number[] = [];
    const reference: ReferenceDistribution = {
      slot: 2, stars: 6, readingId: 'spd',
      async query(cutoff, alpha) {
        queries.push(cutoff);
        const tail = cutoff >= 20 ? rational(1, 20) : rational(1, 10);
        const allowance = typeof alpha === 'number' ? rationalFromDecimal(alpha) : alpha;
        return { status: 'complete', cutoff, tail: probabilityBounds(tail), rank: percentileRankBounds(tail, tail), passes: compare(tail, allowance) <= 0 };
      },
    };
    const speed = reading('spd', 8);
    const complete = (speedValue: number): Rune => ({
      ...spdRune(12),
      subProperties: spdRune(12).subProperties.map((line) => line.statId === 8 ? { ...line, value: speedValue } : line),
    });
    const references = new Map([['spd', reference]]);
    const first = await solveRuneFuture({ rune: complete(20), readings: [speed], references, decisionOnly: true });
    const better = await solveRuneFuture({ rune: complete(21), readings: [speed], references, decisionOnly: true });
    expect(first.unionChance?.low).toBe(1);
    expect(better.unionChance?.low).toBe(1);
    expect(queries).toEqual([20]);
    const stricter = await solveRuneFuture({ rune: complete(21), readings: [{ ...speed, alpha: 0.01 }], references, decisionOnly: true });
    expect(stricter.unionChance?.high).toBe(0);
    expect(queries).toEqual([20, 21]);
  });

  it('stops after a certified passing union without making a second reading fail', async () => {
    const speed = { ...reading('spd', 8), efficiencyCeiling: 1 };
    const hp = { ...reading('hp', 2), efficiencyCeiling: 100 };
    const hpReference = fixedReference('hp', 1);
    const rune = spdRune(12);
    const calls: string[] = [];
    const result = await solveRuneFuture({
      rune,
      readings: [hp, speed],
      references: new Map([
        ['spd', fixedReference('spd', 1)],
        ['hp', { ...hpReference, async query(cutoff, alpha, precision) {
          calls.push(precision ?? 'decision');
          return hpReference.query(cutoff, alpha, precision);
        } }],
      ]),
      cachedRank: true,
      stopOnUnionProof: true,
      unionRequirement: 1,
    });
    expect(result.unionChance).toEqual(probabilityBounds(ONE));
    expect(result.readings[0].chance).toEqual(probabilityBounds(ZERO, ONE));
    expect(result.readings[0].potential?.score).toBe(5);
    expect(calls).toEqual(['cached']);
  });

  it('accepts every star and rarity schedule, including Normal with no upgrades', async () => {
    const rarities: Rune['rarity'][] = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'];
    const ids = [8, 2, 4, 9];
    for (let stars = 1; stars <= 6; stars += 1) for (const rarity of rarities) {
      const lines = ids.slice(0, bornSubPropertyCount(rarity)).map((statId) => {
        const initial = subPropertyRange(stars, statId, 'initial');
        if (!initial) throw new Error(`No initial range for ${stars}★ stat ${statId}.`);
        return { statId, value: initial.minimum, grind: 0, gemmed: false };
      });
      const candidate = makeRune({ stars, rarity, lines });
      const constant = reading(`all-${stars}-${rarity}`, 8);
      const supportedReading: PercentileReading = { ...constant, score: () => 1 };
      const result = await solveRuneFuture({
        rune: candidate, readings: [supportedReading],
        references: new Map([[supportedReading.id, fixedReference(supportedReading.id, 1, stars)]]),
        stateLimit: 1,
      });
      expect(result.status, `${stars}★ ${rarity}`).not.toBe('invalid');
      expect(result.unionChance).not.toBeNull();
    }
  });

  it('keeps a zero-benefit reading unusable and improves potential rank with a better body', async () => {
    const finished = makeRune({ level: 12, lines: [
      { statId: 8, value: 20, grind: 0, gemmed: false },
      { statId: 2, value: 5, grind: 0, gemmed: false },
      { statId: 4, value: 5, grind: 0, gemmed: false },
      { statId: 9, value: 4, grind: 0, gemmed: false },
    ] });
    const zero = reading('zero', 8);
    const zeroReading = { ...zero, score: () => null };
    const unusable = await solveRuneFuture({
      rune: finished, readings: [zeroReading], references: new Map([['zero', fixedReference('zero', 1)]]),
    });
    expect(unusable.status).toBe('unusable');
    expect(unusable.unionChance).toEqual(probabilityBounds(ZERO));

    const scoreReference: ReferenceDistribution = {
      slot: 2, stars: 6, readingId: 'speed',
      async query(cutoff) {
        const tail = rational(1, Math.ceil(cutoff));
        return { status: 'complete', cutoff, tail: probabilityBounds(tail), rank: percentileRankBounds(tail, tail), passes: true };
      },
    };
    const speed = reading('speed', 8);
    const lowerBody = { ...finished, subProperties: finished.subProperties.map(line => ({ ...line })) };
    const higherBody = { ...lowerBody, subProperties: lowerBody.subProperties.map(line => line.statId === 8 ? { ...line, value: 21 } : line) };
    const lower = await solveRuneFuture({ rune: lowerBody, readings: [speed], references: new Map([['speed', scoreReference]]) });
    const higher = await solveRuneFuture({ rune: higherBody, readings: [speed], references: new Map([['speed', scoreReference]]) });
    expect(higher.readings[0].potential!.score).toBeGreaterThan(lower.readings[0].potential!.score);
    expect(higher.readings[0].potential!.rank.low).toBeGreaterThan(lower.readings[0].potential!.rank.high);
  });

  it('supports off-checkpoint states and treats cancellation as unavailable', async () => {
    const heroLines = [8, 2, 4].map((statId) => {
      const initial = subPropertyRange(6, statId, 'initial')!;
      return { statId, value: initial.minimum, grind: 0, gemmed: false };
    });
    const offCheckpoint = makeRune({ level: 4, rarity: 'Hero', lines: heroLines });
    const constant = reading('off-checkpoint', 8);
    const constantReading = { ...constant, score: () => 1 };
    const incomplete = await solveRuneFuture({
      rune: offCheckpoint, readings: [constantReading],
      references: new Map([['off-checkpoint', fixedReference('off-checkpoint', 1)]]), stateLimit: 1,
    });
    expect(incomplete.status).toBe('incomplete');
    expect(incomplete.unionChance).not.toBeNull();

    const controller = new AbortController();
    controller.abort();
    const cancelled = await solveRuneFuture({
      rune: spdRune(), readings: [reading('cancel', 8)],
      references: new Map([['cancel', fixedReference('cancel', 27)]]), signal: controller.signal,
    });
    expect(cancelled.status).toBe('incomplete');
    expect(cancelled.unionChance?.low).toBe(0);
    expect(cancelled.unionChance?.high).toBe(1);
  });

  it('keeps canonical Standard and Ancient craft utility, potential rank, and chance monotone', async () => {
    for (const lineage of ['standard', 'ancient'] as const) {
      const rune = craftedFixture(lineage);
      const prices = pricesFor(lineage);
      const score = (body: Rune) => canonicalScore(body, lineage, prices);
      const higher = {
        ...rune,
        subProperties: rune.subProperties.map(line => line.statId === 8 ? { ...line, value: line.value + 1 } : { ...line }),
      };
      const unthresholdedBase = oneUpgradeOracle(rune, score, Number.POSITIVE_INFINITY);
      const unthresholdedHigher = oneUpgradeOracle(higher, score, Number.POSITIVE_INFINITY);
      expect(unthresholdedBase.bodies).toHaveLength(unthresholdedHigher.bodies.length);
      for (let at = 0; at < unthresholdedBase.bodies.length; at += 1) {
        const baseOutcome = unthresholdedBase.bodies[at];
        const higherOutcome = unthresholdedHigher.bodies[at];
        expect(higherOutcome.mass).toEqual(baseOutcome.mass);
        expect(higherOutcome.score).toBeGreaterThanOrEqual(baseOutcome.score);
      }
      expect(unthresholdedHigher.expectedUtility).toBeGreaterThan(unthresholdedBase.expectedUtility);

      const baseMaximum = Math.max(...unthresholdedBase.bodies.map(body => body.score));
      const higherMaximum = Math.max(...unthresholdedHigher.bodies.map(body => body.score));
      expect(higherMaximum).toBeGreaterThan(baseMaximum);
      const threshold = (baseMaximum + higherMaximum) / 2;
      const baseOracle = oneUpgradeOracle(rune, score, threshold);
      const higherOracle = oneUpgradeOracle(higher, score, threshold);
      expect(compare(higherOracle.chance, baseOracle.chance)).toBeGreaterThanOrEqual(0);

      const id = `canonical-${lineage}`;
      const reference = scoreRankReference(id, rune.stars, threshold);
      const baseResult = await solveRuneFuture({
        rune, readings: [canonicalReading(id, rune, lineage, prices)],
        references: new Map([[id, reference]]), stateLimit: 25_000,
      });
      const higherResult = await solveRuneFuture({
        rune: higher, readings: [canonicalReading(id, higher, lineage, prices)],
        references: new Map([[id, reference]]), stateLimit: 25_000,
      });
      expect(baseResult.status).toBe('complete');
      expect(higherResult.status).toBe('complete');
      for (const [result, oracle] of [[baseResult, baseOracle], [higherResult, higherOracle]] as const) {
        const expected = oracle.bodies.reduce((sum, body) => add(sum, multiply(rationalFromNumber(body.score), body.mass)), ZERO);
        const bounds = result.readings[0].expectedUtility;
        expect(bounds).toBeDefined();
        expect(compare(exactChance(bounds!), expected)).toBeLessThanOrEqual(0);
        expect(compare(exactChance({ lowFraction: bounds!.highFraction }), expected)).toBeGreaterThanOrEqual(0);
        expect(bounds!.high - bounds!.low).toBeLessThan(1e-12);
      }
      expect(exactChance(higherResult.readings[0].chance)).toEqual(higherOracle.chance);
      expect(exactChance(baseResult.readings[0].chance)).toEqual(baseOracle.chance);
      expect(compare(exactChance(higherResult.readings[0].chance), exactChance(baseResult.readings[0].chance))).toBeGreaterThanOrEqual(0);
      expect(higherResult.readings[0].potential!.score).toBeGreaterThan(baseResult.readings[0].potential!.score);
      expect(higherResult.readings[0].potential!.rank.low).toBeGreaterThan(baseResult.readings[0].potential!.rank.high);
    }
  });

  it('retains the existing Grindstone on an actual same-stat converted Gem', () => {
    for (const lineage of ['standard', 'ancient'] as const) {
      const prices = pricesFor(lineage, true);
      const plan = craftPlan(lineage, canonicalCraftCredit);
      const gem = craftItemRoll('gem', lineage, 8, 'Legend', 'average');
      const grindRange = craftItemRange('grindstone', lineage, 8, 'Legend');
      const grind = grindRange?.maximum;
      expect(gem).not.toBeNull();
      expect(grind).toBeDefined();
      const lines = [
        { statId: 8, value: gem! - 1, grind: grind!, gemmed: true },
        { statId: 2, value: 5, grind: 0, gemmed: false },
        { statId: 4, value: 5, grind: 0, gemmed: false },
        { statId: 9, value: 5, grind: 0, gemmed: false },
      ];
      const body = { ...makeRune({ level: 12, rarity: 'Legend', stars: 6, lines }), ancient: lineage === 'ancient' };
      const options = gemOptions(plan, prices, body.slot, body.mainStatId, body.prefixStatId);
      const result = craftedLines(plan, options, prices, lines, 0);
      const converted = result.find(line => line.gemmed);
      expect(converted?.statId).toBe(8);
      expect(converted?.value).toBe(gem);
      expect(converted?.grind).toBe(grind);
      expect(canonicalScore(body, lineage, prices)).toBeGreaterThanOrEqual(craftedScore(plan, options, prices, lines, 0));
    }
  });

  it('keeps exact inclusive tails, decimal policy equality, and denominator mass', () => {
    const measure = new ScoreDistribution([
      { score: 1, mass: rational(1, 25) },
      { score: 1, mass: rational(1, 100) },
      { score: null, mass: rational(19, 20) },
    ]);
    const query = measure.query(1, 0.05);
    expect(query.status).toBe('complete');
    expect(query.tail.lowFraction).toEqual({ numerator: '1', denominator: '20' });
    expect(query.passes).toBe(true);
    expect(query.rank.low).toBe(95);
    expect(compare(rationalFromDecimal(0.2), rational(1, 5))).toBe(0);
    expect(compare(
      multiply(multiply(rationalFromDecimal(0.05), rationalFromDecimal(0.85)), rationalFromDecimal(2)),
      rational(17, 200),
    )).toBe(0);

    const bounds = probabilityBounds(rational(1, 3));
    expect(compare(rationalFromNumber(bounds.low), rational(1, 3))).toBeLessThanOrEqual(0);
    expect(compare(rationalFromNumber(bounds.high), rational(1, 3))).toBeGreaterThanOrEqual(0);
    const large = rational(BigInt(`1${'0'.repeat(400)}`), BigInt(`3${'0'.repeat(400)}`));
    expect(Number.isFinite(toNumber(large))).toBe(true);

    const greaterThanOne = rational(5, 3);
    expect(compare(rationalFromNumber(roundRationalDown(greaterThanOne)), greaterThanOne)).toBeLessThanOrEqual(0);
    expect(compare(rationalFromNumber(roundRationalUp(greaterThanOne)), greaterThanOne)).toBeGreaterThanOrEqual(0);
    const tiny = rational(BigInt(1), BigInt(10) ** BigInt(400));
    expect(roundRationalDown(tiny)).toBe(0);
    expect(roundRationalUp(tiny)).toBe(Number.MIN_VALUE);
    const huge = rational(BigInt(10) ** BigInt(400));
    expect(roundRationalDown(huge)).toBe(Number.MAX_VALUE);
    expect(roundRationalUp(huge)).toBe(Number.POSITIVE_INFINITY);
  });

  it('rounds large finite and subnormal rational bounds outwards', () => {
    const large = rational((BigInt(1) << BigInt(1100)) + BigInt(1), (BigInt(3) << BigInt(75)) + BigInt(1));
    const subnormal = rational(3, BigInt(1) << BigInt(1075));
    for (const exact of [large, subnormal]) {
      const down = roundRationalDown(exact);
      const up = roundRationalUp(exact);
      expect(Number.isFinite(down)).toBe(true);
      expect(Number.isFinite(up)).toBe(true);
      expect(compare(rationalFromNumber(down), exact)).toBeLessThanOrEqual(0);
      expect(compare(rationalFromNumber(up), exact)).toBeGreaterThanOrEqual(0);
      expect(up - down).toBeLessThanOrEqual(Math.max(up * Number.EPSILON, Number.MIN_VALUE));
    }
  });

  it('retains incompatible-main mass while a cold reference is state-limited', async () => {
    const reading: PercentileReading = {
      id: 'slot-four-cri-dmg', mainStatId: 10, alpha: 0.2, permitted: true,
      weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, 0])),
      score: (body) => body.mainStatId === 10 ? 1 : null,
    };
    expect(slotMainProperties[4]).toContain(10);
    const reference = await buildReferenceDistribution({ slot: 4, stars: 6, reading, stateLimit: 1 });
    const result = await reference.query(1, 0.2);
    expect(result.status).toBe('incomplete');
    expect(result.passes).toBe(true);
    expect(result.tail.highFraction).toEqual({ numerator: '1', denominator: '8' });
  });

  it('matches an ordered birth-event oracle for a mixed non-SPD score CDF', async () => {
    const slot = 4;
    const stars = 1;
    const mainStatId = 10;
    const prices = priceList({
      key: 'ordered-non-spd-oracle',
      value: (statId, raw) => raw * (statId === 2 ? 0.3 : statId === 4 ? 0.7 : 0),
    });
    const plan = craftPlan('standard', noCraftCredit);
    const options = gemOptions(plan, prices, slot, mainStatId, null);
    const scoreBody = (body: Rune) => {
      if (body.mainStatId !== mainStatId) return 0;
      const prefixScore = body.prefixStatId === null ? 0 : body.prefixValue * prices[body.prefixStatId];
      return craftedScore(plan, options, prices, body.subProperties, prefixScore);
    };
    const descriptor: PercentileReading = {
      id: 'ordered-non-spd', permitted: true, mainStatId, alpha: 0.05,
      weightsByStatId: Object.fromEntries(allStatIds.map(id => [id, prices[id]])),
      score: body => body.mainStatId === mainStatId ? scoreBody(body) : null,
    };
    const oracle = orderedBirthScoreMasses(slot, stars, mainStatId, prices, scoreBody);
    const oracleMass = [...oracle.values()].reduce(add, ZERO);
    expect(compare(oracleMass, rational(1, slotMainProperties[slot].length))).toBe(0);

    const reference = await buildReferenceDistribution({ slot, stars, reading: descriptor, stateLimit: 1_000_000 });
    const usefulScores = [...oracle.keys()].filter(score => score > 0).sort((left, right) => left - right);
    const cutoffs = [
      usefulScores[0], usefulScores[Math.floor(usefulScores.length / 3)],
      usefulScores[Math.floor(2 * usefulScores.length / 3)], usefulScores[usefulScores.length - 1],
    ];
    for (const cutoff of new Set(cutoffs)) {
      const expected = [...oracle.entries()].filter(([score]) => score >= cutoff).reduce((mass, [, entryMass]) => add(mass, entryMass), ZERO);
      const result = await reference.query(cutoff, 0.05, 'full');
      expect(result.status, `cutoff ${cutoff}`).toBe('complete');
      expect(result.tail.lowFraction, `cutoff ${cutoff}`).toEqual({
        numerator: expected.numerator.toString(), denominator: expected.denominator.toString(),
      });
    }
  }, 20_000);
});
