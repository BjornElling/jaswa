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
import { runeMaximumLevel } from './runes';
import type { Rune } from './runes';
import type { RuneRole } from './rune-roles';
import type { RunePotentialSettings } from './types';
import type { ReferenceStats } from './rune-reference-stats';
import {
  candidateChanceAsk, candidateExpectedBound, candidateExpectedValue, candidateMaxValue, isFourPieceSet,
  newRuneAdviceScope, ordinaryBox, ordinarySample, prepareRuneCandidate, roleBuilds, referenceStars,
  runeRuns, slotMainFamily, standingIn,
} from './rune-cleanup-model';
import type {
  Build, ChanceAsk, CountingJob, CraftCredit, MatchRank, OrdinaryBox, RuneCandidate,
} from './rune-cleanup-model';
import { countJobs, playForward, runScore } from './rune-power-up-outcomes';
import type { RuneFuture, RuneRuns } from './rune-power-up-outcomes';
import type { Valuation } from './rune-substat-weights';
import { lastSubPropertyLevel } from './rune-properties';
import { craftedLines, groundLines } from './rune-craft-end-state';
import type { EndStateLine } from './rune-craft-end-state';

/* Slot balance is a yardstick, not another user preference. Keeping it at the
   shipped baseline means craft settings can only make a candidate stronger or
   weaker; they cannot move the floor underneath every other rune. */
const floorCalibrationCredit: CraftCredit = {
  gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero',
};
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
 * An ask can settle itself — a rune whose substats are final at `+12`, or one that cannot reach the bar by any
 * road — and those never become jobs at all. The rest are numbered, gathered into one
 * list, and handed back by number once the batch comes home.
 */
class ChanceLedger {
  private readonly asks: ChanceAsk[] = [];
  /** For every ask, where each of its jobs sits in the one list handed out. */
  private readonly slots: number[][] = [];
  private readonly unique: CountingJob[] = [];
  /**
   * **The same question is counted once.** Two builds of a role whose main stats
   * differ only where the role wants nothing price every line alike and draw the
   * same bar, so they ask one rune one question twice. Measured on a role with
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
 * The floor is an actual Max value. Balance may raise it, never dilute it.
 * Each sample body must survive +0, +9 and +12, with the drop-grade mix used
 * by the simulator. The denominator includes every generated main.
 */
const balanceSampleRunes = 600;
const balanceRuns = 128;
type CheckpointScores = readonly (readonly [number, number, number])[];
type FunnelScores = readonly CheckpointScores[];
const balancePopulations = new Map<string, FunnelScores[][]>();
type BalancedFloors = { ordinary: readonly number[]; fourPiece: readonly number[] };
const balancedFloors = new Map<string, Map<string, BalancedFloors>>();

class RuneFloorCalibration {
  private readonly floors = new Map<number, BalancedFloors>();

  private readonly scope: ReturnType<typeof newRuneAdviceScope>;
  private readonly roles: readonly RuneRole[];
  private readonly builds: ReadonlyMap<string, readonly Build[]>;
  private readonly base: ReadonlyMap<string, ReferenceStats>;
  private readonly qualityBar: number;
  private readonly chanceBar: number;
  private readonly accepted: number;
  private readonly broken: number;

  constructor(
    scope: ReturnType<typeof newRuneAdviceScope>,
    roles: readonly RuneRole[],
    builds: ReadonlyMap<string, readonly Build[]>,
    base: ReadonlyMap<string, ReferenceStats>,
    qualityBar: number,
    chanceBar: number,
    accepted: number,
    broken: number,
  ) {
    this.scope = scope;
    this.roles = roles;
    this.builds = builds;
    this.base = base;
    this.qualityBar = qualityBar;
    this.chanceBar = chanceBar;
    this.accepted = accepted;
    this.broken = broken;
  }

  floorFor(slot: number, stars: number, fourPiece = false): number {
    return this.balanceOf(stars)[fourPiece ? 'fourPiece' : 'ordinary'][slot - 1] ?? this.qualityBar;
  }

