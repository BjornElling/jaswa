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
 * enumerated every line against every Gem. They must share one answer: the complete
 * realized body with the highest canonical score, including the body with no Gem.
 * `npm run verify:rune-craft-single-source` is what stops a sixth copy appearing.
 *
 * ## The four rules
 *
 * 1. **A Grindstone sits on top of one sub property**, and only on one of the seven
 *    grindable effect ids (§8). Never on the main property, and never on the innate,
 *    which takes neither craft item (§4). It is credited as `max(the stone already
 *    there, the credited one)` rather than added to it: a rune ground as far as the
 *    credited stone is worth what an unground one is, because the stone
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
 * ## Which line, and which stat
 *
 * **The placement is chosen on one fixed reference rune per lineage, never on the settings.**
 * Every grindable line is ground by an average Legend Grindstone where that raises
 * it, the Gem is an average Legend Gem, ground likewise, and the `(line, stat)` pair
 * that gives the highest complete-body score is the one a Gem takes
 * (`canonicalCraftCredit`), with no Gem included and stable ties. The candidate's
 * lineage supplies those reference tables: an Ancient rune is compared with an
 * Ancient Gem and Grindstone. Only then is the placement valued at the credit
 * the caller assumes — for Rune Clean-up that is the same credit, for Gems & Grinds a
 * held item's own roll.
 *
 * Two readings of this question used to stand side by side, and they disagreed. Rune
 * Clean-up ground every line first and put the Gem where it gained most at its own
 * credit; Gems & Grinds measured against the rune as it stands, so an SPD Gem on an
 * SPD line was paid for the stone that line could take anyway, and won. A fixed
 * reference is what makes the choice one answer in every view: it moves with the rune
 * and the role, and with nothing a slider or a held item says.
 *
 * And the rule that follows from all four: **a Gem is never forced.** The end state
 * is whichever of "no Gem" and the chosen placement scores higher at the credit, so
 * considering a craft item can only ever raise a rune, never lower it.
 */
import { craftRollValue, craftValueRange, grindableStatIds } from './rune-craft-items';
import type { CraftItem, CraftKind, CraftLineage, CraftRollAssumption, CraftValueRange } from './rune-craft-items';
import { allStatIds } from '../rune-properties';
import { gemMinimumLevel, runeSpeedStatId, slotAllowsSubStat } from '../runes';
import type { Rune, RuneSubProperty } from '../runes';
import type { ItemGrade } from '../../model';
import type { Valuation } from '../rune-substat-weights';

/**
 * A Gem and a Grindstone assumed to be available, rather than items the account is
 * known to hold.
 *
 * One Gem, because a rune carries one converted line at a time; a Grindstone for
 * every grindable line, because a line holds one stone and nothing stops a player
 * spending one on each. `null` credits none of that kind: Gems & Grinds and Rune
 * Optimization read a rune's current lines that way and add the items they judge.
 */
export type CraftCredit = {
  gem: CraftRollAssumption | null;
  gemGrade: ItemGrade;
  grind: CraftRollAssumption | null;
  grindGrade: ItemGrade;
};

/**
 * **The one assumption about Gems and Grindstones every rune judgement makes:** an
 * average Legend Gem, and an average Legend Grindstone on every grindable line.
 *
 * Rune Clean-up projects a rune with it, its ruler — the weights, the perfect rune,
 * the sampled reference — is priced with it, the Gem's
 * placement is chosen on it, and Gems & Grinds reads a Gem on lines ground by it. It
 * is not a setting. Clean-up once carried its own Gem and Grindstone sliders beside a
 * Hero-three-quarters ruler and this Legend reference, so one rune was read under
 * three assumptions at once, and two views could disagree about the same craft for
 * no reason a player could see.
 *
 * The grade and the roll are the assumption; the items themselves follow the rune's
 * lineage both for legality and for the placement reference (`craftPlan`). The choice
 * therefore follows the candidate's game lineage, never a held item or setting.
 */
export const canonicalCraftCredit: CraftCredit = {
  gem: 'average', gemGrade: 'Legend', grind: 'average', grindGrade: 'Legend',
};

/** Credits nothing: a rune's lines exactly as they stand. */
export const noCraftCredit: CraftCredit = { gem: null, gemGrade: 'Legend', grind: null, grindGrade: 'Legend' };

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
 * `grind` is `0` wherever no stone exists, which is both "the credit names none"
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
export type GemList = {
  /** Legal effect ids, best-valued first. Empty where no Gem is credited. */
  readonly statIds: Int32Array;
  /** What each of those is worth in this role's units, its Grindstone included. */
  readonly values: Float64Array;
  /** The raw roll of each, before its Grindstone, for the same-id case below. */
  readonly rolls: Float64Array;
  /** The same-id option is independent of which other ids a future reveals. */
  readonly indexByStat: Int32Array;
};

