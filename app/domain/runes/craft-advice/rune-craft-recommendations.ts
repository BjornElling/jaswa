import {
  craftComparison, craftItemFit, creditKey, creditedGrade, gemChoiceLineUps, noCraftCredit, rulerCraftCredit,
} from '../craft/rune-craft-end-state';
import { filterIncludes } from '../../shared/filter-selection';
import type { CraftApplication, CraftCredit, EndStateLine } from '../craft/rune-craft-end-state';
import type { CraftItem, CraftRollAssumption } from '../craft/rune-craft-items';
import { newRuneAdviceScope, prepareRuneCandidate, roleBuilds } from '../cleanup/rune-cleanup-model';
import type { MatchRank } from '../cleanup/rune-cleanup-model';
import { runeAdvice, runeRankWorth } from '../cleanup/rune-cleanup-advice';
import { qualityReferences } from '../cleanup/rune-quality-reference';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RoleType, RuneRole } from '../../profiles/rune-roles';
import type { Rune } from '../runes';
import { runeSubValue } from '../runes';
import type { RunePotentialSettings } from '../../model';
import { craftScore } from './craft-score';
import type { CraftScoreJob, ScoreCraftJobs } from './craft-score';
import { craftScoreUncertainty, craftScoreLayout } from './craft-score-layout';
import { combineCalculationBackends } from '../../shared/calculation-summary';
import type { CalculationBackend } from '../../shared/calculation-summary';

export type CraftRecommendationRequest = {
  items: readonly CraftItem[];
  /** Items the box lacks, judged beside the held ones — What's missing; empty elsewhere. */
  missing: readonly CraftItem[];
  runes: readonly Rune[]; roles: readonly RuneRole[];
  base: ReadonlyMap<RoleType, ReferenceStats>; settings: RunePotentialSettings;
  roll: CraftRollAssumption; preferGpu: boolean;
};
export type CraftEvaluation = { score: number; role: string; rank: MatchRank };
/**
 * One Gem stat as the placement rule ranks it on one rune: its best score on the
 * reference rune, and the sub line (`subProperties` index) that score replaces —
 * `-1` where two lines serve the stat equally, so the rule names no one line.
 */
export type GemStatChoice = { statId: number; score: number; line: number };
export type CraftRecommendation = {
  rune: Rune; item: CraftItem; application: CraftApplication;
  before: CraftEvaluation; after: CraftEvaluation; gain: number; stat: number;
  /**
   * The Gem stats the placement rule would put on this rune, best first, each only
   * where it beats the rune without a Gem. Read from the rune, its roles and the craft
   * credit and quality policy, so every row of a rune carries the same list —
   * Grindstone rows too, because a stone on a line the Gem will replace is lost
   * (`onDesirableGemStat`). For a credit with no Gem, this is `null`.
   */
  gemChoice: readonly GemStatChoice[] | null;
  /**
   * The readings of the rune's Best role it was judged in, shared by all its rows, so a plan
   * of several stones is priced on exactly the terms each stone was (`grindPlans`).
   */
  readings: readonly CraftReading[];
};
export type CraftRankings = {
  highestScore: CraftRecommendation[]; highestGain: CraftRecommendation[];
  highestStat: Map<number, CraftRecommendation[]>;
};
export type CraftRecommendations = {
  candidates: readonly CraftRecommendation[]; backend: CalculationBackend;
  comparisons: number; durationMs: number;
};
export type CraftReading = { prices: number[]; discount: number; role: string; rank: MatchRank };
type State = { values: number[]; evaluation: CraftEvaluation | null;
  recommendation?: { item: CraftItem; application: CraftApplication; baseline: State } };

/** Rank only visible lines, on Clean-up's fixed ruler, without hypothetical power-ups: the craft is whatever `craftComparison` put in the lines. */
function valuesOf(rune: Rune, lines: readonly EndStateLine[] = rune.subProperties): number[] {
  const values = Array<number>(craftScoreLayout.stats).fill(0);
  if (rune.prefixStatId !== null) values[rune.prefixStatId] += rune.prefixValue;
  for (const line of lines) values[line.statId] += runeSubValue(line);
  return values;
}
/* Tied replacements follow Clean-up's canonical stat-id order, so the export's
   line order never decides which stat a Gem replaces. */
