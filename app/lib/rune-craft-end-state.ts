/**
 * **What a Gem and a Grindstone do to a finished rune — stated once, for everything
 * that needs to know.**
 *
 * `docs/RUNE-CANONICAL.md` §8 owns the game rules and `rune-craft-items.ts` owns the
 * value tables. This owns the *arithmetic*: given a line-up whose substats are final
 * at `+12`, what is the best legal end state worth at the `+15` projection point.
 *
 * It exists because the same four rules were being applied in five places — a rune's
 * projection, its ceiling, the box of ordinary runes it is measured against, the
 * probability engine, and the craft planner — and two of them had drifted. The
 * projection picked the *weakest* line and offered it the best Gem; the ceiling
 * enumerated every line against every Gem and kept the best pair. Those are different
 * answers, and the second one is the right one: a player chooses the replacement that
 * gains the most, not the replacement of the line that happens to be smallest.
 * `npm run verify:rune-craft-single-source` is what stops a sixth copy appearing.
 *
 * ## The four rules
 *
 * 1. **A Grindstone sits on top of one sub property**, and only on one of the seven
 *    grindable effect ids (§8). Never on the main property, and never on the innate,
 *    which takes neither craft item (§4). It is credited as `max(the stone already
 *    there, the one the settings assume)` rather than added to it: a rune ground
 *    three quarters of the way is worth what an unground one is, because the stone
 *    can always be topped up, and adding them would pay the rune twice for one line.
 * 2. **A Gem replaces one sub property**, and the rune must be at `+12` for it. The
 *    replaced line loses every roll it collected. A rune may carry one converted line
 *    at a time, so where it already has one, that is the only line a further Gem may
 *    replace.
 * 3. **The new effect id must be legal**: allowed in the slot, and not the main
 *    property, the innate, or any *other* sub property. Re-rolling the replaced
 *    line's own id is allowed, and is what a player does to improve a bad value.
 * 4. **A Gemmed line may then be ground**, where its new id is grindable. So an
 *    enchanted value that can be ground is always counted as ground.
 *
 * And the rule that follows from all four: **a Gem is never forced.** The end state
 * is whichever of "no Gem" and the best legal placement scores higher, so considering
 * a craft item can only ever raise a rune, never lower it.
 */
import { craftRollValue, craftValueRange, grindableStatIds } from './rune-craft-items';
import type { CraftKind, CraftLineage, CraftRollAssumption, CraftValueRange } from './rune-craft-items';
import { allStatIds } from './rune-properties';
import { slotAllowsSubStat } from './runes';
import type { ItemGrade } from './types';
import type { Valuation } from './rune-substat-weights';

/**
 * The Gem and the Grindstone the Clean-up policy assumes are available.
 *
 * One Gem, because a rune carries one converted line at a time; a Grindstone for
 * every grindable line, because a line holds one stone and nothing stops a player
 * spending one on each. Both are *assumptions about the player's stock*, not items
 * the account is known to hold.
 */
export type CraftCredit = {
  gem: CraftRollAssumption | null;
  gemGrade: ItemGrade;
  grind: CraftRollAssumption | null;
  grindGrade: ItemGrade;
};

export const creditKey = (credit: CraftCredit): string =>
  `${credit.gem ?? '-'}/${credit.gemGrade}/${credit.grind ?? '-'}/${credit.grindGrade}`;

/** The highest effect id the game uses, so a table can be a flat array. */
export const statIdBound = 13;

/**
 * What one raw point of each effect id is worth to a role, as a flat table.
 *
 * A `Valuation` is linear by contract, so one multiplication is the whole of it and
 * the eleven slopes can be read once. That matters here and nowhere else in the
 * codebase: pricing a line is the innermost operation of the chance calculation, run
 * a few hundred million times on a real box, and a `Map` lookup per line per run was
 * most of it.
 */
export type PriceList = Float64Array;

const priceLists = new WeakMap<Valuation, PriceList>();

export function priceList(valuation: Valuation): PriceList {
  const found = priceLists.get(valuation);
  if (found) return found;
  const prices = new Float64Array(statIdBound);
  for (const statId of allStatIds) prices[statId] = valuation.value(statId, 1);
  priceLists.set(valuation, prices);
  return prices;
}

