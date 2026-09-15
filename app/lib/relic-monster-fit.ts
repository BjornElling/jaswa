import {
  relicEngravingLimit, relicMainPropertyOrder, relicStrengthIndex,
} from './relic-properties';
import type { Relic } from './relics';
import type { MonsterCopyPreferences } from './monster-preferences';
import { relicSynergy } from './relic-synergy';
import type { RelicSynergyBand } from './relic-synergy';
import { relicShrunkShares, relicUsageStatus } from './relic-monster-statistics';
import type { RelicUsageStatistics, RelicUsageStatus } from './relic-monster-statistics';

export { relicEngravingLimit };

/**
 * The credit a property earns when this monster's players never choose it.
 *
 * **It is not zero, and the reason is not the one this file used to give.** The
 * old note claimed a floor was what let the page promise exactly one
 * recommendation per monster (§11.1). That was wrong twice over: `argmax` over a
 * finite, non-empty list of relics exists whatever the scores are, and the
 * stated tie-break already decides it — and the synergy term has a floor of its
 * own, so the fit could never have reached zero even with both usage terms at
 * nothing.
 *
 * The floor earns its place on a different argument. Without it, a monster whose
 * players reject every profile the account owns would score every relic at
 * `0.35·Y` and nothing else, and among relics sharing a band the strength index
 * would stop mattering — the page would answer such a monster with its oldest
 * relic rather than its best. The floor is a model assumption, stated as one: a
 * relic nobody engraves here is worth little, not literally nothing.
 */
export const relicUsageCreditFloor = 0.10;

/**
 * How sharply credit falls away from the monster's own leading choice.
 *
 * **This is calibrated, not chosen.** It replaces three hard steps — 1.00, 0.50,
 * 0.10 at fixed shares — and the exponent is the one that keeps the continuous
 * curve closest to the steps it replaces across all 1,017 captured panels
 * (RMSE 0.081 at `2`, against 0.138 at `1` and 0.088 at `3`). So the change here
 * is continuity, and deliberately not a change of policy.
 *
 * The steps were not defended as a shape; they were defended against one
 * particular ramp, `min(1, share / 0.40)`, which gives full credit to the
 * leading main on every monster in the game. This curve does not, because it is
 * measured against the leader rather than against a constant.
 */
export const relicUsageCreditExponent = 2;

/**
 * How much of what this relic delivers this monster's players actually want,
 * `0.10`–`1`.
 *
 * ```
 * credit = floor + (1 − floor) · (share / leading share) ^ exponent
 * ```
 *
 * **The comparison is against the monster's own leading option, not a fixed
 * share, and that is what makes one function serve both halves.** Three values
 * compete for a main property and sixteen for a unique, so a cut that is a real
 * bar for one is a low bar for the other — which is why the steps needed two
 * threshold pairs, the unique's being the main's halved. A ratio normalises that
 * away: the leader reads `1.00` on either half by construction, and the halving
 * stops being an assertion and becomes arithmetic.
 *
 * **It also separates the pair the steps could not.** The case for hard steps
 * was HP at 52 % against ATK at 39 %, which a ramp to 40 % scores 1.00 and 0.98.
 * The steps score them 1.00 and 0.50 — but only because 39 % happens to fall
 * below the cut. On the real monster nearest that description the shares are
 * 50.7 % and 40.2 %, and the steps score *both* 1.00, because both clear 40 %.
 * This curve reads 1.00 and 0.62, and goes on separating them wherever they sit.
 *
 * The exponent is what keeps the bottom punitive, which §11.2's own reasoning
 * asks for: a property chosen a fifth as often as the leader earns 0.14, not the
 * 0.28 a straight line would hand it.
 */
export function relicUsageCredit(share: number, leading: number): number {
  if (!(leading > 0)) return relicUsageCreditFloor;
  const ratio = Math.min(1, Math.max(0, share / leading));
  return relicUsageCreditFloor
    + (1 - relicUsageCreditFloor) * ratio ** relicUsageCreditExponent;
}