/**
 * The legal Gems twice over: priced at the caller's credit, and priced on the
 * reference the placement is chosen on (`canonicalCraftCredit`). The ids are the same;
 * only the order and the values differ.
 */
export type GemOptions = GemList & {
  /** The same legal ids on the reference, best first: what `craftedScore` chooses from. */
  readonly choice: GemList;
};

const emptyGemList: GemList = {
  statIds: new Int32Array(0), values: new Float64Array(0), rolls: new Float64Array(0),
  indexByStat: new Int32Array(statIdBound).fill(-1),
};
const emptyGemOptions: GemOptions = { ...emptyGemList, choice: emptyGemList };

/** The reference plan for each lineage, whose grind table is what "every line ground" means. */
const referencePlans = new Map<CraftLineage, CraftPlan>();
function choicePlan(lineage: CraftLineage): CraftPlan {
  let plan = referencePlans.get(lineage);
  if (!plan) { plan = craftPlan(lineage, canonicalCraftCredit); referencePlans.set(lineage, plan); }
  return plan;
}

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
  return { ...gemList(plan, prices, slot, mainStatId, prefixStatId),
    choice: gemList(choicePlan(plan.lineage), prices, slot, mainStatId, prefixStatId) };
}

function gemList(
  plan: CraftPlan, prices: PriceList, slot: number, mainStatId: number, prefixStatId: number | null,
): GemList {
  const legal: Array<{ statId: number; value: number; roll: number }> = [];
  for (const statId of allStatIds) {
    if (statId === mainStatId || statId === prefixStatId || !slotAllowsSubStat(slot, statId)) continue;
    const roll = gemCredit(plan, statId);
    if (roll === null) continue;
    legal.push({ statId, roll, value: (roll + grindCredit(plan, statId)) * prices[statId] });
  }
  legal.sort((left, right) => right.value - left.value || left.statId - right.statId);
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
 * The greatest legal Gem-result contribution for one particular line, without
 * choosing which line receives the rune's one Gem. `options.choice` supplies ids
 * already legal for this rune's main, innate, slot and lineage; this finishes the
 * line-dependent checks against its neighbours and any existing converted line.
 *
 * Same-stat Gems keep that line's existing Grindstone and must strictly raise its
 * raw value. The strict check matters to a support-value law: only when `roll > value`
 * can that option produce a positive gain over the grounded line. Different-stat
 * Gems replace the line's old stone with the target stat's credited floor. The
 * contribution uses the same `(roll + grind) * price` operation as the realized
 * end-state scorer.
 */
export function gemLineContribution(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], lineIndex: number,
): number | null {
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    throw new RangeError(`A Gem contribution needs a line index in 0..${lines.length - 1}.`);
  }
  if (!plan.hasGem || options.choice.statIds.length === 0) return null;
  const convertedAt = lines.findIndex((line) => line.gemmed);
  if (convertedAt !== -1 && convertedAt !== lineIndex) return null;

  const line = lines[lineIndex];
  if (!line) throw new RangeError(`A Gem contribution has no line at index ${lineIndex}.`);
  let best: number | null = null;
  for (let optionAt = 0; optionAt < options.choice.statIds.length; optionAt += 1) {
    const statId = options.choice.statIds[optionAt];
    const roll = options.choice.rolls[optionAt];
    if (statId === undefined || roll === undefined) continue;
    if (lines.some((other, at) => at !== lineIndex && other.statId === statId)) continue;
    if (!canGemReplaceValue(line, statId, roll)) continue;

    const retainedGrind = statId === line.statId ? line.grind : 0;
    const grind = Math.max(retainedGrind, grindCredit(plan, statId));
    const contribution = (roll + grind) * prices[statId];
    if (best === null || contribution > best) best = contribution;
  }
  return best;
}

/* Where `placement` leaves its answer. Out values rather than a returned record,
   because this is the innermost operation of the chance calculation, run a few
   hundred million times on a real box, and an object per call was measurable. */
let placedAt = -1;
let placedStat = -1;
let placedScore = 0;
let placementBaseline = 0;
let choiceValues = new Float64Array(8);
let orderedLineIndexes = new Int32Array(8);