  private balanceOf(stars: number): BalancedFloors {
    const known = this.floors.get(stars);
    if (known) return known;
    const policies = chanceThresholds;
    const key = JSON.stringify([this.roles, [...this.base], stars]);
    let scores = balancePopulations.get(key);
    if (!scores) {
      scores = [1, 2, 3, 4, 5, 6].map((slot) => {
        const checkpoints = ([0, 9, 12] as const).map((level) =>
          ordinarySample(slot, stars, balanceSampleRunes, level, 'drop', 10_000).map((rune) => {
            const scores = policies.map(() => [0, 0, 0] as [number, number, number]);
            let runs: ReturnType<typeof playForward> | null = null;
            for (const role of this.roles) {
              const base = this.base.get(role.type);
              if (!base) continue;
              for (const build of this.builds.get(role.id) ?? []) {
                const candidate = prepareRuneCandidate(rune, role, build, base, floorCalibrationCredit, this.scope);
                if (!candidate) continue;
                const rank = candidate.rank === 'preferred' ? 0 : candidate.rank === 'acceptable' ? 1 : 2;
                if (level === 12) {
                  for (const scoresAtPolicy of scores) scoresAtPolicy[rank] = Math.max(scoresAtPolicy[rank], candidateMaxValue(candidate));
                  continue;
                }
                runs ??= playForward(candidate.future, balanceRuns);
                const outcomes = new Float64Array(balanceRuns);
                for (let at = 0; at < balanceRuns; at += 1) outcomes[at] = runScore(runs, candidate.scoring, at);
                outcomes.sort();
                policies.forEach((bar, at) => {
                  const value = (outcomes[balanceRuns - Math.max(1, Math.ceil(bar * balanceRuns))] ?? 0) / candidate.ceiling;
                  scores[at][rank] = Math.max(scores[at][rank], value);
                });
              }
            }
            return scores;
          }));
        return Array.from({ length: balanceSampleRunes }, (_, at) => checkpoints.map((checkpoint) => checkpoint[at]));
      });
      balancePopulations.set(key, scores);
      while (balancePopulations.size > 4) balancePopulations.delete(balancePopulations.keys().next().value!);
    }
    const fourPiece = [1, 2, 3, 4, 5, 6].map((slot) =>
      ordinarySample(slot, stars, balanceSampleRunes, 0, 'drop', 10_000).map((rune) =>
        isFourPieceSet(rune.setName)));
    let grid = balancedFloors.get(key);
    if (!grid) {
      grid = new Map();
      const gridKey = (quality: number, policy: number, accepted: number, broken: number) =>
        `${quality}|${policy}|${accepted}|${broken}`;
      /* Each setting inherits its immediate less demanding neighbours, then
         tightens the overrepresented slots. This preserves both slot balance
         and the promise that a stricter choice never re-admits a rune. */
      for (const [quality, anchor] of qualityThresholds.entries()) {
        for (const [policy] of policies.entries()) {
          for (const [acceptedAt, accepted] of acceptedWorth.entries()) {
            for (const [brokenAt, broken] of brokenWorth.entries()) {
              const neighbours = [
                grid.get(gridKey(quality - 1, policy, acceptedAt, brokenAt)),
                grid.get(gridKey(quality, policy - 1, acceptedAt, brokenAt)),
                grid.get(gridKey(quality, policy, acceptedAt - 1, brokenAt)),
                grid.get(gridKey(quality, policy, acceptedAt, brokenAt - 1)),
              ];
              const floors = [0, 1, 2, 3, 4, 5].map((at) =>
                Math.max(anchor, ...neighbours.map((previous) => previous?.ordinary[at] ?? 0)));
              const values = scores.map((slot) => slot.map((checkpoints) => {
                const value = Math.min(...checkpoints.map((checkpoint) => {
                  const [preferred, acceptable, unwanted] = checkpoint[policy];
                  return Math.max(preferred, acceptable * accepted, unwanted * broken);
                }));
                return value;
              }));
              const observedTarget = Math.min(...values.map((slot, at) => slot.filter((value) => value >= floors[at]).length));
              const target = Math.max(1, observedTarget);
              /* A zero in a small sample does not establish a zero population.
                 Keep a one-observation tail allowance, while still tightening
                 slots with a clearly larger surviving tail. */
              values.forEach((slot, at) => {
                const ordered = [...slot].sort((a, b) => b - a);
                const excluded = ordered[target];
                if (excluded !== undefined) floors[at] = Math.max(floors[at], excluded + Number.EPSILON);
              });
              const preferredFloor = [...floors];
              const lower = floors.map((_, at) =>
                Math.max(anchor, ...neighbours.map((previous) => previous?.fourPiece[at] ?? 0)));
              const regularCounts = values.map((slot, at) => slot.filter((value, index) =>
                !fourPiece[at][index] && value >= floors[at]).length);
              const baselineCounts = values.map((slot, at) => slot.filter((value) => value >= floors[at]).length);
              const capacities = values.map((slot, at) => regularCounts[at] + slot.filter((value, index) =>
                fourPiece[at][index] && value >= lower[at]).length);
              const preferredTarget = Math.min(...capacities,
                Math.floor(2 * baselineCounts.reduce((sum, count) => sum + count, 0) / 6));
              /* Four-piece preference changes only four-piece candidates. Fit its
                 larger retained population separately, so turning it on cannot
                 move the floor of a two-piece rune or break the slot balance. */
              if (preferredTarget >= 1 && preferredTarget >= Math.max(...baselineCounts)) {
                values.forEach((slot, at) => {
                  const wanted = preferredTarget - regularCounts[at];
                  const ordered = slot.filter((_, index) => fourPiece[at][index]).sort((a, b) => b - a);
                  if (wanted > 0) preferredFloor[at] = Math.min(floors[at],
                    Math.max(lower[at], (ordered[wanted] ?? anchor) + Number.EPSILON));
                });
              }
              grid.set(gridKey(quality, policy, acceptedAt, brokenAt), { ordinary: floors, fourPiece: preferredFloor });
            }
          }
        }
      }
      balancedFloors.set(key, grid);
      while (balancedFloors.size > 4) balancedFloors.delete(balancedFloors.keys().next().value!);
    }
    const floors = grid.get(`${qualityThresholds.indexOf(this.qualityBar)}|${policies.indexOf(this.chanceBar)}|${acceptedWorth.indexOf(this.accepted)}|${brokenWorth.indexOf(this.broken)}`)
      ?? { ordinary: [1, 2, 3, 4, 5, 6].map(() => this.qualityBar), fourPiece: [1, 2, 3, 4, 5, 6].map(() => this.qualityBar) };
    this.floors.set(stars, floors);
    return floors;
  }
}

/** One role's best reading of one rune, valued but not yet gated. */
type Contender = {
  role: RuneRole; prepared: RuneCandidate; box: OrdinaryBox;
  value: number; maxValue: number; rank: MatchRank; floor: number;
  /** Diagnostic share above the actual Max-value floor in this reading's box. */
  share: number;
};

/**
 * One role the policy will walk: its best-valued build, whose Max value and standing
 * the row prints, and one numbered question per build whose odds are asked.
 */
type Step = { candidate: Contender; passesValue: boolean; asks: number[] };

type RunePlan = { rune: Rune; steps: Step[] };

type Answer = {
  value: number; maxValue: number; chance: number; share: number; floorMaxValue: number;
  role: RuneRole; rank: MatchRank;
  /** The one build whose Max value, Chance and craft decision the row shows. */
  candidate: RuneCandidate;
};

type AnswerWithStep = { answer: Answer; passesValue: boolean };

export type RuneVerdict = 'power-up' | 'keep' | 'sell';

export const runeVerdictOrder: readonly RuneVerdict[] = ['power-up', 'keep', 'sell'];

export const runeVerdictLabels: Record<RuneVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};

