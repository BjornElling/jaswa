/**
 * The exact probability arithmetic two calculations share.
 *
 * `rune-cleanup-model.ts` asks what a rune's remaining power-ups are likely to
 * produce. `rune-substat-weights.ts` asks the mirror question — what an ordinary
 * rune produces of one stat, so that a preset's requirement can be priced by how
 * hard it is to meet. Both are the same convolution over the same uniform rolls,
 * so both read it from here rather than each growing a copy.
 *
 * ## The representation contract
 *
 * Probability support is represented on a lattice of 10⁻¹² score units. A single
 * roll's contribution is quantised to a whole number of those units **once**,
 * where it is first converted by a `Valuation`; sums of those whole numbers are
 * then exact, so a convolution introduces no further rounding.
 *
 * "Exact" means exact on that lattice, which is itself a quantisation of the
 * underlying value. What makes the lattice safe is that no grid may ever be
 * coarse enough to merge two outcomes the game can distinguish: the smallest
 * difference two distinct outcomes can have is one flat point of a scaled stat,
 * about 7 × 10⁻⁴ score units, nine orders of magnitude above one lattice unit.
 * `docs/RUNE-CLEANUP-MATH.md` §7.1 is the contract this implements.
 */

/**
 * What a raw stat value is worth in the unit a calculation counts in.
 *
 * It is **linear in `raw`** and that is load-bearing: a Grindstone's flat bonus is
 * priced by valuing the bonus on its own and adding it, and a distribution's
 * support is produced by valuing each legal roll. A valuation that was not linear
 * would make those two disagree.
 *
 * `key` identifies the valuation for caches. Two valuations that would price every
 * line identically must carry the same key, and two that would not must not.
 */
export type Valuation = {
  readonly key: string;
  value(statId: number, raw: number): number;
};

/** Whole units of 10⁻¹² score units, as an integer, against its probability. */
export type Distribution = Map<number, number>;

/** Units per score unit. See the representation contract above. */
export const probabilityScale = 1e12;

export const probabilityKey = (value: number): number => Math.round(value * probabilityScale);

/**
 * A threshold, carrying exactly one unit of slack.
 *
 * It is the successor to a `+ 1e-12` epsilon applied at every comparison, and
 * folding it into the target once is what keeps the key's precision and the
 * comparison's tolerance from drifting apart: every downstream comparison is then
 * a plain integer `>=`.
 */
export const targetKey = (value: number): number => Math.round(value * probabilityScale) - 1;

/**
 * The largest score a key can carry and stay exact — `Number.MAX_SAFE_INTEGER`
 * divided by the scale, about 9,007 score units. A slot ceiling is nine, so there
 * are three orders of magnitude of headroom. Callers assert against it rather than
 * trusting it, because a future change that made contributions larger would
 * consume that headroom and otherwise lose precision silently.
 */
export const isExactKey = (key: number): boolean => Number.isSafeInteger(key);

/**
 * `cap` and `floor` are the two ends of the only question a caller asks: whether
 * a total reaches a target.
 *
 * Everything at or above the target is one outcome, so `cap` collapses it to one
 * key. A partial sum that cannot reach the target even if every remaining term
 * rolls its maximum is already a certain zero, and carrying it at full resolution
 * multiplies the size of every later cross product — one intermediate distribution
 * reached 51,454 entries that way, mostly describing outcomes that were hopeless
 * before the first term was drawn. Dropping them cannot move the answer, because a
 * zero contribution is what is being dropped.
 */
export function convolveDistribution(
  left: Distribution, right: Distribution,
  cap = Number.POSITIVE_INFINITY, floor = Number.NEGATIVE_INFINITY,
): Distribution {
  const out: Distribution = new Map();
  /* The right-hand side is read through its sorted tail view, which turns both
     bounds from a test inside the inner loop into a range around it. Everything
     below the floor and everything at or above the cap is skipped rather than
     visited: the whole tail above the cap is one key, so it is added once per
     left-hand state from the view's suffix sums instead of once per pair. On a real
     account most of the cross product is in exactly those two regions. */
  const view = tailView(right);
  const { values, atOrAbove, probabilities } = view;
  for (const [a, leftWeight] of left) {
    const from = lowerBound(values, floor - a);
    const until = lowerBound(values, cap - a);
    for (let at = from; at < until; at += 1) {
      const key = a + values[at];
      out.set(key, (out.get(key) ?? 0) + leftWeight * probabilities[at]);
    }
    if (until < values.length) out.set(cap, (out.get(cap) ?? 0) + leftWeight * atOrAbove[until]);
  }
  return out;
}

/** The first index whose value is at least `target`, or the length. */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1; else high = middle;
  }
  return low;
}

/**
 * A distribution read as a tail: sorted support, with the mass at or above each
 * position.
 *
 * A caller that reads only the mass at or above a target would otherwise build the
 * final and largest cross product in full and discard all but a sliver of it.
 * `P(X + Y ≥ g) = Σ_x P(X = x)·P(Y ≥ g−x)` sums the same products in a different
 * order without ever materialising the joint distribution.
 *
 * The view is a pure function of the distribution, so a `WeakMap` on the
 * distribution itself needs no invalidation rule of its own.
 */
