/**
 * What to do with each rune: the policy, and nothing but the policy.
 *
 * `docs/RUNE-CLEANUP-MATH.md` §9 owns this. **Every figure it reads comes from
 * `rune-cleanup-model.ts` and is computed there**, so a verdict and the chance
 * printed beside it can never come from two different calculations. This file
 * decides what the numbers mean; it does not produce them.
 *
 * The questions it asks, in the order they outrank each other: is this rune of a
 * kind the account wants at all, is its best possible end state good enough, and is
 * it likely enough to get there.
 */
import type { Rune } from './runes';
import type { RunePotentialPreset } from './rune-potential-presets';
import type { RunePotentialSettings } from './types';
import type { ReferenceStats } from './rune-reference-stats';
import { craftRollValue, craftValueRange } from './rune-craft-items';
import { isFourPieceSet, judgeAgainstBuild, presetBuilds } from './rune-cleanup-model';
import type { Build, MatchRank } from './rune-cleanup-model';

export type RuneVerdict = 'power-up' | 'keep' | 'sell';

export const runeVerdictOrder: readonly RuneVerdict[] = ['power-up', 'keep', 'sell'];

export const runeVerdictLabels: Record<RuneVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};

/**
 * The Max value a rune must be able to reach, by the Rune quality floor slider.
 *
 * The stops are the calibrated ones: at `3`, the setting the slider opens on, about
 * 15 % of an ordinary box survives, which is the figure
 * `scripts/verify-rune-cleanup-calibration.mjs` measures and holds. They are
 * percentages of a perfect rune for the role, so `0.55` means "reaches at least
 * 55 % of what the best possible rune for this preset would".
 */
export const qualityThresholds: readonly number[] = [0.41, 0.49, 0.55, 0.62, 0.69];

/**
 * How likely a rune must be to reach that floor before its mana is worth spending,
 * by the Power-up policy slider.
 *
 * It runs the other way from the quality floor: stop `1` is Full YOLO and asks for
 * almost no certainty, stop `5` takes no chances. The two bars are independent on
 * purpose — how good a rune must end up and how sure you must be are different
 * questions, and a player who wants a high ceiling on a long shot is entitled to say
 * so.
 */
export const chanceThresholds: readonly number[] = [0.02, 0.08, 0.20, 0.40, 0.70];

/**
 * What a rune the preset merely accepts is worth against one it prefers, by the
 * Accepted runes slider. A multiplier on Max value, so an accepted rune has to be
 * that much better in itself to earn the same verdict.
 */
export const acceptedWorth: readonly number[] = [1.00, 0.85, 0.70, 0.55, 0.40];

/**
 * The same for a rune the preset names neither way. The last stop is `0`: "No"
 * means no, and no amount of quality redeems a set the role never asked for.
 */
export const brokenWorth: readonly number[] = [0.80, 0.60, 0.40, 0.20, 0];

/** Where in a gem's or grindstone's range the credited roll is assumed to land. */
const creditFractions: readonly (number | null)[] = [null, 0.5, 0.75, 1];

/**
 * How a wanted-count multiplier becomes a score multiplier.
 *
 * A preset's share, the four-set switch and the Intangible slider all say *how many*
 * runes are wanted, not how good one has to be. There is no closed form between the
 * two — the answer depends on how the scores of real runes are distributed — so it
 * is measured rather than derived: `verify:rune-cleanup-calibration` scores a
 * million simulated runes and solves for the multiplier that actually makes the kept
 * count scale by each stated factor. These are the solved values, and regenerating
 * them is a run of that script rather than an edit here.
 *
 * The curve is steep downwards and shallow upwards, which is the part no one would
 * have guessed. Scores thin out fast above the bar and pile up below it, so asking
 * for a tenth as many runes costs only a third more quality, while asking for ten
 * times as many needs the bar cut by 70 % — and even then it saturates, because
 * there are not ten times as many runes to find.
 */