/**
 * The five synergy bands as suitability, `0`–`1`.
 *
 * These are steeper than §8's stone-investment multipliers and deliberately so.
 * There the ladder ranks which relic deserves a scarce power-up stone, and a
 * Weak relic that happens to be cheap to finish is still worth ranking. Here the
 * question is whether to put this relic on this monster, and
 * `RELIC-CANONICAL.md` §5.1 defines Weak as plausible only for a narrow need and
 * Poor as very rarely rational. A band that means "rarely rational" should not
 * read as a fifth of the way to exceptional.
 */
export const relicSynergySuitability: Record<RelicSynergyBand, number> = {
  exceptional: 1,
  strong: 0.75,
  neutral: 0.5,
  weak: 0.25,
  poor: 0.1,
};

/**
 * How the three suitability signals divide the judgement.
 *
 * **The unique property's own weight was 0.35 and is now 0.20, because the
 * statistic behind it turned out to be mostly a fact about the game rather than
 * about the monster.** Decomposing the credit's variance across the 1,017
 * captured panels: **81.7 % of the unique term's variation is explained by which
 * property it is, and only 18.3 % by which monster it is on.** The main property
 * is the other way round — 37.1 % against 62.9 %. Nimble Primal is the only
 * unique to reach the old top tier on 855 of the 1,017 panels, and the mean
 * number of uniques reaching it per monster is 0.88, so the term was close to a
 * restatement of "is this Nimble Primal".
 *
 * That matters because the synergy table already says so, at Exceptional on an
 * HP main and Strong on the other two. The same global preference was being paid
 * for twice — once as expert judgement and once as population habit — and the
 * fit had no term that could tell the two apart.
 *
 * **The weight moved to synergy and not to the main property, which is the part
 * measurement settled rather than argument.** Raising the main term looks
 * reasonable — it is the signal with real monster-specific content — and is
 * wrong: the synergy table is the *only* term that judges the unique property at
 * all once its own statistic is discounted, so taking weight off `unique` and
 * putting it on `main` leaves the unique half of a relic nearly unrepresented.
 * Tried against the dataset over random relic pools, `0.50 / 0.15 / 0.35` raises
 * the share of recommendations carrying a Weak or Poor pair from 15.4 % to
 * 25.4 %. `0.30 / 0.20 / 0.50` lowers it to 10.0 %.
 *
 * Main therefore stays at 0.30, where §11.4's argument left it: the synergy
 * table is indexed by main property, so the main already speaks twice and does
 * not need a third voice.
 */
export const relicSuitabilityWeights = { main: 0.30, unique: 0.20, synergy: 0.50 } as const;

export type RelicSuitability = {
  /** `0.10`–`1`, the weighted blend of the three signals below. */
  fit: number;
  main: number;
  unique: number;
  synergy: number;
  band: RelicSynergyBand;
  /** Whether the two usage terms rest on this monster's own panel. */
  status: RelicUsageStatus;
  /** The observed shares behind the two credits, or `null` where none were seen. */
  mainShare: number | null;
  uniqueShare: number | null;
};

/**
 * How suitable one relic is for one monster.
 *
 * **There is one path through this function, and there used to be two.** A
 * monster with no captured panel took a separate branch that read a table of
 * per-property average *credits*; a monster with one read hard tiers. Two models
 * disagree eventually, and `RELIC-CANONICAL.md` §11.3.1 records how these two
 * did — an unmeasured monster reaching `F = 1.00` on any exceptional pair while
 * a measured monster whose players favoured the same relic 69 % of the time
 * reached only 0.825. Evidence made the score go down.
 *
 * `relicShrunkShares` removes the branch rather than patching it. A monster with
 * no panel is the `n = 0` case of a monster with one: its counts are absent, so
 * the shrinkage returns the population's own distribution and the same curve
 * scores it. A thin panel lands in between, in proportion to how thin it is.
 *
 * The two shares stay `null` for an unmeasured monster rather than reporting the
 * population's: `undefined` and a number are different answers, and a reader
 * shown `50 % observed` would think something had been.
 */