/** Minimum discounted Max value at each Rune quality floor stop. */
export const qualityThresholds: readonly number[] = [0.45, 0.55, 0.65, 0.75, 0.85];

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
 * — in its own build reading (§5.1) — against the stop.
 */
export const chanceThresholds: readonly number[] = [0.01, 0.05, 0.20, 0.50, 0.80];

/**
 * What a rune the role merely accepts is worth against one it prefers, by the
 * Accepted runes slider. A multiplier on Max value, so an accepted rune has to be
 * that much better in itself to earn the same verdict. The middle of the ladder is
 * also shifted one stop towards leniency, so the old `Forgiving` bar is now
 * `Quality is quality`.
 */
export const acceptedWorth: readonly number[] = [1.00, 0.95, 0.85, 0.70, 0.55];

/**
 * The same for a rune the role names neither way. The middle of the ladder is
 * shifted one stop towards leniency, so the old `A good rune is a good rune` bar is
 * now `Occasionally`. The last stop remains `0`: "No" means no, and no amount of
 * quality redeems a set the role never asked for.
 */
export const brokenWorth: readonly number[] = [0.90, 0.85, 0.80, 0.65, 0];

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
   * discount — a diagnostic percentile, not the floor used by the gates.
   *
   * It is carried out of the engine rather than kept private so that the page can
   * explain why a slot-4 rune was kept beside a slot-3 rune that reads higher, and
   * so `verify:rune-slot-neutrality` can check the scale rather than only its
   * consequences.
   */
  standing: number;
  /** Diagnostic share above the actual floor in the reading's ordinary box. */
  floorShare: number;
  /** The actual discounted Max value required by both gates. */
  floorMaxValue: number;
  /** `0`–`1`: the chance of reaching the final +15 bar; RNG ends at +12. */
  chance: number;
  /** The role this rune answers best, or `null` when none can use it. */
  role: RuneRole | null;
  rank: MatchRank;
  /**
   * The craft available now for `role`; future craft is already included in
   * Max value and Chance. From `+12`: every grindable line
   * ground and the Gem spent where it gains most, as `craftedLines` decides it. Below
   * `+12`: the lines it shows so far, each grindable one ground and no Gem, because a
   * stone may go on at any level and a Gem only from `+12` (`groundLines`). `null` only
   * where no role can use the rune. Carried out so that whatever acts on the verdict
   * spends the items the verdict counted, rather than deciding the craft a second time.
   */
  craftedLines: EndStateLine[] | null;
  /**
   * The slot 2, 4 and 6 mains of the build `role` was read in, `0` where the role
   * leaves a slot open. A rune keeps its best build, and which one that is decides what
   * each of its lines is worth — a CRI Rate % main in slot 4 can meet the role's whole
   * CRI Rate target and leave a CRI Rate sub worth nothing — so the page names it.
   * `null` only where no role can use the rune.
   */
  buildMains: Build['mains'] | null;
  /**
   * Every role's own best reading of this rune, for a page that explains the
   * choice of Best role rather than only stating it. `null` unless asked for:
   * a reading's expectation costs a pass over the rune's runs, and the table,
   * which asks about every rune at once, has no use for the other nine.
   */
  readings: RoleReading[] | null;
};

