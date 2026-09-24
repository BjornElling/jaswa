/**
 * The complete random-rune simulator.
 *
 * This module owns the simulation loop and the decisions between its three
 * visible checkpoints. The page may choose inputs and render the returned
 * snapshots, but it must not re-create a power-up rule, a sell gate or a
 * craft action: doing that in the page would make a pretty table that no
 * longer describes the thing it claims to simulate.
 *
 * Game numbers still come from the canonical rune tables. This file owns only
 * the random experiment around them: which legal property is drawn, where a
 * power-up lands, and how a configured checkpoint acts on the result.
 */
import { allStatIds, mainPropertyMaximum, slotMainProperties, subPropertyRange } from './rune-properties';
import {
  runeStatName, slotAllowsSubStat,
} from './runes';
import type { Rune, RuneDefaultGrade } from './runes';
import { runeSetId } from './rune-sets';
import type { EndStateLine } from './rune-craft-end-state';
import { runeAdvice } from './rune-cleanup-advice';
import type { RuneAdvice, RuneVerdict } from './rune-cleanup-advice';
import type { RunePotentialPreset } from './rune-potential-presets';
import type { ReferenceStats } from './rune-reference-stats';
import type { RunePotentialSettings } from './types';
import { combineCalculationBackends } from './compute/calculation-summary';
import { countRuneChances } from './compute/rune-chance-engine';
import type { CalculationBackend } from './compute/calculation-summary';

export const simulationStages = [0, 9, 12] as const;
export type SimulationStage = typeof simulationStages[number];

/** A named set, or null for a generated rune with no rune type. */
export type SimulationSet = string | null;
export type SimulationSlot = number | null;
export type SimulationStars = number | null;

/** A checkpoint either lets everything through or acts on Rune Clean-up's verdict. */
export type SimulationCheckpointPolicy = 'keep-all' | 'recommendation';

export type SimulationGate = {
  policy: SimulationCheckpointPolicy;
};

/**
 * What the experiment draws and where it stops. The craft at `+12` is not part of it:
 * it is whatever Rune Clean-up's own settings credit, read from the context, so the
 * items the simulator spends and the items the verdict counted cannot disagree.
 */
export type RuneSimulationConfig = {
  count: number;
  setName: SimulationSet;
  slot: SimulationSlot;
  stars: SimulationStars;
  gates: Readonly<Record<SimulationStage, SimulationGate>>;
};