const tie = (a: CraftRecommendation, b: CraftRecommendation) => a.rune.id.localeCompare(b.rune.id)
  || a.item.id.localeCompare(b.item.id) || a.application.target.property.statId - b.application.target.property.statId;
/* Two runes worth the same can differ in the last bit of their arithmetic; within a
   billionth of a percentage point they are a tie, settled by identity, so the order on
   screen never turns on rounding the figure itself cannot show. */
const tolerance = 1e-9;
export function rankCraftRecommendations(rows: readonly CraftRecommendation[], count: number,
  metric: (row: CraftRecommendation) => number): CraftRecommendation[] {
  const distinct = new Map<string, CraftRecommendation>();
  const compare = (a: CraftRecommendation, b: CraftRecommendation) => {
    const difference = metric(b) - metric(a);
    return Math.abs(difference) > tolerance ? difference : tie(a, b);
  };
  for (const row of rows) {
    const previous = distinct.get(row.rune.id);
    if (!previous || compare(row, previous) < 0) distinct.set(row.rune.id, row);
  }
  return [...distinct.values()].sort(compare).slice(0, count);
}

/**
 * The bar a suggestion must clear on its rune. For the box's own items it is
 * the rune before the item, on the item's own premise (`craftComparison`); for
 * What's missing it is the best the box can already
 * do to that rune, because an item worth chasing is one that beats it.
 */
export type CraftBenchmark = {
  score: (row: CraftRecommendation) => number;
  stat: (row: CraftRecommendation) => number;
};

export const runeAsItStands: CraftBenchmark = { score: (row) => row.before.score, stat: () => -Infinity };

export const isHeldCraft = (row: CraftRecommendation): boolean => row.item.amount > 0;

/**
 * The box's best on every rune, read from the complete calculation rather than
 * the filtered one: what the account can already do does not change because a
 * filter hides some of it.
 */
export function heldCraftBenchmark(rows: readonly CraftRecommendation[]): CraftBenchmark {
  const scores = new Map<string, number>();
  const stats = new Map<string, number>();
  const scoreKey = (row: CraftRecommendation) => `${row.rune.id}\0${row.item.kind}`;
  const statKey = (row: CraftRecommendation) => `${row.rune.id}\0${row.item.statId}`;
  for (const row of rows) if (isHeldCraft(row)) {
    scores.set(scoreKey(row), Math.max(scores.get(scoreKey(row)) ?? -Infinity, row.after.score));
    if (row.item.kind === 'grindstone') stats.set(statKey(row), Math.max(stats.get(statKey(row)) ?? -Infinity, row.stat));
  }
  return {
    score: (row) => Math.max(row.before.score, scores.get(scoreKey(row)) ?? -Infinity),
    stat: (row) => stats.get(statKey(row)) ?? -Infinity,
  };
}

/**
 * The Gem stat each rune should take: the placement rule's own answer
 * (`gemChoiceLineUps`, the rule `craftedScore` applies), read off the rows, so
 * neither the box's grades nor the page's roll can tip it. A Gem is permanent and
 * one per rune, so spending one on a lesser stat closes the rune to the right one;
 * a Gem of any other stat is therefore never suggested, and a rune whose stat the
 * box lacks gets no Gem at all (`RUNE-CRAFT-ITEMS.md` §5.1). A stat the user waved
 * away on a rune is out of that rune's choice, so the next best stat stands in.
 *
 * A rune that already carries a Gem may always take a better roll of that stat:
 * the stat is already spent, so re-rolling it closes nothing the rune had open.
 * That top — the best stat among those the game lets replace the gemmed line
 * without changing its stat — joins the placement rule's own top under both
 * answers to *Can change gem'ed stat?* (`gemChange`); No only drops the other.
 * Yes is a permission, so it never shows less than No: read as the placement rule
 * alone, Yes emptied such a rune whenever the box lacked the rule's stat, while No
 * still offered the better roll.
 * A rune with no Gem is untouched: No permits every first Gem, so it still takes
 * only the stat the placement rule chooses.
 *
 * Each stat keeps the line it would replace, which is what keeps a Grindstone off
 * that line (`onDesirableGemStat`).
 */
