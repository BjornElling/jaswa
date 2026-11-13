import { relicEngravingLimit } from './relic-properties';
import type { Relic } from './relics';
import type { MonsterCopyPreferences } from '../profiles/monster-preferences';
import { statedAnswer, statedBand } from '../profiles/monster-preferences';
import { honouredMainStat } from '../combat/main-stat-model';
import { relicMonsterValue } from './relic-monster-value';
import type { RelicMonsterModel, RelicMonsterValue } from './relic-monster-value';

export { relicEngravingLimit };
export type RelicCandidate = { relic: Relic; value: RelicMonsterValue };

/** Whether the copy has said anything the plan must honour about its relic. */
function statesRelic(preferences?: MonsterCopyPreferences): boolean {
  return honouredMainStat(preferences) !== undefined || statedAnswer(preferences?.relics?.unique) !== undefined;
}

/**
 * How well a relic answers the copy's stated choices: `0` where every stated
 * question is answered from its preferred band, `1` where one is answered only
 * from its acceptable band, and `undefined` where one is not answered at all.
 * A question never stated, or with both bands emptied, is answered by every relic.
 *
 * The tier ranks ahead of the score, as a preferred artifact conversion
 * displaces an acceptable one (`ARTIFACT-CANONICAL.md` §17.5): accepting a
 * property says it will do when nothing preferred is to hand, so a strong
 * acceptable relic does not outrank a preferred one that is merely weaker.
 */
function relicTier(relic: Relic, preferences?: MonsterCopyPreferences): 0 | 1 | undefined {
  /* A main answer with nothing preferred is not an answer yet (`mainStatStatement`). */
  const mainStat = honouredMainStat(preferences);
  const unique = statedAnswer(preferences?.relics?.unique);
  const bands = [
    mainStat === undefined ? 'preferred' : statedBand(mainStat, relic.mainProperty),
    unique === undefined ? 'preferred' : statedBand(unique, relic.unique.definition.id),
  ];
  if (bands.includes('unwanted')) return undefined;
  return bands.includes('acceptable') ? 1 : 0;
}

/** Only floating-point ties are suppressed, never a small mathematical upgrade. */
export const relicScoreTolerance = 1e-10;

type TieredCandidate = RelicCandidate & { tier: 0 | 1 };

function tieredCandidates(
  relics: readonly Relic[], model: RelicMonsterModel,
  engraved: ReadonlySet<string>, preferences?: MonsterCopyPreferences,
): TieredCandidate[] {
  const candidates: TieredCandidate[] = [];
  for (const relic of relics) {
    const tier = relicTier(relic, preferences);
    if (tier === undefined) continue;
    const value = relicMonsterValue(relic, model);
    if (value) candidates.push({ relic, value, tier });
  }
  return candidates.sort((left, right) => {
    const difference = right.value.score - left.value.score;
    return left.tier - right.tier
      || (Math.abs(difference) > relicScoreTolerance ? difference : 0)
      || Number(engraved.has(right.relic.id)) - Number(engraved.has(left.relic.id))
      || left.relic.obtainedOrder - right.relic.obtainedOrder;
  });
}

/** One monster's relics from best to worst, as if it had the account to itself. */
export function rankRelicsForMonster(
  relics: readonly Relic[], model: RelicMonsterModel,
  engraved: ReadonlySet<string> = new Set(), preferences?: MonsterCopyPreferences,
): RelicCandidate[] {
  return tieredCandidates(relics, model, engraved, preferences).map(({ relic, value }) => ({ relic, value }));
}

export type RelicRecommendation = {
  monsterId: string;
  /** The relic the plan gives this monster, within every relic's places. */
  chosen: RelicCandidate | null;
  /** The relic this monster would take if no other monster wanted a place. */
  ideal: RelicCandidate | null;
  alreadyEngraved: boolean;
  /** `capacity` where the ideal's places went to monsters the plan puts first. */
  limit: 'none' | 'capacity';
  unavailable: 'missing-stats' | 'no-priorities' | 'no-relics' | 'preferences' | 'capacity' | null;
};

