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
import {
  boxThreshold, candidateChanceAskForReading, candidateOwnMaxValue, isFourPieceSet,
  newRuneAdviceScope, ordinaryBox, prepareRuneCandidate, presetBuilds, standingIn,
} from './rune-cleanup-model';
import type {
  Build, ChanceAsk, CountingJob, CraftCredit, MatchRank, OrdinaryBox, RuneCandidate,
} from './rune-cleanup-model';
import { countJobs } from './rune-power-up-outcomes';
import { craftAssumptionForSetting } from './rune-craft-items';
import { craftedLines } from './rune-craft-end-state';
import type { EndStateLine } from './rune-craft-end-state';

/**
 * Who answers the odds.
 *
 * The whole account's remaining questions arrive as one list, and whoever answers
 * gives back one share per job in the same order. The processor's answer is
 * `countJobs`; the worker hands this the graphics card instead when the user's
 * setting allows it and the card has proved itself. Nothing in this file knows which
 * one it got, which is the point — a verdict cannot depend on where it was computed.
 */
export type ChanceCounter = (jobs: readonly CountingJob[], chanceBar?: number) => Promise<Float64Array>;

/**
 * Every question about odds this call will ask, written down before any is answered.
 *
 * An ask can settle itself — a rune at `+12`, or one that cannot reach the bar by any
 * road — and those never become jobs at all. The rest are numbered, gathered into one
 * list, and handed back by number once the batch comes home.
 */
class ChanceLedger {
  private readonly asks: ChanceAsk[] = [];
  private readonly starts: number[] = [];
  private pending = 0;

  add(ask: ChanceAsk): number {
    this.asks.push(ask);
    this.starts.push(this.pending);
    this.pending += ask.jobs.length;
    return this.asks.length - 1;
  }

  jobs(): CountingJob[] {
    const all: CountingJob[] = [];
    for (const ask of this.asks) for (const job of ask.jobs) all.push(job);
    return all;
  }

  settle(shares: Float64Array): number[] {
    if (shares.length !== this.pending) {
      throw new Error('The chance counter returned an unexpected number of answers.');
    }
    return this.asks.map((ask, at) =>
      ask.combine(Array.from(shares.subarray(this.starts[at], this.starts[at] + ask.jobs.length))));
  }
}

/** One preset's best reading of one rune, valued but not yet gated. */
type Contender = {
  preset: RunePotentialPreset; prepared: RuneCandidate; box: OrdinaryBox; neutralBox: OrdinaryBox;
  value: number; maxValue: number; neutralValue: number; neutralMaxValue: number; rank: MatchRank;
};

/** One contender the policy will walk, with its questions already numbered. */
type Step = { candidate: Contender; passesValue: boolean; current: number };

type RunePlan = { rune: Rune; retentionShare: number; steps: Step[]; neutralSteps: Step[] };

type Answer = {
  value: number; maxValue: number; chance: number; priority: number;
  preset: RunePotentialPreset; rank: MatchRank;
  /** The credited reading of this preset's build, whose craft decision the row stands on. */
  candidate: RuneCandidate;
};

export type RuneVerdict = 'power-up' | 'keep' | 'sell';

export const runeVerdictOrder: readonly RuneVerdict[] = ['power-up', 'keep', 'sell'];

export const runeVerdictLabels: Record<RuneVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};