export type DesirableGems = ReadonlyMap<string, readonly GemStatChoice[] | null>;
export function desirableGemStats(rows: readonly CraftRecommendation[],
  waived: (runeId: string, statId: number) => boolean = () => false,
  gemChange: 'yes' | 'no' = 'yes'): DesirableGems {
  const desirable = new Map<string, readonly GemStatChoice[] | null>();
  const topOf = (row: CraftRecommendation, choices: readonly GemStatChoice[], change: 'yes' | 'no') => {
    const open = choices.filter((choice) => !waived(row.rune.id, choice.statId)
      && craftMatchesChangeFilter(row.rune, { kind: 'gem', statId: choice.statId }, { grinded: [], gemChange: change }));
    const top = open.length ? open[0].score : -Infinity;
    return open.filter((choice) => choice.score === top);
  };
  for (const row of rows) {
    if (desirable.has(row.rune.id)) continue;
    const choices = row.gemChoice;
    desirable.set(row.rune.id, choices === null ? null
      : [...new Set([...topOf(row, choices, 'no'), ...(gemChange === 'yes' ? topOf(row, choices, 'yes') : [])])]);
  }
  return desirable;
}

/**
 * Rank each stat on the readings the Gem can serve. In one reading the best
 * of these is the stat `craftedScore` places, including the option to leave
 * the rune without a Gem.
 */
function gemChoiceOf(rune: Rune, readings: readonly CraftReading[], credit: CraftCredit): GemStatChoice[] | null {
  if (creditedGrade(credit.gem) === null) return null;
  const lineUps = gemChoiceLineUps(rune, credit);
  if (!lineUps || !readings.length) return [];
  const best = new Map<number, GemStatChoice>();
  for (const reading of readings) {
    const base = craftScore({ ...reading, values: valuesOf(rune, lineUps.base) });
    for (const gem of lineUps.gems) {
      const score = craftScore({ ...reading, values: valuesOf(rune, gem.lines) });
      if (score <= base) continue;
      const previous = best.get(gem.statId);
      if (!previous || score > previous.score) best.set(gem.statId, { statId: gem.statId, score, line: gem.at });
      else if (score === previous.score && previous.line !== gem.at) best.set(gem.statId, { ...previous, line: -1 });
    }
  }
  return [...best.values()].sort((left, right) => right.score - left.score || left.statId - right.statId);
}

/**
 * A Gem passes only with its rune's most desirable stat, or every Gem where the
 * credit assumes none and the rule therefore names no stat.
 *
 * A Grindstone passes unless a desirable Gem would put another stat on its line:
 * the Gem then replaces the line, and the stone goes with it. Re-rolling the line's
 * own stat keeps the stone, so that Gem blocks nothing. A line already ground is
 * exempt: its stone is spent either way, and topping it up is the user's call.
 */
export function onDesirableGemStat(row: CraftRecommendation, desirable: DesirableGems): boolean {
  const choices = desirable.get(row.rune.id);
  if (row.item.kind === 'gem') return choices === null || (choices?.some((choice) => choice.statId === row.item.statId) ?? false);
  const { index, property } = row.application.target;
  return property.grind > 0 || !choices
    || choices.every((choice) => choice.line !== index || choice.statId === property.statId);
}

/**
 * A projection of the complete calculation. Filters and result count never change
 * its scores. With `lines`, a Grindstone row is ranked by its plan (`grindPlan`),
 * because that is the score its card shows; a rune's best row is then one whose
 * plan is the rune's whole plan.
 */
export function craftRecommendationRankings(rows: readonly CraftRecommendation[], count: number,
  benchmark: CraftBenchmark = runeAsItStands, lines?: CraftGrindLines): CraftRankings {
  const planned = new Map<CraftRecommendation, number>();
  const after = (row: CraftRecommendation) => {
    if (!lines || row.item.kind !== 'grindstone') return row.after.score;
    let score = planned.get(row);
    if (score === undefined) { score = grindPlan(row, lines).after.score; planned.set(row, score); }
    return score;
  };
  const gain = (row: CraftRecommendation) => after(row) - benchmark.score(row);
  const positive = rows.filter((row) => row.after.score - benchmark.score(row) > 0);
  const byStat = new Map<number, CraftRecommendation[]>();
  for (const row of rows) if (row.item.kind === 'grindstone' && row.stat > benchmark.stat(row)) {
    const own = byStat.get(row.item.statId) ?? []; own.push(row); byStat.set(row.item.statId, own);
  }
  return {
    highestScore: rankCraftRecommendations(positive, count, after),
    highestGain: rankCraftRecommendations(positive, count, gain),
    highestStat: new Map([...byStat].map(([stat, own]) => [stat, rankCraftRecommendations(own, count, (row) => row.stat)])),
  };
}