const grindable = (() => {
  const flags = new Uint8Array(statIdBound);
  for (const statId of grindableStatIds) flags[statId] = 1;
  return flags;
})();

/** Rule 1's first half: whether a stone may touch this effect id at all. */
export const isGrindableStatId = (statId: number): boolean =>
  statId >= 0 && statId < statIdBound && grindable[statId] === 1;

/**
 * **The one door onto the §8 tables**, for the workspaces that plan a craft item
 * rather than score one.
 *
 * Rune Clean-up asks about the settings' credit and takes a whole `CraftPlan`; Gems &
 * Grinds and the Rune Simulator ask about one item they actually hold. Both questions
 * read the same tables and obey the same legality, so both come through here —
 * `npm run verify:rune-craft-single-source` is what keeps a fourth reader from
 * appearing with a grindable list of its own.
 *
 * `undefined` means the game has no such item: a Grindstone for CRI Dmg, Resistance,
 * CRI Rate or Accuracy, or a stat that is not a rune property at all.
 */
export function craftItemRange(
  kind: CraftKind, lineage: CraftLineage, statId: number, grade: ItemGrade,
): CraftValueRange | undefined {
  if (kind === 'grindstone' && !isGrindableStatId(statId)) return undefined;
  return craftValueRange(kind, lineage, statId, grade);
}

/** What such an item is assumed to roll, or `null` where no such item exists. */
export function craftItemRoll(
  kind: CraftKind, lineage: CraftLineage, statId: number, grade: ItemGrade,
  assumption: CraftRollAssumption,
): number | null {
  const range = craftItemRange(kind, lineage, statId, grade);
  return range ? craftRollValue(range, assumption) : null;
}

/**
 * What the credited items would put on each effect id — the whole of rules 1 and 3's
 * value half, worked out once per lineage and credit rather than per line of per rune.
 *
 * `grind` is `0` wherever no stone exists, which is both "the settings credit none"
 * and "this id cannot be ground", because the two have the same arithmetic.
 * `gem` is `-1` where no Gem exists, which is not the same as `0`: a Gem that rolls
 * nothing would still replace the line.
 */
export type CraftPlan = {
  readonly lineage: CraftLineage;
  readonly credit: CraftCredit;
  readonly key: string;
  readonly hasGem: boolean;
  /** Indexed by effect id. The Grindstone bonus credited to a line of that id. */
  readonly grind: Float64Array;
  /** Indexed by effect id. What one Gem would roll there, or `-1` for none. */
  readonly gem: Float64Array;
};

const plans = new Map<string, CraftPlan>();

export function craftPlan(lineage: CraftLineage, credit: CraftCredit): CraftPlan {
  const key = `${lineage}|${creditKey(credit)}`;
  const found = plans.get(key);
  if (found) return found;
  const grind = new Float64Array(statIdBound);
  const gem = new Float64Array(statIdBound).fill(-1);
  for (const statId of allStatIds) {
    if (credit.grind !== null && isGrindableStatId(statId)) {
      const range = craftValueRange('grindstone', lineage, statId, credit.grindGrade);
      if (range) grind[statId] = craftRollValue(range, credit.grind);
    }
    if (credit.gem !== null) {
      const range = craftValueRange('gem', lineage, statId, credit.gemGrade);
      if (range) gem[statId] = craftRollValue(range, credit.gem);
    }
  }
  const plan: CraftPlan = { lineage, credit, key, hasGem: credit.gem !== null, grind, gem };
  plans.set(key, plan);
  return plan;
}

/** What a credited Grindstone would put on this line, or `0` where none can. */
export const grindCredit = (plan: CraftPlan, statId: number): number =>
  statId >= 0 && statId < statIdBound ? plan.grind[statId] : 0;

/**
 * What a credited Enchanted Gem would roll on this id, or `null` where none can.
 *
 * Deliberately not exported. It is half of a Gem decision — what one would roll,
 * without which line it may replace — and a caller holding that half is a caller
 * about to write the other half somewhere new. `gemOptions` and `craftedScore` are
 * the whole rule, and they are what leaves this file.
 */
