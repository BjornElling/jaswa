import { effectSlotCount, effectSlotOf } from './monster-stats';
import type { Candidate, RuneOptimizationProblem } from './rune-optimization-problem';
import { ceilingEffectSlots } from './rune-optimization-ranges';

type Choice = { stock: number; value: number };
type Operation = { kind: 'gem' | 'grindstone'; statId: number; line: number; choices: Choice[]; key: number };
type Recipe = { indexes: number[]; operations: Operation[]; variants: Map<string, number> };
type Edge = { to: number; reverse: number; capacity: number; cost: number };

export const craftRecipeKey = (candidate: Candidate): string =>
  `${candidate.runeId}|${candidate.gemmedAt}|${candidate.lines.map((line) => line.statId)}`;

/** Ceiling-sensitive work is fixed; only independent, monotone operations are deferred. */
export function craftAllocationKey(
  candidate: Candidate, capped: ReadonlySet<number>, stock: RuneOptimizationProblem['stock'],
): string {
  if (capped.size === 0) return craftRecipeKey(candidate);
  return `${craftRecipeKey(candidate)}|${candidate.lines.map((line) => capped.has(effectSlotOf(line.statId))
    ? `${line.value}:${line.grind}` : '').join(',')}|${candidate.stock
    .filter((at) => capped.has(effectSlotOf(stock[at].statId))).sort((a, b) => a - b)}`;
}