/** The legal line order is fixed by stat id, so sums and exact ties ignore input order. */
function lineIndexesByStat(lines: readonly EndStateLine[]): Int32Array {
  if (orderedLineIndexes.length < lines.length) orderedLineIndexes = new Int32Array(lines.length);
  for (let at = 0; at < lines.length; at += 1) {
    let insert = at;
    while (insert > 0 && lines[orderedLineIndexes[insert - 1]].statId > lines[at].statId) {
      orderedLineIndexes[insert] = orderedLineIndexes[insert - 1];
      insert -= 1;
    }
    orderedLineIndexes[insert] = at;
  }
  return orderedLineIndexes;
}

function sumLinesByStatId(prefixScore: number, lines: readonly EndStateLine[], values: Float64Array): number {
  const order = lineIndexesByStat(lines);
  let total = prefixScore;
  for (let at = 0; at < lines.length; at += 1) total += values[order[at]];
  return total;
}

function sumLinesByStatIdWithReplacement(prefixScore: number, lines: readonly EndStateLine[], values: Float64Array,
  replaced: number, replacementStatId: number, replacementValue: number, order = lineIndexesByStat(lines)): number {
  let total = prefixScore;
  let inserted = false;
  for (let at = 0; at < lines.length; at += 1) {
    const lineAt = order[at];
    if (lineAt === replaced) continue;
    if (!inserted && replacementStatId < lines[lineAt].statId) {
      total += replacementValue;
      inserted = true;
    }
    total += values[lineAt];
  }
  if (!inserted) total += replacementValue;
  return total;
}

/* A shape stores offsets followed by packed option/gap pairs in canonical line order.
   The sampled ruler visits hundreds of shapes per price list, so retaining an object
   for each possible Gem would dominate the reference workers' heap. */
const replacementOrders = new Map<number, Map<number, Uint16Array>>();
const replacementChoices = new WeakMap<GemList, Map<number, Uint16Array>>();

function replacementChoicesFor(list: GemList, occupied: number, lines: readonly EndStateLine[],
  ordered: Int32Array): Uint16Array {
  let byShape = replacementChoices.get(list);
  if (!byShape) {
    // Choice geometry uses the order of legal stat IDs. Different prices with
    // the same order can reuse it, even across two calculations.
    let orderKey = 0;
    for (const id of list.statIds) orderKey = orderKey * 16 + id;
    byShape = replacementOrders.get(orderKey);
    if (!byShape) {
      byShape = new Map();
      if (replacementOrders.size >= 64) {
        const oldest = replacementOrders.keys().next();
        if (!oldest.done) replacementOrders.delete(oldest.value);
      }
      replacementOrders.set(orderKey, byShape);
    }
    replacementChoices.set(list, byShape);
  }
  const cached = byShape.get(occupied);
  if (cached) return cached;
  const packed = Array<number>(lines.length + 1).fill(0);
  for (let index = 0; index < lines.length; index += 1) {
    packed[index] = packed.length;
    const lineId = lines[ordered[index]].statId;
    const survivors = occupied & ~(1 << lineId);
    let usedGaps = 0;
    for (let option = 0; option < list.statIds.length; option += 1) {
      const statId = list.statIds[option];
      if (survivors & (1 << statId)) continue;
      let gap = 0;
      for (let earlier = survivors & ((1 << statId) - 1); earlier !== 0; earlier &= earlier - 1) gap += 1;
      // The first different-id Gem in each gap dominates later options in that gap.
      // A same-id Gem may keep a better grind, so it has its own entry.
      if (statId !== lineId) {
        if (usedGaps & (1 << gap)) continue;
        usedGaps |= 1 << gap;
      }
      packed.push(option * 16 + gap + (statId === lineId ? 8 : 0));
    }
  }
  packed[lines.length] = packed.length;
  const result = Uint16Array.from(packed);
  byShape.set(occupied, result);
  return result;
}

/**
 * The legal `(line, Gem)` pair with the highest complete-body score, summed in
 * realized stat-id order when every Gem is priced from `list` on `plan`. Exact ties
 * keep the earlier stat-id and Gem option; a no-Gem tie keeps the unmodified body.
 */