/**
 * **One role's view of one rune**, chosen within that role by the same rule Best
 * role is chosen by across all of them: the readings that clear both gates first,
 * the one expected to be worth most among those. So the reading marked best in a list
 * of these is exactly the one the row names.
 */
export type RoleReading = {
  roleId: string;
  /** How the rune's set and main answer this role — the worse of the two. */
  rank: MatchRank;
  maxValue: number;
  chance: number;
  /** What the rune is expected to be worth at `+15`, on the Max value scale — the figure Best role is chosen on. */
  expected: number;
  floorShare: number;
  floorMaxValue: number;
  /** Whether this reading clears both the quality floor and the chance bar. */
  cleared: boolean;
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
 * account-wide: the same slider settings, the same roles and the same reference
 * base line decide every row, and computing them once per call is what keeps two
 * rows from being judged against two different bars.
 *
 * The three passes are what let the odds be answered anywhere but here:
 *
 * 1. **What is certain.** Every rune against every build of every role: the weights,
 *    the perfect rune of its slot, the box of ordinary runes it is measured in, its
 *    own Max value and its standing. Nothing random, nothing deferred. Every question
 *    about odds that the policy will ask is *written down* rather than answered, and
 *    most of them are settled on the spot — a rune at `+12` has no substat gamble left, and
 *    of the rest most cannot reach the bar by any road or cannot miss it.
 * 2. **What is left.** Whatever questions remain go to `count` in one batch. That is
 *    the only reason the pass exists: one batch is one errand for the graphics card,
 *    where a question at a time would be thousands of them, and the processor's own
 *    version is faster for it too, because a rune is played forward once however many
 *    roles are asking about it.
 * 3. **What it means.** The policy, with the answers in hand. It walks exactly the
 *    candidates the first pass walked, because what it skips depends on Max value and
 *    the retention share and never on the odds.
 */
/** Every number the sliders stand for, read once, for every caller alike. */
function policyOf(settings: RunePotentialSettings) {
  /* Every field comes from the settings, so the active credit belongs to the policy
     and not to the rune. Every imported star class enters the same engine: Ancient
     roll intervals are a candidate-only input to Max value and Chance, while the
     common ruler stays on the fixed neutral credit. Craft legality remains
     Ancient-specific. */
  const credit: CraftCredit = {
    gem: settings.gemRoll, gemGrade: settings.gemGrade,
    grind: settings.grindstoneRoll, grindGrade: settings.grindstoneGrade,
  };
  return {
    qualityBar: qualityThresholds[settings.runeQuality - 1] ?? qualityThresholds[2],
    chanceBar: chanceThresholds[settings.powerUpPolicy - 1] ?? chanceThresholds[2],
    accepted: acceptedWorth[settings.acceptedRunes - 1] ?? acceptedWorth[2],
    broken: brokenWorth[settings.brokenRunes - 1] ?? brokenWorth[2],
    intangible: intangibleFactors[settings.intangibleRunes - 1] ?? 1,
    credit,
  };
}

/** The same discounted Max-value floors used by every advice checkpoint. */
export function slotFloorMaxValues(
  roles: readonly RuneRole[], settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>, stars = 6,
): readonly number[] {
  const balance = calibrationFor(roles, settings, base);
  return [1, 2, 3, 4, 5, 6].map((slot) => balance.floorFor(slot, stars, settings.keepMoreForLargerSets));
}

/**
 * **The slot calibration outlives the call that made it.** It depends on the roles,
 * the reference lines and the policy, and never on which runes are asked about. A
 * refresh after a sync, one rune opened in the overlay and the simulator's four
 * checkpoints all ask again with the same inputs, and the fresh-rune balance costs
 * seconds, so asking about one rune used to cost as much as asking about the box.
 * The key is the inputs' content rather than their identity, because the worker
 * receives a new copy of every object with each message. Craft credit is not in it:
 * the calibration always reads the fixed `floorCalibrationCredit`.
 */
const calibrations = new Map<string, RuneFloorCalibration>();
const calibrationsKept = 4;

function calibrationFor(
  roles: readonly RuneRole[], settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
): RuneFloorCalibration {
  const { qualityBar, chanceBar, accepted, broken } = policyOf(settings);
  const key = JSON.stringify([roles, [...base], qualityBar, chanceBar, accepted, broken]);
  const known = calibrations.get(key);
  if (known) {
    calibrations.delete(key);
    calibrations.set(key, known);
    return known;
  }
  const builds = new Map<string, Build[]>(roles.map((role) => [role.id, roleBuilds(role)]));
  const shares = new RuneFloorCalibration(newRuneAdviceScope(), roles, builds, base, qualityBar, chanceBar,
    accepted, broken);
  calibrations.set(key, shares);
  while (calibrations.size > calibrationsKept) calibrations.delete(calibrations.keys().next().value!);
  return shares;
}

export async function runeAdvice(
  runes: readonly Rune[], roles: readonly RuneRole[],
  settings: RunePotentialSettings, base: ReadonlyMap<string, ReferenceStats>,
  /** Who answers the odds. The processor by default; the worker passes the card. */
  count: ChanceCounter = async (jobs) => countJobs(jobs),
  /** Whether to carry every role's reading out (`RuneAdvice.readings`). */
  { explain = false }: { explain?: boolean } = {},
): Promise<Map<string, RuneAdvice>> {
  const { qualityBar, chanceBar, accepted, broken, intangible, credit } = policyOf(settings);
  const worthOf = (rank: MatchRank) => (rank === 'preferred' ? 1 : rank === 'acceptable' ? accepted : broken);
  /* Builds are the same for every rune, so they are enumerated once. About sixty
     across the shipped roles; a role with three choices in every slot would
     give twenty-four on its own, which is still nothing. */
  const builds = new Map<string, Build[]>(roles.map((role) => [role.id, roleBuilds(role)]));

  /* Work the model would otherwise repeat per rune or per role, held for
     exactly as long as this call. The roles and the reference lines are fixed
     for its duration, which is what makes the keys inside it sound. */
  const scope = newRuneAdviceScope();
  const ledger = new ChanceLedger();
  /* The preferred-main floor is calibrated on fixed middle Accepted/Broken weights
     and the fixed craft credit, so those settings change their own candidates'
     verdicts and not the bar. The fresh-rune balance does read the policy (§9.4),
     and is built so that a stricter choice can only lower a slot's factor. */
  const floorCalibration = calibrationFor(roles, settings, base);
  const prepared: RunePlan[] = [];

  /* ------------------------------------------------- 1. everything that is certain */
  for (const rune of runes) {
    /* Every role and build this rune could serve, valued but not yet gated.
       Selecting a winner on Max value alone and *then* asking whether its chance
       clears the bar is how a rune gets sold: a build worth 91 % at a 30 % chance
       would beat one worth 90 % at 70 %, and only the second one survives both
       gates. So the gates are applied to each candidate and the verdict is taken
       across all of them. */
    const candidates: Contender[] = [];
    const retentionMultiplier = rune.setName === 'Intangible' ? intangible : 1;
    const stars = referenceStars(rune);
    for (const role of roles) {
      const line = base.get(role.type);
      if (!line) continue;
      /* Standing compares the whole build family; the actual quality floor
         stays a Max value shared by every compatible reading in this slot. */
      const family: RuneCandidate[] = [];
      /* **Every compatible build, not one representative.** It used to keep the
         first build whose own slot matched, on the reasoning that another slot's
         main choice could not change this rune's legal lines. That reasoning ended
         when main properties began to be subtracted from what a role still needs:
         a build with HP % in slots 4 and 6 asks its runes for thousands less HP
         than one with ATK % there, and the same slot-2 rune is worth different
         amounts to the two. Keeping whichever build happened to be enumerated
         first would have picked one of those answers at random. */
      for (const build of builds.get(role.id) ?? []) {
        /* A slot the role says nothing about accepts every main the slot allows,
           at the broken rank — `roleBuilds` emits `0` for exactly that, and
           `prepareRuneCandidate`'s guard honours it. Demanding an exact match here
           would skip the role outright, which made a rune the role wants report
           "No role can use it" purely because the user left a different slot
           blank. */
        if (rune.slot === 2 || rune.slot === 4 || rune.slot === 6) {
          const wanted = build.mains[rune.slot];
          if (wanted !== rune.mainStatId && wanted !== 0) continue;
        }
        const candidate = prepareRuneCandidate(rune, role, build, line, credit, scope, floorCalibrationCredit);
        if (candidate) family.push(candidate);
      }
      if (family.length === 0) continue;
      const roleBuildList = builds.get(role.id) ?? [];
      const box = ordinaryBox(slotMainFamily(
        role, roleBuildList, rune.slot, family[0].main, stars, line, floorCalibrationCredit, scope,
      ));
      const calibratedFloor = floorCalibration.floorFor(rune.slot, stars, settings.keepMoreForLargerSets && isFourPieceSet(rune.setName));
      for (const candidate of family) {
        const worth = worthOf(candidate.rank);
        /* Two figures, and they are not interchangeable. `maxValue` is what the row
           prints: the plain fraction of a perfect rune, discounted for a set or main
           the role merely accepts, which is the honest description of the rune
           itself. Standing is a diagnostic and tie-breaker. Both gates read
           this candidate's actual discounted Max-value floor. */
        const maxValue = candidateMaxValue(candidate) * worth;
        const value = standingIn(box, maxValue);
        const floor = qualityBar + (calibratedFloor - qualityBar) / retentionMultiplier;
        const share = 1 - standingIn(box, floor);
        candidates.push({ role, prepared: candidate, box, maxValue, value, rank: candidate.rank, share, floor });
      }
    }

    /* **Every build is one complete reading.** A role's builds are the main-stat
       combinations it would accept in slots 2, 4 and 6. A row may name a reading only
       when that reading's own Max value and Chance clear their gates; it must not pair
       one build's high Max value with another's high Chance.

       It is affordable because a rune is played forward once however many builds ask
       about it: another build is another price list over the same runs, and a build
       whose best end state misses its bar settles at zero without a run. A rune only
       fits the builds that name its own main, so three choices in each of slots 2, 4
       and 6 is nine builds for a slot-2 rune and twenty-seven for a slot-1 rune. */
    /* Every viable reading competes. Preferred, accepted and (unless the user chose
       No) broken say how demanding its own gate is; a preferred match is never a
       licence to hide a better answer for another role. Ties are broken on Max value,
       and they are not hypothetical. A standing is a
       position in a box recorded at a finite resolution, so two candidates a hair
       apart can land on the same step of it — and far out in a box's thin upper tail,
       where the best runes live, a whole span of Max values can. Falling through to
       the rune id there would seat an excellent rune behind a merely good one for
       want of a comparison that was available all along. */
    /* Standing cannot decide which role a rune best serves: boxes differ
       between roles. Keep every build as a
       complete pair of Max value and Chance, so a high Max value from one build
       cannot borrow a passing chance from another. */
    const contenders = [...candidates]
      .sort((left, right) => right.maxValue - left.maxValue || right.value - left.value);
    const steps: Step[] = [];
    /* The chance has to be the chance of clearing the *same* bar the value was judged
       against. The value carries the accepted/broken discount, so the fill the rune
       actually has to reach is the bar divided by that discount — otherwise an
       accepted rune would be discounted once in its score and not at all in its odds,
       and the two halves of the row would disagree. Both gates read the same
       discounted Max-value floor, so the bar and chance describe one reading. */
    const askOf = (candidate: Contender) => {
      const worth = worthOf(candidate.rank);
      const threshold = worth > 0
        ? candidate.floor / worth : Number.POSITIVE_INFINITY;
      return ledger.add(candidateChanceAsk(candidate.prepared, threshold));
    };
    /* Set preferences soften only the extra slot correction. The chosen quality
       anchor remains a minimum, even for Intangible and four-piece sets. */
    for (const candidate of contenders) {
      const passesValue = candidate.maxValue >= candidate.floor;
      steps.push({ candidate, passesValue, asks: [askOf(candidate)] });
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
      floorMaxValue: step.candidate.floor,
      chance: step.asks.reduce((best, at) => Math.max(best, answers[at]), 0),
      role: step.candidate.role, rank: step.candidate.rank, candidate: step.candidate.prepared,
    }));
    /* A rune may satisfy several roles. **The readings that clear both gates are
       chosen from first, and only where there are none does any other reading
       compete**, so a Best role that says Sell can never stand in for one that
       says Keep or Power up. Within that pool the reading the rune is expected to
       be worth most to wins (`RUNE-CLEANUP-MATH.md` §9.6). It used to be the one
       with the highest Max value, which is the best case — every improvement on
       one line at its maximum — and so named the role that prices one stat alone
       on a rune whose other two lines only another role could use. The chosen
       reading supplies every figure in the row; no build may lend its Chance to
       another build's Max value. */
    const answersWithSteps: AnswerWithStep[] = answered.map((answer, at) => ({ answer, passesValue: plan.steps[at].passesValue }));
    const allowed = broken === 0
      ? answersWithSteps.filter(({ answer }) => answer.rank !== 'broken')
      : answersWithSteps;
    const qualified = allowed
      .filter(({ answer, passesValue }) => passesValue && answer.chance >= chanceBar);
    const best = mostExpected(qualified.length > 0 ? qualified : allowed, worthOf);
    const selected = qualified.length > 0 ? best?.answer ?? null : null;
    /* At Broken = No, an unwanted rune remains as the named fallback only when no
       preferred or acceptable reading exists. It must not hide a permitted reading
       merely because its standing happens to be higher. */
    const chosen = selected ?? best?.answer ?? allowed[0]?.answer ?? answered[0] ?? null;

    advice.set(plan.rune.id, {
      ...decide({
        rune: plan.rune, value: chosen?.maxValue ?? 0, standing: chosen?.value ?? 0,
        chance: chosen?.chance ?? 0,
        role: chosen?.role ?? null, rank: chosen?.rank ?? 'broken',
        cleared: selected !== null,
        brokenRejected: broken === 0,
      }),
      floorShare: chosen?.share ?? 0,
      floorMaxValue: chosen?.floorMaxValue ?? 0,
      craftedLines: chosen ? finishedLines(chosen.candidate) : null,
      buildMains: chosen ? chosen.candidate.build.mains : null,
      readings: explain ? roleReadings(roles, answersWithSteps, allowed, chanceBar, worthOf) : null,
    });
  }
  return advice;
}

