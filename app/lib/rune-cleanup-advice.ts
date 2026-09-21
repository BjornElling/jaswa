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
  boxThreshold, candidateChance, candidateMaxValue, isFourPieceSet, newRuneAdviceScope,
  ordinaryBox, prepareRuneCandidate, presetBuilds, standingIn,
} from './rune-cleanup-model';
import type { Build, CraftCredit, MatchRank, OrdinaryBox, RuneCandidate } from './rune-cleanup-model';

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

/** The share steps a preset can be set to, as plain multipliers. */
const shareFactors: readonly number[] = [0.1, 0.2, 1 / 3, 0.5, 1, 2, 3, 5, 10];

/** How much more an Intangible rune is wanted, by the Intangible runes slider. */
const intangibleFactors: readonly number[] = [1, 1.5, 2, 3.5, 5];

export type RuneAdvice = {
  verdict: RuneVerdict;
  /** The chance itself, as the row prints it — never the internal score. */
  reason: string;
  /** `0`–`1` against a perfect rune, after the preferred/acceptable/broken discount. */
  maxValue: number;
  /**
   * `0`–`1` from an ordinary rune of this slot to a perfect one, after the same
   * discount — the figure the gates and the allocation actually settled on.
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
};

const percent = (fraction: number) => {
  const value = fraction * 100;
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)} %`;
  if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')} %`;
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} %`;
};

/**
 * The crafting policy, expressed as a position in the item's own verified range.
 * The model chooses a legal target line and reads that line's actual grade and
 * lineage; this layer must not guess a stat from the first sub property.
 */
function craftAssumption(step: number): import('./rune-craft-items').CraftRollAssumption | null {
  const fraction = creditFractions[step - 1];
  if (fraction === null || fraction === undefined) return null;
  return fraction === 0.5 ? 'average' : fraction === 0.75 ? 'three-quarters' : 'maximum';
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

  /* Every field comes from the settings, so the credit is the account's and not
     the rune's. Every imported star class enters the same engine: Ancient differs
     only where the game differs, in that born lines and craft items use Ancient
     ranges while main stats, later upgrades and added lines use their ordinary
     six-star ranges. */
  const credit: CraftCredit = {
    gem: craftAssumption(settings.enchantedGems), gemGrade: settings.gemGrade,
    grind: craftAssumption(settings.grindstones), grindGrade: settings.grindstoneGrade,
  };

  /* Work the model would otherwise repeat per rune or per preset, held for
     exactly as long as this call. The presets and the reference lines are fixed
     for its duration, which is what makes the keys inside it sound. */
  const scope = newRuneAdviceScope();

  type Answer = { value: number; maxValue: number; chance: number; priority: number; preset: RunePotentialPreset; rank: MatchRank };
  type Pending = { rune: Rune; fallback: Answer | null; eligible: Answer[] };
  const pending: Pending[] = [];
  /* Every eligible candidate, by the preset it is eligible for. */
  const eligibleFor = new Map<string, Array<{ item: Pending; answer: Answer }>>();
  for (const rune of runes) {
    /* Every preset and build this rune could serve, valued but not yet gated.
       Selecting a winner on Max value alone and *then* asking whether its chance
       clears the bar is how a rune gets sold: a build worth 91 % at a 30 % chance
       would beat one worth 90 % at 70 %, and only the second one survives both
       gates. So the gates are applied to each candidate and the verdict is taken
       across all of them. */
    type Contender = {
      preset: RunePotentialPreset; prepared: RuneCandidate; box: OrdinaryBox;
      value: number; maxValue: number; rank: MatchRank;
    };
    const candidates: Contender[] = [];
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
        const prepared = prepareRuneCandidate(rune, preset, build, line, credit, scope);
        if (prepared) family.push(prepared);
      }
      if (family.length === 0) continue;
      const box = ordinaryBox(family);
      for (const prepared of family) {
        const worth = prepared.rank === 'preferred' ? 1 : prepared.rank === 'acceptable' ? accepted : broken;
        /* Two figures, and they are not interchangeable. `maxValue` is what the row
           prints: the plain fraction of a perfect rune, discounted for a set or main
           the preset merely accepts, which is the honest description of the rune
           itself. `value` is that same discounted figure read as a position in this
           slot's own box of ordinary runes, and it is what every gate, every
           comparison and every quota is settled on — because it is the only one of
           the two that means the same thing in slot 1 as it does in slot 3. The
           discount is applied before the box is consulted rather than after, so it
           goes on discounting the rune rather than the population. */
        const maxValue = candidateMaxValue(prepared) * worth;
        candidates.push({
          preset, prepared, box, maxValue, value: standingIn(box, maxValue), rank: prepared.rank,
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

    /* Best first, so the strongest candidate that also clears the chance bar wins,
       and so a rune that clears nothing still reports its best showing rather than
       an arbitrary one.

       On standing rather than on Max value: each preset prices this rune's slot
       differently, so their boxes differ, and a position in the box is the only
       reading of the two that is comparable across them. The floor applied to it is
       one shared number, so no presentation transform can change which one wins. */
    const contenders = [...bestPerPreset.values()]
      .sort((left, right) => right.value - left.value || right.maxValue - left.maxValue);
    let fallback: Answer | null = null;
    const eligibleByPreset = new Map<string, Answer>();
    for (const candidate of contenders) {
      const passesValue = candidate.value >= 1 - qualityBar;
      if (!passesValue && fallback !== null) continue;
      /* The chance has to be the chance of clearing the *same* bar the value was
         judged against. The value carries the accepted/broken discount, so the fill
         the rune actually has to reach is the bar divided by that discount —
         otherwise an accepted rune would be discounted once in its score and not at
         all in its odds, and the two halves of the row would disagree. */
      const worth = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable' ? accepted : broken;
      /* The floor is stated as a share of this slot's box and the odds are asked of
         a Max value, so the share is read back out of the box before the probability
         engine sees it. One bar, in the two units the two halves of the row speak. */
      const chance = candidateChance(candidate.prepared,
        worth > 0 ? boxThreshold(candidate.box, qualityBar) / worth : Number.POSITIVE_INFINITY);
      const answer = {
        value: candidate.value, maxValue: candidate.maxValue, chance,
        priority: candidate.value * (settings.keepMoreForLargerSets && isFourPieceSet(rune.setName) ? 2 : 1)
          * (rune.setName === 'Intangible' ? intangible : 1),
        preset: candidate.preset, rank: candidate.rank,
      };
      if (fallback === null) fallback = answer;
      if (passesValue && chance >= chanceBar) {
        const prior = eligibleByPreset.get(answer.preset.id);
        if (!prior || answer.priority > prior.priority || (answer.priority === prior.priority && answer.chance > prior.chance)) {
          eligibleByPreset.set(answer.preset.id, answer);
        }
      }
    }
    const item: Pending = { rune, fallback, eligible: [...eligibleByPreset.values()] };
    pending.push(item);
    /* Indexed as each item is produced rather than rescanned per preset. The
       allocation below asked `pending` the same question four times over — twice
       inside a sort comparator, which is where an O(N) scan really does not
       belong. The index preserves `pending`'s order, and the sorts that read it
       end in a rune-id tie-break, so nothing about the order can turn on it. */
    for (const answer of item.eligible) {
      const list = eligibleFor.get(answer.preset.id);
      if (list) list.push({ item, answer });
      else eligibleFor.set(answer.preset.id, [{ item, answer }]);
    }
  }

  /* The rune-share setting is a count preference, not a disguised quality penalty.
     First apply the quality/chance gates, then allocate the finite eligible pool to
     presets in those exact relative shares. A rune is assigned only once; roles
     with the smallest candidate pool per requested place go first, so a broad role
     cannot consume the only rune a narrow role could use. */
  const activePresets = presets.filter((preset) => (eligibleFor.get(preset.id)?.length ?? 0) > 0);
  const totalEligible = pending.filter((item) => item.eligible.length > 0).length;
  const requested = new Map(activePresets.map((preset) => [preset.id, shareFactors[preset.runeShare - 1] ?? 1]));
  const totalRequested = [...requested.values()].reduce((sum, value) => sum + value, 0);
  const quota = new Map<string, number>();
  const remainders: Array<{ id: string; fraction: number }> = [];
  let assignedQuota = 0;
  for (const preset of activePresets) {
    const exact = totalRequested > 0 ? totalEligible * (requested.get(preset.id) ?? 0) / totalRequested : 0;
    const whole = Math.floor(exact);
    quota.set(preset.id, whole); assignedQuota += whole;
    remainders.push({ id: preset.id, fraction: exact - whole });
  }
  remainders.sort((left, right) => right.fraction - left.fraction || left.id.localeCompare(right.id));
  for (const item of remainders.slice(0, totalEligible - assignedQuota)) quota.set(item.id, (quota.get(item.id) ?? 0) + 1);

  const assignments = new Map<string, Answer>();
  /* Each preset's candidate pool per requested place, computed once rather than
     recomputed on every comparison. A key that is a pure function of state the
     sort cannot change reads the same either way. */
  const capacity = new Map(activePresets.map((preset) =>
    [preset.id, (eligibleFor.get(preset.id)?.length ?? 0) / Math.max(1, quota.get(preset.id) ?? 0)]));
  const allocationOrder = [...activePresets].sort((left, right) =>
    (capacity.get(left.id) ?? 0) - (capacity.get(right.id) ?? 0) || left.id.localeCompare(right.id));
  for (const preset of allocationOrder) {
    const candidatesForPreset = (eligibleFor.get(preset.id) ?? [])
      .filter((candidate) => !assignments.has(candidate.item.rune.id))
      .sort((left, right) => right.answer.priority - left.answer.priority
        || right.answer.maxValue - left.answer.maxValue
        || right.answer.chance - left.answer.chance
        || left.item.rune.id.localeCompare(right.item.rune.id));
    for (const candidate of candidatesForPreset.slice(0, quota.get(preset.id) ?? 0)) assignments.set(candidate.item.rune.id, candidate.answer);
  }

  const advice = new Map<string, RuneAdvice>();
  for (const item of pending) {
    const assigned = assignments.get(item.rune.id) ?? null;
    const result = assigned ?? item.fallback;
    const verdict = decide({
      rune: item.rune, value: result?.maxValue ?? 0, standing: result?.value ?? 0,
      chance: result?.chance ?? 0,
      preset: result?.preset ?? null, rank: result?.rank ?? 'broken', cleared: assigned !== null,
      brokenRejected: broken === 0,
    });
    advice.set(item.rune.id, assigned === null && item.eligible.length > 0
      ? { ...verdict, verdict: 'sell', reason: 'Outside requested preset capacity' }
      : verdict);
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
function decide({ rune, value, standing, chance, preset, rank, cleared, brokenRejected }: {
  rune: Rune; value: number; standing: number; chance: number;
  preset: RunePotentialPreset | null; rank: MatchRank;
  cleared: boolean; brokenRejected: boolean;
}): RuneAdvice {
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
