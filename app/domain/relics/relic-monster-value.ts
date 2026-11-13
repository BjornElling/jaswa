import type { GameRecord } from '../account/game-record';
import type { MainStatBasis } from '../combat/main-stat-model';
import { copyMainStatNeed, mainStatCuts } from '../combat/main-stat-model';
import type { DefaultEntry } from '../profiles/monster-defaults';
import { calculateMonsterTotals, monsterBaseStats } from '../combat/monster-stats';
import {
  relicMainPercent, relicMainPropertyOrder, relicMaximumLevel, relicProperties, relicThreshold, relicUniquePercent,
} from './relic-properties';
import type { RelicMainProperty, RelicPropertyDefinition, RelicSourceStat } from './relic-properties';
import type { Relic } from './relics';

export type RelicStatValues = Record<RelicSourceStat, number>;
export type RelicStatWeights = Record<RelicMainProperty, number>;
export type RelicMonsterModel = {
  status: 'ready' | 'missing-stats' | 'no-priorities';
  base: RelicStatValues;
  totals: RelicStatValues;
  /** Where the need came from, where one was found (`main-stat-model.ts`). */
  basis?: MainStatBasis;
  /** How far each stat is lifted above base, in percent of base. */
  need: RelicStatWeights;
  weights: RelicStatWeights;
};

/**
 * What this copy needs is the main-stat model's answer, not one of this
 * module's own: the same need decides an artifact's main and a relic's, so the
 * two cannot be told different stories about one monster. The weights are that
 * need's shares, and a relic's main is worth its percentage times its stat's
 * share — exactly the order the model's relic bands are in. The totals a
 * unique reads its source from use the shared stat engine, so flats, grinds and
 * sets agree with the monster overlay.
 */
export function relicMonsterModel(monster: GameRecord): RelicMonsterModel {
  const rawBase = monsterBaseStats(monster);
  const base = { HP: rawBase[0], ATK: rawBase[1], DEF: rawBase[2], SPD: rawBase[3] };
  /* Candidate relics are compared against the same sheet before engraving;
     counting the currently engraved relic here would give every candidate its main
     property twice. */
  const sheet = calculateMonsterTotals({ ...monster, relics: [] });
  const totals = { HP: sheet.hp, ATK: sheet.atk, DEF: sheet.def, SPD: sheet.spd };
  const need = { HP: 0, ATK: 0, DEF: 0 };
  const weights = { HP: 0, ATK: 0, DEF: 0 };
  const model: RelicMonsterModel = { status: 'missing-stats', base, totals, need, weights };
  if (Object.values(base).some((value) => !Number.isFinite(value) || value <= 0)
    || Object.values(totals).some((value) => !Number.isFinite(value) || value <= 0)) return model;

  const found = copyMainStatNeed(monster);
  const investment = found === undefined ? 0 : found.need.HP + found.need.ATK + found.need.DEF;
  if (found === undefined || !(investment > 0) || !Number.isFinite(investment)) {
    model.status = 'no-priorities';
    return model;
  }
  model.basis = found.basis;
  for (const stat of ['HP', 'ATK', 'DEF'] as const) {
    need[stat] = found.need[stat];
    weights[stat] = found.need[stat] / investment;
  }
  model.status = 'ready';
  return model;
}

/** Indirect effects are value judgements, kept apart from the stat arithmetic. */
export const relicIndirectValue = { damageDealt: 1, damageTaken: 2 / 3, recovery: 2 / 3 } as const;

export type RelicMonsterValue = {
  /** Weighted percentage points of base stats; the two halves add to score. */
  main: number;
  unique: number;
  score: number;
  mainGain: number;
  sourceValue: number;
  uniquePercent: number;
  /** A stat-equivalent gain; indirect effects use the declared value judgement. */
  uniqueGain: number;
  target: RelicMainProperty;
};

/**
 * One effect calculation for rankings and explanations. The explicit battle
 * model uses base-relative stat bonuses, continuous unique scaling and a source
 * snapshot after the main bonus. No unique feeds back into its own source.
 * RELIC-CANONICAL §11 distinguishes these assumptions from measured game rules.
 */