/**
 * Each role's own pick, by the rule the row's pick is made by, so the list can
 * never mark as best a reading the row does not name. A role whose only readings
 * are broken, at Broken = No, still shows them rather than a blank: the list explains
 * the choice, and "this role could only read it as broken" is part of that.
 */
function roleReadings(
  roles: readonly RuneRole[], answered: readonly AnswerWithStep[], allowed: readonly AnswerWithStep[],
  chanceBar: number, worthOf: (rank: MatchRank) => number,
): RoleReading[] {
  let runs: RuneRuns | null = null;
  return roles.flatMap((role) => {
    const own = (list: readonly AnswerWithStep[]) => list.filter(({ answer }) => answer.role.id === role.id);
    const pool = own(allowed).length > 0 ? own(allowed) : own(answered);
    const qualified = pool.filter(({ answer, passesValue }) => passesValue && answer.chance >= chanceBar);
    const pick = mostExpected(qualified.length > 0 ? qualified : pool, worthOf)?.answer;
    if (!pick) return [];
    const raw = candidateExpectedValue(pick.candidate, () => (runs ??= runeRuns(pick.candidate.future)));
    return [{
      roleId: role.id, rank: pick.rank, maxValue: pick.maxValue, chance: pick.chance, expected: worthOf(pick.rank) * raw,
      floorShare: pick.share, floorMaxValue: pick.floorMaxValue, cleared: qualified.length > 0,
    }];
  });
}