function placement(
  plan: CraftPlan, list: GemList, prices: PriceList, lines: readonly EndStateLine[], lineValues: Float64Array,
  prefixScore: number,
): void {
  placedAt = -1; placedStat = -1;
  const ordered = lineIndexesByStat(lines);
  let baseline = prefixScore;
  for (let index = 0; index < lines.length; index += 1) baseline += lineValues[ordered[index]];
  placementBaseline = baseline;
  placedScore = baseline;
  /* Rule 2: one converted line at a time, and a later Gem may only replace it. */
  let onlyAt = -1;
  let occupied = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const at = ordered[index];
    occupied |= 1 << lines[at].statId;
    if (lines[at].gemmed && onlyAt === -1) onlyAt = at;
  }
  const choices = replacementChoicesFor(list, occupied, lines, ordered);

  for (let index = 0; index < lines.length; index += 1) {
    const at = ordered[index];
    if (onlyAt !== -1 && at !== onlyAt) continue;
    const line = lines[at];
    const first = lineValues[ordered[index === 0 ? 1 : 0]];
    const second = lineValues[ordered[index < 2 ? 2 : 1]];
    const third = lineValues[ordered[index < 3 ? 3 : 2]];
    /* Compare each legal realized body in canonical order. A same-id Gem must raise
       the base roll before it can enter this comparison. */
    for (let entry = choices[index]; entry < choices[index + 1]; entry += 1) {
      const choice = choices[entry];
      const option = choice >>> 4;
      const gap = choice & 7;
      let value = list.values[option];
      if (choice & 8) {
        const roll = list.rolls[option];
        if (!canGemReplaceValue(line, line.statId, roll)) continue;
        // Only a Gem that keeps the line's ID can inherit its existing stone.
        value = groundValue(plan, line.statId, roll, line.grind) * prices[line.statId];
      }
      let score: number;
      if (lines.length !== 4) {
        score = sumLinesByStatIdWithReplacement(prefixScore, lines, lineValues, at, list.statIds[option], value, ordered);
      } else if (gap === 0) score = prefixScore + value + first + second + third;
      else if (gap === 1) score = prefixScore + first + value + second + third;
      else if (gap === 2) score = prefixScore + first + second + value + third;
      else score = prefixScore + first + second + third + value;
      /* No Gem is the first answer. A Gem replaces it only when the realized body
         scores higher; equal Gem bodies keep the first canonical line/option. */
      if (score > placedScore) {
        placedScore = score;
        placedAt = at;
        placedStat = list.statIds[option];
      }
    }
  }
}

/** Rule 1 on every line at `plan`'s credit, into `lineValues`; sum in canonical stat order. */
function plainScore(plan: CraftPlan, prices: PriceList, lines: readonly EndStateLine[],
  prefixScore: number, lineValues: Float64Array): number {
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    const value = groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId];
    lineValues[at] = value;
  }
  return sumLinesByStatId(prefixScore, lines, lineValues);
}

export type CraftedScoreBreakdown = {
  /** The finished body's score at the supplied credit. */
  readonly score: number;
  /** The same lines, without a Gem, summed in canonical stat-id order. */
  readonly plainScore: number;
  /** The selected Gem's increase at the supplied credit, or zero where none is chosen. */
  readonly gemGain: number;
  /** Index into the caller's line array; `-1` when the body keeps no Gem. */
  readonly replaced: number;
  /** Effect id of the selected Gem; `-1` when the body keeps no Gem. */
  readonly statId: number;
  /** Each line's credited value, indexed in the caller's original line order. */
  readonly lineValues: Float64Array;
};

type CraftedScoreParts = { plainScore: number; gemGain: number };

/** The shared implementation; `parts` is omitted on the hot-path numeric reader. */
function scoreEndState(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
  lineValues: Float64Array, report?: CraftReport, parts?: CraftedScoreParts,
): number {
  if (report) { report.replaced = -1; report.statId = -1; }
  if (parts) parts.gemGain = 0;
  if (!plan.hasGem || lines.length === 0 || options.choice.statIds.length === 0) {
    const plain = plainScore(plan, prices, lines, prefixScore, lineValues);
    if (parts) parts.plainScore = plain;
    return plain;
  }
  /* Both line-ups in one pass: this is the innermost loop of the chance calculation. */
  const reference = choicePlan(plan.lineage);
  const sameCredit = plan === reference;
  if (choiceValues.length < lines.length) choiceValues = new Float64Array(lines.length);
  for (let at = 0; at < lines.length; at += 1) {
    const { statId, value, grind } = lines[at];
    const price = prices[statId];
    lineValues[at] = (value + Math.max(grind, grindCredit(plan, statId))) * price;
    if (!sameCredit) choiceValues[at] = (value + Math.max(grind, grindCredit(reference, statId))) * price;
  }
  placement(reference, options.choice, prices, lines, sameCredit ? lineValues : choiceValues, prefixScore);
  if (sameCredit) {
    if (report) { report.replaced = placedAt; report.statId = placedStat; }
    if (parts) { parts.plainScore = placementBaseline; parts.gemGain = placedScore - placementBaseline; }
    return placedScore;
  }
  const plain = sumLinesByStatId(prefixScore, lines, lineValues);
  if (parts) parts.plainScore = plain;
  if (placedAt < 0) return plain;

  const line = lines[placedAt];
  const roll = gemCredit(plan, placedStat);
  if (roll === null || !canGemReplaceValue(line, placedStat, roll)) return plain;
  /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
  const kept = placedStat === line.statId ? line.grind : 0;
  const gemValue = (roll + Math.max(kept, grindCredit(plan, placedStat))) * prices[placedStat];
  const score = sumLinesByStatIdWithReplacement(prefixScore, lines, lineValues, placedAt, placedStat, gemValue,
    orderedLineIndexes);
  if (score <= plain) return plain;
  if (report) { report.replaced = placedAt; report.statId = placedStat; }
  if (parts) parts.gemGain = score - plain;
  return score;
}