export function relicSuitability(
  relic: Relic,
  usage: RelicUsageStatistics | undefined,
  /**
   * What the copy this relic is being judged for says it wants, where its owner
   * has said anything.
   *
   * **A statement replaces the population for the term it answers, and only
   * that term.** A user who named the mains they will accept has answered the
   * main question outright, so the shares stop speaking to it; if they said
   * nothing about uniques, the shares still answer that half. The two halves are
   * kept separate for the same reason the statement and the default are never
   * blended (`ARTIFACT-CANONICAL.md` §19.4): a merged answer is one neither
   * party gave.
   *
   * The synergy term is deliberately untouched. It is a fact about how a main
   * and a unique work together, not a preference about a monster, and it stays
   * the same judgement whoever is asking.
   */
  stated?: MonsterCopyPreferences,
): RelicSuitability {
  const band = relicSynergy(relic.mainProperty, relic.unique.definition.id);
  const synergy = relicSynergySuitability[band];
  const status = relicUsageStatus(usage);

  const shares = relicShrunkShares(usage);
  const leadingMain = Math.max(...relicMainPropertyOrder.map((property) => shares.main[property]));
  const leadingUnique = Math.max(0, ...shares.unique.values());

  /* A chosen option takes full credit and an unchosen one takes the floor —
     the same floor an unused property gets from the curve, so a relic the user
     did not ask for is ranked low rather than excluded outright. It can still
     be recommended when nothing better is owned, which is the honest answer:
     the alternative is an empty slot. An empty stated list means none are
     wanted, and every option then sits at the floor. */
  const statedMains = stated?.relics?.main;
  const statedUniques = stated?.relics?.unique;
  const main = statedMains === undefined
    ? relicUsageCredit(shares.main[relic.mainProperty], leadingMain)
    : (statedMains.includes(relic.mainProperty) ? 1 : relicUsageCreditFloor);
  const unique = statedUniques === undefined
    ? relicUsageCredit(shares.unique.get(relic.unique.definition.id) ?? 0, leadingUnique)
    : (statedUniques.includes(relic.unique.definition.id) ? 1 : relicUsageCreditFloor);

  return {
    fit: relicSuitabilityWeights.main * main
      + relicSuitabilityWeights.unique * unique
      + relicSuitabilityWeights.synergy * synergy,
    main,
    unique,
    synergy,
    band,
    status,
    mainShare: usage ? usage.mainShares[relic.mainProperty] : null,
    uniqueShare: usage ? usage.uniqueShares.get(relic.unique.definition.id) ?? 0 : null,
  };
}

/**
 * What this relic is worth on this monster, `0`–`1`.
 *
 * **Suitability scales strength; it does not sit beside it.** A relic's
 * power-up level says how much it delivers, and the three suitability signals
 * say how much of that delivery this monster can use. Those are not two
 * substitutable kinds of value that can be averaged: an 18 % DEF main on a pure
 * attacker is a large number pointed at nothing.
 *
 * An additive form was tried first and rejected on a case it decides wrongly.
 * At `0.50·S + 0.30·F + 0.20·Y` a `+15` relic banks 0.50 from its level alone,
 * whatever pair it carries, and a fully levelled DEF/Solid Conquest relic then
 * outscores a `+6` ATK/Sharp Conquest relic on an ATK monster although the
 * second is the relic that feeds the stat the monster builds.
 * `RELIC-CANONICAL.md` §11.4.1 keeps the arithmetic.
 *
 * **What it still does not do is model the effect.** JASWA holds the monster's
 * real stats, so the relic's actual contribution is computable; weighing
 * `+1.8 % DMG dealt` against `+9 % ATK` is what it cannot do without a role
 * model per monster. `relicStrengthIndex` is a development proxy — how far this
 * relic is from its own `+15` — and asking it to compare *different* relics on
 * one monster asks more of it than §7.2 claims. It is the model's largest
 * remaining approximation and `RELIC-CANONICAL.md` §11.8 states it as one.
 */