/**
 * Every stone one rune should take, all spent together: per sub line, the stone
 * that scores highest there, and the score of the rune with all of them in.
 */
export type CraftGrindPlan = { lines: readonly CraftRecommendation[]; after: CraftEvaluation };

/**
 * The stones each rune should take, from the rows shown: per sub line, the stone
 * that scores highest there and clears the same bar the rankings ask
 * (`craftRecommendationRankings`). Grinds on different lines do not exclude one
 * another, so the stones are judged together (`grindPlan`) — each line's own best
 * is the largest figure its stat can take, which no other line's choice can make
 * worse. A Gem is left out: a rune takes one, so a second Gem is a replacement,
 * never an addition.
 */
export type CraftGrindLines = ReadonlyMap<string, ReadonlyMap<number, CraftRecommendation>>;
export function grindLines(rows: readonly CraftRecommendation[],
  benchmark: CraftBenchmark = runeAsItStands): CraftGrindLines {
  const lines = new Map<string, Map<number, CraftRecommendation>>();
  for (const row of rows) {
    if (row.item.kind !== 'grindstone' || row.after.score - benchmark.score(row) <= 0) continue;
    const own = lines.get(row.rune.id) ?? new Map<number, CraftRecommendation>();
    const index = row.application.target.index;
    const previous = own.get(index);
    if (!previous || row.after.score - previous.after.score > tolerance
      || (Math.abs(row.after.score - previous.after.score) <= tolerance && tie(row, previous) < 0)) own.set(index, row);
    lines.set(row.rune.id, own);
  }
  return lines;
}

/**
 * The plan a card about `row` shows: the rune's chosen stones (`grindLines`) with
 * `row`'s own stone always on its line, because Highest stat may rank a stone no
 * role values, and its card must still be about that stone. It is priced on the
 * readings every row of the rune carries, exactly as the worker priced each stone
 * alone.
 */
export function grindPlan(row: CraftRecommendation, lines: CraftGrindLines): CraftGrindPlan {
  const own = new Map(lines.get(row.rune.id));
  own.set(row.application.target.index, row);
  const chosen = [...own.values()].sort((a, b) => a.application.target.index - b.application.target.index);
  /* One stone is the row itself, so a plan never differs from its stone by rounding. */
  if (chosen.length === 1) return { lines: chosen, after: row.after };
  const subs = [...row.rune.subProperties];
  for (const entry of chosen) subs[entry.application.target.index] = entry.application.result;
  const values = valuesOf(row.rune, subs);
  let after = row.after;
  for (const reading of row.readings) {
    const score = craftScore({ ...reading, values });
    if (score > after.score) after = { score, role: reading.role, rank: reading.rank };
  }
  return { lines: chosen, after };
}

export type WantedCraftItem = { item: CraftItem; runes: number; topGain: number };

/**
 * What's missing, said per item: each rune names the one item it lacks that
 * would lift it furthest past the box, and the items are ordered by how many
 * runes named them. A Legend gem that helps a little everywhere does not crowd
 * out the stone that is the answer for thirty runes.
 */
export function wantedCraftItems(rows: readonly CraftRecommendation[], count: number,
  benchmark: CraftBenchmark): WantedCraftItem[] {
  const gain = (row: CraftRecommendation) => row.after.score - benchmark.score(row);
  const best = new Map<string, CraftRecommendation>();
  for (const row of rows) {
    if (gain(row) <= 0) continue;
    const previous = best.get(row.rune.id);
    if (!previous || gain(row) > gain(previous) || (gain(row) === gain(previous) && tie(row, previous) < 0)) best.set(row.rune.id, row);
  }
  const tally = new Map<string, WantedCraftItem>();
  for (const row of best.values()) {
    const entry = tally.get(row.item.id) ?? { item: row.item, runes: 0, topGain: 0 };
    tally.set(row.item.id, { item: row.item, runes: entry.runes + 1, topGain: Math.max(entry.topGain, gain(row)) });
  }
  return [...tally.values()].sort((a, b) => b.runes - a.runes || b.topGain - a.topGain
    || a.item.id.localeCompare(b.item.id)).slice(0, count);
}