/**
 * **The end state of a finished line-up, in this role's units.**
 *
 * Rule 4 in one expression: score the lines as they stand at the credit, choose the
 * Gem's placement on the same-lineage reference rune (`canonicalCraftCredit`), and
 * score the complete realized body at the credit — or keep the plain body where
 * that placement scores no higher, or where
 * the credited Gem of that stat could not legally take the line.
 *
 * `lineValues` is filled with each line's own scored contribution when it is passed,
 * so a caller that needs the breakdown does not price the lines twice. `report` is
 * for callers such as `craftedLines`, which need to know where the Gem landed.
 */
export function craftedScore(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
  lineValues: Float64Array = new Float64Array(lines.length),
  report?: CraftReport,
): number {
  return scoreEndState(plan, options, prices, lines, prefixScore, lineValues, report);
}

/**
 * **`craftedScore` as seen from a band of bars**: a number that compares with every
 * bar in `[lowest, highest]` exactly as `craftedScore` would, without the canonical
 * placement whenever the body is clear of every bar.
 *
 * The end state is never below the plain body — a Gem is never forced, and that
 * baseline is summed in the order `craftedScore` sums it — so a plain body at or above
 * `highest` clears every bar outright. A Gem body differs from the plain one by one
 * line, so "weakest line out, best Gem in" (with any stone above the credit it may
 * keep) bounds it, and a bound below `lowest` misses every bar; that holds at any
 * credit, because the Gem is priced at the credit in `options.values`.
 *
 * At the reference credit the best Gem body is then found in real arithmetic: each
 * replaceable line against the first legal Gem in the best-first list (which
 * `placement` evaluates, and which dominates the other different-id Gems) and against
 * re-rolling its own id. That differs from `craftedScore` only by the order of a
 * five-term sum, far inside the margin, so a body clear of the margin on both sides
 * answers every bar exactly as the placement would. Only a body within the margin of a
 * bar pays for the placement, which was most of what counting a rune's union cost.
 */
export function craftedScoreAgainst(
  plan: CraftPlan, options: GemOptions, prices: PriceList, lines: readonly EndStateLine[], prefixScore: number,
  lineValues: Float64Array, lowest: number, highest: number,
): number {
  const plain = plainScore(plan, prices, lines, prefixScore, lineValues);
  const list = options.choice;
  if (!plan.hasGem || lines.length === 0 || list.statIds.length === 0 || plain >= highest) return plain;
  let weakest = Number.POSITIVE_INFINITY;
  let kept = 0;
  let occupied = 0;
  let onlyAt = -1;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    if (lineValues[at] < weakest) weakest = lineValues[at];
    const excess = (line.grind - grindCredit(plan, line.statId)) * prices[line.statId];
    if (excess > kept) kept = excess;
    occupied |= 1 << line.statId;
    if (line.gemmed && onlyAt === -1) onlyAt = at;
  }
  const best = options.values.length > 0 ? options.values[0] : 0;
  /* No term exceeds `|prefixScore|` plus the lines and the best Gem in size — the fixed
     part is negative on a lower-star rune — so no order of summing them strays from
     the real value by more than a few ulps of that. */
  const margin = (Math.abs(prefixScore) + (plain - prefixScore) + best + kept) * Number.EPSILON * 32;
  const loose = plain - weakest + best + kept;
  if (loose + margin < lowest) return Math.max(plain, loose);
  if (plan !== choicePlan(plan.lineage)) return scoreEndState(plan, options, prices, lines, prefixScore, lineValues);

  let body = plain;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    if (onlyAt !== -1 && at !== onlyAt) continue;
    const survivors = occupied & ~(1 << line.statId);
    let gem = Number.NEGATIVE_INFINITY;
    for (let option = 0; option < list.statIds.length; option += 1) {
      const statId = list.statIds[option];
      if (statId === line.statId || survivors & (1 << statId)) continue;
      gem = list.values[option];
      break;
    }
    const own = list.indexByStat[line.statId];
    if (own >= 0 && canGemReplaceValue(line, line.statId, list.rolls[own])) {
      gem = Math.max(gem, groundValue(plan, line.statId, list.rolls[own], line.grind) * prices[line.statId]);
    }
    const replaced = plain - lineValues[at] + gem;
    if (replaced > body) body = replaced;
  }
  if (body + margin < lowest || body - margin >= highest) return body;
  return scoreEndState(plan, options, prices, lines, prefixScore, lineValues);
}