export function relicMonsterScore(relic: Relic, suitability: RelicSuitability): number {
  return relicStrengthIndex(relic.level, relic.unique.definition.per) * suitability.fit;
}

export type RelicCandidate = {
  relic: Relic;
  suitability: RelicSuitability;
  score: number;
};

/**
 * Every owned relic scored for one monster, best first.
 *
 * **A relic the monster already wears wins a tie, and acquisition order only
 * decides the rest.** Ordering equal scores on `rid` alone is deterministic and
 * still wrong here: it can name a relic that scores exactly what the incumbent
 * scores, and the row then asks for an engraving that buys nothing. The natural
 * order for this question is score, then what is already in place, then the
 * stable fallback §8.1 uses to choose between equal copies.
 */
export function rankRelicsForMonster(
  relics: readonly Relic[],
  usage: RelicUsageStatistics | undefined,
  worn: ReadonlySet<string> = new Set(),
  stated?: MonsterCopyPreferences,
): RelicCandidate[] {
  return relics
    .map((relic) => {
      const suitability = relicSuitability(relic, usage, stated);
      return { relic, suitability, score: relicMonsterScore(relic, suitability) };
    })
    .sort((left, right) => right.score - left.score
      || Number(worn.has(right.relic.id)) - Number(worn.has(left.relic.id))
      || left.relic.obtainedOrder - right.relic.obtainedOrder);
}

/**
 * How much better a relic must score before the page asks for the engraving to
 * be changed.
 *
 * **A recommendation is work, and the score is not precise enough to ask for it
 * over nothing.** Two relics separated by a thousandth are separated by a
 * rounding in a population share, a hand-set synergy band, or the exponent in
 * the credit curve — none of which is evidence that moving the engraving would
 * help. Below this margin the monster keeps what it wears.
 *
 * Five per cent is smaller than one synergy band at any level, so a real
 * upgrade is never suppressed; measured over random relic pools across every
 * captured panel it retires **1.1 %** of the changes the page would otherwise
 * ask for, which is the size of a churn correction rather than a policy.
 */
export const relicReplacementMargin = 0.05;

/** Why a monster did not get the relic it scored highest against. */
export type RelicRecommendationLimit = 'none' | 'capacity';

export type RelicRecommendation = {
  monsterId: string;
  /** The relic the plan engraves, or `null` when the account owns none. */
  chosen: RelicCandidate | null;
  /** The highest-scoring relic ignoring capacity, which `chosen` may not be. */
  ideal: RelicCandidate | null;
  /** Whether the monster already wears `chosen`, so no new engraving is spent. */
  alreadyEngraved: boolean;
  limit: RelicRecommendationLimit;
  /**
   * Whether the monster keeps what it wears because nothing available beat it by
   * `relicReplacementMargin`.
   */
  retained: boolean;
  /**
   * How many monsters wearing the blocked ideal relic today fit it *worse* than
   * this monster does.
   *
   * **This is the one figure on the row that reads the rest of the roster**, and
   * it is an annotation rather than part of the judgement, which is why it is
   * named apart from everything above it. §11.6's guarantee is that the
   * recommendation, the fit and the score are computed from this monster alone;
   * `verify:relic-monster-plan` holds those three and not this.
   *
   * It exists because the gate on the import's own counts otherwise treats the
   * account's history as correct. A relic full of 150 poor wearers is refused to
   * a monster that would use it far better, and until this figure the row's only
   * explanation was that the relic was full — a dead end rather than an action.
   * `0` where nothing is blocked, and where every current wearer fits it better.
   */
  displaceableWearers: number;
};

export type RelicAllocationSubject = {
  monsterId: string;
  /** Ordering for a deterministic pass; the roster's own row order serves. */
  monsterOrder: number;
  masterId: unknown;
  /** Relic ids this monster wears today. */
  wornRelicIds: readonly string[];
  /**
   * What this copy's owner says it wants, where they have said anything.
   *
   * It rides on the subject rather than arriving through `usageFor`, because
   * the two are keyed differently and cannot share a lookup: the statistics are
   * per species (`masterId`) and a statement is per owned copy (`monsterId`).
   */
  preferences?: MonsterCopyPreferences;
};