/**
 * A remembered answer. `key` is everything but the items and the runes
 * (`craftCalculationKey`); `items` and `runes` name every item and rune it has
 * judged (`craftItemKey`, `craftRuneKey`), so a change to the account — a stone
 * spent, a rune powered up, a live sync — costs only what is new to it
 * (`reconcileCraftCalculation`).
 */
/** `keepers`: whether the Calculate that made it also asked Rune Clean-up which runes it
    keeps, so turning *Only keep-runes* on afterwards is a new question, not a new calculation. */
export type CraftCalculation = { key: string; items: readonly string[]; runes: readonly string[]; result: CraftRecommendations; keepers?: boolean };

/**
 * What an item contributes to the arithmetic: everything but how many are held.
 * A pair is judged on the rune and the item alone, never on the rest of the box,
 * so spending one of three stones changes no answer — only the stack it names.
 */
export const craftItemKey = (item: CraftItem): string => JSON.stringify({ ...item, amount: undefined });

/**
 * A rune as the arithmetic sees it. Everything is in it, its placement included,
 * so a rune moved to another monster is judged again; that costs one rune, and
 * a key that left a field out would one day leave out one that mattered.
 */
export const craftRuneKey = (rune: Rune): string => JSON.stringify(rune);

export type ReconciledCraftCalculation = {
  result: CraftRecommendations;
  /** Items nobody has judged yet. */
  addedItems: CraftItem[];
  /** Runes nobody has judged yet: new to the account, or changed since. */
  addedRunes: Rune[];
};

/**
 * The remembered answer brought up to the account as it is now, without asking
 * again for anything already judged: a row whose item has left the box, or whose
 * rune is gone or has changed, is dropped — not kept greyed — and a row whose
 * stack merely changed size names the stack as it is now. What is new is listed
 * for `craftExtensionRequests` to ask about alone.
 */
export function reconcileCraftCalculation(calculation: CraftCalculation, items: readonly CraftItem[],
  runes: readonly Rune[]): ReconciledCraftCalculation {
  const currentItems = new Map(items.map((item) => [craftItemKey(item), item]));
  const currentRunes = new Map(runes.map((rune) => [craftRuneKey(rune), rune]));
  const judgedItems = new Set(calculation.items);
  const judgedRunes = new Set(calculation.runes);
  const candidates = calculation.result.candidates.flatMap((row) => {
    const item = currentItems.get(craftItemKey(row.item));
    const rune = currentRunes.get(craftRuneKey(row.rune));
    if (!item || !rune) return [];
    return [item === row.item && rune === row.rune ? row : { ...row, item, rune }];
  });
  return {
    result: { ...calculation.result, candidates },
    addedItems: items.filter((item) => !judgedItems.has(craftItemKey(item))),
    addedRunes: runes.filter((rune) => !judgedRunes.has(craftRuneKey(rune))),
  };
}

/**
 * The questions that bring a reconciled answer up to date, and no more: every
 * item on each new rune, and each new item on the runes already judged. The two
 * never ask about the same pair, so their answers simply add up.
 */
export function craftExtensionRequests(request: CraftRecommendationRequest, reconciled: ReconciledCraftCalculation): CraftRecommendationRequest[] {
  const { addedItems, addedRunes } = reconciled;
  const newRunes = new Set(addedRunes);
  const known = request.runes.filter((rune) => !newRunes.has(rune));
  const asks: CraftRecommendationRequest[] = [];
  if (addedRunes.length) asks.push({ ...request, runes: addedRunes, items: [...request.items, ...request.missing], missing: [] });
  if (addedItems.length && known.length) asks.push({ ...request, runes: known, items: addedItems, missing: [] });
  return asks;
}

/**
 * Publish a complete answer for the current account after every extension is in.
 * Retiring old keys here also prevents repeated syncs from retaining every
 * earlier form of a rune, or treating a returning item as already calculated.
 */