export type TailView = {
  readonly values: readonly number[];
  readonly probabilities: readonly number[];
  readonly atOrAbove: readonly number[];
};

const tailViews = new WeakMap<Distribution, TailView>();

export function tailView(distribution: Distribution): TailView {
  const cached = tailViews.get(distribution);
  if (cached) return cached;
  const values = [...distribution.keys()].sort((left, right) => left - right);
  const probabilities = values.map((value) => distribution.get(value) ?? 0);
  const atOrAbove = new Array<number>(values.length + 1).fill(0);
  for (let at = values.length - 1; at >= 0; at -= 1) {
    atOrAbove[at] = atOrAbove[at + 1] + probabilities[at];
  }
  const view: TailView = { values, probabilities, atOrAbove };
  tailViews.set(distribution, view);
  return view;
}

/** `P(X >= target)`, by binary search on the sorted support. */
export function tailMass(view: TailView, target: number): number {
  return view.atOrAbove[lowerBound(view.values, target)];
}

/**
 * The exact distribution of the **sum of `count` raw roll values**, as whole game
 * numbers rather than score units.
 *
 * It depends on nothing but the interval and the count — not on the reference
 * monster, and not on what a role pays for the stat — so there are a few dozen of
 * them for the life of the process. That is the whole reason it exists: pricing the
 * rolls first and convolving afterwards makes the answer depend on the role, and a
 * role-dependent convolution is rebuilt for every preset, every build and every rune
 * set. On a real account that alone was half the run time.
 */
const rawSums = new Map<string, Distribution>();

function rawRollSums(minimum: number, maximum: number, count: number): Distribution {
  const cacheKey = `${minimum}/${maximum}/${count}`;
  const cached = rawSums.get(cacheKey);
  if (cached) return cached;
  const width = maximum - minimum + 1;
  const one: Distribution = new Map();
  for (let value = minimum; value <= maximum; value += 1) one.set(value, 1 / width);
  let total: Distribution = new Map([[0, 1]]);
  for (let step = 0; step < count; step += 1) total = convolveDistribution(total, one);
  rawSums.set(cacheKey, total);
  return total;
}

/**
 * The exact distribution of `count` uniform draws from one legal roll interval,
 * priced into a role's score units.
 *
 * The valuation is linear, so the sum of the priced rolls is the price of the summed
 * rolls — and pricing the sum quantises **once**, at the one place a quantity crosses
 * into score units, which is what §7.1 of `docs/RUNE-CLEANUP-MATH.md` promises.
 */
export function rollDistribution(
  valuation: Valuation, statId: number, count: number, range: { minimum: number; maximum: number } | undefined,
): Distribution {
  if (count === 0 || !range) return new Map([[0, 1]]);
  const out: Distribution = new Map();
  for (const [sum, probability] of rawRollSums(range.minimum, range.maximum, count)) {
    const key = probabilityKey(valuation.value(statId, sum));
    out.set(key, (out.get(key) ?? 0) + probability);
  }
  return out;
}

/** Every unordered draw without replacement. Each has equal probability. */
export function combinations<T>(items: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  const out: T[][] = [];
  const chosen: T[] = [];
  const visit = (from: number) => {
    if (chosen.length === count) { out.push([...chosen]); return; }
    for (let at = from; at <= items.length - (count - chosen.length); at += 1) {
      chosen.push(items[at]); visit(at + 1); chosen.pop();
    }
  };
  visit(0);
  return out;
}

const factorial = (n: number): number => { let f = 1; for (let at = 2; at <= n; at += 1) f *= at; return f; };

/**
 * Every way `events` upgrades can be split across `lines` lines — the compositions
 * of `events` into `lines` non-negative parts, with the multinomial weight of each.
 *
 * The split has to be enumerated rather than treated as independent draws, because
 * two upgrades landing on the same line interact: they share one roll interval and,
 * where a line has been reserved for an Enchanted Gem, they are both discarded
 * together. Four events across four lines is 35 splits, which is nothing.
 */
export function compositions(events: number, lines: number): Array<{ counts: number[]; weight: number }> {
  if (lines === 0) return events === 0 ? [{ counts: [], weight: 1 }] : [];
  const out: Array<{ counts: number[]; weight: number }> = [];
  const counts = new Array<number>(lines).fill(0);
  const walk = (at: number, left: number) => {
    if (at === lines - 1) {
      counts[at] = left;
      const ways = factorial(events) / counts.reduce((product, count) => product * factorial(count), 1);
      out.push({ counts: [...counts], weight: ways / lines ** events });
      return;
    }
    for (let take = 0; take <= left; take += 1) { counts[at] = take; walk(at + 1, left - take); }
    counts[at] = 0;
  };
  walk(0, events);
  return out;
}

