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
 *    It must strictly raise the base value, whether that line was naturally rolled
 *    or gemmed. No setting or stat ceiling can permit an equal or lower value.
 * 4. **A Gemmed line may then be ground**, where its new id is grindable. So an
 *    enchanted value that can be ground is always counted as ground.
 *
 * And the rule that follows from all four: **a Gem is never forced.** The end state
 * is whichever of "no Gem" and the best legal placement scores higher, so considering
 * a craft item can only ever raise a rune, never lower it.
 */
import { craftRollValue, craftValueRange, grindableStatIds } from './rune-craft-items';
import type { CraftItem, CraftKind, CraftLineage, CraftRollAssumption, CraftValueRange } from './rune-craft-items';
import { allStatIds } from './rune-properties';
import { runeSpeedStatId, slotAllowsSubStat } from './runes';
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
  /** The same-id option is independent of which other ids a future reveals. */
  readonly indexByStat: Int32Array;
};

const emptyGemOptions: GemOptions = {
  statIds: new Int32Array(0), values: new Float64Array(0), rolls: new Float64Array(0),
  indexByStat: new Int32Array(statIdBound).fill(-1),
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
  const indexByStat = new Int32Array(statIdBound).fill(-1);
  legal.forEach((entry, at) => { indexByStat[entry.statId] = at; });
  return {
    indexByStat,
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
 * A same-stat Gem must raise the base value, before Grindstones. This is a game
 * constraint for natural and converted lines alike, never a scoring preference.
 * Slot, duplicate-stat and converted-line restrictions are checked separately.
 */
export const canGemReplaceValue = (line: Pick<EndStateLine, 'statId' | 'value'>, statId: number, roll: number): boolean =>
  statId !== line.statId || roll > line.value;

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
    /* The first legal other id already wins the sorted list. Looking up the
       same-id exception directly avoids scanning the remainder in every future. */
    for (let index = 0; index < options.statIds.length; index += 1) {
      const statId = options.statIds[index];
      if (statId === line.statId) continue;
      let blocked = false;
      for (let other = 0; other < lines.length && !blocked; other += 1) {
        if (other !== at && lines[other].statId === statId) blocked = true;
      }
      if (blocked) continue;
      best = options.values[index];
      bestOption = index;
      break;
    }
    const sameIndex = options.indexByStat[line.statId];
    if (sameIndex >= 0) {
      const same = groundValue(plan, line.statId, options.rolls[sameIndex], line.grind) * prices[line.statId];
      if (same > best || (same === best && sameIndex < bestOption)) {
        best = same;
        bestOption = sameIndex;
      }
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
const groundLine = (plan: CraftPlan, line: EndStateLine): EndStateLine =>
  ({ ...line, grind: Math.max(line.grind, grindCredit(plan, line.statId)) });

/**
 * **Rule 1 alone**, for a rune below `+12`: a Grindstone may go on at any level, a Gem
 * only from `+12`, so what can be named on such a rune today is the credited stone on
 * every grindable line it already shows, and no Gem.
 */
export function groundLines(plan: CraftPlan, lines: readonly EndStateLine[]): EndStateLine[] {
  return lines.map((line) => groundLine(plan, line));
}

export function craftedLines(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
): EndStateLine[] {
  const report: CraftReport = { replaced: -1, option: -1 };
  craftedScore(plan, options, prices, lines, prefixScore, undefined, report);
  return lines.map((line, at) => {
    if (at !== report.replaced) return groundLine(plan, line);
    const statId = options.statIds[report.option];
    /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
    const kept = statId === line.statId ? line.grind : 0;
    return { statId, value: options.rolls[report.option], gemmed: true, grind: Math.max(kept, grindCredit(plan, statId)) };
  });
}

/*
 * ## Rune Optimization's question
 *
 * Clean-up asks what one rune is worth in one role's units, so a Gem decision there
 * collapses to one number. Rune Optimization cannot ask that: whether SPD or ATK %
 * is the better Gem depends on the other five runes, which are what it is still
 * choosing. So it asks for **every legal end state worth considering**, and the
 * search chooses between them like it chooses between runes. The four rules are the
 * same four; only the question differs.
 *
 * It also asks a question Clean-up never does — **which of the account's own items
 * would be spent** — because "only the Gems and Grindstones I hold" is a real
 * setting there, and one stack can be spent only as many times as it is deep.
 */

/**
 * One half of a supply — the Gems or the Grindstones — as the optimizer is allowed
 * to spend it on one rune. Indexed by effect id: what an item of that id would put
 * on a line, and the held stack it would come out of (`-1` where the
 * item is assumed rather than held, which is a stock that never runs out).
 */
export type CraftChoice = { readonly value: number; readonly stock: number };
export type CraftHalf = { readonly choices: ReadonlyArray<readonly CraftChoice[]> };

export type CraftSupply = { readonly gem: CraftHalf | null; readonly grind: CraftHalf | null };

const assumedHalves = new Map<string, CraftHalf>();

/**
 * The half the settings assume: one item of this kind, grade and lineage for every
 * effect id the game makes one for, landing where `assumption` says. It is the same
 * credit `craftPlan` gives Clean-up, read per kind because the optimizer's two
 * halves are set independently.
 */
export function assumedCraftHalf(
  kind: CraftKind, lineage: CraftLineage, grade: ItemGrade, assumption: CraftRollAssumption,
): CraftHalf {
  const key = `${kind}|${lineage}|${grade}|${assumption}`;
  const found = assumedHalves.get(key);
  if (found) return found;
  const choices: CraftChoice[][] = Array.from({ length: statIdBound }, () => []);
  for (const statId of allStatIds) {
    const roll = craftItemRoll(kind, lineage, statId, grade, assumption);
    if (roll !== null) choices[statId].push({ value: roll, stock: -1 });
  }
  const half = { choices };
  assumedHalves.set(key, half);
  return half;
}

/**
 * The half the account actually holds, for one rune: every item of this kind per
 * effect id among `items`, which the caller has already narrowed to the ones whose
 * lineage fits the rune. `stock` is the caller's own index for each item's stack, so
 * the search can count how many times a stack has been spent.
 *
 * Different stacks are different resources even at equal rolls: preserving a
 * set-specific item or an Immemorial item can decide which other rune is usable.
 */
export function heldCraftHalf(
  kind: CraftKind, items: ReadonlyArray<{ item: CraftItem; stock: number }>, assumption: CraftRollAssumption,
): CraftHalf {
  const choices: CraftChoice[][] = Array.from({ length: statIdBound }, () => []);
  for (const { item, stock: index } of items) {
    if (item.kind !== kind || item.amount <= 0 || item.statId < 0 || item.statId >= statIdBound) continue;
    const roll = craftItemRoll(kind, item.lineage, item.statId, item.grade, assumption);
    if (roll === null) continue;
    choices[item.statId].push({ value: roll, stock: index });
  }
  for (const options of choices) options.sort((a, b) => b.value - a.value || a.stock - b.stock);
  return { choices };
}

/** One legal end state of one rune, with what it costs. */
export type CraftVariant = {
  /** The lines as they would stand once the items are spent. */
  readonly lines: readonly EndStateLine[];
  /** The line a Gem replaced, or `-1` where none did. */
  readonly gemmedAt: number;
  /** The held stacks spent, one entry per item. Empty where nothing held was spent. */
  readonly stock: readonly number[];
};

/**
 * **Every end state of a finished line-up worth handing to the search.**
 *
 * `wanted` says which effect ids the calculation can use at all. A Grindstone or a
 * Gem landing on an id nothing reads is left out, because it spends an item and a
 * candidate slot to change no figure; everything else follows the four rules:
 *
 * - every wanted grindable line takes the supply's stone where it beats the one
 *   already there (rule 1);
 * - from `+12` only (`gemAllowed`), one Gem may replace one line — the converted one
 *   where the rune already has one — with a legal id (rules 2 and 3), and the new
 *   line is then ground where it can be (rule 4);
 * - no Gem is always one of the answers, so considering a Gem can only add options.
 *
 * Held stones are optional independently on every line. An assumed stone never
 * runs out, but remains optional where a ceiling makes the smaller value useful.
 */
export function craftVariants(
  supply: CraftSupply, slot: number, mainStatId: number, prefixStatId: number | null,
  lines: readonly EndStateLine[], gemAllowed: boolean, wanted: (statId: number) => boolean,
  allowGemSpeedRemoval: boolean,
  keepLower: (statId: number) => boolean = () => false,
): CraftVariant[] {
  const grind = supply.grind;
  const variants: CraftVariant[] = [];
  function offer(from: readonly EndStateLine[], gemmedAt: number, stock: readonly number[]) {
    let states: CraftVariant[] = [{ lines: from, gemmedAt, stock }];
    if (grind) for (const [at, line] of from.entries()) {
      if (!wanted(line.statId)) continue;
      const stones = grind.choices[line.statId].filter((choice) => choice.value > line.grind);
      if (stones.length === 0) continue;
      const next: CraftVariant[] = [];
      for (const state of states) {
        // Held stones are optional one line at a time: spending on ATK must not
        // force spending the scarce SPD stone needed on another rune.
        if (keepLower(line.statId) || stones.every((choice) => choice.stock >= 0)) next.push(state);
        for (const stone of stones) next.push({
          lines: state.lines.map((entry, index) => index === at ? { ...entry, grind: stone.value } : entry),
          gemmedAt, stock: stone.stock < 0 ? state.stock : [...state.stock, stone.stock],
        });
      }
      states = next;
    }
    variants.push(...states);
  }

  offer(lines, -1, []);

  const gem = supply.gem;
  if (!gem || !gemAllowed || lines.length === 0) return variants;
  /* Rule 2: one converted line at a time, and a later Gem may only replace it. */
  const onlyAt = lines.findIndex((line) => line.gemmed);
  for (let at = 0; at < lines.length; at += 1) {
    if (onlyAt !== -1 && at !== onlyAt) continue;
    const line = lines[at];
    for (const statId of allStatIds) {
      /* Speed stays on the rune unless the owner explicitly allows a Gem to replace it. */
      if (!allowGemSpeedRemoval && line.statId === runeSpeedStatId && statId !== runeSpeedStatId) continue;
      if (!wanted(statId) && !keepLower(line.statId)) continue;
      if (statId === mainStatId || statId === prefixStatId || !slotAllowsSubStat(slot, statId)) continue;
      if (lines.some((other, index) => index !== at && other.statId === statId)) continue;
      for (const choice of gem.choices[statId]) {
        const roll = choice.value;
        if (!canGemReplaceValue(line, statId, roll)) continue;
        const replaced = lines.map((entry, index) => (index !== at ? entry : {
          statId, value: roll, gemmed: true,
          /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
          grind: statId === line.statId ? line.grind : 0,
        }));
        offer(replaced, at, choice.stock >= 0 ? [choice.stock] : []);
      }
    }
  }
  return variants;
}
