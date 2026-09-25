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
  boxThreshold, candidateChanceAsk, candidateMaxValue, isFourPieceSet,
  newRuneAdviceScope, ordinaryBox, prepareRuneCandidate, presetBuilds, referenceStars, slotMainFamily,
  standingIn,
} from './rune-cleanup-model';
import type {
  Build, ChanceAsk, CountingJob, CraftCredit, MatchRank, OrdinaryBox, RuneCandidate,
} from './rune-cleanup-model';
import { countJobs } from './rune-power-up-outcomes';
import type { RuneFuture } from './rune-power-up-outcomes';
import type { Valuation } from './rune-substat-weights';
import { craftAssumptionForSetting } from './rune-craft-items';
import { slotMainProperties } from './rune-properties';
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
  /** For every ask, where each of its jobs sits in the one list handed out. */
  private readonly slots: number[][] = [];
  private readonly unique: CountingJob[] = [];
  /**
   * **The same question is counted once.** Two builds of a preset whose main stats
   * differ only where the role wants nothing price every line alike and draw the
   * same bar, so they ask one rune one question twice. Measured on a preset with
   * three main stats in each of slots 2, 4 and 6, half its jobs were such repeats.
   * A job is the rune's future, the role's valuation and craft plan, the bar and
   * the run count — every one of them either memoised or a number, so identity is
   * exact rather than approximate.
   */
  private readonly seen = new Map<RuneFuture, Map<string, number>>();

  add(ask: ChanceAsk): number {
    this.asks.push(ask);
    this.slots.push(ask.jobs.map((job) => {
      const key = `${valuationNumber(job.scoring.valuation)}|${job.scoring.plan.key}|${job.wanted}|${job.runs}`;
      let known = this.seen.get(job.future);
      if (!known) { known = new Map(); this.seen.set(job.future, known); }
      const found = known.get(key);
      if (found !== undefined) return found;
      this.unique.push(job);
      known.set(key, this.unique.length - 1);
      return this.unique.length - 1;
    }));
    return this.asks.length - 1;
  }

  jobs(): CountingJob[] {
    return [...this.unique];
  }

  settle(shares: Float64Array): number[] {
    if (shares.length !== this.unique.length) {
      throw new Error('The chance counter returned an unexpected number of answers.');
    }
    return this.asks.map((ask, at) => ask.combine(this.slots[at].map((slot) => shares[slot])));
  }
}

/* A short number per valuation for the ledger's key. Valuations are memoised per
   weight set, so identity is as fine a distinction as their own keys make, and a
   key built from those would be a kilobyte of string per job. */
const valuationNumbers = new WeakMap<Valuation, number>();
let valuationCount = 0;

function valuationNumber(valuation: Valuation): number {
  let found = valuationNumbers.get(valuation);
  if (found === undefined) { valuationCount += 1; found = valuationCount; valuationNumbers.set(valuation, found); }
  return found;
}

/**
 * **How much of each main's own box passes, so that every slot keeps the same share
 * of what it produces.** `docs/RUNE-CLEANUP-MATH.md` §9.3 owns the reasoning.
 *
 * §9.1 makes the floor a share `q` of the ordinary box of one slot *holding one main*.
 * That is fair between slots 1, 3 and 5, which have one main each, and it is not fair
 * to slots 2, 4 and 6, which have seven or eight: a preset names one or two of them,
 * so most of those slots' runes are runes it cannot use at all, and `q` of the few it
 * can use is a small share of the slot. Measured per shipped preset on an ordinary
 * box of every main, that kept 1–7 % of slots 2, 4 and 6 against 15–20 % of slots 1,
 * 3 and 5, and about half as many across all presets together — while a monster needs
 * one of each.
 *
 * So the floor is stated for the **whole slot** instead. The slot's ordinary runes are
 * a mixture of its `M` legal mains, each drawn on `1/M` of runes (the game states no
 * main-property rate, and none has been measured; uniform is the stated assumption,
 * as it is for the upgrade target). A rune of main `m` is worth `w_m` of itself to the
 * preset — `1` preferred, the Accepted runes worth acceptable, the Broken runes worth
 * for a slot left blank — and nothing where no build accepts `m`. One share `q'` of
 * *every* main's own box is then found such that the slot as a whole keeps `q`:
 *
 * ```
 * (1/M) · Σ_m P( w_m · X_m ≥ T_m(q') ) = q
 * ```
 *
 * where `X_m` is main `m`'s ordinary Max value and `T_m(q')` the Max value at which the
 * best `q'` of its box begins. A preferred main contributes `q'` exactly, a discounted
 * one less, an unwanted one nothing. The left side is continuous and never falls as
 * `q'` rises, so one bisection finds it.
 *
 * - **Slots 1, 3 and 5 are unchanged**: one main, preferred, so `q' = q`.
 * - **Many preferred mains need little help and one needs a lot**, which is the case a
 *   flat "double it" gets wrong: four of slot 6's eight mains preferred is `q' = 2q`,
 *   one of them is `8q`. The preset's own choices set the factor.
 * - **One `q'` for every main of the slot**, not one Max value, so §9.1's promise
 *   still holds between mains: a CRI Dmg slot-4 rune and an ATK % one are cut at the
 *   same place in their own boxes, whichever of the two blocks the stat the role wants.
 * - **Where even `q' = 1` falls short**, the slot cannot produce `q` of runes the preset
 *   can use, and every rune of a wanted main clears the floor. That is the arithmetic
 *   of "as many as any other slot" and it is stated rather than hidden: a preset asking
 *   for SPD alone in slot 2 has one slot-2 rune in seven to choose from.
 */
