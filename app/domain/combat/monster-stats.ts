import type { BuildingBonuses } from '../account/account-buildings';
import { criticalRateCapPercent, metricDmg, metricEhp, metricEhpD } from '../runes/rune-potential-metrics';
import {
  elementName, intangibleCompletion, intangibleSetId, runeSetName, setIdBound, setPieceCount, swiftSetId,
} from '../runes/rune-sets';
import { swiftPercent } from '../speed/speed-tick';
import { spdUpEffectPropertyId } from '../artifacts/artifact-properties';
import { personalPassiveStatBonus } from './passive-stat-bonuses';
import type { AutomaticStatLine, PassiveStatRule } from './passive-stat-bonuses';

/* The set rules live with the set table in `rune-sets.ts`; the search workers
   have always read them from here, so they are offered here too. */
export { intangibleCompletion, intangibleSetId, setIdBound, setPieceCount };

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
 * six runes once it was engraved.
 *
 * The sheet is summed into display and battle accumulators, in the order `effectSlot` names,
 * and read out in the order `MonsterTotals` names.
 */
export const effectSlot = {
  hpPercent: 0, hpFlat: 1, atkPercent: 2, atkFlat: 3, defPercent: 4, defFlat: 5,
  spdPercent: 6, spdFlat: 7, criticalRate: 8, criticalDamage: 9, resistance: 10, accuracy: 11,
  teamHpPercent: 12, teamAtkPercent: 13, teamDefPercent: 14, teamResistance: 15, teamAccuracy: 16,
} as const;

export const effectSlotCount = 17;

/** The eight base stats in `MonsterTotals` order: HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES, ACC. */
export const baseStatCount = 8;

/**
 * What a fight adds to a copy, kept in its base after the eight stats, one
 * position per stat in the same order: HP, ATK, DEF and SPD as a percentage of
 * base — leads, Glory buildings and the Sky Tribe Totem — and CRI Rate, CRI Dmg,
 * RES and ACC in points — leads, the teammates' team sets, element advantage and
 * the Fallen Ancient Guardian. After them, `criRateFloorAt`: the CRI Rate a
 * guaranteed crit raises the fight's to. The totals carry the eight stats as the
 * panel shows them, then the same eight as the fight has them, at `combatAt`.
 *
 * **The panel shows a stat; a fight is judged by it.** The display stats are what
 * the game's monster panel shows: runes, gear and the copy's personal sets,
 * and nothing else — no team set, no lead, no building, as the panel shows none.
 * Every figure a range, a target or a ranking reads is the fight's: a CRI Rate
 * range of 100 with a 24-point crit lead asks the runes for 76, and DMG, E.HP and
 * E.HP D are counted from the same eight. One sum gives both, so a stat and the
 * composite beside it can never count the fight differently. The display stats
 * stay beside them so a page can show what the fight adds (`figure-marks.ts`).
 */
export const combatAt = { hp: 8, atk: 9, def: 10, spd: 11, criRate: 12, criDmg: 13, res: 14, acc: 15 } as const;

/** Where a copy's base holds the CRI Rate a guaranteed crit lifts the fight's to; 0 without one. */
export const criRateFloorAt = 16;

/** Battle-start rules that derive a stat from another stat rather than a fixed addition. */
export const passiveRuleAt = { defenseFromAttackPercent: 17, balanceAttackDefense: 18 } as const;

/** A copy's base as every sheet reads it: the eight stats, `combatAt`, crit floor, then passive rules. */
export const baseLength = 19;

/** The totals `totalsInto` writes: the eight display stats, then the eight the fight has. */
export const totalCount = 16;

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

/**
 * Completed sets include the holder's own team bonuses (RUNE-CANONICAL.md §10).
 * A set is identified by its id; the name is kept beside it because teammates'
 * sets are counted by name, and is held to the set table's own below.
 */
