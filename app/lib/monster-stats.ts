import { metricDmg, metricEhp, metricEhpD } from './rune-potential-metrics';

type RecordLike = Record<string, unknown>;

export type MonsterTotals = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  criticalRate: number;
  criticalDamage: number;
  resistance: number;
  accuracy: number;
};

/**
 * **One stat sheet, however many pages read it.**
 *
 * The Monsters page, the monster overlay, Speed Tuning and Rune Optimization all
 * need a copy's eight stats, and Rune Optimization needs them a few hundred million
 * times per calculation. So the rules are written once, over flat arrays, and the
 * object-shaped functions below are thin readers of the same arithmetic. A second
 * copy tuned for speed would be exactly the drift `AGENTS.md` §6 forbids: the
 * optimizer would print one E.HP for a build and the overlay another for the same
 * six runes once it was worn.
 *
 * The sheet is summed into twelve accumulators, in the order `effectSlot` names,
 * and read out in the order `MonsterTotals` names.
 */
export const effectSlot = {
  hpPercent: 0, hpFlat: 1, atkPercent: 2, atkFlat: 3, defPercent: 4, defFlat: 5,
  spdPercent: 6, spdFlat: 7, criticalRate: 8, criticalDamage: 9, resistance: 10, accuracy: 11,
} as const;

export const effectSlotCount = 12;

/** The eight base stats in `MonsterTotals` order: HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES, ACC. */
export const baseStatCount = 8;

/* A rune property's effect id against the accumulator it feeds. The main, the
   innate and every sub property read through the same table, so a flat and a
   percentage line can never be confused by one of them. */
const effectSlotByStatId: Readonly<Record<number, number>> = {
  1: effectSlot.hpFlat, 2: effectSlot.hpPercent, 3: effectSlot.atkFlat, 4: effectSlot.atkPercent,
  5: effectSlot.defFlat, 6: effectSlot.defPercent, 8: effectSlot.spdFlat, 9: effectSlot.criticalRate,
  10: effectSlot.criticalDamage, 11: effectSlot.resistance, 12: effectSlot.accuracy,
};

/** Which accumulator a rune property of this effect id adds to, or `-1` for none. */
export function effectSlotOf(statId: number): number {
  return effectSlotByStatId[statId] ?? -1;
}

/*
 * The permanent, personal-stat bonuses granted by completed rune sets, by the
 * game's `set_id`. Effects which only matter during a battle are deliberately not
 * included in the always-visible stats.
 *
 * **Open question, recorded rather than settled here.** `rune-properties.ts`
 * `setBonuses` also lists the five team sets (Fight, Determination, Enhance,
 * Accuracy, Tolerance) that `RUNE-CANONICAL.md` §10 says include the wearer. This
 * sheet has never counted them and was matched against SWOP Pro without them
 * (`RUNE-PRESET-METRICS.md` §6), so whether the game's own stat panel shows them is
 * unverified. Until an in-game capture says, the sheet keeps its measured form —
 * and because every page reads it from here, they all keep it together.
 */
const setStatBonuses: Readonly<Record<number, { pieces: number; slot: number; value: number }>> = {
  1: { pieces: 2, slot: effectSlot.hpPercent, value: 15 }, // Energy
  2: { pieces: 2, slot: effectSlot.defPercent, value: 15 }, // Guard
  3: { pieces: 4, slot: effectSlot.spdPercent, value: 25 }, // Swift
  4: { pieces: 2, slot: effectSlot.criticalRate, value: 12 }, // Blade
  5: { pieces: 4, slot: effectSlot.criticalDamage, value: 40 }, // Rage
  6: { pieces: 2, slot: effectSlot.accuracy, value: 20 }, // Focus
  7: { pieces: 2, slot: effectSlot.resistance, value: 20 }, // Endure
  8: { pieces: 4, slot: effectSlot.atkPercent, value: 35 }, // Fatal
};

/** The sets whose completion moves a stat, as `[setId, pieces, accumulator, value]` rows. */
export const statSetBonuses: ReadonlyArray<readonly [setId: number, pieces: number, slot: number, value: number]> =
  Object.entries(setStatBonuses).map(([setId, bonus]) => [Number(setId), bonus.pieces, bonus.slot, bonus.value] as const);