export type RuneSimulationContext = {
  presets: readonly RunePotentialPreset[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats> | null;
  /** Whether recommendation checkpoints may count their odds on the graphics card. */
  preferWebGpu?: boolean;
};

export type SimulationSubProperty = {
  statId: number;
  value: number;
  gemmed: boolean;
  grind: number;
  /** Only power-up upgrades that landed on this line; its natural birth is zero. */
  rolls: number;
};

export type SimulatedRune = {
  id: string;
  setName: SimulationSet;
  slot: number;
  stars: number;
  defaultGrade: RuneDefaultGrade;
  level: number;
  mainStatId: number;
  prefixStatId: number | null;
  prefixValue: number;
  subProperties: SimulationSubProperty[];
};

/**
 * Rune Clean-up's reading of one simulated rune, reduced to what crosses the
 * worker boundary: the preset is carried by id and name rather than as the whole
 * preset, which the page already holds.
 */
export type SimulationVerdict = {
  verdict: RuneVerdict;
  reason: string;
  maxValue: number;
  chance: number;
  presetId: string | null;
  presetName: string | null;
};

export type SimulationEntry = {
  rune: SimulatedRune;
  /**
   * The engine's verdict, asked at every checkpoint whether or not the gate acts
   * on it, so the table always says what Rune Clean-up would do. `null` only when
   * there is nothing to ask it with: no reference monster or no preset.
   */
  verdict: SimulationVerdict | null;
  /** Whether this checkpoint's gate removed the rune; only a recommendation gate can. */
  sold: boolean;
};

export type SimulationStageResult = {
  level: SimulationStage;
  /** Includes entries sold at this checkpoint, so the result can explain the drop. */
  entries: SimulationEntry[];
  reached: number;
  survived: number;
  sold: number;
};

export type RuneSimulationSummary = {
  generated: number;
  reachedNine: number;
  reachedTwelve: number;
  /** Runes Rune Clean-up keeps at +12, or `null` when no verdict could be asked. */
  kept: number | null;
  soldAtZero: number;
  soldAtNine: number;
  soldAtTwelve: number;
};

export type RuneSimulationResult = {
  config: RuneSimulationConfig;
  stages: Readonly<Record<SimulationStage, SimulationStageResult>>;
  summary: RuneSimulationSummary;
  durationMs: number;
  backend: CalculationBackend;
};

/** The simulator-only set label used when the user asks for no rune type. */
export const simulationNoRuneType = 'No rune type';

export type RandomSource = () => number;

const defaultRandom: RandomSource = () => Math.random();
const prefixFrequency = 0.51;
const gradeSubPropertyCount: Readonly<Record<RuneDefaultGrade, number>> = {
  Normal: 0, Magic: 1, Rare: 2, Hero: 3, Legend: 4,
};

export const defaultRuneSimulationConfig: RuneSimulationConfig = {
  count: 50,
  setName: null,
  slot: null,
  stars: 6,
  gates: {
    0: { policy: 'recommendation' },
    9: { policy: 'recommendation' },
    12: { policy: 'recommendation' },
  },
};

const asUnit = (value: number): number => Math.min(0.9999999999999999, Math.max(0, value));

function integer(minimum: number, maximum: number, random: RandomSource): number {
  return minimum + Math.floor(asUnit(random()) * (maximum - minimum + 1));
}

function choose<T>(values: readonly T[], random: RandomSource): T {
  const value = values[integer(0, values.length - 1, random)];
  if (value === undefined) throw new Error('Rune simulator cannot choose from an empty legal set.');
  return value;
}

function rollValue(
  stars: number, statId: number, kind: 'initial' | 'upgrade', random: RandomSource,
): number {
  const range = subPropertyRange(stars, statId, kind);
  if (!range) throw new Error(`Rune simulator has no ${kind} range for ${stars}★ stat ${statId}.`);
  return integer(range.minimum, range.maximum, random);
}

/** The simulator's only legal rune-grade distribution, fixed by slot. */
export function simulationGradeForSlot(slot: number, random: RandomSource = defaultRandom): RuneDefaultGrade {
  const roll = asUnit(random());
  if (slot % 2 === 1) return roll < 0.75 ? 'Hero' : 'Legend';
  if (roll < 0.25) return 'Rare';
  return roll < 0.75 ? 'Hero' : 'Legend';
}

function legalStatIds(rune: Pick<SimulatedRune, 'slot' | 'mainStatId' | 'prefixStatId' | 'subProperties'>): number[] {
  const used = new Set([
    rune.mainStatId,
    ...(rune.prefixStatId === null ? [] : [rune.prefixStatId]),
    ...rune.subProperties.map((property) => property.statId),
  ]);
  return allStatIds.filter((statId) => !used.has(statId) && slotAllowsSubStat(rune.slot, statId));
}

/** The one display helper for the stat vocabulary used by the simulator. */
export function simulationStatLabel(statId: number): string {
  return runeStatName(statId) ?? `Unknown stat ${statId}`;
}

function cloneRune(rune: SimulatedRune): SimulatedRune {
  return {
    ...rune,
    subProperties: rune.subProperties.map((property) => ({ ...property })),
  };
}

function addRandomSubProperty(rune: SimulatedRune, random: RandomSource): void {
  const statId = choose(legalStatIds(rune), random);
  rune.subProperties.push({
    statId,
    value: rollValue(rune.stars, statId, 'initial', random),
    gemmed: false,
    grind: 0,
    rolls: 0,
  });
}

/** Power the exact same copy to the requested checkpoint. */
export function powerUpRune(rune: SimulatedRune, targetLevel: SimulationStage, random: RandomSource = defaultRandom): SimulatedRune {
  if (targetLevel < rune.level) return cloneRune(rune);
  const next = cloneRune(rune);
  const bornLines = gradeSubPropertyCount[next.defaultGrade];
  for (const [eventIndex, level] of ([3, 6, 9, 12] as const).entries()) {
    if (level <= next.level || level > targetLevel) continue;
    if (eventIndex >= bornLines) {
      /* The grade fixes which events add a line; every generated line uses the
         ordinary interval because the simulator has no Ancient mode. */
      addRandomSubProperty(next, random);
    } else {
      const target = next.subProperties[integer(0, next.subProperties.length - 1, random)];
      if (!target) throw new Error('Rune simulator chose no existing sub-property to improve.');
      target.value += rollValue(next.stars, target.statId, 'upgrade', random);
      target.rolls += 1;
    }
    next.level = level;
  }
  return next;
}

/**
 * Spend the Gem and the Grindstones Rune Clean-up's `+12` verdict counted.
 *
 * The craft is not decided here. It used to be — a random line, a random new id and
 * one random stone — and so the rune on screen was never the one its verdict had
 * valued: three grindable lines left bare, and a DEF % line swapped for CRI Rate while
 * a fresh Resistance, worth less to the role, stayed. The verdict's own line-up is the
 * only honest one to show. The rolls a replaced line had collected go with it (§8).
 */
function applyCraft(rune: SimulatedRune, lines: readonly EndStateLine[]): SimulatedRune {
  if (lines.length !== rune.subProperties.length) {
    throw new Error(`Rune simulator received a crafted line-up that does not fit ${rune.id}.`);
  }
  return {
    ...rune,
    subProperties: lines.map((line, at) => {
      const before = rune.subProperties[at];
      const replaced = line.statId !== before.statId || line.value !== before.value
        || line.gemmed !== before.gemmed;
      return {
        statId: line.statId, value: line.value, gemmed: line.gemmed, grind: line.grind,
        rolls: replaced ? 0 : before.rolls,
      };
    }),
  };
}

/** Adapt the simulation copy to the exact Rune Clean-up input shape. */
export function simulationRuneToCleanupRune(rune: SimulatedRune, obtainedOrder = 0): Rune {
  const setName = rune.setName ?? simulationNoRuneType;
  return {
    id: rune.id,
    setId: rune.setName === null ? 0 : runeSetId(rune.setName) ?? 0,
    setName,
    slot: rune.slot,
    stars: rune.stars,
    ancient: false,
    defaultGrade: rune.defaultGrade,
    level: rune.level,
    mainStatId: rune.mainStatId,
    mainValue: mainPropertyMaximum(rune.stars, rune.mainStatId),
    prefixStatId: rune.prefixStatId,
    prefixValue: rune.prefixValue,
    subProperties: rune.subProperties.map(({ statId, value, gemmed, grind }) => ({ statId, value, gemmed, grind })),
    occupiedId: null,
    obtainedOrder,
  };
}

function verdictFor(advice: RuneAdvice): SimulationVerdict {
  return {
    verdict: advice.verdict,
    reason: advice.reason,
    maxValue: advice.maxValue,
    chance: advice.chance,
    presetId: advice.preset?.id ?? null,
    presetName: advice.preset?.name ?? null,
  };
}

function stageResult(
  level: SimulationStage, runes: readonly SimulatedRune[], reached: number, config: RuneSimulationConfig,
  recommendations: ReadonlyMap<string, RuneAdvice> | null,
): SimulationStageResult {
  const acts = config.gates[level].policy === 'recommendation';
  const entries = runes.map((rune): SimulationEntry => {
    const advice = recommendations?.get(rune.id);
    if (recommendations !== null && !advice) {
      throw new Error(`Rune simulator has no Rune Clean-up recommendation for ${rune.id}.`);
    }
    return {
      rune,
      verdict: advice ? verdictFor(advice) : null,
      sold: acts && advice?.verdict === 'sell',
    };
  });
  const sold = entries.filter((entry) => entry.sold).length;
  return { level, entries, reached, survived: entries.length - sold, sold };
}

function generateRune(index: number, config: RuneSimulationConfig, random: RandomSource): SimulatedRune {
  const setName = config.setName;
  const slot = config.slot ?? integer(1, 6, random);
  const stars = config.stars ?? integer(1, 6, random);
  const grade = simulationGradeForSlot(slot, random);
  const mainStatId = choose(slotMainProperties[slot] ?? [], random);
  const rune: SimulatedRune = {
    id: `simulation-${index + 1}`,
    setName,
    slot,
    stars,
    defaultGrade: grade,
    level: 0,
    mainStatId,
    prefixStatId: null,
    prefixValue: 0,
    subProperties: [],
  };

  if (random() < prefixFrequency) {
    const prefixStatId = choose(legalStatIds(rune), random);
    rune.prefixStatId = prefixStatId;
    rune.prefixValue = rollValue(stars, prefixStatId, 'initial', random);
  }
  for (let at = 0; at < gradeSubPropertyCount[grade]; at += 1) addRandomSubProperty(rune, random);
  return rune;
}

function emptyStageRecord(): Record<SimulationStage, SimulationStageResult> {
  return {
    0: { level: 0, entries: [], reached: 0, survived: 0, sold: 0 },
    9: { level: 9, entries: [], reached: 0, survived: 0, sold: 0 },
    12: { level: 12, entries: [], reached: 0, survived: 0, sold: 0 },
  };
}

/**
 * Rune Clean-up's advice for one checkpoint.
 *
 * Asked whenever it can be, not only when the gate acts on it: a Keep all gate
 * still wants to show what the engine would have sold, or the table would print
 * a verdict nobody computed. A recommendation gate without the means to ask is
 * an error rather than a silent Keep all.
 */
async function recommendationsFor(
  runes: readonly SimulatedRune[], stage: SimulationStage,
  config: RuneSimulationConfig, context: RuneSimulationContext,
  engines: CalculationBackend[],
): Promise<ReadonlyMap<string, RuneAdvice> | null> {
  const { base } = context;
  if (base === null || context.presets.length === 0) {
    if (config.gates[stage].policy === 'keep-all') return null;
    throw new Error(base === null
      ? 'Rune Clean-up recommendations need a level 40 reference monster.'
      : 'Rune Clean-up recommendations need at least one preset.');
  }
  if (runes.length === 0) return new Map();
  return runeAdvice(
    runes.map((rune, index) => simulationRuneToCleanupRune(rune, index + 1)),
    context.presets,
    context.settings,
    base,
    async (jobs, chanceBar) => {
      const answer = await countRuneChances(jobs, context.preferWebGpu ?? false, chanceBar);
      engines.push(answer.backend);
      return answer.shares;
    },
  );
}

/**
 * The experiment runs the whole Rune Clean-up engine three times, and that engine
 * now answers the odds in one batch rather than a rune at a time — so this waits for
 * it. The three stages stay strictly in order: what survives `+0` is what is powered
 * to `+9`, and there is nothing to overlap.
 */
export async function simulateRunes(
  config: RuneSimulationConfig, context: RuneSimulationContext, random: RandomSource = defaultRandom,
): Promise<RuneSimulationResult> {
  const startedAt = performance.now();
  const engines: CalculationBackend[] = [];
  if (!Number.isSafeInteger(config.count) || config.count < 1) {
    throw new Error('Rune simulator needs at least one rune.');
  }
  for (const stage of simulationStages) {
    const checkpoint = config.gates[stage];
    if (!checkpoint || !['keep-all', 'recommendation'].includes(checkpoint.policy)) {
      throw new Error(`Rune simulator has an invalid gate at +${stage}.`);
    }
  }
  const stages = emptyStageRecord();
  const generated = Array.from({ length: config.count }, (_, index) => generateRune(index, config, random));

  stages[0] = stageResult(0, generated, generated.length, config,
    await recommendationsFor(generated, 0, config, context, engines));
  const afterZero = stages[0].entries.filter((entry) => !entry.sold).map((entry) => entry.rune);

  const atNine = afterZero.map((rune) => powerUpRune(rune, 9, random));
  stages[9] = stageResult(9, atNine, afterZero.length, config,
    await recommendationsFor(atNine, 9, config, context, engines));
  const afterNine = stages[9].entries.filter((entry) => !entry.sold).map((entry) => entry.rune);

  /* Two asks at +12: the first says what the craft should be, the second judges the
     rune it produced. Every rune is judged with the credited items already spent, so
     the crafted rune stands where the bare one did; the row shows the rune the
     verdict counted rather than the bare one from before. Without a
     preset or a reference monster nothing says which Gem helps, so nothing is spent. */
  const poweredToTwelve = afterNine.map((rune) => powerUpRune(rune, 12, random));
  const craftPlans = await recommendationsFor(poweredToTwelve, 12, config, context, engines);
  const atTwelve = poweredToTwelve.map((rune) => {
    const lines = craftPlans?.get(rune.id)?.craftedLines;
    return lines ? applyCraft(rune, lines) : rune;
  });
  stages[12] = stageResult(12, atTwelve, afterNine.length, config,
    await recommendationsFor(atTwelve, 12, config, context, engines));
  const kept = stages[12].entries.some((entry) => entry.verdict === null)
    ? null : stages[12].entries.filter((entry) => entry.verdict?.verdict === 'keep').length;

  return {
    config,
    stages,
    durationMs: performance.now() - startedAt,
    backend: combineCalculationBackends(engines),
    summary: {
      generated: generated.length,
      reachedNine: afterZero.length,
      reachedTwelve: afterNine.length,
      kept,
      soldAtZero: stages[0].sold,
      soldAtNine: stages[9].sold,
      soldAtTwelve: stages[12].sold,
    },
  };
}