export const teamSetBonuses = [
  { name: 'Fight', setId: 19, stat: 'atk', value: 8 },
  { name: 'Determination', setId: 20, stat: 'def', value: 8 },
  { name: 'Enhance', setId: 21, stat: 'hp', value: 8 },
  { name: 'Accuracy', setId: 22, stat: 'acc', value: 10 },
  { name: 'Tolerance', setId: 23, stat: 'res', value: 10 },
] as const;
export type TeamSet = typeof teamSetBonuses[number]['name'];
/** Completed sets on other monsters only; the holder's own sets come from its runes. */
export type TeammateSets = Partial<Record<TeamSet, number>>;

for (const { name, setId } of teamSetBonuses) {
  if (runeSetName(setId) !== name) throw new Error(`Team set ${name} does not match set ${setId} in the set table.`);
}

/* What a completed set adds, by set id; the runes it takes are the set table's. */
const setStatValues: Readonly<Record<number, { slot: number; value: number }>> = {
  1: { slot: effectSlot.hpPercent, value: 15 }, // Energy
  2: { slot: effectSlot.defPercent, value: 15 }, // Guard
  [swiftSetId]: { slot: effectSlot.spdPercent, value: swiftPercent },
  4: { slot: effectSlot.criticalRate, value: 12 }, // Blade
  5: { slot: effectSlot.criticalDamage, value: 40 }, // Rage
  6: { slot: effectSlot.accuracy, value: 20 }, // Focus
  7: { slot: effectSlot.resistance, value: 20 }, // Endure
  8: { slot: effectSlot.atkPercent, value: 35 }, // Fatal
  ...Object.fromEntries(teamSetBonuses.flatMap(({ setId, stat, value }) => {
    const slot = stat === 'hp' ? effectSlot.teamHpPercent : stat === 'atk' ? effectSlot.teamAtkPercent
      : stat === 'def' ? effectSlot.teamDefPercent : stat === 'res' ? effectSlot.teamResistance : effectSlot.teamAccuracy;
    return [[setId, { slot, value }]];
  })),
};

/** The sets whose completion moves a stat, as `[setId, pieces, accumulator, value]` rows. */
export const statSetBonuses: ReadonlyArray<readonly [setId: number, pieces: number, slot: number, value: number]> =
  Object.entries(setStatValues).map(([setId, bonus]) => [Number(setId), setPieceCount(Number(setId)), bonus.slot, bonus.value] as const);

/** How many complete Swift sets a count of engraved runes holds, an Intangible's completion included. */
function swiftSets(counts: ArrayLike<number>, completes: number): number {
  return Math.floor(((counts[swiftSetId] ?? 0) + (completes === swiftSetId ? 1 : 0)) / setPieceCount(swiftSetId));
}

/** Completed team sets from one monster's own runes, including an unambiguous Intangible completion. */
export function completedTeamSets(runes: readonly RecordLike[]): TeammateSets {
  const counts = new Int32Array(setIdBound);
  for (const rune of runes) {
    const id = numberValue(rune.set_id);
    if (Number.isInteger(id) && id > 0 && id < setIdBound) counts[id] += 1;
  }
  const completes = intangibleCompletion(counts);
  return Object.fromEntries(teamSetBonuses.flatMap(({ name, setId }) => {
    const count = Math.floor((counts[setId] + (completes === setId ? 1 : 0)) / setPieceCount(setId));
    return count ? [[name, count]] : [];
  }));
}

/**
 * Add the completed sets' display and battle bonuses to `effects`, from a count of engraved
 * runes by `set_id`. `completes` is the set an Intangible completes, as
 * `intangibleCompletion` answered it; anything below zero completes nothing.
 */
export function addSetBonuses(counts: ArrayLike<number>, completes: number, effects: Float64Array): void {
  for (const [setId, pieces, slot, value] of statSetBonuses) {
    const engraved = (counts[setId] ?? 0) + (completes === setId ? 1 : 0);
    if (engraved >= pieces) effects[slot] += Math.floor(engraved / pieces) * value;
  }
}