export function relicMonsterValue(relic: Relic, model: RelicMonsterModel): RelicMonsterValue | null {
  if (model.status !== 'ready') return null;
  const mainGain = model.base[relic.mainProperty] * relic.mainPercent / 100;
  const afterMain = { ...model.totals, [relic.mainProperty]: model.totals[relic.mainProperty] + mainGain };
  const sourceValue = afterMain[relic.unique.definition.per];
  const uniquePercent = sourceValue / relic.unique.threshold * relic.unique.percent;
  const fraction = uniquePercent / 100;
  let target: RelicMainProperty;
  let uniqueGain: number;
  switch (relic.unique.definition.grants) {
    case 'MAX HP': target = 'HP'; uniqueGain = model.base.HP * fraction; break;
    case 'ATK': target = 'ATK'; uniqueGain = model.base.ATK * fraction; break;
    case 'DEF': target = 'DEF'; uniqueGain = model.base.DEF * fraction; break;
    case 'DMG dealt':
      target = 'ATK';
      uniqueGain = afterMain.ATK * fraction * relicIndirectValue.damageDealt;
      break;
    case 'DMG taken':
      target = 'HP';
      if (!(fraction >= 0 && fraction < 1)) throw new Error(`Relic ${relic.id} produces an invalid damage reduction.`);
      // Reducing incoming damage by q buys q / (1 − q) more effective HP.
      uniqueGain = afterMain.HP * fraction / (1 - fraction) * relicIndirectValue.damageTaken;
      break;
    case 'Recovery & Shield':
      target = 'HP';
      uniqueGain = afterMain.HP * fraction * relicIndirectValue.recovery;
      break;
  }
  const main = model.weights[relic.mainProperty] * mainGain / model.base[relic.mainProperty] * 100;
  const unique = model.weights[target] * uniqueGain / model.base[target] * 100;
  const score = main + unique;
  if ([mainGain, sourceValue, uniquePercent, uniqueGain, main, unique, score]
    .some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Relic ${relic.id} produces an invalid stat contribution.`);
  }
  return { main, unique, score, mainGain, sourceValue, uniquePercent, uniqueGain, target };
}

/** A relic no account owns: the given pair at the top level, for asking what a property is worth. */
function finishedRelic(main: RelicMainProperty, definition: RelicPropertyDefinition): Relic {
  return {
    id: `model-${main}-${definition.id}`, mainProperty: main, mainPercent: relicMainPercent(relicMaximumLevel),
    unique: {
      definition, threshold: relicThreshold(relicMaximumLevel, definition.per), percent: relicUniquePercent(definition),
    },
    level: relicMaximumLevel, durability: 0, locked: false, obtainedOrder: 0,
  };
}

/**
 * Which unique properties this copy should want, answered by the same
 * calculation the relic plan ranks with (`RELIC-CANONICAL.md` §11.9).
 *
 * The population's relic panel used to stand in here, and it said Nimble Primal
 * for 974 of 1,017 species: it records what the drop table handed out, not what
 * a monster needs, and it disagreed with the plan beside it. Each property is
 * valued as a finished relic on `main` — the main the copy's answer prefers,
 * else the one its need weighs most — and banded against the best property with
 * the main-stat model's own cuts, so a property and a main are judged on one scale.
 */
export function relicUniqueAdvice(
  model: RelicMonsterModel, preferredMain?: RelicMainProperty,
): Map<number, DefaultEntry> | undefined {
  if (model.status !== 'ready') return undefined;
  const main = preferredMain ?? relicMainPropertyOrder.reduce<RelicMainProperty>(
    (best, stat) => (model.weights[stat] > model.weights[best] ? stat : best), relicMainPropertyOrder[0]);
  const worth = relicProperties.map((definition) =>
    [definition.id, relicMonsterValue(finishedRelic(main, definition), model)?.unique ?? 0] as const);
  const best = worth.reduce((highest, [, value]) => Math.max(highest, value), 0);
  const total = worth.reduce((sum, [, value]) => sum + value, 0);
  if (!(best > 0) || !(total > 0)) return undefined;
  return new Map(worth.map(([id, value]) => {
    const ratio = value / best;
    const band = ratio >= mainStatCuts.preferred ? 'preferred' : ratio >= mainStatCuts.acceptable ? 'acceptable' : 'unwanted';
    return [id, { band, share: value / total }];
  }));
}