/** Assign at most six lines to held stacks, with the greatest total contribution. */
function assign(operations: Operation[], stock: RuneOptimizationProblem['stock']): Choice[] | null {
  const best = operations.map((operation) => operation.choices[0]);
  const spent = new Map<number, number>();
  for (const choice of best) if (choice.stock >= 0) spent.set(choice.stock, (spent.get(choice.stock) ?? 0) + 1);
  if ([...spent].every(([at, count]) => count <= stock[at].amount)) return best;
  const stacks = [...new Set(operations.flatMap((operation) => operation.choices.map((choice) => choice.stock)))].sort((a, b) => a - b);
  const sink = 1 + operations.length + stacks.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  function edge(from: number, to: number, capacity: number, cost: number): Edge {
    const forward = { to, reverse: graph[to].length, capacity, cost };
    const backward = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward); graph[to].push(backward);
    return forward;
  }
  const offered = operations.map((operation, at) => {
    edge(0, at + 1, 1, 0);
    return operation.choices.map((choice) => ({ choice,
      edge: edge(at + 1, 1 + operations.length + stacks.indexOf(choice.stock), 1, -choice.value) }));
  });
  stacks.forEach((stack, at) => edge(1 + operations.length + at, sink,
    stack < 0 ? operations.length : Math.min(operations.length, stock[stack].amount), 0));
  for (let sent = 0; sent < operations.length; sent += 1) {
    const distance = new Float64Array(graph.length).fill(Infinity);
    const previous = new Int32Array(graph.length).fill(-1);
    const via = new Int32Array(graph.length);
    distance[0] = 0;
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      for (let from = 0; from < graph.length; from += 1) {
        if (!Number.isFinite(distance[from])) continue;
        for (const [at, link] of graph[from].entries()) {
          const next = distance[from] + link.cost;
          if (link.capacity > 0 && next < distance[link.to]) {
            distance[link.to] = next; previous[link.to] = from; via[link.to] = at; changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (previous[sink] < 0) return null;
    for (let to = sink; to !== 0; to = previous[to]) {
      const link = graph[previous[to]][via[to]];
      link.capacity -= 1; graph[to][link.reverse].capacity += 1;
    }
  }
  return offered.map((choices) => choices.find((choice) => choice.edge.capacity === 0)!.choice);
}

/**
 * Once ceiling-sensitive work and six Gem placements are fixed, more of each
 * remaining stat cannot hurt. Grades and stones need only maximize its sum.
 * Item kinds and stat ids have disjoint stacks, so small independent matchings
 * replace the Cartesian product of every grade and optional Grindstone.
 * All options come from legal end states supplied by rune-craft-end-state; this
 * module knows neither a craft table nor a placement rule.
 */
export type CraftAllocationPreparation = {
  sourceSlots: Candidate[][];
  slots: Candidate[][];
  recipes: Recipe[][];
  originalToRecipe: Int32Array[];
};

const planKey = (candidate: Pick<Candidate, 'lines' | 'stock'>) =>
  `${candidate.lines.map((line) => `${line.value}:${line.grind}`)}|${[...candidate.stock].sort((a, b) => a - b)}`;

export function prepareCraftAllocation(source: RuneOptimizationProblem): CraftAllocationPreparation | null {
  const capped = ceilingEffectSlots(source.ceilings);
  const recipes: Recipe[][] = [];
  const originalToRecipe: Int32Array[] = [];
  const operationKeys = new Map<string, number>();
  const slots = source.slots.map((slot, own) => {
    const groups = new Map<string, number[]>();
    slot.forEach((candidate, at) => {
      const key = craftAllocationKey(candidate, capped, source.stock);
      const group = groups.get(key) ?? []; group.push(at); groups.set(key, group);
    });
    const mapping = new Int32Array(slot.length);
    const here: Recipe[] = [];
    const candidates: Candidate[] = [];
    for (const indexes of groups.values()) {
      const first = slot[indexes[0]];
      const operations: Operation[] = [];
      for (const [line, property] of first.lines.entries()) {
        if (capped.has(effectSlotOf(property.statId))) continue;
        for (const kind of line === first.gemmedAt ? ['gem', 'grindstone'] as const : ['grindstone'] as const) {
          const choices = new Map<number, number>();
          for (const index of indexes) {
            const candidate = slot[index];
            const stack = candidate.stock.find((at) => source.stock[at].kind === kind && source.stock[at].statId === property.statId) ?? -1;
            const value = kind === 'gem' ? candidate.lines[line].value : candidate.lines[line].grind;
            choices.set(stack, Math.max(choices.get(stack) ?? -Infinity, value));
          }
          const offered = [...choices].map(([stock, value]) => ({ stock, value })).sort((a, b) => b.value - a.value || a.stock - b.stock);
          const signature = offered.map((choice) => `${choice.stock}:${choice.value}`).join(',');
          if (!operationKeys.has(signature)) operationKeys.set(signature, operationKeys.size);
          operations.push({ kind, statId: property.statId, line, choices: offered, key: operationKeys.get(signature)! });
        }
      }
      indexes.forEach((index) => { mapping[index] = here.length; });
      const variants = new Map<string, number>();
      for (const index of indexes) {
        const key = planKey(slot[index]);
        if (!variants.has(key)) variants.set(key, index);
      }
      here.push({ indexes, operations, variants });
      candidates.push({ ...first, stock: first.stock.filter((at) => capped.has(effectSlotOf(source.stock[at].statId))),
        effects: Float64Array.from({ length: effectSlotCount }, (_, stat) =>
        indexes.reduce((maximum, at) => Math.max(maximum, slot[at].effects[stat]), 0)) });
    }
    recipes[own] = here; originalToRecipe[own] = mapping;
    return candidates;
  });
  if (slots.every((slot, at) => slot.length === source.slots[at].length)) return null;
  return { sourceSlots: source.slots, slots, recipes, originalToRecipe };
}

export function craftAllocation(source: RuneOptimizationProblem): {
  problem: RuneOptimizationProblem; resolve: (picks: readonly number[]) => number[] | null;
} | null {
  const prepared = source.craft?.sourceSlots === source.slots ? source.craft : prepareCraftAllocation(source);
  if (!prepared) return null;
  const { slots, recipes, originalToRecipe } = prepared;
  const matchingCache = new Map<string, Choice[] | null>();
  return {
    problem: { ...source, slots, guides: source.guides.map((guide) => guide.map((pick, at) => originalToRecipe[at][pick])) },
    resolve(picks) {
      const selected = picks.map((pick, at) => recipes[at][pick]);
      const groups = new Map<string, { slot: number; operation: Operation }[]>();
      selected.forEach((recipe, slot) => recipe.operations.forEach((operation) => {
        const key = `${operation.kind}|${operation.statId}`;
        const group = groups.get(key) ?? []; group.push({ slot, operation }); groups.set(key, group);
      }));
      const lines = selected.map((recipe, at) => source.slots[at][recipe.indexes[0]].lines.map((line) => ({ ...line })));
      const spends: number[][] = picks.map((pick, at) => [...slots[at][pick].stock]);
      for (const group of groups.values()) {
        const key = group.map((entry) => entry.operation.key).join(',');
        if (!matchingCache.has(key)) {
          // A set/grade supply pattern recurs on thousands of rune combinations.
          // Eviction only repeats the same matching; it changes no answer.
          if (matchingCache.size >= 4096) matchingCache.delete(matchingCache.keys().next().value!);
          matchingCache.set(key, assign(group.map((entry) => entry.operation), source.stock));
        }
        const choices = matchingCache.get(key)!;
        if (!choices) return null;
        choices.forEach((choice, at) => {
          const { slot, operation } = group[at];
          if (operation.kind === 'gem') lines[slot][operation.line].value = choice.value;
          else lines[slot][operation.line].grind = choice.value;
          if (choice.stock >= 0) spends[slot].push(choice.stock);
        });
      }
      return selected.map((recipe, at) => {
        const index = recipe.variants.get(planKey({ lines: lines[at], stock: spends[at] }));
        if (index === undefined) throw new Error('A craft allocation has no legal end state.');
        return index;
      });
    },
  };
}