export const wantedCountMultipliers: ReadonlyArray<{ wanted: number; score: number }> = [
  { wanted: 0.1, score: 1.36 },
  { wanted: 0.2, score: 1.27 },
  { wanted: 1 / 3, score: 1.21 },
  { wanted: 0.5, score: 1.14 },
  { wanted: 1, score: 1.00 },
  { wanted: 2, score: 0.84 },
  { wanted: 3, score: 0.70 },
  { wanted: 5, score: 0.50 },
  { wanted: 10, score: 0.30 },
];

/** The score multiplier for an arbitrary wanted-count factor, by interpolation. */
export function scoreMultiplierFor(wanted: number): number {
  const points = wantedCountMultipliers;
  if (wanted <= points[0].wanted) return points[0].score;
  const last = points[points.length - 1];
  if (wanted >= last.wanted) return last.score;
  for (let at = 1; at < points.length; at += 1) {
    const low = points[at - 1];
    const high = points[at];
    if (wanted <= high.wanted) {
      const along = (Math.log(wanted) - Math.log(low.wanted)) / (Math.log(high.wanted) - Math.log(low.wanted));
      return low.score + along * (high.score - low.score);
    }
  }
  return 1;
}

/**
 * What each slot's bar is multiplied by so that the six slots survive in equal
 * numbers.
 *
 * Slots 2, 4 and 6 choose their own main property, and a preset names only one or
 * two it will accept — so most of their runes are rejected on the main stat before
 * anything else is asked of them. Without this the account would end up with three
 * times as many slot-1 runes as slot-6 ones and no way to build anything.
 *
 * Measured, not chosen: the calibration run reports how many of each slot survive
 * and solves for the multiplier that levels them. On the simulated farm it takes the
 * spread between the best and worst slot from **10.7× to 1.14×** at the middle
 * setting, with 14.5 % of runes surviving to +12.
 *
 * **It is solved at the middle setting and drifts at the ends.** At the strictest
 * stop the spread opens to about 4×, because the shape of the score distribution is
 * not the same at every bar and one scalar per slot cannot follow it. That is a
 * known limit of a single multiplier rather than a bug, and the honest fix — a
 * multiplier per slot *per stop* — buys little for a setting almost nobody sits on.
 */
export const slotBalance: Readonly<Record<number, number>> = {
  1: 1.249, 2: 0.842, 3: 1.291, 4: 0.620, 5: 1.118, 6: 0.680,
};

/** The share steps a preset can be set to, as plain multipliers. */
const shareFactors: readonly number[] = [0.1, 0.2, 1 / 3, 0.5, 1, 2, 3, 5, 10];

/** How much more an Intangible rune is wanted, by the Intangible runes slider. */
const intangibleFactors: readonly number[] = [1, 1.5, 2, 3.5, 5];

export type RuneAdvice = {
  verdict: RuneVerdict;
  /** The chance itself, as the row prints it — never the internal score. */
  reason: string;
  /** `0`–`1`, after every discount and multiplier. */
  maxValue: number;
  /** `0`–`1`: the chance of reaching the bar by +12. */
  chance: number;
  /** The preset this rune answers best, or `null` when none can use it. */
  preset: RunePotentialPreset | null;
  rank: MatchRank;
};