/** The highest `set_id` the game uses, so a set count can be a flat array. */
export const setIdBound = 26;

/** Intangible's own `set_id` (`RUNE-CANONICAL.md` §10). */
export const intangibleSetId = 25;

/* Pieces per set, for the one question the Intangible rule asks: which sets are
   exactly one rune short. Taken from the same numbering `rune-sets.ts` uses. */
const setPieces: Readonly<Record<number, number>> = {
  1: 2, 2: 2, 3: 4, 4: 2, 5: 4, 6: 2, 7: 2, 8: 4, 10: 4, 11: 4, 13: 4,
  14: 2, 15: 2, 16: 2, 17: 2, 18: 2, 19: 2, 20: 2, 21: 2, 22: 2, 23: 2, 24: 2,
};

export const setPieceCount = (setId: number): number => setPieces[setId] ?? 0;

/**
 * Which set a worn Intangible rune completes, `-1` for none, or `-2` where the
 * answer is not known.
 *
 * `RUNE-CANONICAL.md` §10: an Intangible completes one set that is exactly one rune
 * short, and never several. Where exactly one set is short the answer is that set.
 * Where several are, the game picks one and JASWA does not know how — so it says so
 * with `-2` rather than choosing, and each caller decides what an unknown means for
 * it: the stat sheet counts no completion, the optimizer refuses the combination.
 */
export function intangibleCompletion(counts: ArrayLike<number>): number {
  if ((counts[intangibleSetId] ?? 0) === 0) return -1;
  let found = -1;
  for (let setId = 1; setId < setIdBound; setId += 1) {
    const pieces = setPieces[setId];
    if (pieces === undefined || (counts[setId] ?? 0) === 0) continue;
    if (counts[setId] % pieces !== pieces - 1) continue;
    if (found !== -1) return -2;
    found = setId;
  }
  return found;
}

/**
 * Add the completed sets' personal-stat bonuses to `effects`, from a count of worn
 * runes by `set_id`. `completes` is the set an Intangible completes, as
 * `intangibleCompletion` answered it; anything below zero completes nothing.
 */
export function addSetBonuses(counts: ArrayLike<number>, completes: number, effects: Float64Array): void {
  for (const [setId, pieces, slot, value] of statSetBonuses) {
    const worn = (counts[setId] ?? 0) + (completes === setId ? 1 : 0);
    if (worn >= pieces) effects[slot] += Math.floor(worn / pieces) * value;
  }
}

/**
 * The eight stats from a copy's base and its summed accumulators, into `out` in
 * `MonsterTotals` order. HP, ATK, DEF and SPD round up once, after every percentage
 * is summed, which is how the game shows them.
 */
export function totalsInto(base: ArrayLike<number>, effects: ArrayLike<number>, out: Float64Array): void {
  out[0] = Math.ceil(base[0] * (100 + effects[effectSlot.hpPercent]) / 100) + effects[effectSlot.hpFlat];
  out[1] = Math.ceil(base[1] * (100 + effects[effectSlot.atkPercent]) / 100) + effects[effectSlot.atkFlat];
  out[2] = Math.ceil(base[2] * (100 + effects[effectSlot.defPercent]) / 100) + effects[effectSlot.defFlat];
  out[3] = Math.ceil(base[3] * (100 + effects[effectSlot.spdPercent]) / 100) + effects[effectSlot.spdFlat];
  out[4] = base[4] + effects[effectSlot.criticalRate];
  out[5] = base[5] + effects[effectSlot.criticalDamage];
  out[6] = base[6] + effects[effectSlot.resistance];
  out[7] = base[7] + effects[effectSlot.accuracy];
}

/**
 * The eleven figures a copy is measured by, in the order `figuresInto` writes them.
 * It is `monsterStatTargetKeys` spelled out here rather than imported, because that
 * list lives beside the statistics dataset and every search worker reads this
 * module; `verify-rune-optimization.mjs` holds the two equal.
 */
export const targetFigureKeys = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc', 'dmg', 'ehp', 'ehpD'] as const;

/** How many figures a copy is measured by: its eight stats and the three composites. */
export const targetFigureCount = targetFigureKeys.length;