/**
 * **The reading the rune is expected to be worth most to**, after the same
 * accepted/broken discount its Max value carries. Ties fall to Max value, then standing,
 * then chance, then the role id, so the answer never depends on enumeration order.
 *
 * The Gem's share of the expectation is counted over the rune's runs, so a reading costs
 * a pass over them. Most readings are never counted: each has a ceiling on its
 * expectation that needs no runs (`candidateExpectedBound`), and once the readings are
 * walked in falling ceiling, the walk stops at the first whose ceiling is below the best
 * expectation found.
 */
function mostExpected<T extends { answer: Answer }>(
  pool: readonly T[], worthOf: (rank: MatchRank) => number,
): T | null {
  if (pool.length <= 1) return pool[0] ?? null;
  /* Every candidate of one rune shares its future, so one set of runs serves them all;
     and two builds that price every line alike share a valuation, so they share an
     expectation too. */
  let runs: RuneRuns | null = null;
  const known = new Map<Valuation, number>();
  const byBound = pool
    .map((entry) => ({ entry, bound: worthOf(entry.answer.rank) * candidateExpectedBound(entry.answer.candidate) }))
    .sort((left, right) => right.bound - left.bound);
  let best: T | null = null;
  let bestExpected = Number.NEGATIVE_INFINITY;
  for (const { entry, bound } of byBound) {
    if (bound < bestExpected) break;
    const { answer } = entry;
    const { valuation } = answer.candidate;
    let raw = known.get(valuation);
    if (raw === undefined) {
      raw = candidateExpectedValue(answer.candidate, () => (runs ??= runeRuns(answer.candidate.future)));
      known.set(valuation, raw);
    }
    const expected = worthOf(answer.rank) * raw;
    const current = best?.answer;
    const wins = !current || expected > bestExpected || (expected === bestExpected && (
      answer.maxValue - current.maxValue || answer.value - current.value || answer.chance - current.chance
      || current.role.id.localeCompare(answer.role.id)) > 0);
    if (wins) { best = entry; bestExpected = expected; }
  }
  return best;
}