const percent = (fraction: number) => {
  const value = fraction * 100;
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)} %`;
  if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')} %`;
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} %`;
};

/**
 * The value a credited gem or grindstone is assumed to roll, in the stat's own
 * units. `0` when the slider says none, or when the item cannot carry that stat.
 */
function creditValue(
  statId: number, kind: 'gem' | 'grindstone', grade: RunePotentialSettings['gemGrade'], step: number,
): number {
  const fraction = creditFractions[step - 1];
  if (fraction === null || fraction === undefined) return 0;
  const range = craftValueRange(kind, 'standard', statId, grade);
  if (!range) return 0;
  return craftRollValue(range, fraction === 0.5 ? 'average' : fraction === 0.75 ? 'three-quarters' : 'maximum');
}

/**
 * Every rune's advice at once.
 *
 * Whole-account rather than per-rune because the thresholds a rune is held to are
 * account-wide: the same slider settings, the same presets and the same reference
 * base line decide every row, and computing them once per call is what keeps two
 * rows from being judged against two different bars.
 */
export function runeAdvice(
  runes: readonly Rune[], presets: readonly RunePotentialPreset[],
  settings: RunePotentialSettings, base: ReadonlyMap<string, ReferenceStats>,
): Map<string, RuneAdvice> {
  const qualityBar = qualityThresholds[settings.runeQuality - 1] ?? qualityThresholds[2];
  const chanceBar = chanceThresholds[settings.powerUpPolicy - 1] ?? chanceThresholds[2];
  const accepted = acceptedWorth[settings.acceptedRunes - 1] ?? acceptedWorth[2];
  const broken = brokenWorth[settings.brokenRunes - 1] ?? brokenWorth[2];
  const intangible = intangibleFactors[settings.intangibleRunes - 1] ?? 1;

  /* Builds are the same for every rune, so they are enumerated once. About sixty
     across the shipped presets; a preset with three choices in every slot would
     give twenty-four on its own, which is still nothing. */
  const builds = new Map<string, Build[]>(presets.map((preset) => [preset.id, presetBuilds(preset)]));

  const advice = new Map<string, RuneAdvice>();
  for (const rune of runes) {
    /* Only ordinary six-star runes have a verified roll table. An Ancient rune is a
       six-star rune the game rolls higher and no source has tabulated (§7), so it
       gets no projection rather than a plausible one. */
    if (rune.ancient || rune.stars !== 6) {
      advice.set(rune.id, {
        verdict: 'keep', maxValue: 0, chance: 0, preset: null, rank: 'broken',
        reason: rune.ancient ? 'Not rated: Ancient' : `Not rated: ${rune.stars}★`,
      });
      continue;
    }

    const credit = {
      gem: 0,
      grind: creditValue(rune.subProperties[0]?.statId ?? 0, 'grindstone', settings.grindstoneGrade, settings.grindstones),
    };

    /* Every preset and build this rune could serve, valued but not yet gated.
       Selecting a winner on Max value alone and *then* asking whether its chance
       clears the bar is how a rune gets sold: a build worth 91 % at a 30 % chance
       would beat one worth 90 % at 70 %, and only the second one survives both
       gates. So the gates are applied to each candidate and the verdict is taken
       across all of them. */
    const candidates: Array<{ preset: RunePotentialPreset; build: Build; value: number; rank: MatchRank; bar: number }> = [];
    for (const preset of presets) {
      const line = base.get(preset.type);
      if (!line) continue;
      /* The bar this rune faces for this preset: the quality floor, adjusted for how
         many of this preset's runes are wanted, whether a four-set is wanted twice
         over, how badly Intangible is wanted, and the slot's own balance. */
      const wanted = (shareFactors[preset.runeShare - 1] ?? 1)
        * (settings.keepMoreForLargerSets && isFourPieceSet(rune.setName) ? 2 : 1)
        * (rune.setName === 'Intangible' ? intangible : 1);
      const bar = qualityBar * scoreMultiplierFor(wanted) * (slotBalance[rune.slot] ?? 1);
      const gemStat = rune.subProperties[0]?.statId ?? 0;
      const gem = creditValue(gemStat, 'gem', settings.gemGrade, settings.enchantedGems);

      for (const build of builds.get(preset.id) ?? []) {
        const outcome = judgeAgainstBuild(rune, preset, build, line, bar, { gem, grind: credit.grind }, false);
        if (!outcome) continue;
        const worth = outcome.rank === 'preferred' ? 1 : outcome.rank === 'acceptable' ? accepted : broken;
        candidates.push({ preset, build, value: outcome.maxValue * worth, rank: outcome.rank, bar });
      }
    }

    /* Best first, so the strongest candidate that also clears the chance bar wins,
       and so a rune that clears nothing still reports its best showing rather than
       an arbitrary one. */
    candidates.sort((left, right) => right.value - left.value);
    let chosen: { value: number; chance: number; preset: RunePotentialPreset | null; rank: MatchRank } | null = null;
    let fallback: { value: number; chance: number; preset: RunePotentialPreset | null; rank: MatchRank } | null = null;
    for (const candidate of candidates) {
      const line = base.get(candidate.preset.type);
      if (!line) continue;
      const passesValue = candidate.value >= candidate.bar;
      if (!passesValue && fallback !== null) continue;
      const gemStat = rune.subProperties[0]?.statId ?? 0;
      /* The chance has to be the chance of clearing the *same* bar the value was
         judged against. The value carries the accepted/broken discount, so the fill
         the rune actually has to reach is the bar divided by that discount —
         otherwise an accepted rune would be discounted once in its score and not at
         all in its odds, and the two halves of the row would disagree. */
      const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
      const outcome = judgeAgainstBuild(rune, candidate.preset, candidate.build, line,
        worth > 0 ? candidate.bar / worth : Number.POSITIVE_INFINITY, {
          gem: creditValue(gemStat, 'gem', settings.gemGrade, settings.enchantedGems), grind: credit.grind,
        }, true);
      if (!outcome) continue;
      const answer = { value: candidate.value, chance: outcome.chance, preset: candidate.preset, rank: candidate.rank };
      if (fallback === null) fallback = answer;
      if (passesValue && outcome.chance >= chanceBar) { chosen = answer; break; }
    }

    const result = chosen ?? fallback;
    advice.set(rune.id, decide({
      rune,
      value: result?.value ?? 0,
      chance: result?.chance ?? 0,
      preset: result?.preset ?? null,
      rank: result?.rank ?? 'broken',
      qualityBar: chosen ? 0 : (candidates[0]?.bar ?? qualityBar),
      chanceBar: chosen ? 0 : chanceBar,
      brokenRejected: broken === 0,
    }));
  }
  return advice;
}

/**
 * The decision, in the order the rules outrank each other.
 *
 * **The broken gate is asked first**, and it is the one the sliders cannot argue
 * with: "No" on Broken runes means the account only wants runes a preset asked for,
 * and a rune that reaches a wonderful end state in a set nothing wants is still a
 * rune nothing wants. Asking about its ceiling first would let quality overturn a
 * choice the user has already made.
 *
 * Then the ceiling, then the chance. The order matters: a rune that cannot reach the
 * bar however lucky it gets should be sold for that reason, not for having a low
 * chance of something it could never do anyway.
 */
function decide({ rune, value, chance, preset, rank, qualityBar, chanceBar, brokenRejected }: {
  rune: Rune; value: number; chance: number; preset: RunePotentialPreset | null; rank: MatchRank;
  qualityBar: number; chanceBar: number; brokenRejected: boolean;
}): RuneAdvice {
  const base = { maxValue: value, chance, preset, rank };
  if (preset === null) {
    return { ...base, verdict: 'sell', reason: 'No preset can use it' };
  }
  if (rank === 'broken' && brokenRejected) {
    return { ...base, verdict: 'sell', reason: 'Broken: not wanted' };
  }
  if (value < qualityBar) {
    return { ...base, verdict: 'sell', reason: percent(chance) };
  }
  if (chance < chanceBar) {
    return { ...base, verdict: 'sell', reason: percent(chance) };
  }
  return {
    ...base,
    verdict: rune.level < 12 ? 'power-up' : 'keep',
    reason: rune.level >= 12 ? 'Already there' : percent(chance),
  };
}