class SlotShares {
  private readonly found = new Map<string, number>();
  private readonly scope: ReturnType<typeof newRuneAdviceScope>;
  private readonly credit: CraftCredit;
  private readonly accepted: number;
  private readonly broken: number;

  constructor(scope: ReturnType<typeof newRuneAdviceScope>, credit: CraftCredit, accepted: number, broken: number) {
    this.scope = scope;
    this.credit = credit;
    this.accepted = accepted;
    this.broken = broken;
  }

  shareOf(
    preset: RunePotentialPreset, builds: readonly Build[], slot: number, stars: number,
    base: ReferenceStats, wanted: number,
  ): number {
    const key = `${preset.id}|${slot}|${stars}|${wanted}`;
    const known = this.found.get(key);
    if (known !== undefined) return known;
    const mains = slotMainProperties[slot] ?? [];
    const readings = mains.map((main) => {
      const family = slotMainFamily(preset, builds, slot, main, stars, base, this.credit, this.scope);
      const worth = family.valuations.length === 0 ? 0
        : family.rank === 'preferred' ? 1 : family.rank === 'acceptable' ? this.accepted : this.broken;
      return { box: ordinaryBox(family), worth };
    });
    const kept = (share: number) => readings.reduce((total, { box, worth }) => {
      if (worth <= 0 || box.below.length === 0) return total;
      if (share >= 1) return total + 1;
      return total + 1 - standingIn(box, boxThreshold(box, share) / worth);
    }, 0) / Math.max(1, mains.length);
    let share = 1;
    if (kept(1) > wanted) {
      let low = 0;
      let high = 1;
      for (let step = 0; step < 50; step += 1) {
        const middle = (low + high) / 2;
        if (kept(middle) < wanted) low = middle; else high = middle;
      }
      share = high;
    }
    this.found.set(key, share);
    return share;
  }
}

/** One preset's best reading of one rune, valued but not yet gated. */
type Contender = {
  preset: RunePotentialPreset; prepared: RuneCandidate; box: OrdinaryBox;
  value: number; maxValue: number; rank: MatchRank;
  /** The share of this rune's own box that passes: the slot's share, spread over its mains (§9.3). */
  share: number;
};

/**
 * One preset the policy will walk: its best-valued build, whose Max value and standing
 * the row prints, and one numbered question per build whose odds are asked.
 */
type Step = { candidate: Contender; passesValue: boolean; asks: number[] };

type RunePlan = { rune: Rune; steps: Step[] };