function gemCredit(plan: CraftPlan, statId: number): number | null {
  if (!plan.hasGem || statId < 0 || statId >= statIdBound) return null;
  const rolled = plan.gem[statId];
  return rolled < 0 ? null : rolled;
}

/** Rule 1: the stone a line ends up carrying, its own and the credited one compared. */
export const groundValue = (plan: CraftPlan, statId: number, roll: number, existingGrind: number): number =>
  roll + Math.max(existingGrind, grindCredit(plan, statId));

/**
 * Rule 3's legality half, plus the price of each legal replacement — everything a Gem
 * decision needs that does not depend on how the rune's lines actually rolled.
 *
 * The ids are held **best first**, so choosing a replacement is a walk down a list
 * that stops at the first id the realised line-up has not already taken. There are at
 * most three of those, so the walk is four steps at worst rather than a scan of all
 * eleven ids per line per sample — which is the innermost loop of the whole chance
 * calculation.
 */
export type GemOptions = {
  /** Legal effect ids, best-valued first. Empty where no Gem is credited. */
  readonly statIds: Int32Array;
  /** What each of those is worth in this role's units, its Grindstone included. */
  readonly values: Float64Array;
  /** The raw roll of each, before its Grindstone, for the same-id case below. */
  readonly rolls: Float64Array;
};

const emptyGemOptions: GemOptions = {
  statIds: new Int32Array(0), values: new Float64Array(0), rolls: new Float64Array(0),
};

/**
 * The legal Gems for one rune in one role, best first.
 *
 * `mainStatId` and `prefixStatId` are the rune's own; the other sub properties are
 * not known yet and are skipped at scoring time. A rune that already carries a
 * converted line restricts *which line* may be replaced, which is rule 2 and belongs
 * to the caller — it does not change which ids are legal.
 */
export function gemOptions(
  plan: CraftPlan, prices: PriceList, slot: number, mainStatId: number, prefixStatId: number | null,
): GemOptions {
  if (!plan.hasGem) return emptyGemOptions;
  /* Every candidate of every rune asks, and the answer depends on nothing but these
     five, so it is remembered. Plans and price lists are memoised objects already. */
  let byPlan = rememberedGems.get(prices);
  if (!byPlan) { byPlan = new WeakMap(); rememberedGems.set(prices, byPlan); }
  let byRune = byPlan.get(plan);
  if (!byRune) { byRune = new Map(); byPlan.set(plan, byRune); }
  const key = (slot * statIdBound + mainStatId) * (statIdBound + 1) + (prefixStatId ?? statIdBound);
  const known = byRune.get(key);
  if (known) return known;
  const found = legalGems(plan, prices, slot, mainStatId, prefixStatId);
  byRune.set(key, found);
  return found;
}

const rememberedGems = new WeakMap<PriceList, WeakMap<CraftPlan, Map<number, GemOptions>>>();

function legalGems(
  plan: CraftPlan, prices: PriceList, slot: number, mainStatId: number, prefixStatId: number | null,
): GemOptions {
  const legal: Array<{ statId: number; value: number; roll: number }> = [];
  for (const statId of allStatIds) {
    if (statId === mainStatId || statId === prefixStatId || !slotAllowsSubStat(slot, statId)) continue;
    const roll = gemCredit(plan, statId);
    if (roll === null) continue;
    legal.push({ statId, roll, value: (roll + grindCredit(plan, statId)) * prices[statId] });
  }
  legal.sort((left, right) => right.value - left.value);
  return {
    statIds: Int32Array.from(legal, (entry) => entry.statId),
    values: Float64Array.from(legal, (entry) => entry.value),
    rolls: Float64Array.from(legal, (entry) => entry.roll),
  };
}

/** One line of a finished rune, as every caller of the end state describes it. */
export type EndStateLine = {
  statId: number;
  /** The roll, or the value a Gem already put there — never including a Grindstone. */
  value: number;
  /** The Grindstone already on the line, `0` where none has been spent. */
  grind: number;
  /** This line is the rune's one converted line, so only it may be replaced again. */
  gemmed: boolean;
};

