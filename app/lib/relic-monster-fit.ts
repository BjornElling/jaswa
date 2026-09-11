import {
  relicEngravingLimit, relicMainPropertyOrder, relicProperties, relicStrengthIndex,
} from './relic-properties';
import type { RelicMainProperty } from './relic-properties';
import type { Relic } from './relics';
import { relicSynergy } from './relic-synergy';
import type { RelicSynergyBand } from './relic-synergy';
import { leadingRelicMain, measuredRelicUsagePanels, relicUsageStatus } from './relic-monster-statistics';
import type { RelicUsageStatistics, RelicUsageStatus } from './relic-monster-statistics';

export { relicEngravingLimit };

/**
 * The share of a monster's engravings a main property needs before the
 * population counts as preferring it, and the share below which it counts as
 * the wrong profile.
 *
 * Three values compete for a main property, so chance alone puts one third of
 * the engravings on each. A cut at 40 % is therefore only just above chance —
 * and measured across the 1,017 captured panels, *every* monster has a main
 * above it. That is why these are three hard steps and not a ramp to 40 %: a
 * ramp gives the leading main full credit on every monster in the game and then
 * cannot separate HP at 52 % from ATK at 39 %, scoring them 1.00 and 0.98. The
 * steps score the same pair 1.00 and 0.50, which is the distinction the reader
 * is actually looking at.
 */
export const relicMainUsageTiers = { preferred: 0.40, plausible: 0.20 } as const;

/**
 * The same two cuts for a unique property, halved, because sixteen values
 * compete for it rather than three — chance alone is 6.25 %, so 20 % is a real
 * bar where for a main it would be a low one. This is the same reasoning
 * `ARTIFACT-CANONICAL.md` §19.3 uses to give a Main Property and a
 * sub-property list different thresholds, and the same halving.
 */
export const relicUniqueUsageTiers = { preferred: 0.20, plausible: 0.10 } as const;

/**
 * What each tier is worth. The bottom tier is deliberately punitive rather than
 * proportional: a profile almost nobody engraves on this monster is evidence
 * that it is the wrong profile, not merely a less popular right one. A
 * proportional floor would hand a quarter of the credit to a property with 5 %
 * uptake simply for existing.
 *
 * It is `0.10` and not `0` so that a monster always has a best relic. The page
 * makes exactly one recommendation per monster (§11.1), which it can only do if
 * no relic can score zero.
 */
export const relicUsageTierCredits = { preferred: 1, plausible: 0.5, unwanted: 0.1 } as const;

export type RelicUsageTier = keyof typeof relicUsageTierCredits;

function usageTier(share: number, tiers: { preferred: number; plausible: number }): RelicUsageTier {
  if (share >= tiers.preferred) return 'preferred';
  if (share >= tiers.plausible) return 'plausible';
  return 'unwanted';
}

export function relicMainUsageTier(share: number): RelicUsageTier {
  return usageTier(share, relicMainUsageTiers);
}