type Answer = {
  value: number; maxValue: number; chance: number; share: number;
  preset: RunePotentialPreset; rank: MatchRank;
  /** This preset's best build, whose craft decision the row stands on. */
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
 * so.
 *
 * **Each stop means what its label says**: Full YOLO rolls a one-in-a-hundred shot,
 * Adventurous one in twenty, Balanced one in five, Picky a coin toss, and Take no
 * chances only a rune four times in five sure to get there. The ladder used to run
 * 2 %–40 %, so "Take no chances" still rolled a rune that would miss more often than
 * it arrived. The verdict is this one comparison and nothing else: the rune's chance
 * — its best build's (§5.1) — against the stop.
 */
export const chanceThresholds: readonly number[] = [0.01, 0.05, 0.20, 0.50, 0.80];

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
  /**
   * The share of its own box the floor let through for this rune: the quality stop's
   * share of the whole slot, spread over the slot's mains (§9.3). A slot-1 rune's is
   * the stop itself; a slot-2 rune's is larger wherever the preset can use only a few
   * of slot 2's mains. `standing` passed where it reached `1 - floorShare`.
   */
  floorShare: number;
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
  const slotShares = new SlotShares(scope, credit, accepted, broken);
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
    const stars = referenceStars(rune);
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
      const presetBuildList = builds.get(preset.id) ?? [];
      const box = ordinaryBox(slotMainFamily(preset, presetBuildList, rune.slot, family[0].main, stars, line, credit, scope));
      const share = slotShares.shareOf(preset, presetBuildList, rune.slot, stars, line, retentionShare);
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
        const maxValue = candidateMaxValue(candidate) * worth;
        const value = standingIn(box, maxValue);
        candidates.push({ preset, prepared: candidate, box, maxValue, value, rank: candidate.rank, share });
      }
    }

    /* **Every build of a preset is asked for its odds, and the preset answers with
       its best of each.** A preset's builds are the main-stat combinations it would
       accept in slots 2, 4 and 6, and the rune goes into whichever of them it suits
       — so its Max value is its best build's, and its chance is its best build's
       chance, even where those are two different builds. The best-valued build is
       not always the likeliest: one whose other targets its main stats already cover
       puts this rune's one excellent line on a higher ceiling and a higher bar, and a
       build that asks less of the rune can be the one it reaches. Asking only the
       best-valued build sold such a rune for want of a question nobody asked.

       It is affordable because a rune is played forward once however many builds ask
       about it: another build is another price list over the same runs, and a build
       whose best end state misses its bar settles at zero without a run. A rune only
       fits the builds that name its own main, so three choices in each of slots 2, 4
       and 6 is nine builds for a slot-2 rune and twenty-seven for a slot-1 rune. */
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
    const buildsPerPreset = new Map<string, Contender[]>();
    for (const candidate of candidates) {
      if (beats(candidate, bestPerPreset.get(candidate.preset.id))) {
        bestPerPreset.set(candidate.preset.id, candidate);
      }
      const family = buildsPerPreset.get(candidate.preset.id);
      if (family) family.push(candidate); else buildsPerPreset.set(candidate.preset.id, [candidate]);
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
    /* The chance has to be the chance of clearing the *same* bar the value was judged
       against. The value carries the accepted/broken discount, so the fill the rune
       actually has to reach is the bar divided by that discount — otherwise an
       accepted rune would be discounted once in its score and not at all in its odds,
       and the two halves of the row would disagree. The floor is stated as a share of
       each build's own box and the odds are asked of that build's own Max value, so
       the bar and the chance describe one reading. */
    const askOf = (candidate: Contender) => {
      const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
      const threshold = worth > 0
        ? boxThreshold(candidate.box, candidate.share) / worth : Number.POSITIVE_INFINITY;
      return ledger.add(candidateChanceAsk(candidate.prepared, threshold));
    };
    /* These preferences change how much of the ordinary box this rune is
       allowed to represent. They widen the retained share; they never remove
       another rune's place or introduce any global limit. */
    for (const candidate of contenders) {
      const passesValue = candidate.value >= 1 - candidate.share;
      if (!passesValue && anyProcessed) continue;
      anyProcessed = true;
      /* A build below the floor cannot reach it by any road, so asking it would only
         spend a bound on a certain zero. Where not even the best build passes, it is
         still asked once, so the row reports the odds of its best showing. */
      const asked = passesValue
        ? (buildsPerPreset.get(candidate.preset.id) ?? []).filter((build) => build.value >= 1 - build.share)
        : [candidate];
      steps.push({ candidate, passesValue, asks: asked.map(askOf) });
    }

    prepared.push({ rune, steps });
  }

  /* --------------------------------------------------------- 2. what is left */
  const answers = ledger.settle(await count(ledger.jobs(), chanceBar));

  /* ------------------------------------------------------ 3. what it means */
  const advice = new Map<string, RuneAdvice>();
  for (const plan of prepared) {
    const answered: Answer[] = plan.steps.map((step) => ({
      value: step.candidate.value, maxValue: step.candidate.maxValue, share: step.candidate.share,
      chance: step.asks.reduce((best, at) => Math.max(best, answers[at]), 0),
      preset: step.candidate.preset, rank: step.candidate.rank, candidate: step.candidate.prepared,
    }));
    /* A rune may satisfy several presets. Pick its strongest passing reading only
       to give the row one explanation; this choice never removes another rune or
       changes whether this rune passed. Every passing rune remains eligible. The
       row's Max value and standing are that preset's best build's, and its chance
       is the best chance any of the preset's builds gives (§5.1). */
    const selected = answered
      .filter((answer, at) => plan.steps[at].passesValue && answer.chance >= chanceBar)
      .sort((left, right) =>
        right.value - left.value
        || right.maxValue - left.maxValue
        || right.chance - left.chance
        || left.preset.id.localeCompare(right.preset.id))[0] ?? null;
    const chosen = selected ?? answered[0] ?? null;

    advice.set(plan.rune.id, {
      ...decide({
        rune: plan.rune, value: chosen?.maxValue ?? 0, standing: chosen?.value ?? 0,
        chance: chosen?.chance ?? 0,
        preset: chosen?.preset ?? null, rank: chosen?.rank ?? 'broken',
        cleared: selected !== null,
        brokenRejected: broken === 0,
      }),
      floorShare: chosen?.share ?? 0,
      craftedLines: chosen && plan.rune.level >= 12 ? finishedLines(chosen.candidate) : null,
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
/** The line-up the row's Max value counted, for a rune whose lines are final. */
function finishedLines(candidate: RuneCandidate): EndStateLine[] {
  const { scoring } = candidate;
  const lines = candidate.rune.subProperties.map(({ statId, value, grind, gemmed }) => ({ statId, value, grind, gemmed }));
  return craftedLines(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore);
}

function decide({ rune, value, standing, chance, preset, rank, cleared, brokenRejected }: {
  rune: Rune; value: number; standing: number; chance: number;
  preset: RunePotentialPreset | null; rank: MatchRank;
  cleared: boolean; brokenRejected: boolean;
}): Omit<RuneAdvice, 'craftedLines' | 'floorShare'> {
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
