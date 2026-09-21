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
import { allStatIds, setBonuses, slotMainProperties, subPropertyRange } from './rune-properties';
import {
  runeStatName, runeStatIds, slotAllowsSubStat,
} from './runes';
import type { RuneDefaultGrade } from './runes';
import { craftAssumptionForSetting, craftRollValue, craftValueRange, isGrindableStat } from './rune-craft-items';
import type { CraftLineage, CraftRollAssumption } from './rune-craft-items';
import type { RunePotentialSettings } from './types';

export const simulationStages = [0, 9, 12] as const;
export type SimulationStage = typeof simulationStages[number];

export type SimulationLineage = 'ordinary' | 'ancient';
/** A named set, or null for a generated rune with no rune type. */
export type SimulationSet = string | null;
export type SimulationSlot = number | null;
export type SimulationStars = number | null;

/** A checkpoint can either let everything through or ask for a target line. */
export type SimulationGate = {
  minimumRolls: number;
  targetStatId: number | null;
};

export type RuneSimulationCraftSettings = Pick<
  RunePotentialSettings, 'enchantedGems' | 'grindstones' | 'gemGrade' | 'grindstoneGrade'
>;

export type RuneSimulationConfig = {
  count: number;
  setName: SimulationSet;
  slot: SimulationSlot;
  stars: SimulationStars;
  lineage: SimulationLineage;
  mainStatId: number | null;
  gates: Readonly<Record<SimulationStage, SimulationGate>>;
  /** The only craft policy the engine accepts: the four Rune Clean-up choices. */
  craftSettings: RuneSimulationCraftSettings;
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
  setBonus: string | null;
  slot: number;
  stars: number;
  ancient: boolean;
  defaultGrade: RuneDefaultGrade;
  level: number;
  mainStatId: number;
  prefixStatId: number | null;
  prefixValue: number;
  subProperties: SimulationSubProperty[];
};

export type SimulationDecision = 'power-up' | 'keep' | 'sell';

export type SimulationEntry = {
  rune: SimulatedRune;
  decision: SimulationDecision;
  /** How many rolls have landed on the configured target, at this checkpoint. */
  targetRolls: number;
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
  kept: number;
  soldAtZero: number;
  soldAtNine: number;
  soldAtTwelve: number;
};