export type RelicAllocation = {
  recommendations: Map<string, RelicRecommendation>;
  /** How many monsters each relic ends up engraved on under the plan. */
  engravings: Map<string, number>;
  /** Relics the plan fills to `relicEngravingLimit`. */
  saturated: ReadonlySet<string>;
};

/** How many of a sorted ascending list fall strictly below a value. */
function countBelow(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * One relic for every monster: each monster's best, and the next best only once
 * a relic is *already* full.
 *
 * **Every monster is judged on its own.** The gate is the engraving count the
 * import actually carries, so a relic is withheld from a monster when the game
 * would refuse the engraving today and never merely because other monsters also
 * want it. A relic sitting on 150 monsters stays available to exactly those
 * monsters — re-recommending what a monster already wears costs no new
 * engraving — and is unavailable to everyone else.
 *
 * **It does not reserve places, and that is a deliberate choice with a cost.**
 * An earlier version was a greedy pass over every `(monster, relic)` pair in
 * score order, the same shape as `allocateArtifactPlacements`, so the plan was
 * feasible as a whole: the account's best relic went to its 150 best homes and
 * the rest were told to look elsewhere. It was feasible and it was unhelpful —
 * a monster was told to wear a second-rate relic because of a queue it could not
 * see, and the answer changed whenever the roster did. **Answering each monster
 * with its own best relic is the more useful of the two**, and §11.5 records
 * what it gives up: follow the column down a large roster and the 151st monster
 * wanting one relic will be refused by the game.
 *
 * **What the gate must not do is defend the account's history**, and until
 * `displaceableWearers` it did. Reading today's counts as a hard constraint
 * optimises inside the existing distribution rather than over the account: a
 * relic full of monsters that fit it badly stays full, and the monster that
 * would use it best is sent away with no way to see that unengraving one of them
 * is the actual move. The plan still will not reshuffle the roster on the user's
 * behalf — that is the reserving pass, with all of its costs — but the row now
 * counts the wearers it would beat.
 *
 * Nothing here reads a display filter, and nothing could: every row's verdict is
 * computed from that monster, the relics, and the counts in the import.
 */
export function allocateRelicEngravings(
  subjects: readonly RelicAllocationSubject[],
  relics: readonly Relic[],
  currentEngravings: ReadonlyMap<string, number>,
  usageFor: (masterId: unknown) => RelicUsageStatistics | undefined,
  limit = relicEngravingLimit,
): RelicAllocation {
  const engravings = new Map<string, number>();
  for (const relic of relics) engravings.set(relic.id, currentEngravings.get(relic.id) ?? 0);

  /* One scoring pass, kept, because the second pass needs both this monster's
     own ranking and — for the capacity annotation alone — how well the monsters
     already wearing a full relic score on it. */
  const ranked = new Map<string, RelicCandidate[]>();
  const wearerScores = new Map<string, number[]>();
  for (const subject of subjects) {
    const worn = new Set(subject.wornRelicIds);
    const candidates = rankRelicsForMonster(relics, usageFor(subject.masterId), worn, subject.preferences);
    ranked.set(subject.monsterId, candidates);
    for (const candidate of candidates) {
      if (!worn.has(candidate.relic.id)) continue;
      const scores = wearerScores.get(candidate.relic.id);
      if (scores) scores.push(candidate.score);
      else wearerScores.set(candidate.relic.id, [candidate.score]);
    }
  }
  for (const scores of wearerScores.values()) scores.sort((left, right) => left - right);

  const recommendations = new Map<string, RelicRecommendation>();
  for (const subject of subjects) {
    const worn = new Set(subject.wornRelicIds);
    const candidates = ranked.get(subject.monsterId) ?? [];
    const ideal = candidates[0] ?? null;
    const available = candidates.find((candidate) => worn.has(candidate.relic.id)
      || (engravings.get(candidate.relic.id) ?? 0) < limit) ?? null;
    /* The best-scoring relic the monster already wears — the list is sorted, so
       the first match is it. */
    const incumbent = candidates.find((candidate) => worn.has(candidate.relic.id)) ?? null;
    const retained = Boolean(available && incumbent && incumbent.relic.id !== available.relic.id
      && incumbent.score * (1 + relicReplacementMargin) >= available.score);
    const chosen = retained ? incumbent : available;
    const blocked = Boolean(available && ideal && available.relic.id !== ideal.relic.id);

    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId,
      chosen,
      ideal,
      alreadyEngraved: chosen ? worn.has(chosen.relic.id) : false,
      /* An account with no relics at all is not a capacity failure, so the two
         reasons a row can differ from its ideal stay apart. */
      limit: blocked ? 'capacity' : 'none',
      retained,
      displaceableWearers: blocked && ideal
        ? countBelow(wearerScores.get(ideal.relic.id) ?? [], ideal.score)
        : 0,
    });
  }

  const saturated = new Set<string>();
  for (const [relicId, count] of engravings) if (count >= limit) saturated.add(relicId);

  return { recommendations, engravings, saturated };
}