/**
 * The eight stats from a copy's base and its summed accumulators, into `out` in
 * `MonsterTotals` order, then the same eight as the fight has them (`combatAt`).
 * HP, ATK, DEF and SPD round up once, after every percentage is summed, which is
 * how the game shows them and how it counts a leader skill, a building and the
 * totem — so a lead is not a fixed number of points on the stat. SPD's fight form
 * is `speed-tick.ts`'s `combatSpeed`, written over the accumulators: Swift is in
 * the percentage, flat rune speed is whole, so `⌈B·(1 + s + t + l) + b⌉` is
 * `⌈B·(100 + s + t + l)/100⌉ + b`; `verify:monster-display-stats` holds the two equal.
 * The fight's CRI Rate is not capped here: the cap is DMG's (`metricDmg`), and a
 * range sees the points past it. `out` holds `totalCount`.
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
  out[8] = Math.ceil(base[0] * (100 + effects[effectSlot.hpPercent] + effects[effectSlot.teamHpPercent] + base[8]) / 100) + effects[effectSlot.hpFlat];
  out[9] = Math.ceil(base[1] * (100 + effects[effectSlot.atkPercent] + effects[effectSlot.teamAtkPercent] + base[9]) / 100) + effects[effectSlot.atkFlat];
  out[10] = Math.ceil(base[2] * (100 + effects[effectSlot.defPercent] + effects[effectSlot.teamDefPercent] + base[10]) / 100) + effects[effectSlot.defFlat];
  /* Kaki reads his battle-start ATK after other stat additions, then adds one
     fifth of it to DEF. Leona's battle-start passive makes both figures equal
     to whichever is higher. These rules remain in the shared sheet so the
     optimizer's candidate runes are counted too. */
  const defenseFromAttack = base[passiveRuleAt.defenseFromAttackPercent] ?? 0;
  if (defenseFromAttack > 0) out[10] = Math.ceil(out[10] + out[9] * defenseFromAttack / 100);
  if ((base[passiveRuleAt.balanceAttackDefense] ?? 0) > 0) {
    out[9] = Math.max(out[9], out[10]);
    out[10] = out[9];
  }
  out[11] = Math.ceil(base[3] * (100 + effects[effectSlot.spdPercent] + base[11]) / 100) + effects[effectSlot.spdFlat];
  out[12] = Math.max(out[4] + base[12], base[criRateFloorAt]);
  out[13] = out[5] + base[13];
  out[14] = out[6] + effects[effectSlot.teamResistance] + base[14];
  out[15] = out[7] + effects[effectSlot.teamAccuracy] + base[15];
}

/**
 * Hold a stat as the fight has it to what a ceiling on it allows — for a bound
 * over builds not yet finished, which must stay an upper bound. A ceiling names
 * the fight's figure itself, and every composite rises with the stats it reads,
 * so the clamped figure bounds them too.
 */
export function capTotal(totals: Float64Array, index: number, ceiling: number): void {
  totals[baseStatCount + index] = Math.min(totals[baseStatCount + index], ceiling);
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
 * The eleven figures from the totals, into `out` in `monsterStatTargetKeys`
 * order — HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES, ACC as the fight has them,
 * then DMG, E.HP, E.HP D. The composites are truncated as `RUNE-ROLE-METRICS.md`
 * displays them, so a figure compared anywhere is the figure the user is shown.
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
    case 8: return Math.floor(Math.max(0, metricDmg(totals[combatAt.atk], totals[combatAt.criRate], totals[combatAt.criDmg])));
    case 9: return Math.floor(Math.max(0, metricEhp(totals[combatAt.hp], totals[combatAt.def])));
    case 10: return Math.floor(Math.max(0, metricEhpD(totals[combatAt.hp], totals[combatAt.def])));
    default: return totals[baseStatCount + index];
  }
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Missing facts must never become numerical answers or enter a reference average. */
export function hasMonsterBaseStats(monster: RecordLike): boolean {
  return ['con', 'atk', 'def', 'spd', 'critical_rate', 'critical_damage', 'resist', 'accuracy'].every((key) => {
    const value = monster[key];
    return typeof value === 'number' && Number.isFinite(value)
      && (['con', 'atk', 'def', 'spd'].includes(key) ? value > 0 : value >= 0);
  });
}

