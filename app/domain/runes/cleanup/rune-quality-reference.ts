import { canonicalCraftCredit, craftPlan, craftedScore, gemOptions } from '../craft/rune-craft-end-state';
import type { EndStateLine, GemOptions, PriceList } from '../craft/rune-craft-end-state';
import { runeBirthRarityMasses } from '../rune-birth-model';
import { generateRuneBody, upgradeRuneBody } from '../rune-generation';
import { slotMainProperties } from '../rune-properties';
import { runeFixedScore } from '../rune-power-up-outcomes';

export const referenceSampleSize = 16_384;
export const allowanceDenominator = 1_000_000;

export type ReferencePiece = Readonly<{ slot: number; stars: number; main: number }>;
export type ReferenceRequest = ReferencePiece & Readonly<{ key: string; prices: PriceList }>;
export type ReferenceBodies = ReferencePiece & Readonly<{
  count: number;
  prefixStatId: Int32Array;
  prefixValue: Int32Array;
  lineCount: Uint8Array;
  lines: Int32Array;
}>;
export type QualityReference = Readonly<{ key: string; scores: Float64Array }>;

export const referencePieceKey = ({ slot, stars, main }: ReferencePiece): string => [slot, stars, main].join('|');

const priceKeys = new WeakMap<PriceList, string>();
export function referenceKey(piece: ReferencePiece, prices: PriceList): string {
  let key = priceKeys.get(prices);
  if (key === undefined) {
    key = prices.join(',');
    priceKeys.set(prices, key);
  }
  return referencePieceKey(piece) + '|' + key;
}