/**
 * The decision, in the order the rules outrank each other.
 *
 * **The broken gate is asked first**, and it is the one the sliders cannot argue
 * with: "No" on Broken runes means the account only wants runes a role asked for,
 * and a rune that reaches a wonderful end state in a set nothing wants is still a
 * rune nothing wants. Asking about its ceiling first would let quality overturn a
 * choice the user has already made.
 *
 * The ceiling and the chance — §9's gates 3 and 4, in that order, because a rune
 * that could never reach the bar should be sold for that rather than for the odds of
 * something it could not do anyway — are answered in `runeAdvice` where the
 * candidate is chosen, and arrive here as `cleared`.
 */
/** The craft the row's Max value counted on the lines the rune shows: the whole of it
    from `+12`, the stones alone below, where no Gem is legal yet. */
function finishedLines(candidate: RuneCandidate): EndStateLine[] {
  const { scoring } = candidate;
  const lines = candidate.rune.subProperties.map(({ statId, value, grind, gemmed }) => ({ statId, value, grind, gemmed }));
  return candidate.rune.level >= lastSubPropertyLevel
    ? craftedLines(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore)
    : groundLines(scoring.plan, lines);
}

/**
 * What a player still has to spend on each line to hold `craftedLines`: the Gem's new
 * id on the line it replaces, and a stone wherever the end state carries more than
 * the line already keeps. Read off the line-up the verdict counted rather than decided
 * again, so a line named here is exactly a line Max value assumed.
 */