export type RuneSimulationResult = {
  config: RuneSimulationConfig;
  stages: Readonly<Record<SimulationStage, SimulationStageResult>>;
  summary: RuneSimulationSummary;
};

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
  lineage: 'ordinary',
  mainStatId: null,
  gates: {
    0: { minimumRolls: 0, targetStatId: null },
    9: { minimumRolls: 0, targetStatId: null },
    12: { minimumRolls: 0, targetStatId: null },
  },
  craftSettings: { enchantedGems: 1, grindstones: 1, gemGrade: 'Hero', grindstoneGrade: 'Hero' },
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
  stars: number, statId: number, kind: 'initial' | 'upgrade', ancient: boolean, random: RandomSource,
): number {
  const range = subPropertyRange(stars, statId, kind, ancient);
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

function setEffectText(setName: string): string | null {
  const effect = setBonuses[setName];
  if (!effect) return null;
  const name = runeStatName(effect.statId)?.replace(' %', '') ?? 'Unknown stat';
  const amount = effect.percent ?? effect.flat;
  if (amount === undefined) return null;
  return `${name} +${amount}${effect.percent === undefined ? '' : ' %'}`;
}

/** The one display helper for the stat vocabulary used by the simulator. */
export function simulationStatLabel(statId: number): string {
  return runeStatName(statId) ?? `Unknown stat ${statId}`;
}

/** The set property shown beside every generated copy of a named set. */
export function simulationSetEffect(setName: string): string | null {
  return setEffectText(setName);
}

function cloneRune(rune: SimulatedRune): SimulatedRune {
  return {
    ...rune,
    subProperties: rune.subProperties.map((property) => ({ ...property })),
  };
}

function addRandomSubProperty(rune: SimulatedRune, random: RandomSource, ancient: boolean): void {
  const statId = choose(legalStatIds(rune), random);
  rune.subProperties.push({
    statId,
    value: rollValue(rune.stars, statId, 'initial', ancient, random),
    gemmed: false,
    grind: 0,
    rolls: 0,
  });
}

/** Power the exact same copy to the requested checkpoint. */
export function powerUpRune(rune: SimulatedRune, targetLevel: SimulationStage, random: RandomSource = defaultRandom): SimulatedRune {
  if (targetLevel < rune.level) return cloneRune(rune);
  const next = cloneRune(rune);
  for (const level of [3, 6, 9, 12] as const) {
    if (level <= next.level || level > targetLevel) continue;
    if (next.subProperties.length < 4) {
      addRandomSubProperty(next, random, next.ancient);
    } else {
      const target = next.subProperties[integer(0, next.subProperties.length - 1, random)];
      if (!target) throw new Error('Rune simulator chose no existing sub-property to improve.');
      target.value += rollValue(next.stars, target.statId, 'upgrade', false, random);
      target.rolls += 1;
    }
    next.level = level;
  }
  return next;
}

function legalEnchantIds(rune: SimulatedRune, lineIndex: number): number[] {
  return legalStatIds({
    ...rune,
    subProperties: rune.subProperties.filter((_, index) => index !== lineIndex),
  });
}

function craftLineageFor(rune: SimulatedRune): CraftLineage {
  if (rune.ancient) return 'ancient';
  return rune.setName === 'Intangible' ? 'immemorial' : 'standard';
}

function applyEnchant(
  rune: SimulatedRune, assumption: CraftRollAssumption | null,
  grade: RuneSimulationCraftSettings['gemGrade'], random: RandomSource,
): void {
  if (assumption === null || rune.subProperties.length === 0) return;
  const lineIndex = integer(0, rune.subProperties.length - 1, random);
  const current = rune.subProperties[lineIndex];
  if (!current) return;
  const candidates = legalEnchantIds(rune, lineIndex);
  if (candidates.length === 0) return;
  const statId = choose(candidates, random);
  const range = craftValueRange('gem', craftLineageFor(rune), statId, grade);
  const value = range ? craftRollValue(range, assumption) : null;
  if (value === null) return;
  rune.subProperties[lineIndex] = {
    statId, value, gemmed: true, grind: statId === current.statId ? current.grind : 0, rolls: 0,
  };
}

function applyGrind(
  rune: SimulatedRune, assumption: CraftRollAssumption | null,
  grade: RuneSimulationCraftSettings['grindstoneGrade'], random: RandomSource,
): void {
  if (assumption === null) return;
  const candidates = rune.subProperties.filter((property) => isGrindableStat(property.statId));
  if (!candidates.length) return;
  const target = choose(candidates, random);
  const range = craftValueRange('grindstone', craftLineageFor(rune), target.statId, grade);
  const value = range ? craftRollValue(range, assumption) : null;
  if (value !== null) target.grind = value;
}

/** Apply the optional post-+12 craft actions in their game order. */
export function craftRuneAtTwelve(
  rune: SimulatedRune, config: RuneSimulationConfig, random: RandomSource = defaultRandom,
): SimulatedRune {
  const next = cloneRune(rune);
  const { craftSettings } = config;
  applyEnchant(next, craftAssumptionForSetting(craftSettings.enchantedGems), craftSettings.gemGrade, random);
  applyGrind(next, craftAssumptionForSetting(craftSettings.grindstones), craftSettings.grindstoneGrade, random);
  return next;
}

function targetRolls(rune: SimulatedRune, gate: SimulationGate): number {
  if (gate.targetStatId === null) return 0;
  return rune.subProperties
    .filter((property) => property.statId === gate.targetStatId)
    .reduce((total, property) => total + property.rolls, 0);
}

function decisionFor(rune: SimulatedRune, stage: SimulationStage, config: RuneSimulationConfig): SimulationDecision {
  const gate = config.gates[stage];
  const sell = gate.targetStatId !== null && targetRolls(rune, gate) < gate.minimumRolls;
  if (sell) return 'sell';
  return stage === 12 ? 'keep' : 'power-up';
}

function stageResult(
  level: SimulationStage, runes: readonly SimulatedRune[], reached: number, config: RuneSimulationConfig,
): SimulationStageResult {
  const entries = runes.map((rune) => {
    const gate = config.gates[level];
    return { rune, decision: decisionFor(rune, level, config), targetRolls: targetRolls(rune, gate) };
  });
  const sold = entries.filter((entry) => entry.decision === 'sell').length;
  return { level, entries, reached, survived: entries.length - sold, sold };
}

function generateRune(index: number, config: RuneSimulationConfig, random: RandomSource): SimulatedRune {
  const setName = config.setName;
  const slot = config.slot ?? integer(1, 6, random);
  const stars = config.stars ?? integer(1, 6, random);
  const ancient = config.lineage === 'ancient';
  if (ancient && stars !== 6) throw new Error('Ancient runes must be six-star runes.');
  const grade = simulationGradeForSlot(slot, random);
  const legalMains = slotMainProperties[slot] ?? [];
  const mainStatId = config.mainStatId !== null && legalMains.includes(config.mainStatId)
    ? config.mainStatId : choose(legalMains, random);
  const rune: SimulatedRune = {
    id: `simulation-${index + 1}`,
    setName,
    setBonus: setName === null ? null : setEffectText(setName),
    slot,
    stars,
    ancient,
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
    rune.prefixValue = rollValue(stars, prefixStatId, 'initial', ancient, random);
  }
  for (let at = 0; at < gradeSubPropertyCount[grade]; at += 1) addRandomSubProperty(rune, random, ancient);
  return rune;
}

function emptyStageRecord(): Record<SimulationStage, SimulationStageResult> {
  return {
    0: { level: 0, entries: [], reached: 0, survived: 0, sold: 0 },
    9: { level: 9, entries: [], reached: 0, survived: 0, sold: 0 },
    12: { level: 12, entries: [], reached: 0, survived: 0, sold: 0 },
  };
}

/** Run the complete configured experiment, including every checkpoint action. */
export function simulateRunes(config: RuneSimulationConfig, random: RandomSource = defaultRandom): RuneSimulationResult {
  if (!Number.isSafeInteger(config.count) || config.count < 1) {
    throw new Error('Rune simulator needs at least one rune.');
  }
  for (const stage of simulationStages) {
    const checkpoint = config.gates[stage];
    if (!checkpoint || !Number.isSafeInteger(checkpoint.minimumRolls) || checkpoint.minimumRolls < 0 || checkpoint.minimumRolls > 4) {
      throw new Error(`Rune simulator has an invalid gate at +${stage}.`);
    }
    if (checkpoint.minimumRolls > 0 && checkpoint.targetStatId === null) {
      throw new Error(`Rune simulator needs a target substat for the +${stage} sell rule.`);
    }
  }
  const stages = emptyStageRecord();
  const generated = Array.from({ length: config.count }, (_, index) => generateRune(index, config, random));

  stages[0] = stageResult(0, generated, generated.length, config);
  const afterZero = stages[0].entries.filter((entry) => entry.decision !== 'sell').map((entry) => entry.rune);

  const atNine = afterZero.map((rune) => powerUpRune(rune, 9, random));
  stages[9] = stageResult(9, atNine, afterZero.length, config);
  const afterNine = stages[9].entries.filter((entry) => entry.decision !== 'sell').map((entry) => entry.rune);

  const atTwelve = afterNine.map((rune) => craftRuneAtTwelve(powerUpRune(rune, 12, random), config, random));
  stages[12] = stageResult(12, atTwelve, afterNine.length, config);
  const kept = stages[12].entries.filter((entry) => entry.decision === 'keep').length;

  return {
    config,
    stages,
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

/** A compact reading for a stat in the results table, including its own unit. */
export function simulationValueLabel(statId: number, value: number): string {
  return `${simulationStatLabel(statId)} ${value}`;
}

/** The grades the fixed slot distributions can generate. */
export const simulationGrades: readonly RuneDefaultGrade[] = ['Rare', 'Hero', 'Legend'];
export const simulationStars: readonly number[] = [1, 2, 3, 4, 5, 6];
export const simulationSlots: readonly number[] = [1, 2, 3, 4, 5, 6];
export const simulationMainStatIds: readonly number[] = runeStatIds;