/**
 * The same terminal scorer as `craftedScore`, with its exact base/Gem decomposition
 * for callers that build a distribution over finished rune bodies.
 */
export function craftedScoreBreakdown(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
): CraftedScoreBreakdown {
  const lineValues = new Float64Array(lines.length);
  const report: CraftReport = { replaced: -1, statId: -1 };
  const parts: CraftedScoreParts = { plainScore: 0, gemGain: 0 };
  const score = scoreEndState(plan, options, prices, lines, prefixScore, lineValues, report, parts);
  return { score, ...parts, ...report, lineValues };
}

/**
 * **A ceiling on `craftedScore`**: the line-up with the Gem whose complete realized
 * body has the highest score *at the credit*. The chosen placement is one of the legal ones, so no end state is
 * worth more than this; it is what a chance can be ruled out against without
 * counting runs, and never a figure a view prints.
 */
export function craftedScoreCeiling(
  plan: CraftPlan, options: GemOptions, prices: PriceList,
  lines: readonly EndStateLine[], prefixScore: number,
  lineValues: Float64Array = new Float64Array(lines.length),
): number {
  const plain = plainScore(plan, prices, lines, prefixScore, lineValues);
  if (!plan.hasGem || lines.length === 0 || options.statIds.length === 0) return plain;
  placement(plan, options, prices, lines, lineValues, prefixScore);
  return placedScore;
}

/**
 * Which line the Gem took and what it put there: `replaced` indexes the lines and
 * `statId` is the Gem's, both `-1` where no Gem gains anything.
 */
export type CraftReport = { replaced: number; statId: number };

/**
 * **The finished line-up `craftedScore` scored**, as the lines a player would hold
 * after spending the items.
 *
 * The score and the line-up come from one decision, and this function exists so that
 * nothing has to make the decision a second time to find out what it was. The Rune
 * Simulator used to: it gemmed a random line into a random id and ground one random
 * line, and so showed a rune that a DEF % line had been swapped for CRI Rate beside a
 * fresh Resistance, three stones left unspent, and a verdict that had assumed none of
 * that. Rule 1 grinds *every* grindable line, and the Gem goes where it gains most on
 * the reference rune — which is the weakest line only when nothing blocks the best id
 * from taking it.
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
  const report: CraftReport = { replaced: -1, statId: -1 };
  craftedScore(plan, options, prices, lines, prefixScore, undefined, report);
  return lines.map((line, at) => {
    if (at !== report.replaced) return groundLine(plan, line);
    const statId = report.statId;
    /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
    const kept = statId === line.statId ? line.grind : 0;
    return { statId, value: gemCredit(plan, statId) ?? 0, gemmed: true, grind: Math.max(kept, grindCredit(plan, statId)) };
  });
}

/**
 * **The placement rule asked per stat**, for a view that scores a rune in units of its
 * own: every legal Gem on this finished rune as the reference line-up it would leave
 * (`canonicalCraftCredit`), beside the reference line-up with no Gem. Priced in one role,
 * the best of these that beats `base` is the placement `craftedScore` chooses in that
 * role; Gems & Grinds reads them across every role it judges a rune in. `null` below
 * `+12`, where no Gem may go on yet.
 */
export function gemChoiceLineUps(rune: Pick<Rune, 'slot' | 'mainStatId' | 'prefixStatId' | 'subProperties' | 'level' | 'ancient'>):
  { base: EndStateLine[]; gems: Array<{ statId: number; lines: EndStateLine[] }> } | null {
  const lines = rune.subProperties;
  if (rune.level < gemMinimumLevel || lines.length === 0) return null;
  const reference = choicePlan(rune.ancient ? 'ancient' : 'standard');
  const base = groundLines(reference, lines);
  const gems: Array<{ statId: number; lines: EndStateLine[] }> = [];
  for (let at = 0; at < lines.length; at += 1) {
    for (const statId of allStatIds) {
      if (!legalGemTarget(rune.slot, rune.mainStatId, rune.prefixStatId, lines, at, statId)) continue;
      const roll = gemCredit(reference, statId);
      if (roll === null || !canGemReplaceValue(lines[at], statId, roll)) continue;
      /* Re-rolling a line's own id keeps its stone (rule 3); any other id starts bare. */
      const kept = statId === lines[at].statId ? lines[at].grind : 0;
      const gemmed: EndStateLine = { statId, value: roll, gemmed: true, grind: Math.max(kept, grindCredit(reference, statId)) };
      gems.push({ statId, lines: base.map((line, index) => index === at ? gemmed : line) });
    }
  }
  return { base, gems };
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
  return craftHalfOf(kind, items.filter(({ item }) => item.amount > 0), assumption);
}

