import { describe, expect, it } from 'vitest';
import { defaultRunePotentialSettings } from '../../profiles/preference-defaults';
import { defaultRuneRoles, withRefreshedMetrics } from '../../profiles/rune-roles';
import { craftPlan, craftedScore, defaultCraftCredit, gemOptions, noCraftCredit } from '../craft/rune-craft-end-state';
import { countChanceGroup, endStateScoring, playForward, runeFuture, runScore } from '../rune-power-up-outcomes';
import { newRuneAdviceScope, ordinarySample, prepareRuneCandidate, roleBuilds } from './rune-cleanup-model';
import { chanceThresholds, runeAdvice, runeQualityText, withRuneSellProtection } from './rune-cleanup-advice';
import {
  allowanceDenominator, nextUp, qualityBar, qualityHits, qualityShare, referenceBodies, referenceSampleSize, referenceScores,
} from './rune-quality-reference';

const prices = Float64Array.from({ length: 16 }, (_, id) => id ? id / 13 : 0);
const reference = { key: 'ties', scores: Float64Array.of(0, 0, 1, 1, 1, 2, 3) };
const baseStats = { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 };
const settings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false, neverSellReappTargets: false, neverSellPotentialValue: false };

describe('sampled rune quality', () => {
  it('advances by one representable float, including around zero', () => {
    const buffer = new DataView(new ArrayBuffer(8));
    for (const value of [-Infinity, -1e100, -1, -Number.MIN_VALUE, Number.MIN_VALUE, 1, 1e100]) {
      buffer.setFloat64(0, value);
      const original = buffer.getBigUint64(0);
      const above = nextUp(value);
      expect(above).toBeGreaterThan(value);
      buffer.setFloat64(0, above);
      expect(buffer.getBigUint64(0) - original).toBe(BigInt(value < 0 ? -1 : 1));
    }
    expect(nextUp(0)).toBe(Number.MIN_VALUE);
    expect(nextUp(Infinity)).toBe(Infinity);
  });

  it('keeps whole score atoms on the inclusive side of a quality boundary', () => {
    expect(qualityShare(reference, 1)).toBe(5 / 7);
    expect(qualityShare(reference, nextUp(1))).toBe(2 / 7);
    expect(qualityBar(reference, 285714, prices)).toBe(nextUp(2));
    expect(qualityBar(reference, 285715, prices)).toBe(nextUp(1));
    const exact = { key: 'quarter', scores: Float64Array.of(0, 1, 2, 3) };
    expect(qualityBar(exact, 249999, prices)).toBe(nextUp(3));
    expect(qualityBar(exact, 250000, prices)).toBe(nextUp(2));
    expect(qualityBar(exact, 250001, prices)).toBe(nextUp(2));
    expect(Math.fround(qualityBar(reference, allowanceDenominator, prices))).toBeGreaterThan(0);
    expect(qualityBar(reference, allowanceDenominator, prices)).toBeLessThan(prices[1]);
  });

  it('stratifies deterministic nested samples and scores the exact same lines as the craft kernel', () => {
    const first = referenceBodies(4, 6, 10, 128);
    const small = referenceBodies(4, 6, 10, 64);
    expect(() => referenceBodies(4, 6, 10, 65)).toThrow();
    expect(() => referenceBodies(1, 6, 10, 64)).toThrow();
    referenceBodies(1, 5, 3, 64);
    expect(referenceBodies(4, 6, 10, 128)).toEqual(first);
    expect(referenceBodies(4, 6, 10, 128, 123).lines).not.toEqual(first.lines);
    expect(first.lineCount.every((count) => count === 4)).toBe(true);
    for (const [shortStart, longStart, length] of [[0, 0, 16], [16, 32, 32], [48, 96, 16]]) {
      expect(small.lines.slice(shortStart * 8, (shortStart + length) * 8))
        .toEqual(first.lines.slice(longStart * 8, (longStart + length) * 8));
    }
    const oracleOf = (credit: typeof defaultCraftCredit) => {
      const plan = craftPlan('standard', credit);
      return Float64Array.from(first.prefixStatId, (id, index) => {
        const lines = Array.from({ length: 4 }, (_, at) => ({
          statId: first.lines[index * 8 + at * 2], value: first.lines[index * 8 + at * 2 + 1], grind: 0, gemmed: false,
        }));
        const gems = gemOptions(plan, prices, first.slot, first.main, id < 0 ? null : id);
        return craftedScore(plan, gems, prices, lines, id < 0 ? 0 : first.prefixValue[index] * prices[id]);
      }).sort();
    };
    expect(referenceScores(first, prices, defaultCraftCredit)).toEqual(oracleOf(defaultCraftCredit));
    /* The reference follows the credit it is given: none of it, and the sample is the lines as rolled. */
    const none = referenceScores(first, prices, noCraftCredit);
    expect(none).toEqual(oracleOf(noCraftCredit));
    expect(none).not.toEqual(oracleOf(defaultCraftCredit));
  });

  it('counts identical, disjoint and overlapping events exactly on each shared future', () => {
    const rune = { ...ordinarySample(5, 6, 3, 9)[2], prefixStatId: null, prefixValue: 0,
      subProperties: [8, 11, 4, 6].map((statId) => ({ statId, value: 8, grind: 0, gemmed: false })) };
    const future = runeFuture(rune);
    const plan = craftPlan('standard', noCraftCredit);
    const score = (id: number) => endStateScoring(rune, { key: String(id), value: (stat, value) => stat === id ? value : 0 }, plan);
    const a = score(8);
    const b = score(11);
    const runs = playForward(future, 4096);
    const values = [a, b].map((scoring) => Array.from({ length: runs.count }, (_, run) => runScore(runs, scoring, run)));
    const bars = values.map((samples) => Math.max(...samples));

    const checks = [
      { jobs: [{ scoring: a, wanted: bars[0] }, { scoring: a, wanted: bars[0] }], relation: 'identical' },
      { jobs: [{ scoring: a, wanted: bars[0] }, { scoring: b, wanted: bars[1] }], relation: 'disjoint' },
      { jobs: [{ scoring: a, wanted: bars[0] }, { scoring: b, wanted: 8 }], relation: 'overlapping' },
    ];
    for (const { jobs, relation } of checks) {
      const events = jobs.map((job) => Array.from({ length: runs.count }, (_, run) => runScore(runs, job.scoring, run) >= job.wanted));
      const { hits, union } = countChanceGroup(future, jobs.map((job) => ({ ...job, future, runs: runs.count })));
      expect([...hits]).toEqual(events.map((event) => event.filter(Boolean).length));
      expect(hits[0]).toBeGreaterThan(0);
      expect(hits[1]).toBeGreaterThan(0);
      expect(union).toBe(events[0].filter((hit, run) => hit || events[1][run]).length);
      if (relation === 'disjoint') expect(union).toBe(hits[0] + hits[1]);
      else expect(union).toBe(Math.max(...hits));
    }
  });

  it('names a contributing Best role when only the union meets the power-up stop', async () => {
    const rune = { ...ordinarySample(5, 6, 1, 9)[0], prefixStatId: null, prefixValue: 0, setName: 'Swift',
      subProperties: [8, 11, 4, 6].map((statId) => ({ statId, value: 25, grind: 0, gemmed: false })) };
    const source = defaultRuneRoles()[0];
    const roles = [{ spd: 350 }, { res: 100 }].map((targets, at) => withRefreshedMetrics({
      ...source, id: String(at), targets, sets: { preferred: ['Swift'], acceptable: [] },
      slots: { slot2: { preferred: [], acceptable: [] }, slot4: { preferred: [], acceptable: [] },
        slot6: { preferred: [], acceptable: [] } },
    }));
    const atoms = roles.map((role) => {
      const candidate = prepareRuneCandidate(rune, role, roleBuilds(role)[0], baseStats, defaultCraftCredit,
        newRuneAdviceScope(defaultCraftCredit));
      if (!candidate) throw new Error('The specialist fixture needs a usable reading.');
      const runs = playForward(candidate.future, 4096);
      const scores = [...new Set(Array.from({ length: runs.count }, (_, run) => runScore(runs, candidate.scoring, run)))].sort((a, b) => a - b);
      /* High enough that each reading alone misses the Balanced stop and their union clears it. */
      return scores[scores.length - 4];
    });
    const references = { get: (_: unknown, readingPrices: Float64Array) => {
      const index = readingPrices[8] > 0 ? 0 : 1;
      return { key: String(index), scores: Float64Array.of(0, atoms[index]) };
    } };
    const base = new Map([[source.type, baseStats]]);
    const [result] = (await runeAdvice([rune], roles, settings, base, undefined, { explain: true, references })).values();
    const stop = chanceThresholds[settings.powerUpPolicy - 1];
    expect(result.verdict).toBe('power-up');
    expect(result.chance).toBeGreaterThanOrEqual(stop);
    expect(result.readings?.every(({ chance }) => chance !== null && chance > 0 && chance < stop)).toBe(true);
    expect(result.readings?.find(({ roleId }) => roleId === result.role?.id)?.chance).toBe(result.readingChance);
  });

  it('prints inclusive ranks without moving them across the requirement', () => {
    const allowance = 42500;
    const k = Math.floor(referenceSampleSize * allowance / allowanceDenominator);
    expect(runeQualityText(null, 0.0425, true)).toBe('Top 4.25 %');
    expect(runeQualityText(k / referenceSampleSize, 0.0425)).toBe('Top 4.25 %');
    expect(runeQualityText((k + 1) / referenceSampleSize, 0.0425)).toBe('Top 4.26 %');
    expect(runeQualityText(0, 1)).toBe('Top 0.01 %');
    expect(runeQualityText(1 / referenceSampleSize, 0.02)).toBe('Top 0.01 %');
    expect(runeQualityText(10 / referenceSampleSize, 0.02)).toBe('Top 0.07 %');
    expect(runeQualityText(17 / referenceSampleSize, 0.02)).toBe('Top 0.2 %');
    expect(runeQualityText(1, 1)).toBe('Top 100 %');
    expect(runeQualityText(null, 1)).toBe('—');
    expect(qualityHits(reference, 0)).toBe(7);
  });

  it('preserves specialists and keeps missing input out of actionable sales', async () => {
    const rune = { ...ordinarySample(5, 6, 1, 12)[0], setName: 'Swift', prefixStatId: null, prefixValue: 0,
      subProperties: [8, 2, 4, 6].map((statId) => ({ statId, value: statId === 8 ? 30 : 5, grind: 0, gemmed: false })) };
    const role = withRefreshedMetrics({ ...defaultRuneRoles()[0], targets: { spd: 350 },
      sets: { preferred: ['Swift'], acceptable: [] } });
    const base = new Map([[role.type, baseStats]]);
    const missing = { ...role, id: 'missing', type: 'No type' as const };
    const [champion] = (await runeAdvice([rune], [role], settings, base, undefined, { explain: true })).values();
    expect(champion.verdict).toBe('keep');
    expect(champion.readingChance).toBe(1);
    expect(champion.readings?.find((row) => row.roleId === champion.role?.id)?.qualityShare).toBe(champion.qualityShare);
    /* An unreadable role could only add events, so a keep survives it and only a sale is withheld. */
    const [kept] = (await runeAdvice([rune], [role, missing], settings, base)).values();
    expect(kept.verdict).toBe('keep');
    const weak = { ...rune, id: 'weak', subProperties: rune.subProperties.map((line) => ({ ...line, value: 1 })) };
    const [sold] = (await runeAdvice([weak], [role], settings, base)).values();
    expect(sold.verdict).toBe('sell');
    const [unavailable] = (await runeAdvice([weak], [role, missing], settings, base)).values();
    expect(unavailable.verdict).toBe('unavailable');
    const [empty] = (await runeAdvice([rune], [], settings, base)).values();
    expect(empty.reason).toBe('No role can use it');
    const potential = { ...settings, neverSellPotentialValue: true, potentialValueMinimum: 50 };
    const sale = { ...champion, verdict: 'sell' as const, maxValue: 0.9, chance: 0.9, readingChance: 0 };
    expect(withRuneSellProtection(rune, sale, potential).verdict).toBe('sell');
    expect(withRuneSellProtection(rune, { ...sale, readingChance: 40 / 4096 }, potential).verdict).toBe('sell');
    expect(withRuneSellProtection(rune, { ...sale, readingChance: 41 / 4096 }, potential).verdict).toBe('keep');
  });
});