export type RelicAllocationSubject = {
  monsterId: string;
  model: RelicMonsterModel;
  engravedRelicIds: readonly string[];
  preferences?: MonsterCopyPreferences;
};

export type RelicAllocation = {
  recommendations: Map<string, RelicRecommendation>;
  /** Today's imported engraving counts, as the game holds them. */
  engravings: Map<string, number>;
  /** The counts once every recommendation is followed; none exceeds the limit. */
  planned: Map<string, number>;
  /** Relics at the limit today. */
  saturated: ReadonlySet<string>;
};

/*
 * What one placement costs the plan, compared position by position:
 *
 * 0. a stated copy that misses its preferred band — the user's preferred
 *    answer is a claim on a place, and no gain elsewhere outbids it;
 * 1. a stated copy left without any relic it accepts;
 * 2. the score given up, as minus the score;
 * 3. a monster moved off the relic it carries (1), or left with none (2), so
 *    equal plans keep the account as it is and leave nobody empty-handed.
 *
 * Only position 2 is fractional, and only it is compared with a tolerance.
 */
type Cost = [number, number, number, number];
const costTolerance = 1e-9;

function plus(left: Cost, right: Cost): Cost {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2], left[3] + right[3]];
}

function minus(left: Cost, right: Cost): Cost {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2], left[3] - right[3]];
}

function compareCost(left: Cost, right: Cost): number {
  for (let at = 0; at < 4; at++) {
    const difference = left[at] - right[at];
    const tolerance = at === 2 ? costTolerance : 0;
    if (difference < -tolerance) return -1;
    if (difference > tolerance) return 1;
  }
  return 0;
}

type Planned = {
  subject: RelicAllocationSubject;
  candidates: TieredCandidate[];
  /** Cost of each class this monster can take, by class index; the last index is "no relic". */
  costs: Map<number, Cost>;
};

/**
 * One plan for the whole roster: every monster gets at most one relic, no relic
 * goes past its limit, and among all such plans the one chosen is best by
 * `Cost` — first the user's stated preferred answers, then the summed score.
 *
 * This is a minimum-cost assignment, solved exactly by successive shortest
 * paths. Relics whose value is identical on every monster are pooled into one
 * class with their places summed, which keeps the search to the handful of
 * distinct relics an account holds rather than every copy. A monster whose best
 * class has a free place takes it directly — in an optimal partial plan no
 * longer path can beat that — and only a full class sends the search through
 * the monsters already on it, moving each to its next best place.
 *
 * Monsters the plan does not cover still hold their places: a Material copy, or
 * one nothing can score, keeps what it carries and the capacity left is what
 * the rest share. Filters cannot reach this calculation.
 */