/**
 * **The best legal end state of a finished line-up, in this role's units.**
 *
 * Rule 4 in one expression: score the lines as they stand, then offer every legal
 * `(line, Gem)` pair and keep the best — or none, where none of them gains anything.
 *
 * `lineValues` is filled with each line's own scored contribution when it is passed,
 * so a caller that needs the breakdown does not price the lines twice. `report` is
 * for the one caller that needs to know *which* line the Gem took — the ordinary box,
 * whose spread has to drop the line that stopped varying. Both are out parameters
 * rather than a returned record because this is the innermost operation of the chance
 * calculation, run a few hundred million times on a real box, and an object per call
 * was measurable.
 */
export function craftedScore(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
  lineValues: Float64Array = new Float64Array(lines.length),
  report?: CraftReport,
): number {
  if (report) { report.replaced = -1; report.option = -1; }
  let plain = prefixScore;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    const value = groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId];
    lineValues[at] = value;
    plain += value;
  }
  if (!plan.hasGem || lines.length === 0 || options.statIds.length === 0) return plain;

  /* Rule 2: one converted line at a time, and a later Gem may only replace it. */
  let onlyAt = -1;
  for (let at = 0; at < lines.length; at += 1) if (lines[at].gemmed) { onlyAt = at; break; }

  let bestGain = 0;
  for (let at = 0; at < lines.length; at += 1) {
    if (onlyAt !== -1 && at !== onlyAt) continue;
    const line = lines[at];
    /* Two candidates, and the cheap one is not always the better one. Every id the
       other lines have not taken is priced alike, so the list's order settles it and
       the first unblocked entry wins. Re-rolling the line's *own* id is the exception:
       it keeps whatever stone is already there, which a credited one can only improve,
       so a line carrying a stone bigger than the credited one is worth more than its
       place in the order says. It is therefore priced separately. */
    let best = -Infinity;
    let bestOption = -1;
    let foundOther = false;
    for (let index = 0; index < options.statIds.length; index += 1) {
      const statId = options.statIds[index];
      if (statId === line.statId) {
        const same = groundValue(plan, statId, options.rolls[index], line.grind) * prices[statId];
        if (same > best) { best = same; bestOption = index; }
        if (foundOther) break;
        continue;
      }
      if (foundOther) continue;
      let blocked = false;
      for (let other = 0; other < lines.length && !blocked; other += 1) {
        if (other !== at && lines[other].statId === statId) blocked = true;
      }
      if (blocked) continue;
      if (options.values[index] > best) { best = options.values[index]; bestOption = index; }
      foundOther = true;
    }
    if (best === -Infinity) continue;
    const gain = best - lineValues[at];
    if (gain > bestGain) {
      bestGain = gain;
      if (report) { report.replaced = at; report.option = bestOption; }
    }
  }
  return plain + bestGain;
}

/**
 * Which line the Gem took and what it put there: `replaced` indexes the lines,
 * `option` indexes `GemOptions`, and both are `-1` where no Gem gains anything.
 */
export type CraftReport = { replaced: number; option: number };

/**
 * **The finished line-up `craftedScore` scored**, as the lines a player would hold
 * after spending the items.
 *
 * The score and the line-up come from one decision, and this function exists so that
 * nothing has to make the decision a second time to find out what it was. The Rune
 * Simulator used to: it gemmed a random line into a random id and ground one random
 * line, and so showed a rune that a DEF % line had been swapped for CRI Rate beside a
 * fresh Resistance, three stones left unspent, and a verdict that had assumed none of
 * that. Rule 1 grinds *every* grindable line, and the Gem goes where it gains most —
 * which is the weakest line only when nothing blocks the best id from taking it.
 */
export function craftedLines(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
): EndStateLine[] {
  const report: CraftReport = { replaced: -1, option: -1 };
  craftedScore(plan, options, prices, lines, prefixScore, undefined, report);
  return lines.map((line, at) => {
    if (at !== report.replaced) {
      return { ...line, grind: Math.max(line.grind, grindCredit(plan, line.statId)) };
    }
    const statId = options.statIds[report.option];
    /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
    const kept = statId === line.statId ? line.grind : 0;
    return { statId, value: options.rolls[report.option], gemmed: true, grind: Math.max(kept, grindCredit(plan, statId)) };
  });
}