/**
 * **The share of an ordinary box of runes each stop of the Rune quality floor lets
 * through** — a third of it at `1`, about 15 % at `3`, a few per cent at `5`.
 *
 * The box is the synthetic one §9 has always named: ordinary six-star runes at `+12`
 * for this role. What changed is that the slider now *states* that share instead of
 * being calibrated to produce it, and the model works out what Max value it comes to
 * **in the slot the rune is actually in**.
 *
 * That is the whole of the slot fix, expressed in one line. A stop stated as one Max
 * value cannot mean the same thing in two slots that may not carry the same effect
 * ids: slot 1 may never carry DEF and slot 3 may never carry ATK, so for a Def DD
 * account the same `0.49` admitted 25 % of the ordinary slot-3 runes and 5 % of the
 * ordinary slot-4 ones. Stated as a share of each slot's own box, it admits the same
 * fraction of every slot by construction, whatever the preset asks for.
 * `rune-cleanup-model.ts`'s `ordinaryBox` is the arithmetic and §9.1 is the reasoning.
 *
 * **This is the second time the stops have been restated**, and the reason is the
 * same both times: a calibrated number left alone through a change of scale silently
 * stops meaning what it says. Before the substat weights they ran `0.41`–`0.69` as
 * Max values, after them `0.36`–`0.63`, and both ladders were this ladder — the
 * shares were always what the ladder was chosen to produce.
 */
export const qualityThresholds: readonly number[] = [0.33, 0.23, 0.15, 0.09, 0.04];

/**
 * How likely a rune must be to reach that floor before its mana is worth spending,
 * by the Power-up policy slider.
 *
 * It runs the other way from the quality floor: stop `1` is Full YOLO and asks for
 * almost no certainty, stop `5` takes no chances. The two bars are independent on
 * purpose — how good a rune must end up and how sure you must be are different
 * questions, and a player who wants a high ceiling on a long shot is entitled to say
 * so. The practical ladder is deliberately shifted one stop towards leniency: the
 * old `Adventurous` bar now belongs to `Balanced`, while the new intermediate stop
 * keeps `Adventurous` distinct instead of making two labels share a value.
 */
export const chanceThresholds: readonly number[] = [0.02, 0.06, 0.08, 0.20, 0.40];

/**
 * What a rune the preset merely accepts is worth against one it prefers, by the
 * Accepted runes slider. A multiplier on Max value, so an accepted rune has to be
 * that much better in itself to earn the same verdict. The middle of the ladder is
 * also shifted one stop towards leniency, so the old `Forgiving` bar is now
 * `Quality is quality`.
 */
export const acceptedWorth: readonly number[] = [1.00, 0.95, 0.85, 0.70, 0.55];

/**
 * The same for a rune the preset names neither way. The middle of the ladder is
 * shifted one stop towards leniency, so the old `A good rune is a good rune` bar is
 * now `Occasionally`. The last stop remains `0`: "No" means no, and no amount of
 * quality redeems a set the role never asked for.
 */
export const brokenWorth: readonly number[] = [0.80, 0.70, 0.60, 0.40, 0];

/** How much more an Intangible rune is wanted, by the Intangible runes slider. */
const intangibleFactors: readonly number[] = [1, 1.5, 2, 3.5, 5];

export type RuneAdvice = {
  verdict: RuneVerdict;
  /** The chance itself, as the row prints it — never the internal score. */
  reason: string;
  /** Against a perfect ordinary rune, after the preferred/acceptable/broken discount; Ancient can exceed 1. */
  maxValue: number;
  /**
   * `0`–`1` from an ordinary rune of this slot to a perfect one, after the same
   * discount — the figure the gates actually settled on.
   *
   * It is carried out of the engine rather than kept private so that the page can
   * explain why a slot-4 rune was kept beside a slot-3 rune that reads higher, and
   * so `verify:rune-slot-neutrality` can check the scale rather than only its
   * consequences.
   */
  standing: number;
  /** `0`–`1`: the chance of reaching the bar by +12. */
  chance: number;
  /** The preset this rune answers best, or `null` when none can use it. */
  preset: RunePotentialPreset | null;
  rank: MatchRank;
  /**
   * For a rune at `+12`, the line-up its Max value assumed: every grindable line
   * ground and the Gem spent where it gains most for `preset`, as `craftedLines`
   * decides it. `null` below `+12`, where the lines are not final, and where no
   * preset can use the rune. Carried out so that whatever acts on the verdict spends
   * the items the verdict counted, rather than deciding the craft a second time.
   */
  craftedLines: EndStateLine[] | null;
};