/**
 * The eleven figures from eight totals, into `out` in `monsterStatTargetKeys`
 * order — HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES, ACC, DMG, E.HP, E.HP D.
 * The composites are truncated as `RUNE-PRESET-METRICS.md` displays them, so a
 * figure compared anywhere is the figure the user is shown.
 */
export function figuresInto(totals: ArrayLike<number>, out: Float64Array): void {
  for (let at = 0; at < targetFigureCount; at += 1) out[at] = figureOf(totals, at);
}

/**
 * One of the eleven figures, by its position in `targetFigureKeys`. It is what
 * `figuresInto` writes, one at a time, for a caller that reads one figure a few
 * hundred million times and would otherwise pay for all three composites each time.
 */
export function figureOf(totals: ArrayLike<number>, index: number): number {
  switch (index) {
    case 8: return Math.floor(Math.max(0, metricDmg(totals[1], totals[4], totals[5])));
    case 9: return Math.floor(Math.max(0, metricEhp(totals[0], totals[2])));
    case 10: return Math.floor(Math.max(0, metricEhpD(totals[0], totals[2])));
    default: return totals[index];
  }
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A copy's base stats, in `MonsterTotals` order. HP is the export's `con` × 15. */
export function monsterBaseStats(monster: RecordLike): Float64Array {
  return Float64Array.of(
    numberValue(monster.con) * 15, numberValue(monster.atk), numberValue(monster.def), numberValue(monster.spd),
    numberValue(monster.critical_rate), numberValue(monster.critical_damage),
    numberValue(monster.resist), numberValue(monster.accuracy),
  );
}

function addEffect(effect: unknown, effects: Float64Array): void {
  if (!Array.isArray(effect) || effect.length < 2) return;
  const slot = effectSlotOf(numberValue(effect[0]));
  // For a rune substat, the fourth value is the grindstone amount. It is a
  // separate addition to the visible stat, not a possible future roll.
  // Main and innate effects do not carry this value, so they remain unchanged.
  if (slot >= 0) effects[slot] += numberValue(effect[1]) + numberValue(effect[3]);
}

function records(value: unknown): RecordLike[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is RecordLike => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

/**
 * Artifacts add their fixed main property. An engraved relic's main property is
 * a percentage of the wearer's base stat and appears on the game's stat panel;
 * its unique property acts at the start of battle and does not appear there.
 */
export function addEquipmentEffects(monster: RecordLike, effects: Float64Array): void {
  for (const artifact of records(monster.artifacts)) {
    const effect = artifact.pri_effect;
    if (!Array.isArray(effect) || effect.length < 2) continue;
    const value = numberValue(effect[1]);
    switch (numberValue(effect[0])) {
      case 100: effects[effectSlot.hpFlat] += value; break;
      case 101: effects[effectSlot.atkFlat] += value; break;
      case 102: effects[effectSlot.defFlat] += value; break;
      default: break;
    }
  }
  for (const relic of records(monster.relics)) {
    const effect = relic.pri_effect;
    if (!Array.isArray(effect) || effect.length < 2) continue;
    const value = numberValue(effect[1]);
    switch (numberValue(effect[0])) {
      case 100: effects[effectSlot.hpPercent] += value; break;
      case 101: effects[effectSlot.atkPercent] += value; break;
      case 102: effects[effectSlot.defPercent] += value; break;
      default: break;
    }
  }
}

type AccountStatModifiers = Partial<Record<'hpPercent' | 'atkPercent' | 'defPercent' | 'spdPercent', number>>;

/**
 * Calculates the current personal stat sheet from the imported monster and its
 * equipped runes. The optional modifiers are reserved for account-wide bonuses
 * once their full import rules have been established; they default to zero so
 * imported game data is never silently guessed or invented.
 */
export function calculateMonsterTotals(monster: RecordLike, accountModifiers: AccountStatModifiers = {}): MonsterTotals {
  const effects = new Float64Array(effectSlotCount);
  effects[effectSlot.hpPercent] = numberValue(accountModifiers.hpPercent);
  effects[effectSlot.atkPercent] = numberValue(accountModifiers.atkPercent);
  effects[effectSlot.defPercent] = numberValue(accountModifiers.defPercent);
  effects[effectSlot.spdPercent] = numberValue(accountModifiers.spdPercent);
  const counts = new Int32Array(setIdBound);

  for (const rune of records(monster.runes)) {
    const setId = numberValue(rune.set_id);
    if (setId > 0 && setId < setIdBound) counts[setId] += 1;
    addEffect(rune.pri_eff, effects);
    addEffect(rune.prefix_eff, effects);
    if (Array.isArray(rune.sec_eff)) rune.sec_eff.forEach((effect) => addEffect(effect, effects));
  }
  addEquipmentEffects(monster, effects);
  addSetBonuses(counts, intangibleCompletion(counts), effects);

  const totals = new Float64Array(baseStatCount);
  totalsInto(monsterBaseStats(monster), effects, totals);
  return {
    hp: totals[0], atk: totals[1], def: totals[2], spd: totals[3],
    criticalRate: totals[4], criticalDamage: totals[5], resistance: totals[6], accuracy: totals[7],
  };
}

/**
 * What a copy's display speed is made of, for Speed Tuning: the base speed, and
 * whether a four-piece Swift set is worn. The display speed itself is the stat
 * sheet's own figure, so it can never disagree with the Monsters page.
 */
export function monsterSpeedParts(monster: RecordLike): { baseSpeed: number; swift: boolean; displaySpeed: number } {
  const swiftPieces = records(monster.runes).filter((rune) => numberValue(rune.set_id) === 3).length;
  return {
    baseSpeed: numberValue(monster.spd),
    swift: swiftPieces >= setStatBonuses[3].pieces,
    displaySpeed: calculateMonsterTotals(monster).spd,
  };
}

/**
 * A copy's combat crit conditions are added to its own CRI Rate while a search
 * judges a build. A guaranteed crit adds enough to reach the 100 % DMG cap;
 * element advantage and a lead each contribute their own points.
 *
 * It is a lift on the stat rather than a second DMG formula because Rune
 * Optimization's search, and the shader beside it, read CRI Rate from the monster's
 * base: lifting the base there is the whole of the rule, with no second
 * implementation to drift. A CRI Rate *shown* is always the monster's own —
 * `unliftedFigures` takes the lift back off. A guaranteed crit satisfies a
 * CRI Rate target by definition, so that target is never asked.
 */
export const alwaysCritsLift = 100;

export type CriticalRateBonuses = {
  alwaysCrits: boolean;
  alwaysElementAdvantage: boolean;
  critLead?: number;
};

/** External CRI Rate points used by a calculation, never printed as the copy's own stat. */
export const criticalRateLift = (bonuses: CriticalRateBonuses): number =>
  (bonuses.alwaysCrits ? alwaysCritsLift : 0) + (bonuses.alwaysElementAdvantage ? 15 : 0) + (bonuses.critLead ?? 0);

/** Figures summed over a lifted base, with the CRI Rate put back to the monster's own. */
export function unliftedFigures<Figures extends { [index: number]: number }>(figures: Figures, lift: number): Figures {
  figures[4] -= lift;
  return figures;
}

/**
 * The eleven figures a copy can be measured against: its eight stats under the
 * names a target is stated in, plus the three composites derived from them.
 *
 * It exists so that the overlay's reference column and the shortfall check read
 * one answer. Two call sites deriving DMG separately is how one screen comes to
 * say a target is met while the other says it is not — and the composites are
 * derived here rather than stored precisely so that cannot happen
 * (`AGENTS.md` §6). The truncation is `RUNE-PRESET-METRICS.md`'s display rule,
 * so a figure compared here is the figure the user was shown.
 */
export function monsterTargetFigures(totals: MonsterTotals, bonuses: CriticalRateBonuses): {
  hp: number; atk: number; def: number; spd: number;
  criRate: number; criDmg: number; res: number; acc: number;
  dmg: number; ehp: number; ehpD: number;
} {
  const lift = criticalRateLift(bonuses);
  const figures = new Float64Array(targetFigureCount);
  figuresInto([
    totals.hp, totals.atk, totals.def, totals.spd,
    totals.criticalRate + lift, totals.criticalDamage, totals.resistance, totals.accuracy,
  ], figures);
  unliftedFigures(figures, lift);
  return {
    hp: figures[0], atk: figures[1], def: figures[2], spd: figures[3],
    criRate: figures[4], criDmg: figures[5], res: figures[6], acc: figures[7],
    dmg: figures[8], ehp: figures[9], ehpD: figures[10],
  };
}