export function extendCraftCalculation(calculation: CraftCalculation, added: readonly CraftRecommendations[],
  items: readonly CraftItem[], runes: readonly Rune[]): CraftCalculation {
  const result = reconcileCraftCalculation({ ...calculation,
    result: { ...calculation.result, candidates: [...calculation.result.candidates, ...added.flatMap((answer) => answer.candidates)] },
  }, items, runes).result;
  return {
    key: calculation.key,
    keepers: calculation.keepers,
    items: items.map(craftItemKey),
    runes: runes.map(craftRuneKey),
    result: {
      candidates: result.candidates,
      comparisons: added.reduce((total, answer) => total + answer.comparisons, calculation.result.comparisons),
      durationMs: added.reduce((total, answer) => total + answer.durationMs, calculation.result.durationMs),
      backend: combineCalculationBackends([calculation.result.backend, ...added.map((answer) => answer.backend)]),
    },
  };
}

/**
 * A Grindstone answers *Stat already grinded* (`grinded`, inclusive); a Gem
 * answers *Can change gem'ed stat?* (`gemChange`). Refusing a change of Gem stat
 * still permits the first Gem and a better same-stat Gem.
 */
export function craftMatchesChangeFilter(rune: Pick<Rune, 'subProperties'>, item: Pick<CraftItem, 'kind' | 'statId'>,
  choice: { grinded: readonly ('yes' | 'no')[]; gemChange: 'yes' | 'no' }): boolean {
  if (item.kind === 'grindstone') {
    const property = rune.subProperties.find((line) => line.statId === item.statId);
    return filterIncludes(choice.grinded, (property?.grind ?? 0) > 0 ? 'yes' : 'no', ['yes', 'no'] as const);
  }
  return choice.gemChange === 'yes'
    || rune.subProperties.every((line) => !line.gemmed || line.statId === item.statId);
}

/**
 * Only calculation inputs address the shared result; a filter cannot invalidate it.
 * The items and runes are left out: each pair is judged on its own, so a change to
 * the account extends or prunes the answer rather than discarding it
 * (`reconcileCraftCalculation`).
 */
export function craftCalculationKey(request: Omit<CraftRecommendationRequest, 'items' | 'missing' | 'runes'>): string {
  return JSON.stringify([request.roles, [...request.base], creditKey(request.settings.craftCredit),
    request.settings.acceptedRunes, request.settings.brokenRunes, request.settings.runeQuality,
    request.settings.intangibleRunes, request.roll]);
}