function birthRandom({ slot, stars, main }: ReferencePiece, stratum: number, index: number, seed: number) {
  let state = seed ^ Math.imul(slot, 0x85ebca6b) ^ Math.imul(stars, 0xc2b2ae35)
    ^ Math.imul(main, 0x9e3779b9) ^ Math.imul(stratum + 1, 0x165667b1) ^ Math.imul(index + 1, 0x27d4eb2d);
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  state = (state ^ (state >>> 16)) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function referenceBodies(
  slot: number, stars: number, main: number, count = referenceSampleSize, seed = 0x73b4ae91,
): ReferenceBodies {
  if (!slotMainProperties[slot]?.includes(main) || !Number.isInteger(stars) || stars < 1 || stars > 6) {
    throw new RangeError('Rune quality references need a legal slot, star class and main.');
  }
  const strata = runeBirthRarityMasses(slot).map(({ rarity, mass }) => ({
    rarity, size: count * mass,
  }));
  if (!Number.isSafeInteger(count) || count <= 0 || strata.some(({ size }) => !Number.isInteger(size))) {
    throw new RangeError('The rune sample size must represent every rarity stratum exactly.');
  }
  const piece = { slot, stars, main };
  const prefixStatId = new Int32Array(count);
  const prefixValue = new Int32Array(count);
  const lineCount = new Uint8Array(count);
  const lines = new Int32Array(count * 8);
  let row = 0;
  for (const [stratum, { rarity, size }] of strata.entries()) {
    for (let index = 0; index < size; index += 1, row += 1) {
      const random = birthRandom(piece, stratum, index, seed);
      const body = upgradeRuneBody(generateRuneBody({ slot, stars, mainStatId: main, setName: null, rarity, random }), 12, random);
      prefixStatId[row] = body.prefixStatId ?? -1;
      prefixValue[row] = body.prefixValue ?? 0;
      lineCount[row] = body.subProperties.length;
      body.subProperties.forEach(({ statId, value }, line) => {
        lines[row * 8 + line * 2] = statId;
        lines[row * 8 + line * 2 + 1] = value;
      });
    }
  }
  return { ...piece, count, prefixStatId, prefixValue, lineCount, lines };
}

const plan = craftPlan('standard', canonicalCraftCredit);
export function referenceScores(bodies: ReferenceBodies, readingPrices: PriceList): Float64Array {
  // The placement cache warms during this reference and can be collected with it.
  const prices = readingPrices.slice();
  const scores = new Float64Array(bodies.count);
  const options = new Map<number, GemOptions>();
  const buffer: EndStateLine[] = Array.from({ length: 4 }, () => ({ statId: 0, value: 0, gemmed: false, grind: 0 }));
  const scratch = new Float64Array(4);
  for (let row = 0; row < bodies.count; row += 1) {
    const id = bodies.prefixStatId[row];
    const prefixStatId = id === -1 ? null : id;
    let gems = options.get(id);
    if (!gems) {
      gems = gemOptions(plan, prices, bodies.slot, bodies.main, prefixStatId);
      options.set(id, gems);
    }
    for (let line = 0; line < bodies.lineCount[row]; line += 1) {
      buffer[line].statId = bodies.lines[row * 8 + line * 2];
      buffer[line].value = bodies.lines[row * 8 + line * 2 + 1];
    }
    const lines = bodies.lineCount[row] === 4 ? buffer : buffer.slice(0, bodies.lineCount[row]);
    const fixed = runeFixedScore({
      stars: bodies.stars, mainStatId: bodies.main, prefixStatId, prefixValue: bodies.prefixValue[row],
    }, prices);
    scores[row] = craftedScore(plan, gems, prices, lines, fixed, scratch);
  }
  return scores.sort();
}

const bits = new DataView(new ArrayBuffer(8));
export function nextUp(value: number): number {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  bits.setFloat64(0, value);
  bits.setBigUint64(0, bits.getBigUint64(0) + (BigInt(value > 0 ? 1 : -1)));
  return bits.getFloat64(0);
}

export function qualityHits({ scores }: QualityReference, score: number): number {
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (scores[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return scores.length - lo;
}

export function qualityShare(reference: QualityReference, score: number): number {
  return qualityHits(reference, score) / reference.scores.length;
}

/** Values are integral, so half the smallest line price separates zero even on the card. */
export function qualityBar({ scores }: QualityReference, allowance: number, prices: PriceList): number {
  const k = Math.floor(scores.length * allowance / allowanceDenominator);
  if (k < scores.length && scores[scores.length - 1 - k] > 0) return nextUp(scores[scores.length - 1 - k]);
  const least = prices.reduce((smallest, price) => price > 0 ? Math.min(smallest, price) : smallest, Infinity);
  return Math.max(Number.MIN_VALUE, least / 2);
}

/**
 * **Every ordinary drop of one slot, as one role in one position reads it** (§9.1).
 *
 * A slot carrying a choice of main is born with each legal main equally often, and
 * a main never earns a score of its own: the build already counts it. Comparing a
 * rune only with drops of its own main therefore kept the same share of each main,
 * which on slots 2, 4 and 6 is that share of a fraction of the slot — measured on the
 * shipped roles at the second-strictest stop, slot 4 kept 4.2 % of its drops where
 * slot 1 kept 16.7 %. So the population holds every main of the slot. A main the role
 * can use in this position is one part, scored in the build that puts it there and
 * scaled onto the candidate's own ruler by the two perfect runes (`scale`); a main it
 * cannot use is a drop that is worth nothing to it (`zeros`). The candidate's own part
 * has scale 1 exactly, so its own atoms keep the exact tie rule of §9.4.
 */
export type PopulationReference = Readonly<{
  parts: readonly Readonly<{ scores: Float64Array; scale: number }>[];
  zeros: number;
}>;

const populationSize = ({ parts, zeros }: PopulationReference): number =>
  parts.reduce((sum, { scores }) => sum + scores.length, zeros);

function scaledHits(scores: Float64Array, scale: number, score: number): number {
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (scores[mid] * scale < score) lo = mid + 1;
    else hi = mid;
  }
  return scores.length - lo;
}

export function populationShare(population: PopulationReference, score: number): number {
  let hits = score <= 0 ? population.zeros : 0;
  for (const { scores, scale } of population.parts) hits += scaledHits(scores, scale, score);
  return hits / populationSize(population);
}

/** `qualityBar` over the whole slot: strictly above the atom at ascending index `N − 1 − k`. */
export function populationBar(population: PopulationReference, allowance: number, prices: PriceList): number {
  const size = populationSize(population);
  const k = Math.floor(size * allowance / allowanceDenominator);
  if (k < size) {
    /* Walk down from the top of every part at once; past them all, only zeros remain. */
    const next = population.parts.map(({ scores }) => scores.length - 1);
    let atom = 0;
    for (let taken = 0; taken <= k; taken += 1) {
      let pick = -1;
      let value = 0;
      population.parts.forEach(({ scores, scale }, at) => {
        if (next[at] < 0) return;
        const candidate = scores[next[at]] * scale;
        if (pick === -1 || candidate > value) { pick = at; value = candidate; }
      });
      if (pick === -1 || value <= 0) { atom = 0; break; }
      next[pick] -= 1;
      atom = value;
    }
    if (atom > 0) return nextUp(atom);
  }
  const least = prices.reduce((smallest, price) => price > 0 ? Math.min(smallest, price) : smallest, Infinity);
  return Math.max(Number.MIN_VALUE, least / 2);
}

export type QualityReferences = Readonly<{
  get(piece: ReferencePiece, prices: PriceList): QualityReference;
}>;

export function rememberReference<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

export const retainedReferenceCount = 768;
const scoreCache = new Map<string, QualityReference>();
const bodyCache = new Map<string, ReferenceBodies>();

export function cachedReferenceBodies(piece: ReferencePiece): ReferenceBodies {
  const key = referencePieceKey(piece);
  const bodies = bodyCache.get(key) ?? referenceBodies(piece.slot, piece.stars, piece.main);
  rememberReference(bodyCache, key, bodies, 30);
  return bodies;
}

export function qualityReferences(prepared?: ReadonlyMap<string, QualityReference>, retain = true): QualityReferences {
  return {
    get(piece, prices) {
      const key = referenceKey(piece, prices);
      if (prepared) {
        const reference = prepared.get(key);
        if (!reference) throw new Error('A prepared rune quality reference is missing.');
        return reference;
      }
      const reference = scoreCache.get(key) ?? { key, scores: referenceScores(cachedReferenceBodies(piece), prices) };
      if (retain) rememberReference(scoreCache, key, reference, retainedReferenceCount);
      return reference;
    },
  };
}