/**
 * The chance, as the row prints it.
 *
 * **A tenth of a percentage point is the floor, and it is not a presentation choice.**
 * The odds are counted over `chanceRuns` runs (`docs/RUNE-CLEANUP-MATH.md` §7.2), so
 * the finest answer the engine can give is one run in four thousand — about
 * 0.024 points. Printing `0.03 %` from a single run that happened to clear the bar
 * would claim two decimals the calculation does not have. Anything real but below
 * that floor says so instead, and `0 %` still means the engine settled it at zero
 * rather than failing to find one.
 */
const percent = (fraction: number) => {
  const value = fraction * 100;
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)} %`;
  if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')} %`;
  if (value >= 0.1) return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} %`;
  return value > 0 ? 'under 0.1 %' : '0 %';
};

/**
 * **Every rune's advice at once, in three passes.**
 *
 * Whole-account rather than per-rune because the thresholds a rune is held to are
 * account-wide: the same slider settings, the same presets and the same reference
 * base line decide every row, and computing them once per call is what keeps two
 * rows from being judged against two different bars.
 *
 * The three passes are what let the odds be answered anywhere but here:
 *
 * 1. **What is certain.** Every rune against every build of every preset: the weights,
 *    the perfect rune of its slot, the box of ordinary runes it is measured in, its
 *    own Max value and its standing. Nothing random, nothing deferred. Every question
 *    about odds that the policy will ask is *written down* rather than answered, and
 *    most of them are settled on the spot — a rune at `+12` has no gamble left, and
 *    of the rest most cannot reach the bar by any road or cannot miss it.
 * 2. **What is left.** Whatever questions remain go to `count` in one batch. That is
 *    the only reason the pass exists: one batch is one errand for the graphics card,
 *    where a question at a time would be thousands of them, and the processor's own
 *    version is faster for it too, because a rune is played forward once however many
 *    presets are asking about it.
 * 3. **What it means.** The policy, with the answers in hand. It walks exactly the
 *    candidates the first pass walked, because what it skips depends on Max value and
 *    the retention share and never on the odds.
 */
export async function runeAdvice(
  runes: readonly Rune[], presets: readonly RunePotentialPreset[],
  settings: RunePotentialSettings, base: ReadonlyMap<string, ReferenceStats>,
  /** Who answers the odds. The processor by default; the worker passes the card. */
  count: ChanceCounter = async (jobs) => countJobs(jobs),
): Promise<Map<string, RuneAdvice>> {
  const qualityBar = qualityThresholds[settings.runeQuality - 1] ?? qualityThresholds[2];
  const chanceBar = chanceThresholds[settings.powerUpPolicy - 1] ?? chanceThresholds[2];
  const accepted = acceptedWorth[settings.acceptedRunes - 1] ?? acceptedWorth[2];
  const broken = brokenWorth[settings.brokenRunes - 1] ?? brokenWorth[2];
  const intangible = intangibleFactors[settings.intangibleRunes - 1] ?? 1;
  /* Builds are the same for every rune, so they are enumerated once. About sixty
     across the shipped presets; a preset with three choices in every slot would
     give twenty-four on its own, which is still nothing. */
  const builds = new Map<string, Build[]>(presets.map((preset) => [preset.id, presetBuilds(preset)]));

  /* Every field comes from the settings, so the credit is the account's and not
     the rune's. Every imported star class enters the same engine: Ancient roll
     intervals are a candidate-only input to Max value and Chance, while role
     valuation, the ordinary reference box, main stats and later upgrades stay on
     ordinary six-star rules. Craft legality remains Ancient-specific. */
  const credit: CraftCredit = {
    gem: craftAssumptionForSetting(settings.enchantedGems), gemGrade: settings.gemGrade,
    grind: craftAssumptionForSetting(settings.grindstones), grindGrade: settings.grindstoneGrade,
  };
  /* Work the model would otherwise repeat per rune or per preset, held for
     exactly as long as this call. The presets and the reference lines are fixed
     for its duration, which is what makes the keys inside it sound. */
  const scope = newRuneAdviceScope();
  const ledger = new ChanceLedger();
  const prepared: RunePlan[] = [];

  /* ------------------------------------------------- 1. everything that is certain */
  for (const rune of runes) {
    /* Every preset and build this rune could serve, valued but not yet gated.
       Selecting a winner on Max value alone and *then* asking whether its chance
       clears the bar is how a rune gets sold: a build worth 91 % at a 30 % chance
       would beat one worth 90 % at 70 %, and only the second one survives both
       gates. So the gates are applied to each candidate and the verdict is taken
       across all of them. */
    const candidates: Contender[] = [];
    const retentionMultiplier = (settings.keepMoreForLargerSets && isFourPieceSet(rune.setName) ? 2 : 1)
      * (rune.setName === 'Intangible' ? intangible : 1);
    const retentionShare = Math.min(1, qualityBar * retentionMultiplier);
    for (const preset of presets) {
      const line = base.get(preset.type);
      if (!line) continue;
      /* The family first, then the scale it is measured on. A rune's standing is
         read against an ordinary rune offered the same choice of builds, so the
         whole family has to be prepared before any one of its members can be
         scored — which is also why the anchor cannot live on a single candidate. */
      const family: RuneCandidate[] = [];
      /* **Every compatible build, not one representative.** It used to keep the
         first build whose own slot matched, on the reasoning that another slot's
         main choice could not change this rune's legal lines. That reasoning ended
         when main properties began to be subtracted from what a role still needs:
         a build with HP % in slots 4 and 6 asks its runes for thousands less HP
         than one with ATK % there, and the same slot-2 rune is worth different
         amounts to the two. Keeping whichever build happened to be enumerated
         first would have picked one of those answers at random. */
      for (const build of builds.get(preset.id) ?? []) {
        /* A slot the preset says nothing about accepts every main the slot allows,
           at the broken rank — `presetBuilds` emits `0` for exactly that, and
           `prepareRuneCandidate`'s guard honours it. Demanding an exact match here
           would skip the preset outright, which made a rune the preset wants report
           "No preset can use it" purely because the user left a different slot
           blank. */
        if (rune.slot === 2 || rune.slot === 4 || rune.slot === 6) {
          const wanted = build.mains[rune.slot];
          if (wanted !== rune.mainStatId && wanted !== 0) continue;
        }
        const candidate = prepareRuneCandidate(rune, preset, build, line, credit, scope);
        if (candidate) family.push(candidate);
      }
      if (family.length === 0) continue;
      const box = ordinaryBox(family);
      const neutralFamily = family
        .map((candidate) => candidate.baseline)
        .filter((candidate): candidate is RuneCandidate => candidate !== null);
      const neutralBox = neutralFamily.length > 0 ? ordinaryBox(neutralFamily) : box;
      for (const candidate of family) {
        const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
        /* Two figures, and they are not interchangeable. `maxValue` is what the row
           prints: the plain fraction of a perfect rune, discounted for a set or main
           the preset merely accepts, which is the honest description of the rune
           itself. `value` is that same discounted figure read as a position in this
           slot's own box of ordinary runes, and it is what every gate and every
           comparison is settled on — because it is the only one of the two that
           means the same thing in slot 1 as it does in slot 3. The discount is
           applied before the box is consulted rather than after, so it goes on
           discounting the rune rather than the population. */
        const maxValue = candidateOwnMaxValue(candidate) * worth;
        const hasNeutral = candidate.baseline !== null || (credit.gem === null && credit.grind === null);
        const neutralMaxValue = !hasNeutral ? 0 : candidate.baseline === null ? maxValue
          : candidateOwnMaxValue(candidate.baseline) * worth;
        const neutralValue = !hasNeutral || candidate.baseline === null
          ? standingIn(box, maxValue) : standingIn(neutralBox, neutralMaxValue);
        /* The credited and neutral readings stay separate. The policy chooses between
           them after each has supplied its own Max value, standing and chance; taking
           field-by-field maxima would print a score from one reading beside a standing
           or chance from the other. */
        const value = standingIn(box, maxValue);
        candidates.push({
          preset, prepared: candidate, box, neutralBox, maxValue, value, neutralMaxValue, neutralValue,
          rank: candidate.rank,
        });
      }
    }

    /* **One candidate per preset: the build it scores best in.** A preset's builds
       are readings of the same role, and the row prints one Max value and one Chance
       against one preset, so the build those two describe should be the same one —
       the best. Asking every build for its odds instead is what the chance
       calculation costs the most of, and the engine used to keep whichever build was
       enumerated first, so picking the best-valued one is strictly better than what
       this replaced. Choosing between *presets* on chance as well as value is a
       different question, and the loop below still does it. */
    /* Ties are broken on Max value, and they are not hypothetical. A standing is a
       position in a box recorded at a finite resolution, so two candidates a hair
       apart can land on the same step of it — and far out in a box's thin upper tail,
       where the best runes live, a whole span of Max values can. Falling through to
       the rune id there would seat an excellent rune behind a merely good one for
       want of a comparison that was available all along. */
    const beats = (candidate: Contender, standing: Contender | undefined) => !standing
      || candidate.value > standing.value
      || (candidate.value === standing.value && candidate.maxValue > standing.maxValue);
    const bestPerPreset = new Map<string, Contender>();
    for (const candidate of candidates) {
      if (beats(candidate, bestPerPreset.get(candidate.preset.id))) {
        bestPerPreset.set(candidate.preset.id, candidate);
      }
    }
    const bestNeutralPerPreset = new Map<string, Contender>();
    for (const candidate of candidates) {
      if ((credit.gem !== null || credit.grind !== null) && candidate.prepared.baseline === null) continue;
      const current = bestNeutralPerPreset.get(candidate.preset.id);
      if (!current || candidate.neutralValue > current.neutralValue
        || (candidate.neutralValue === current.neutralValue
          && candidate.neutralMaxValue > current.neutralMaxValue)) {
        bestNeutralPerPreset.set(candidate.preset.id, candidate);
      }
    }

    /* Best first, so the strongest candidate that also clears the chance bar wins,
       and so a rune that clears nothing still reports its best showing rather than
       an arbitrary one.

       On standing rather than on Max value: each preset prices this rune's slot
       differently, so their boxes differ, and a position in the box is the only
       reading of the two that is comparable across them. The floor applied to it is
       one shared number, so no presentation transform can change which one wins. */
    const contenders = [...bestPerPreset.values()]
      .sort((left, right) => right.value - left.value || right.maxValue - left.maxValue);
    const steps: Step[] = [];
    let anyProcessed = false;
    /* These preferences change how much of the ordinary box this rune is
       allowed to represent. They widen the retained share; they never remove
       another rune's place or introduce any global limit. */
    for (const candidate of contenders) {
      const passesValue = candidate.value >= 1 - retentionShare;
      if (!passesValue && anyProcessed) continue;
      anyProcessed = true;
      /* The chance has to be the chance of clearing the *same* bar the value was
         judged against. The value carries the accepted/broken discount, so the fill
         the rune actually has to reach is the bar divided by that discount —
         otherwise an accepted rune would be discounted once in its score and not at
         all in its odds, and the two halves of the row would disagree. */
      const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
      /* The floor is stated as a share of this reading's own box and the odds are
         asked of its own Max value, so the bar and the chance describe one reading. */
      const currentThreshold = worth > 0
        ? boxThreshold(candidate.box, retentionShare) / worth : Number.POSITIVE_INFINITY;
      steps.push({
        candidate,
        passesValue,
        current: ledger.add(candidateChanceAskForReading(candidate.prepared, currentThreshold)),
      });
    }

    /* The neutral reading is built beside the credited reading from the same
       candidate families. That is the same legal choice as a separate no-craft
       calculation, without calculating every rune in the account twice. */
    const neutralContenders = [...bestNeutralPerPreset.values()]
      .sort((left, right) => right.neutralValue - left.neutralValue
        || right.neutralMaxValue - left.neutralMaxValue);
    const neutralSteps: Step[] = [];
    for (const candidate of neutralContenders) {
      const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
      const neutralThreshold = worth > 0
        ? boxThreshold(candidate.neutralBox, retentionShare) / worth : Number.POSITIVE_INFINITY;
      neutralSteps.push({
        candidate,
        passesValue: candidate.neutralValue >= 1 - retentionShare,
        current: ledger.add(candidateChanceAskForReading(candidate.prepared.baseline ?? candidate.prepared, neutralThreshold)),
      });
    }

    prepared.push({ rune, retentionShare, steps, neutralSteps });
  }

  /* --------------------------------------------------------- 2. what is left */
  const answers = ledger.settle(await count(ledger.jobs(), chanceBar));

  /* ------------------------------------------------------ 3. what it means */
  const advice = new Map<string, RuneAdvice>();
  for (const plan of prepared) {
    let fallback: Answer | null = null;
    const eligibleByPreset = new Map<string, Answer>();
    for (const step of plan.steps) {
      const chance = answers[step.current];
      const answer: Answer = {
        value: step.candidate.value, maxValue: step.candidate.maxValue, chance,
        priority: step.candidate.value,
        preset: step.candidate.preset, rank: step.candidate.rank, candidate: step.candidate.prepared,
      };
      if (fallback === null) fallback = answer;
      if (step.passesValue && chance >= chanceBar) {
        const prior = eligibleByPreset.get(answer.preset.id);
        if (!prior || answer.value > prior.value
          || (answer.value === prior.value && answer.maxValue > prior.maxValue)
          || (answer.value === prior.value && answer.maxValue === prior.maxValue && answer.chance > prior.chance)) {
          eligibleByPreset.set(answer.preset.id, answer);
        }
      }
    }
    /* A rune may satisfy several presets. Pick its strongest passing reading only
       to give the row one explanation; this choice never removes another rune or
       changes whether this rune passed. Every passing rune remains eligible. */
    const selected = [...eligibleByPreset.values()].sort((left, right) =>
      right.priority - left.priority
      || right.maxValue - left.maxValue
      || right.chance - left.chance
      || left.preset.id.localeCompare(right.preset.id))[0] ?? null;
    const result = selected ?? fallback;

    let neutralFallback: Answer | null = null;
    const neutralEligibleByPreset = new Map<string, Answer>();
    for (const step of plan.neutralSteps) {
      const neutralChance = answers[step.current];
      const answer: Answer = {
        value: step.candidate.neutralValue, maxValue: step.candidate.neutralMaxValue,
        chance: neutralChance, priority: step.candidate.neutralValue,
        preset: step.candidate.preset, rank: step.candidate.rank, candidate: step.candidate.prepared,
      };
      if (neutralFallback === null) neutralFallback = answer;
      if (step.passesValue && neutralChance >= chanceBar) {
        const prior = neutralEligibleByPreset.get(answer.preset.id);
        if (!prior || answer.value > prior.value
          || (answer.value === prior.value && answer.maxValue > prior.maxValue)
          || (answer.value === prior.value && answer.maxValue === prior.maxValue && answer.chance > prior.chance)) {
          neutralEligibleByPreset.set(answer.preset.id, answer);
        }
      }
    }
    const neutralSelected = [...neutralEligibleByPreset.values()].sort((left, right) =>
      right.priority - left.priority
      || right.maxValue - left.maxValue
      || right.chance - left.chance
      || left.preset.id.localeCompare(right.preset.id))[0] ?? null;
    const neutral = neutralSelected ?? neutralFallback;

    /**
     * **Two whole readings, and one of them wins entire.**
     *
     * The credited reading and the neutral one are each a preset, a build, a rank, a
     * Max value, a standing and a chance that belong together. This used to take the
     * larger of each field separately and the preset and rank from whichever reading
     * existed — so a row could carry preset A's name and rank beside preset B's
     * chance, and print `55 %` under a preset whose own odds were 3 %. `RUNE-CLEANUP-
     * MATH.md` §5.1 says the Max value and the Chance in a row describe one build,
     * and a figure maxed across two presets describes neither.
     *
     * Passing outranks any figure, because the verdict is what the row is for and a
     * reading that clears both gates is a legal way for this rune to be kept; below
     * that it is standing, then Max value, then chance — the same order the
     * contenders were sorted in.
     */
    const readings = [
      { answer: result, cleared: selected !== null },
      { answer: neutral, cleared: neutralSelected !== null },
    ].filter((reading): reading is { answer: Answer; cleared: boolean } => reading.answer !== null);
    const [chosen] = readings.sort((left, right) =>
      Number(right.cleared) - Number(left.cleared)
      || right.answer.value - left.answer.value
      || right.answer.maxValue - left.answer.maxValue
      || right.answer.chance - left.answer.chance);

    advice.set(plan.rune.id, {
      ...decide({
        rune: plan.rune, value: chosen?.answer.maxValue ?? 0, standing: chosen?.answer.value ?? 0,
        chance: chosen?.answer.chance ?? 0,
        preset: chosen?.answer.preset ?? null, rank: chosen?.answer.rank ?? 'broken',
        cleared: chosen?.cleared ?? false,
        brokenRejected: broken === 0,
      }),
      craftedLines: chosen && plan.rune.level >= 12 ? finishedLines(chosen.answer.candidate) : null,
    });
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
 * The ceiling and the chance — §9's gates 3 and 4, in that order, because a rune
 * that could never reach the bar should be sold for that rather than for the odds of
 * something it could not do anyway — are answered in `runeAdvice` where the
 * candidate is chosen, and arrive here as `cleared`.
 */
/**
 * The line-up the credited reading counted, for a rune whose lines are final.
 *
 * Always the credited candidate, even when the neutral reading won the row: the
 * neutral one differs only in its scale, not in the rune, and a stone or a Gem that
 * `craftedLines` spends never lowers what the rune itself is worth.
 */
function finishedLines(candidate: RuneCandidate): EndStateLine[] {
  const { scoring } = candidate;
  const lines = candidate.rune.subProperties.map(({ statId, value, grind, gemmed }) => ({ statId, value, grind, gemmed }));
  return craftedLines(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore);
}

function decide({ rune, value, standing, chance, preset, rank, cleared, brokenRejected }: {
  rune: Rune; value: number; standing: number; chance: number;
  preset: RunePotentialPreset | null; rank: MatchRank;
  cleared: boolean; brokenRejected: boolean;
}): Omit<RuneAdvice, 'craftedLines'> {
  const base = { maxValue: value, standing, chance, preset, rank };
  if (preset === null) {
    return { ...base, verdict: 'sell', reason: 'No preset can use it' };
  }
  if (rank === 'broken' && brokenRejected) {
    return { ...base, verdict: 'sell', reason: 'Broken: not wanted' };
  }
  /* A rune at +12 has no upgrades left, so it has no odds to quote: its chance is
     1 or 0, and at +12 that is the ceiling gate restated, since nothing can change
     the fill it already has. Printing "0 %" there would dress a certainty as a
     gamble, so the row says what happened instead. */
  if (!cleared) {
    return { ...base, verdict: 'sell', reason: rune.level >= 12 ? 'Below the floor' : percent(chance) };
  }
  return {
    ...base,
    verdict: rune.level < 12 ? 'power-up' : 'keep',
    reason: rune.level >= 12 ? 'Already there' : percent(chance),
  };
}