/** A copy's base stats, in `MonsterTotals` order, with nothing a fight adds. HP is the export's `con` × 15. */
export function monsterBaseStats(monster: RecordLike): Float64Array {
  if (!hasMonsterBaseStats(monster)) throw new Error('This monster’s base stats are unavailable. Import a complete account snapshot.');
  return Float64Array.of(
    numberValue(monster.con) * 15, numberValue(monster.atk), numberValue(monster.def), numberValue(monster.spd),
    numberValue(monster.critical_rate), numberValue(monster.critical_damage),
    numberValue(monster.resist), numberValue(monster.accuracy),
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
 * a percentage of the monster's own base stat and appears on the game's stat panel;
 * its unique property acts at the start of battle and does not appear there.
 */
export function addGearEffects(monster: RecordLike, effects: Float64Array): void {
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

/**
 * The copy's stat sheet as the game's monster panel shows it: base stats, the
 * engraved runes, gear and completed personal sets. Account-wide bonuses —
 * buildings, the totem — are not on the panel and so not here; the composites
 * and the combat speeds count them (`combatBase`, `speed-tick.ts`).
 */
export function calculateMonsterTotals(monster: RecordLike): MonsterTotals {
  const totals = new Float64Array(totalCount);
  totalsInto(monsterBaseStats(monster), monsterEffects(monster), totals);
  return {
    hp: totals[0], atk: totals[1], def: totals[2], spd: totals[3],
    criticalRate: totals[4], criticalDamage: totals[5], resistance: totals[6], accuracy: totals[7],
  };
}

/* A count of a copy's engraved runes by `set_id`, which the set bonuses and
   Swift both read, so the two cannot count an Intangible differently. */
function engravedSetCounts(monster: RecordLike): Int32Array {
  const counts = new Int32Array(setIdBound);
  for (const rune of records(monster.runes)) {
    const setId = numberValue(rune.set_id);
    if (setId > 0 && setId < setIdBound) counts[setId] += 1;
  }
  return counts;
}

/** The display and battle accumulators a copy's engraved runes, gear and completed sets add up to. */
export function monsterEffects(monster: RecordLike): Float64Array {
  const effects = new Float64Array(effectSlotCount);
  for (const rune of records(monster.runes)) {
    addEffect(rune.pri_eff, effects);
    addEffect(rune.prefix_eff, effects);
    if (Array.isArray(rune.sec_eff)) rune.sec_eff.forEach((effect) => addEffect(effect, effects));
  }
  addGearEffects(monster, effects);
  const counts = engravedSetCounts(monster);
  addSetBonuses(counts, intangibleCompletion(counts), effects);
  return effects;
}


/**
 * What a copy's display speed is made of, for Speed Tuning: the base speed,
 * whether a Swift set is complete — an Intangible's completion counted, as the
 * display sheet counts it — and the SPD UP Effect its engraved artifacts add to
 * any speed buff it receives, in percent. The display speed itself is the stat
 * sheet's own figure, so it can never disagree with the Monsters page.
 */
export function monsterSpeedParts(monster: RecordLike): {
  baseSpeed: number; swift: boolean; displaySpeed: number; speedUpEffect: number;
  passiveFlatSpeed: number; passiveSpeedPercent: number;
} {
  const counts = engravedSetCounts(monster);
  let speedUpEffect = 0;
  for (const artifact of records(monster.artifacts)) {
    if (!Array.isArray(artifact.sec_effects)) continue;
    for (const line of artifact.sec_effects) {
      if (Array.isArray(line) && numberValue(line[0]) === spdUpEffectPropertyId) speedUpEffect += numberValue(line[1]);
    }
  }
  const passiveSpeed = personalPassiveStatBonus(String(monster.unit_id ?? ''), monster.unit_master_id)?.effects
    .filter((entry) => entry.stat === 'spd') ?? [];
  return {
    baseSpeed: numberValue(monster.spd),
    swift: swiftSets(counts, intangibleCompletion(counts)) > 0,
    displaySpeed: calculateMonsterTotals(monster).spd,
    speedUpEffect,
    passiveFlatSpeed: passiveSpeed.filter((entry) => entry.kind === 'flat').reduce((sum, entry) => sum + entry.amount, 0),
    passiveSpeedPercent: passiveSpeed.filter((entry) => entry.kind === 'basePercent').reduce((sum, entry) => sum + entry.amount, 0),
  };
}

/**
 * A guaranteed crit raises the fight's CRI Rate to the DMG cap, and leaves one
 * already past it where it is. A CRI Rate target is met by definition, so that
 * target is never asked.
 */
export const alwaysCritsFloor = criticalRateCapPercent;

/**
 * What element advantage adds to the CRI Rate DMG is dealt at. SWCalc states
 * no figure; Fandom, *Attribute Advantage* (read through its API on October 19,
 * 2026): "When attacking with attribute advantage, the attacker gets extra 15%
 * critical hit chance."
 */
export const elementAdvantageLift = 15;

/**
 * The leads a Scenario profile states by hand: HP, ATK and DEF by a share of the
 * monster's base stat, CRI Rate by points. A preset reads its leads off its
 * leader instead (`team-leads.ts`).
 */
export const leadStats = ['atk', 'def', 'hp', 'criRate'] as const;
export type LeadStat = typeof leadStats[number];

/**
 * Every stat a leader skill raises in a fight: the four above, SPD by a share of
 * base speed, and CRI Dmg, ACC and RES by points. Scenario states no SPD lead,
 * as it is no team; a preset's comes off its leader like every other
 * (`team-leads.ts`), judged by the same reach Speed Tuning reads.
 */
export const ledStats = ['atk', 'def', 'hp', 'spd', 'criRate', 'criDmg', 'acc', 'res'] as const;
export type LedStat = typeof ledStats[number];
export type Leads = Partial<Record<LedStat, number>>;

export type CombatBonuses = {
  alwaysCrits: boolean;
  alwaysElementAdvantage: boolean;
  leads?: Leads;
  teammateSets?: TeammateSets;
  /** Cross-stat battle-start rules from the same lead reading. */
  leadRules?: readonly PassiveStatRule[];
  /** Source detail for bonuses already folded into `leads`. */
  automaticLeadLines?: readonly AutomaticStatLine[];
  /**
   * The account's Glory buildings (`readBuildingBonuses`). Every caller that
   * holds the import passes them; absent counts none, as for an export with no
   * building list.
   */
  buildings?: BuildingBonuses;
};

/** A lead and the teammates' team sets; the copy's own sets come from its runes. */
export function combatStatBonus(stat: LedStat, bonuses: CombatBonuses): number {
  const lead = bonuses.leads?.[stat] ?? 0;
  return teamSetBonuses.reduce((sum, set) => sum + (set.stat === stat ? (bonuses.teammateSets?.[set.name] ?? 0) * set.value : 0), lead);
}

/**
 * A copy's base with what its fight adds: the one place a lead, a building, the
 * totem or a crit condition joins a calculation. Every sheet that reads it — the
 * overlay, the search, the shader beside it, a found build read again — counts
 * them the same way, because `totalsInto` is the only arithmetic that reads
 * `combatAt`. A building is a share of base summed with every other percentage,
 * as a lead is (Fandom: "additive with bonuses from runes, leader skills, and
 * glory buildings"); a Sanctuary reaches its own element only.
 */
export function combatBase(monster: RecordLike, bonuses: CombatBonuses): Float64Array {
  const base = monsterBaseStats(monster);
  for (const stat of ledStats) base[combatAt[stat]] += combatStatBonus(stat, bonuses);
  for (const rule of bonuses.leadRules ?? []) {
    if (rule.kind === 'defenseFromAttack') base[passiveRuleAt.defenseFromAttackPercent] += rule.percent;
    else base[passiveRuleAt.balanceAttackDefense] = 1;
  }
  base[combatAt.criRate] += bonuses.alwaysElementAdvantage ? elementAdvantageLift : 0;
  base[criRateFloorAt] = bonuses.alwaysCrits ? alwaysCritsFloor : 0;
  const buildings = bonuses.buildings;
  if (buildings !== undefined) {
    base[combatAt.hp] += buildings.hp;
    base[combatAt.atk] += buildings.atk + sanctuaryAtk(monster, buildings);
    base[combatAt.def] += buildings.def;
    base[combatAt.spd] += buildings.spd;
    base[combatAt.criDmg] += buildings.criDmg;
  }
  return base;
}

/** The ATK percent the Sanctuary of this copy's element adds. */
export function sanctuaryAtk(monster: RecordLike, buildings: BuildingBonuses): number {
  const element = elementName(monster.attribute);
  return element === undefined ? 0 : buildings.elementAtk[element] ?? 0;
}

/**
 * The eleven figures a copy can be measured against: its eight stats as the
 * fight has them, under the names a target is stated in, plus the three
 * composites derived from them.
 *
 * It exists so that the overlay's reference column and the shortfall check read
 * one answer. Two call sites deriving DMG separately is how one screen comes to
 * say a target is met while the other says it is not — and the composites are
 * derived here rather than stored precisely so that cannot happen
 * (`AGENTS.md` §6). The truncation is `RUNE-ROLE-METRICS.md`'s display rule.
 */
export type TargetFigures = {
  hp: number; atk: number; def: number; spd: number;
  criRate: number; criDmg: number; res: number; acc: number;
  dmg: number; ehp: number; ehpD: number;
};

/** The eight stats, under the names a target is stated in. */
export const statFigureKeys = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'] as const;
export type StatFigure = typeof statFigureKeys[number];
export type StatFigures = Record<StatFigure, number>;
export const isStatFigure = (figure: string): figure is StatFigure => (statFigureKeys as readonly string[]).includes(figure);

/**
 * A copy's figures as the fight has them, and its eight stats as its panel shows
 * them, from one sum: what a page shows as a stat and what the fight adds to it
 * are the difference of the two, so neither can be counted apart from the other.
 */
export type MonsterStatSheet = { figures: TargetFigures; display: StatFigures };

export function monsterStatSheet(monster: RecordLike, bonuses: CombatBonuses): MonsterStatSheet {
  return statSheetOf(combatBase(monster, bonuses), monsterEffects(monster));
}

/** The same from a base and summed accumulators, for a build that is not the copy's. */
export function statSheetOf(base: ArrayLike<number>, effects: ArrayLike<number>): MonsterStatSheet {
  const totals = new Float64Array(totalCount);
  totalsInto(base, effects, totals);
  const figures = new Float64Array(targetFigureCount);
  figuresInto(totals, figures);
  const keyed = Object.fromEntries(targetFigureKeys.map((key, at) => [key, figures[at]])) as TargetFigures;
  const display = Object.fromEntries(statFigureKeys.map((key, at) => [key, totals[at]])) as StatFigures;
  return { figures: keyed, display };
}

export function monsterTargetFigures(monster: RecordLike, bonuses: CombatBonuses): TargetFigures {
  return monsterStatSheet(monster, bonuses).figures;
}
