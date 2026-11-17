/**
 * The canonical synthetic-rune generator.
 *
 * The simulator and Rune Clean-up's deterministic sample must describe the same
 * game-generated rune. Keeping the draw and upgrade rules here means a correction
 * to the synthetic method reaches both callers on their next calculation; neither
 * caller owns a second copy of the rules or a stale pre-generated population.
 */
import {
  allStatIds, bornSubPropertyCount, remainingEvents, slotMainProperties, subPropertyRange,
} from './rune-properties';
import type { RuneRarity } from './runes';
import { slotAllowsSubStat } from './runes';
import { runeInnateFrequency, sampleRuneBirthRarity } from './rune-birth-model';

export type RandomSource = () => number;

/** The drop mix used by Rune Simulator and the slot-balance population. */
export function generatedRuneGrade(slot: number, random: RandomSource): RuneRarity {
  return sampleRuneBirthRarity(slot, random());
}

export type GeneratedRuneLine = {
  statId: number;
  value: number;
  gemmed: boolean;
  grind: number;
  rolls: number;
};

export type GeneratedRuneBody = {
  setName: string | null;
  slot: number;
  stars: number;
  rarity: RuneRarity;
  level: number;
  mainStatId: number;
  prefixStatId: number | null;
  prefixValue: number;
  subProperties: GeneratedRuneLine[];
};

const asUnit = (value: number): number => Math.min(0.9999999999999999, Math.max(0, value));

export function randomInteger(minimum: number, maximum: number, random: RandomSource): number {
  return minimum + Math.floor(asUnit(random()) * (maximum - minimum + 1));
}

export function chooseRandom<T>(values: readonly T[], random: RandomSource): T {
  const value = values[randomInteger(0, values.length - 1, random)];
  if (value === undefined) throw new Error('Synthetic rune generation cannot choose from an empty legal set.');
  return value;
}

function rollValue(
  stars: number, statId: number, kind: 'initial' | 'upgrade', random: RandomSource,
): number {
  const range = subPropertyRange(stars, statId, kind);
  if (!range) throw new Error(`Synthetic rune generation has no ${kind} range for ${stars}★ stat ${statId}.`);
  return randomInteger(range.minimum, range.maximum, random);
}

function legalStatIds(rune: Pick<GeneratedRuneBody, 'slot' | 'mainStatId' | 'prefixStatId' | 'subProperties'>): number[] {
  const used = new Set([
    rune.mainStatId,
    ...(rune.prefixStatId === null ? [] : [rune.prefixStatId]),
    ...rune.subProperties.map((property) => property.statId),
  ]);
  return allStatIds.filter((statId) => !used.has(statId) && slotAllowsSubStat(rune.slot, statId));
}

function cloneRuneBody(rune: GeneratedRuneBody): GeneratedRuneBody {
  return { ...rune, subProperties: rune.subProperties.map((property) => ({ ...property })) };
}

function newSubProperty(rune: GeneratedRuneBody, random: RandomSource): GeneratedRuneLine {
  const statId = chooseRandom(legalStatIds(rune), random);
  return {
    statId,
    value: rollValue(rune.stars, statId, 'initial', random),
    gemmed: false,
    grind: 0,
    rolls: 0,
  };
}

export function generateRuneBody({
  setName, slot, stars, rarity, mainStatId: requestedMainStatId, random,
}: {
  setName: string | null;
  slot: number;
  stars: number;
  rarity: RuneRarity;
  /** A deterministic caller may cycle the legal mains instead of sampling them. */
  mainStatId?: number;
  random: RandomSource;
}): GeneratedRuneBody {
  const mainStatId = requestedMainStatId ?? chooseRandom(slotMainProperties[slot] ?? [], random);
  const rune: GeneratedRuneBody = {
    setName, slot, stars, rarity, level: 0, mainStatId,
    prefixStatId: null, prefixValue: 0, subProperties: [],
  };
  if (random() < runeInnateFrequency) {
    const prefixStatId = chooseRandom(legalStatIds(rune), random);
    rune.prefixStatId = prefixStatId;
    rune.prefixValue = rollValue(stars, prefixStatId, 'initial', random);
  }
  for (let at = 0; at < bornSubPropertyCount(rarity); at += 1) {
    rune.subProperties.push(newSubProperty(rune, random));
  }
  return rune;
}

/**
 * Power a body up to a checkpoint. `drawThroughLevel` is normally the target;
 * deterministic samples can set it to +15 so their +0 and +12 views consume the
 * same random stream and therefore are checkpoints of the same rune bodies.
 */
export function upgradeRuneBody(
  rune: GeneratedRuneBody, targetLevel: number, random: RandomSource, drawThroughLevel = targetLevel,
): GeneratedRuneBody {
  if (targetLevel < rune.level) return cloneRuneBody(rune);
  const next = cloneRuneBody(rune);
  /* The schedule is `remainingEvents`', not a second copy of it: the Simulator, the
     calibration population and Statistics all play their runes forward through here. */
  const { events, levels } = remainingEvents(next.level, next.rarity);
  for (const [at, event] of events.entries()) {
    const level = levels[at];
    if (level > drawThroughLevel) continue;
    if (event === 'add') {
      const added = newSubProperty(next, random);
      if (level <= targetLevel) next.subProperties.push(added);
    } else {
      const target = next.subProperties[randomInteger(0, next.subProperties.length - 1, random)];
      if (!target) throw new Error('Synthetic rune generation chose no existing sub-property to improve.');
      const value = rollValue(next.stars, target.statId, 'upgrade', random);
      if (level <= targetLevel) {
        target.value += value;
        target.rolls += 1;
      }
    }
  }
  next.level = targetLevel;
  return next;
}