/** The same half without asking whether a stack is empty: What's missing asks about items nobody holds. */
function craftHalfOf(
  kind: CraftKind, items: ReadonlyArray<{ item: CraftItem; stock: number }>, assumption: CraftRollAssumption,
): CraftHalf {
  const choices: CraftChoice[][] = Array.from({ length: statIdBound }, () => []);
  for (const { item, stock: index } of items) {
    if (item.kind !== kind || item.statId < 0 || item.statId >= statIdBound) continue;
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

function legalGemTarget(slot: number, mainStatId: number, prefixStatId: number | null,
  lines: readonly EndStateLine[], at: number, statId: number): boolean {
  const converted = lines.findIndex((line) => line.gemmed);
  return (converted === -1 || at === converted) && statId !== mainStatId && statId !== prefixStatId
    && slotAllowsSubStat(slot, statId)
    && lines.every((line, other) => other === at || line.statId !== statId);
}

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
      if (!legalGemTarget(slot, mainStatId, prefixStatId, lines, at, statId)) continue;
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

export type CraftApplication = {
  target: CraftTarget;
  result: RuneSubProperty;
  lines: readonly EndStateLine[];
};

/**
 * **One item on one rune: the rune before it and every legal way to spend it, read
 * on one premise.** Before and after leave this function together so that nothing
 * can price them on different terms.
 *
 * They once were. A Gem's line was ground by an assumed follow-up Grindstone while
 * the rune it was measured against stood unground, so the gain paid the Gem for a
 * stone the replaced line could have taken just as well: a Bruiser's ATK 8 % line
 * lost to HP +385 ground to +755, although ATK ground by the same stone was worth
 * more, and the Gem was put on the wrong line besides.
 *
 * **A Gem is read on the placement rule's reference rune** (`canonicalCraftCredit`):
 * every grindable line, before and after alike, carries an average Legend
 * Grindstone where that raises it, and a line already ground higher keeps its own.
 * The gain is then the Gem's alone, and it is measured on exactly the line-ups that
 * chose the Gem's stat (`gemChoiceLineUps`); only the Gem's own roll is the item's.
 * **A Grindstone is read on the rune as it stands**, because the stone is the thing
 * being judged and crediting one beforehand would judge it against itself.
 *
 * `premise` names the baseline, so a caller judging many items on one rune prices
 * each baseline once. Whether the box holds the item is not asked here: What's
 * missing judges the items an account lacks by exactly the rules that place the
 * ones it has.
 */
export type CraftComparison = {
  premise: CraftKind;
  baseline: readonly EndStateLine[];
  applications: CraftApplication[];
};

export function craftComparison(item: CraftItem, rune: Rune, roll: CraftRollAssumption): CraftComparison {
  const stones = item.kind === 'gem' ? choicePlan(rune.ancient ? 'ancient' : 'standard') : null;
  const premise = (lines: readonly EndStateLine[]) => stones ? groundLines(stones, lines) : lines;
  const baseline = premise(rune.subProperties);
  if (!lineageFits(item, rune)) return { premise: item.kind, baseline, applications: [] };
  const held = craftHalfOf(item.kind, [{ item, stock: 0 }], roll);
  const variants = craftVariants({
    gem: item.kind === 'gem' ? held : null,
    grind: item.kind === 'grindstone' ? held : null,
  }, rune.slot, rune.mainStatId, rune.prefixStatId, rune.subProperties,
  rune.level >= gemMinimumLevel, () => true, true);
  const applications = variants.filter((variant) => variant.stock.includes(0)).map((variant) => {
    const index = item.kind === 'gem' ? variant.gemmedAt
      : variant.lines.findIndex((line, at) => line.grind !== rune.subProperties[at].grind);
    const lines = premise(variant.lines);
    return { target: { index, property: rune.subProperties[index] }, result: lines[index], lines };
  });
  return { premise: item.kind, baseline, applications };
}

/**
 * Why an item cannot be spent on a rune, ordered by how close the rune came.
 *
 * The order is the point. An item that fits nothing is told about once, in one
 * line, and that line should name the last thing that stopped it rather than
 * the first — "no Violent rune has SPD left to grind" is a fact the user can
 * act on, where "no Violent rune" would be simply false.
 */
export const craftBlockOrder = ['set', 'level', 'slot', 'duplicate', 'stat', 'target', 'potential'] as const;
export type CraftBlock = typeof craftBlockOrder[number];

/** One legal way to spend an item on a rune: which sub property it lands on. */
export type CraftTarget = {
  /** Index into the rune's own `subProperties`. */
  index: number;
  property: RuneSubProperty;
};

export type CraftFit =
  | { fits: true; targets: CraftTarget[] }
  | { fits: false; block: CraftBlock };

/**
 * Whether the item's lineage lets it touch this rune at all (§8, *Which runes an
 * item may go on*).
 *
 * Ancient runes and ordinary runes each take their own items, and §8 is
 * explicit that an ordinary gem is not a permitted fallback on an Ancient rune.
 * Intangible needs no clause of its own: it is a set like any other here, so an
 * Intangible item matches it by set and an Immemorial one by belonging to none,
 * which is exactly the pair §8 allows it.
 */
export function lineageFits(item: CraftItem, rune: Pick<Rune, 'ancient' | 'setId'>): boolean {
  /* Immemorial is the only item that belongs to no set, and the only one whose
     match is the lineage alone. An Ancient item still names a set in its own
     id, so Ancient is a second condition on top of the set — not a replacement
     for it. Read as a replacement, an Ancient Violent gem offered itself to
     every Ancient rune in the account.

     An Immemorial item is refused on an Ancient rune. No published source states
     it, but the user confirmed it in play (October 2026): an Ancient rune takes
     Ancient items and nothing else, Immemorial included. */
  if (item.lineage === 'immemorial') return !rune.ancient;
  if (rune.ancient !== (item.lineage === 'ancient')) return false;
  return item.setId === rune.setId;
}

/**
 * Every way one item can potentially improve one rune, or the reason there is none.
 *
 * A gem replaces one existing sub property, so its target is any sub property
 * whose *other* three do not already carry the gem's stat — which means a rune
 * that already has the stat has exactly one legal target: that property itself,
 * re-rolled, keeping its grindstone. It is a potential improvement only when
 * the Gem's best roll beats the current base value. A different stat remains a
 * possible improvement for a role that wants that stat. A rune already carrying
 * a converted line offers that line alone. A grindstone instead adds to a
 * property of its own stat, and may only be spent where its ceiling can beat
 * the bonus already sitting there.
 */
export function craftItemFit(item: CraftItem, rune: Rune): CraftFit {
  if (!lineageFits(item, rune)) return { fits: false, block: 'set' };
  const maximum = craftItemRoll(item.kind, item.lineage, item.statId, item.grade, 'maximum');
  if (maximum === null) return { fits: false, block: 'target' };

  if (item.kind === 'grindstone') {
    const matching = rune.subProperties
      .map((property, index) => ({ index, property }))
      .filter(({ property }) => property.statId === item.statId);
    if (!matching.length) return { fits: false, block: 'stat' };
    /* §8: a second grindstone is only allowed where it could beat the bonus
       already applied. The shared craft rule supplies the verified ordinary
       or Ancient ceiling for that exact item. */
    const targets = matching.filter(({ property }) => property.grind < maximum);
    return targets.length ? { fits: true, targets } : { fits: false, block: 'target' };
  }

  if (rune.level < gemMinimumLevel) return { fits: false, block: 'level' };
  if (!slotAllowsSubStat(rune.slot, item.statId)) return { fits: false, block: 'slot' };
  if (item.statId === rune.mainStatId || item.statId === rune.prefixStatId) {
    return { fits: false, block: 'duplicate' };
  }
  if (!rune.subProperties.length) return { fits: false, block: 'target' };

  /* §8: one converted line at a time, so a rune that already carries one offers
     only that line to a further Gem. */
  const eligible = rune.subProperties
    .map((property, index) => ({ index, property }))
    .filter(({ index }) => legalGemTarget(rune.slot, rune.mainStatId, rune.prefixStatId, rune.subProperties, index, item.statId));
  const targets = eligible.filter(({ property }) => canGemReplaceValue(property, item.statId, maximum));
  if (!targets.length && eligible.length) return { fits: false, block: 'potential' };
  return targets.length ? { fits: true, targets } : { fits: false, block: 'duplicate' };
}