/**
 * A defensive boundary for callers and for `verify:relic-monster-plan`, holding
 * the pass to what it promises: exactly one answer per monster, drawn from the
 * monsters it was given, and never a relic the game would refuse today.
 */
export function assertRelicAllocation(
  allocation: RelicAllocation,
  subjects: readonly RelicAllocationSubject[],
  limit = relicEngravingLimit,
) {
  const known = new Map(subjects.map((subject) => [subject.monsterId, new Set(subject.wornRelicIds)]));
  for (const monsterId of allocation.recommendations.keys()) {
    if (!known.has(monsterId)) throw new Error('Relic allocation recommended a relic for a monster outside its scope.');
  }
  if (allocation.recommendations.size !== known.size) {
    throw new Error('Relic allocation must answer for every monster in its scope exactly once.');
  }
  for (const [monsterId, recommendation] of allocation.recommendations) {
    const relicId = recommendation.chosen?.relic.id;
    if (relicId === undefined || known.get(monsterId)?.has(relicId)) continue;
    if ((allocation.engravings.get(relicId) ?? 0) >= limit) {
      throw new Error(`Relic allocation recommended ${relicId} to a monster that does not wear it, though it is already on ${limit}.`);
    }
  }
}

/**
 * How close each half of a relic comes to the best that half could be on this
 * monster, as a share of the most-engraved option, `0`–`1`.
 *
 * **This is the reading, and it is deliberately the raw one.** The credit behind
 * the judgement shrinks the same share toward the population by the panel's own
 * size and then curves it (`relicUsageCredit`); this divides the counts the game
 * itself shows. The two are monotonically related and answer the same question,
 * and only this one can be checked against the game's own Statistics panel in a
 * glance — the leading option always reads 100 %, everything else reads its share
 * of that. A column the reader cannot check is a column the reader must trust.
 *
 * It is scale-free by construction, which is what makes two different monsters'
 * columns comparable down the page.
 *
 * `null` where there is nothing to measure against: no relic, or no captured
 * panel. A share of the population average would answer a different question,
 * and `0` would claim the population had rejected the property rather than that
 * nobody had counted.
 */
export function relicHalvesAgainstOptimum(
  relic: Relic | undefined,
  usage: RelicUsageStatistics | undefined,
): { main: number | null; unique: number | null } {
  if (!relic || !usage || relicUsageStatus(usage) !== 'measured') return { main: null, unique: null };
  const bestMain = Math.max(...relicMainPropertyOrder.map((property) => usage.mainShares[property]));
  const bestUnique = Math.max(0, ...usage.uniqueShares.values());
  return {
    main: bestMain > 0 ? usage.mainShares[relic.mainProperty] / bestMain : null,
    unique: bestUnique > 0 ? (usage.uniqueShares.get(relic.unique.definition.id) ?? 0) / bestUnique : null,
  };
}