export function relicUniqueUsageTier(share: number): RelicUsageTier {
  return usageTier(share, relicUniqueUsageTiers);
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
 * Main takes the smallest share of the three even though it is the signal with
 * the most monster-specific information, and that is a considered choice rather
 * than an oversight: the synergy table is *indexed by* main property, so the
 * main already speaks twice — once here and once through `synergy`. Giving it
 * 0.30 rather than a third leaves the two mentions roughly balanced against the
 * unique property, which the statistics describe far less sharply.
 *
 * The three weights matter much less than the fact that they multiply strength
 * rather than adding to it. `RELIC-CANONICAL.md` §11.4 works the case that
 * settled it.
 */
export const relicSuitabilityWeights = { main: 0.30, unique: 0.35, synergy: 0.35 } as const;

/**
 * What a property's usage credit is worth on an *average* monster, taken across
 * every panel large enough to read.
 *
 * **This is what a monster with no panel is judged against, and it replaced a
 * worse answer.** The first fallback gave the two usage terms the synergy band's
 * own credit, which meant an unmeasured monster reached `F = 1.00` on any
 * exceptional pair — the ceiling of the measured scale. Measured against the
 * dataset that is perverse: the same `+15` ATK/Sharp Conquest relic scored
 * **1.000 on a monster with no panel and 0.825 on Beth**, whose players put ATK
 * main on it 69 % of the time. Evidence made the score go down, and since the
 * Score column orders the table, every unmeasured monster floated to the top.
 *
 * A prior fixes it in the right direction. With no monster-specific evidence,
 * the honest expectation for a property's credit is what that property earns
 * across the player base — high for HP main and Nimble Primal, low for DEF main
 * and the properties nobody engraves. It is neither optimistic nor pessimistic
 * on average, which is exactly what a prior should be.
 *
 * It is computed from the dataset rather than written down, so a capture session
 * moves it and no constant can go stale. Per property and not one global
 * number, because "expect an average main" and "expect an average *DEF* main"
 * are different claims and the second is the one that is true.
 *
 * **This deliberately uses the global level that §5.2 distrusts.** For a monster
 * with a panel, JASWA reads the monster's own distribution and never this; for
 * a monster without one there is nothing else, and a clearly labelled prior
 * beats both a flat guess and no answer at all.
 */
export type RelicUsagePriors = {
  main: Record<RelicMainProperty, number>;
  unique: Map<number, number>;
};

let cachedPriors: RelicUsagePriors | null = null;

export function relicUsagePriors(): RelicUsagePriors {
  if (cachedPriors) return cachedPriors;
  const panels = measuredRelicUsagePanels();
  const main: Record<RelicMainProperty, number> = { HP: 0, ATK: 0, DEF: 0 };
  const uniqueTotals = new Map<number, number>();
  for (const panel of panels) {
    for (const property of relicMainPropertyOrder) {
      main[property] += relicUsageTierCredits[relicMainUsageTier(panel.mainShares[property])];
    }
    for (const definition of relicProperties) {
      const share = panel.uniqueShares.get(definition.id) ?? 0;
      uniqueTotals.set(definition.id,
        (uniqueTotals.get(definition.id) ?? 0) + relicUsageTierCredits[relicUniqueUsageTier(share)]);
    }
  }
  /* No captured panel at all leaves the bottom credit standing for every
     property. That is the same answer the tiers give a property nobody
     engraves, and it keeps the fallback defined on a fresh checkout rather
     than dividing by zero. */
  const divide = (total: number) => panels.length ? total / panels.length : relicUsageTierCredits.unwanted;
  cachedPriors = {
    main: {
      HP: divide(main.HP),
      ATK: divide(main.ATK),
      DEF: divide(main.DEF),
    },
    unique: new Map(relicProperties.map((definition) =>
      [definition.id, divide(uniqueTotals.get(definition.id) ?? 0)])),
  };
  return cachedPriors;
}

export type RelicSuitability = {
  /** `0.10`–`1`, the weighted blend of the three signals below. */
  fit: number;
  main: number;
  unique: number;
  synergy: number;
  mainTier: RelicUsageTier;
  uniqueTier: RelicUsageTier;
  band: RelicSynergyBand;
  /** Whether the two usage terms came from the statistics or fell back to synergy. */
  status: RelicUsageStatus;
  /** The observed shares behind the two tiers, or `null` where none were used. */
  mainShare: number | null;
  uniqueShare: number | null;
};

/**
 * How suitable one relic is for one monster.
 *
 * **A monster with no usable panel keeps its synergy term and takes the
 * population's prior for the other two** (`relicUsagePriors`). That keeps the
 * page's promise of exactly one recommendation per monster without inventing a
 * tier out of an absent or eleven-observation distribution, and without letting
 * an unmeasured monster outscore a measured one.
 *
 * The two shares stay `null` rather than becoming the prior's value, because
 * `undefined` and a number are different answers: nothing was observed here,
 * and a reader shown `50 % observed` would think something had been.
 */
export function relicSuitability(
  relic: Relic,
  usage: RelicUsageStatistics | undefined,
): RelicSuitability {
  const band = relicSynergy(relic.mainProperty, relic.unique.definition.id);
  const synergy = relicSynergySuitability[band];
  const status = relicUsageStatus(usage);

  if (!usage || status !== 'measured') {
    const priors = relicUsagePriors();
    const main = priors.main[relic.mainProperty];
    const unique = priors.unique.get(relic.unique.definition.id) ?? relicUsageTierCredits.unwanted;
    return {
      fit: relicSuitabilityWeights.main * main
        + relicSuitabilityWeights.unique * unique
        + relicSuitabilityWeights.synergy * synergy,
      main,
      unique,
      synergy,
      mainTier: 'unwanted',
      uniqueTier: 'unwanted',
      band,
      status,
      mainShare: null,
      uniqueShare: null,
    };
  }

  const mainShare = usage.mainShares[relic.mainProperty];
  const uniqueShare = usage.uniqueShares.get(relic.unique.definition.id) ?? 0;
  const mainTier = relicMainUsageTier(mainShare);
  const uniqueTier = relicUniqueUsageTier(uniqueShare);
  const main = relicUsageTierCredits[mainTier];
  const unique = relicUsageTierCredits[uniqueTier];

  return {
    fit: relicSuitabilityWeights.main * main
      + relicSuitabilityWeights.unique * unique
      + relicSuitabilityWeights.synergy * synergy,
    main,
    unique,
    synergy,
    mainTier,
    uniqueTier,
    band,
    status,
    mainShare,
    uniqueShare,
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
 * outscores a `+6` ATK/Sharp Conquest relic on an ATK monster — 0.73 to 0.71 —
 * although the second is the relic that feeds the stat the monster builds.
 * Multiplying answers the same case 0.38 to 0.42, and `RELIC-CANONICAL.md`
 * §11.4 keeps the arithmetic.
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
 * Ties are broken on acquisition order, the same deterministic rule §8.1 uses
 * to decide which of two equal copies an account keeps. Hard tiers make exact
 * ties common by design — two relics whose tiers and level agree score
 * identically — so a stated fallback is what stops two runs of the same data
 * ranking them differently.
 */
export function rankRelicsForMonster(
  relics: readonly Relic[],
  usage: RelicUsageStatistics | undefined,
): RelicCandidate[] {
  return relics
    .map((relic) => {
      const suitability = relicSuitability(relic, usage);
      return { relic, suitability, score: relicMonsterScore(relic, suitability) };
    })
    .sort((left, right) => right.score - left.score
      || left.relic.obtainedOrder - right.relic.obtainedOrder);
}

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
};

export type RelicAllocationSubject = {
  monsterId: string;
  /** Ordering for a deterministic pass; the roster's own row order serves. */
  monsterOrder: number;
  masterId: unknown;
  /** Relic ids this monster wears today. */
  wornRelicIds: readonly string[];
};

export type RelicAllocation = {
  recommendations: Map<string, RelicRecommendation>;
  /** How many monsters each relic ends up engraved on under the plan. */
  engravings: Map<string, number>;
  /** Relics the plan fills to `relicEngravingLimit`. */
  saturated: ReadonlySet<string>;
};

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
 * Nothing here reads a display filter, and now nothing could: every row is
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

  const recommendations = new Map<string, RelicRecommendation>();
  for (const subject of subjects) {
    const worn = new Set(subject.wornRelicIds);
    const candidates = rankRelicsForMonster(relics, usageFor(subject.masterId));
    const ideal = candidates[0] ?? null;
    const chosen = candidates.find((candidate) => worn.has(candidate.relic.id)
      || (engravings.get(candidate.relic.id) ?? 0) < limit) ?? null;
    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId,
      chosen,
      ideal,
      alreadyEngraved: chosen ? worn.has(chosen.relic.id) : false,
      /* An account with no relics at all is not a capacity failure, so the two
         reasons a row can differ from its ideal stay apart. */
      limit: chosen && ideal && chosen.relic.id !== ideal.relic.id ? 'capacity' : 'none',
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
 * The leading main property on this monster, as the reason line words it. Kept
 * here rather than in the component so the sentence a user reads and the tier
 * that produced it come from one place.
 */
export function relicUsageLeadingMain(usage: RelicUsageStatistics): RelicMainProperty {
  return leadingRelicMain(usage);
}

/**
 * How close each half of a relic comes to the best that half could be on this
 * monster, as a share of the most-engraved option, `0`–`1`.
 *
 * **This is a reading, not a score.** The judgement uses the fixed tiers in
 * §11.2, which are the right shape for deciding but the wrong shape for showing:
 * a tier tells the user which of three boxes a property fell into, while this
 * says how far it is from the best available. A main with 39 % on a monster
 * whose leader has 40 % and one with 21 % on the same monster share a tier and
 * are plainly not the same relic.
 *
 * It is scale-free by construction — the leading option always reads 100 % —
 * which is what makes two different monsters' columns comparable down the page.
 *
 * `null` where there is nothing to measure against: no relic, or a panel that
 * is missing or too thin to read. A share of the population average would be
 * an answer to a different question, and `0` would claim the population had
 * rejected the property rather than that nobody had counted.
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