export function allocateRelicEngravings(
  subjects: readonly RelicAllocationSubject[], relics: readonly Relic[],
  currentEngravings: ReadonlyMap<string, number>, limit = relicEngravingLimit,
): RelicAllocation {
  const engravings = new Map(relics.map((relic) => [relic.id, currentEngravings.get(relic.id) ?? 0]));
  const planned: Planned[] = [];
  const inert: Array<{ subject: RelicAllocationSubject; candidates: TieredCandidate[] }> = [];
  for (const subject of subjects) {
    const candidates = tieredCandidates(relics, subject.model, new Set(subject.engravedRelicIds), subject.preferences);
    if (candidates.length) planned.push({ subject, candidates, costs: new Map() });
    else inert.push({ subject, candidates });
  }

  /* A monster outside the plan keeps its place; one inside it gives its place
     back to the pool the plan shares out. */
  const outside = new Map(relics.map((relic) => [relic.id, engravings.get(relic.id) ?? 0]));
  for (const { subject } of planned) {
    for (const id of new Set(subject.engravedRelicIds)) {
      if (outside.has(id)) outside.set(id, Math.max(0, outside.get(id)! - 1));
    }
  }
  const free = new Map(relics.map((relic) => [relic.id, Math.max(0, limit - outside.get(relic.id)!)]));

  /* Pool relics that every planned monster values identically. */
  const valueOn = planned.map(({ candidates }) => new Map(candidates.map((candidate) => [candidate.relic.id, candidate])));
  const classOf = new Map<string, number>();
  const classes: Relic[][] = [];
  const keys = new Map<string, number>();
  for (const relic of relics) {
    if (!(free.get(relic.id)! > 0)) continue;
    const key = valueOn.map((byRelic) => {
      const candidate = byRelic.get(relic.id);
      return candidate ? `${candidate.tier}:${candidate.value.score}` : '-';
    }).join('|');
    let index = keys.get(key);
    if (index === undefined) {
      index = classes.length;
      keys.set(key, index);
      classes.push([]);
    }
    classes[index].push(relic);
    classOf.set(relic.id, index);
  }
  const none = classes.length;
  const room = [...classes.map((members) => members.reduce((sum, relic) => sum + free.get(relic.id)!, 0)), Infinity];

  for (const entry of planned) {
    const stated = statesRelic(entry.subject.preferences);
    const carries = new Set(entry.subject.engravedRelicIds);
    for (const candidate of entry.candidates) {
      const index = classOf.get(candidate.relic.id);
      if (index === undefined) continue;
      const keeps = classes[index].some((relic) => carries.has(relic.id));
      const cost: Cost = [stated && candidate.tier !== 0 ? 1 : 0, 0, -candidate.value.score, keeps ? 0 : 1];
      const known = entry.costs.get(index);
      if (!known || compareCost(cost, known) < 0) entry.costs.set(index, cost);
    }
    /* No relic is the last resort: a relic with a free place and no gain still
       beats it, so a monster reads No capacity only where there is none. */
    entry.costs.set(none, [stated ? 1 : 0, stated ? 1 : 0, 0, 2]);
  }

  const assigned = new Array<number>(planned.length);
  const members: Array<Set<number>> = Array.from({ length: none + 1 }, () => new Set());
  const load = (index: number) => members[index].size;

  planned.forEach((entry, at) => {
    let best = none;
    for (const [index, cost] of entry.costs) {
      if (compareCost(cost, entry.costs.get(best)!) < 0) best = index;
    }
    if (load(best) < room[best]) {
      assigned[at] = best;
      members[best].add(at);
      return;
    }
    /* Shortest path over classes: arriving at a full class means one of its
       monsters moves on, at the difference of its two costs. */
    const distance = new Array<Cost | undefined>(none + 1);
    const previous = new Array<{ from: number; mover: number } | undefined>(none + 1);
    const queued = new Array<boolean>(none + 1).fill(false);
    const visits = new Array<number>(none + 1).fill(0);
    const queue: number[] = [];
    for (const [index, cost] of entry.costs) {
      distance[index] = cost;
      queue.push(index);
      queued[index] = true;
    }
    while (queue.length) {
      const from = queue.shift()!;
      queued[from] = false;
      if (load(from) < room[from]) continue;
      if (++visits[from] > 4 * (none + 2)) throw new Error('Relic allocation found a cycle that improves itself.');
      for (const mover of members[from]) {
        const costs = planned[mover].costs;
        const leaving = costs.get(from)!;
        for (const [to, cost] of costs) {
          if (to === from) continue;
          const through = plus(distance[from]!, minus(cost, leaving));
          if (distance[to] !== undefined && compareCost(through, distance[to]!) >= 0) continue;
          distance[to] = through;
          previous[to] = { from, mover };
          if (!queued[to]) {
            queued[to] = true;
            queue.push(to);
          }
        }
      }
    }
    let end = none;
    for (let index = 0; index <= none; index++) {
      if (distance[index] === undefined || load(index) >= room[index]) continue;
      if (compareCost(distance[index]!, distance[end]!) < 0) end = index;
    }
    for (let to = end, step = previous[to]; step; to = step.from, step = previous[to]) {
      members[step.from].delete(step.mover);
      members[to].add(step.mover);
      assigned[step.mover] = to;
    }
    let start = end;
    while (previous[start]) start = previous[start]!.from;
    assigned[at] = start;
    members[start].add(at);
  });

  /* A class's places are named relics again: each monster keeps the copy it
     carries where it can, and the rest fill copies in the order they were
     obtained. */
  const seats = new Map(free);
  const given = new Map<number, Relic>();
  for (let index = 0; index < none; index++) {
    const waiting: number[] = [];
    for (const at of [...members[index]].sort((left, right) => left - right)) {
      const kept = classes[index].find((relic) =>
        planned[at].subject.engravedRelicIds.includes(relic.id) && seats.get(relic.id)! > 0);
      if (kept) {
        given.set(at, kept);
        seats.set(kept.id, seats.get(kept.id)! - 1);
      } else waiting.push(at);
    }
    const order = [...classes[index]].sort((left, right) => left.obtainedOrder - right.obtainedOrder);
    for (const at of waiting) {
      const relic = order.find((copy) => seats.get(copy.id)! > 0)!;
      given.set(at, relic);
      seats.set(relic.id, seats.get(relic.id)! - 1);
    }
  }

  const plannedCounts = new Map(outside);
  const recommendations = new Map<string, RelicRecommendation>();
  planned.forEach((entry, at) => {
    const { subject, candidates } = entry;
    const relic = given.get(at);
    const chosen = relic ? candidates.find((candidate) => candidate.relic.id === relic.id)! : null;
    if (relic) plannedCounts.set(relic.id, plannedCounts.get(relic.id)! + 1);
    const first = candidates[0];
    /* A twin of the ideal is the ideal: the same value, another copy. */
    const ideal = chosen && classOf.get(first.relic.id) === classOf.get(chosen.relic.id) ? chosen : first;
    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId,
      chosen: chosen ? { relic: chosen.relic, value: chosen.value } : null,
      ideal: { relic: ideal.relic, value: ideal.value },
      alreadyEngraved: chosen ? subject.engravedRelicIds.includes(chosen.relic.id) : false,
      limit: chosen === ideal ? 'none' : 'capacity',
      unavailable: chosen ? null : 'capacity',
    });
  });
  for (const { subject } of inert) {
    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId, chosen: null, ideal: null, alreadyEngraved: false, limit: 'none',
      unavailable: subject.model.status !== 'ready' ? subject.model.status : !relics.length ? 'no-relics' : 'preferences',
    });
  }
  const saturated = new Set([...engravings].filter(([, count]) => count >= limit).map(([id]) => id));
  return { recommendations, engravings, planned: plannedCounts, saturated };
}

export function assertRelicAllocation(
  allocation: RelicAllocation, subjects: readonly RelicAllocationSubject[], limit = relicEngravingLimit,
): void {
  const known = new Set(subjects.map((subject) => subject.monsterId));
  if (known.size !== subjects.length) throw new Error('Relic allocation received duplicate monster identifiers.');
  if (allocation.recommendations.size !== known.size) {
    throw new Error('Relic allocation must answer for every monster exactly once.');
  }
  for (const monsterId of allocation.recommendations.keys()) {
    if (!known.has(monsterId)) throw new Error('Relic allocation answered for a monster outside its scope.');
  }
  for (const [relicId, count] of allocation.planned) {
    /* The plan may leave a relic over its limit only where monsters outside it already hold it so. */
    if (count > Math.max(limit, allocation.engravings.get(relicId) ?? 0)) {
      throw new Error(`Relic allocation puts relic ${relicId} on more than ${limit} monsters.`);
    }
  }
}