export type RuneCraftStep = {
  /** The id the Gem puts on this line, or `null` where no Gem is spent here. */
  gemStatId: number | null;
  /** What Max value assumes that Gem rolls, its stone excluded; `null` where no Gem is spent. */
  gemValue: number | null;
  /** The stone the end state carries on this line, or `0` where none is spent. */
  grind: number;
};

export function runeCraftSteps(rune: Rune, crafted: readonly EndStateLine[]): RuneCraftStep[] {
  return rune.subProperties.map((line, at) => {
    const end = crafted[at];
    if (end === undefined) return { gemStatId: null, gemValue: null, grind: 0 };
    const gemSpent = end.statId !== line.statId || end.value !== line.value || end.gemmed !== line.gemmed;
    /* A Gem on another id starts the line bare; re-rolling its own id keeps the stone. */
    const kept = gemSpent && end.statId !== line.statId ? 0 : line.grind;
    return {
      gemStatId: gemSpent ? end.statId : null, gemValue: gemSpent ? end.value : null,
      grind: end.grind > kept ? end.grind : 0,
    };
  });
}

function decide({ rune, value, standing, chance, role, rank, cleared, brokenRejected }: {
  rune: Rune; value: number; standing: number; chance: number;
  role: RuneRole | null; rank: MatchRank;
  cleared: boolean; brokenRejected: boolean;
}): Omit<RuneAdvice, 'craftedLines' | 'buildMains' | 'floorShare' | 'floorMaxValue' | 'readings'> {
  const base = { maxValue: value, standing, chance, role, rank };
  if (role === null) {
    return { ...base, verdict: 'sell', reason: 'No role can use it' };
  }
  if (rank === 'broken' && brokenRejected) {
    return { ...base, verdict: 'sell', reason: 'Broken: not wanted' };
  }
  /* A rune at +12 has no substat upgrades left, so it has no odds to quote: its
     chance is 1 or 0, and the climb to +15 changes only the deterministic main stat.
     Printing "0 %" there would dress a certainty as a gamble, so the row says what
     happened instead. */
  if (!cleared) {
    return { ...base, verdict: 'sell', reason: rune.level >= lastSubPropertyLevel ? 'Below the floor' : percent(chance) };
  }
  return {
    ...base,
    /* +12 is the one checkpoint where the user explicitly wants no further
       level-up recommendation. At +13 and +14 the substats are still final,
       but the remaining main-stat levels are again actionable; +15 is settled. */
    verdict: rune.level === lastSubPropertyLevel
      ? 'keep'
      : rune.level < runeMaximumLevel ? 'power-up' : 'keep',
    reason: rune.level >= runeMaximumLevel
      ? 'Already there'
      : rune.level >= lastSubPropertyLevel ? 'Main stat only' : percent(chance),
  };
}