/** Bounded batches; sets are joined before every legal target meets every allowed role build. */
export async function recommendRuneCraft(request: CraftRecommendationRequest, scoreJobs: ScoreCraftJobs,
  progress?: (fraction: number) => void): Promise<CraftRecommendations> {
  const started = performance.now();
  const credit = request.settings.craftCredit;
  const scope = newRuneAdviceScope(rulerCraftCredit);
  const families = request.roles.map((role) => ({ role, builds: roleBuilds(role) }));
  const engines: CalculationBackend[] = [];
  const candidates: CraftRecommendation[] = [];
  let comparisons = 0;
  const bySet = new Map<number, CraftItem[]>();
  const anySet: CraftItem[] = [];
  for (const item of [...request.items, ...request.missing]) {
    if (item.setId === null) anySet.push(item);
    else { const set = bySet.get(item.setId) ?? []; set.push(item); bySet.set(item.setId, set); }
  }
  const itemsFor = (rune: Rune) => [...(bySet.get(rune.setId) ?? []), ...anySet];
  /* **One Best role, the one Clean-up and the overlay name.** It is chosen on the
     finished rune — the credited Gem and Grindstones in — so it already says what
     the rune is for once crafted. Every item is judged in that role's reading only,
     Gems and Grindstones alike: a stone once took whichever role scored highest on
     the bare rune, and the card then named a role the overlay did not. Judging a Gem
     in its own best role could also trade away the stat the rune is kept for. */
  const fitting = request.roles.length
    ? request.runes.filter((rune) => itemsFor(rune).some((item) => craftItemFit(item, rune).fits)) : [];
  const advice = fitting.length ? await runeAdvice(fitting, request.roles, request.settings, request.base, undefined, {
    references: qualityReferences(undefined, false),
    onLocalPreparation: (fraction) => { if (fraction !== null) progress?.(fraction / 4); },
    onProgress: (fraction) => progress?.((1 + fraction) / 4),
  }) : null;
  function prepare(rune: Rune) {
    const states: State[] = [];
    let baseline: State | undefined;
    for (const item of itemsFor(rune)) {
      const comparison = craftComparison(item, rune, request.roll);
      if (!comparison.applications.length) continue;
      if (!baseline) {
        baseline = { values: valuesOf(rune, comparison.baseline), evaluation: null };
        states.push(baseline);
      }
      for (const application of comparison.applications) {
        states.push({ values: valuesOf(rune, application.lines), evaluation: null, recommendation: { item, application, baseline } });
      }
    }
    const readings: CraftReading[] = [];
    const answer = advice?.get(rune.id);
    /* Where Clean-up names no role — a role it cannot read leaves a sale in doubt —
       there is no Best role to agree with, and every role still competes. */
    const best = answer?.role ?? null;
    const mains = answer?.buildMains ?? null;
    if (states.length > 1) {
      for (const { role, builds } of families) {
        const base = request.base.get(role.type);
        if (!base || (best && role.id !== best.id)) continue;
        for (const build of builds) {
          if (best && mains && (build.mains[2] !== mains[2] || build.mains[4] !== mains[4] || build.mains[6] !== mains[6])) continue;
          const candidate = prepareRuneCandidate(rune, role, build, base, noCraftCredit, scope);
          if (!candidate) continue;
          const discount = runeRankWorth(request.settings, candidate.rank);
          if (discount === 0) continue;
          const reading = { prices: Array.from({ length: craftScoreLayout.stats }, (_, stat) => candidate.valuation.value(stat, 1) / candidate.ceiling * 100),
            discount, role: role.name, rank: candidate.rank };
          readings.push(reading);
        }
      }
    }
    scope.futures.clear();
    return { rune, states, readings, gemChoice: gemChoiceOf(rune, readings, credit) };
  }
  // Combine small rune matrices before dispatch: thousands of tiny readbacks cost
  // more than their arithmetic. Both the retained plans and the score buffer stay bounded.
  for (let first = 0; first < request.runes.length; first += 32) {
    const plans = request.runes.slice(first, first + 32).map(prepare);
    let jobs: Array<CraftScoreJob & Pick<CraftReading, 'role' | 'rank'>> = [];
    let destinations: State[] = [];
    async function flush() {
      if (!jobs.length) return;
      const answer = await scoreJobs(jobs, request.preferGpu);
      engines.push(answer.backend);
      comparisons += jobs.length;
      jobs.forEach((job, at) => {
        const state = destinations[at];
        // The card narrows the contenders; the processor decides scores and ties in double precision.
        if (answer.result[at] + craftScoreUncertainty(answer.result[at]) < (state.evaluation?.score ?? -Infinity)) return;
        const score = craftScore(job);
        if (!state.evaluation || score > state.evaluation.score) state.evaluation = { score, role: job.role, rank: job.rank };
      });
      jobs = []; destinations = [];
    }
    for (const { states, readings } of plans) for (const state of states) for (const reading of readings) {
      jobs.push({ ...reading, values: state.values }); destinations.push(state);
      // At most 16,384 jobs: every storage binding is smaller than 2 MiB.
      if (jobs.length === 16384) await flush();
    }
    await flush();
    for (const { rune, states, readings, gemChoice } of plans) {
      const rows: CraftRecommendation[] = states.flatMap((state) => {
        const before = state.recommendation?.baseline.evaluation;
        if (!state.recommendation || !state.evaluation || !before) return [];
        const { item, application } = state.recommendation;
        return [{ rune, item, application, before, after: state.evaluation,
          gain: state.evaluation.score - before.score, stat: runeSubValue(application.result),
          gemChoice, readings }];
      });
      // A pair's baseline is fixed, so its best target wins score and gain alike.
      // Retain every pair, not just today's top N: tomorrow's filter may need any of them.
      const perItem = new Map<string, CraftRecommendation>();
      for (const row of rows) {
        const previous = perItem.get(row.item.id);
        if (!previous || row.after.score > previous.after.score
          || (row.after.score === previous.after.score && tie(row, previous) < 0)) perItem.set(row.item.id, row);
      }
      candidates.push(...perItem.values());
    }
    const scored = Math.min(first + 32, request.runes.length) / request.runes.length;
    progress?.(advice ? (1 + scored) / 2 : scored);
  }
  return { candidates, comparisons, backend: combineCalculationBackends(engines), durationMs: performance.now() - started };
}
