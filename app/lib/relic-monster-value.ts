import type { GameRecord } from './game-data';
import type { MainStatBasis } from './main-stat-model';
import { copyMainStatNeed } from './main-stat-model';
import type { MonsterCopyPreferences } from './monster-preferences';
import { calculateMonsterTotals, monsterBaseStats } from './monster-stats';
import type { RelicMainProperty, RelicSourceStat } from './relic-properties';
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
export function relicMonsterModel(monster: GameRecord, stated?: MonsterCopyPreferences): RelicMonsterModel {
  const rawBase = monsterBaseStats(monster);
  const base = { HP: rawBase[0], ATK: rawBase[1], DEF: rawBase[2], SPD: rawBase[3] };
  /* Candidate relics are compared against the same sheet before engraving;
     counting the currently worn relic here would give every candidate its main
     property twice. */
  const sheet = calculateMonsterTotals({ ...monster, relics: [] });
  const totals = { HP: sheet.hp, ATK: sheet.atk, DEF: sheet.def, SPD: sheet.spd };
  const need = { HP: 0, ATK: 0, DEF: 0 };
  const weights = { HP: 0, ATK: 0, DEF: 0 };
  const model: RelicMonsterModel = { status: 'missing-stats', base, totals, need, weights };
  if (Object.values(base).some((value) => !Number.isFinite(value) || value <= 0)
    || Object.values(totals).some((value) => !Number.isFinite(value) || value <= 0)) return model;

  const found = copyMainStatNeed(monster, stated);
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
