import { relicEngravingLimit } from './relic-properties';
import type { Relic } from './relics';
import type { MonsterCopyPreferences } from './monster-preferences';
import { relicMonsterValue } from './relic-monster-value';
import type { RelicMonsterModel, RelicMonsterValue } from './relic-monster-value';

export { relicEngravingLimit };
export type RelicCandidate = { relic: Relic; value: RelicMonsterValue };

/** Saved choices constrain the search; a cleared menu says Any, as the overlay does. */
function acceptsRelic(relic: Relic, preferences?: MonsterCopyPreferences): boolean {
  const mains = preferences?.relics?.main;
  const uniques = preferences?.relics?.unique;
  return (!mains?.length || mains.includes(relic.mainProperty))
    && (!uniques?.length || uniques.includes(relic.unique.definition.id));
}

/** Only floating-point ties are suppressed, never a small mathematical upgrade. */
export const relicScoreTolerance = 1e-10;

export function rankRelicsForMonster(
  relics: readonly Relic[], model: RelicMonsterModel,
  worn: ReadonlySet<string> = new Set(), preferences?: MonsterCopyPreferences,
): RelicCandidate[] {
  const candidates: RelicCandidate[] = [];
  for (const relic of relics) {
    if (!acceptsRelic(relic, preferences)) continue;
    const value = relicMonsterValue(relic, model);
    if (value) candidates.push({ relic, value });
  }
  return candidates.sort((left, right) => {
    const difference = right.value.score - left.value.score;
    return (Math.abs(difference) > relicScoreTolerance ? difference : 0)
      || Number(worn.has(right.relic.id)) - Number(worn.has(left.relic.id))
      || left.relic.obtainedOrder - right.relic.obtainedOrder;
  });
}

export type RelicRecommendation = {
  monsterId: string;
  chosen: RelicCandidate | null;
  ideal: RelicCandidate | null;
  alreadyEngraved: boolean;
  limit: 'none' | 'capacity';
  unavailable: 'missing-stats' | 'no-priorities' | 'no-relics' | 'preferences' | 'capacity' | null;
  /** The sole roster-dependent annotation; it never affects the recommendation. */
  displaceableWearers: number;
};

export type RelicAllocationSubject = {
  monsterId: string;
  model: RelicMonsterModel;
  wornRelicIds: readonly string[];
  preferences?: MonsterCopyPreferences;
};

export type RelicAllocation = {
  recommendations: Map<string, RelicRecommendation>;
  /** Today's imported engraving counts, never reservations for proposed changes. */
  engravings: Map<string, number>;
  saturated: ReadonlySet<string>;
};

function countBelow(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value - relicScoreTolerance) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Each monster gets its own best available relic. Today's 150 engravings gate
 * new wearers; proposals for other monsters never reserve places. Filters cannot
 * reach this calculation. A full relic stays available to its current wearers.
 */
export function allocateRelicEngravings(
  subjects: readonly RelicAllocationSubject[], relics: readonly Relic[],
  currentEngravings: ReadonlyMap<string, number>, limit = relicEngravingLimit,
): RelicAllocation {
  const engravings = new Map(relics.map((relic) => [relic.id, currentEngravings.get(relic.id) ?? 0]));
  const ranked = new Map<string, RelicCandidate[]>();
  const wearerScores = new Map<string, number[]>();
  for (const subject of subjects) {
    const worn = new Set(subject.wornRelicIds);
    ranked.set(subject.monsterId, rankRelicsForMonster(relics, subject.model, worn, subject.preferences));
    // Preferences constrain recommendations, not the value a current wearer receives.
    for (const relic of relics) {
      if (!worn.has(relic.id)) continue;
      const value = relicMonsterValue(relic, subject.model);
      if (!value) continue;
      const scores = wearerScores.get(relic.id);
      if (scores) scores.push(value.score);
      else wearerScores.set(relic.id, [value.score]);
    }
  }
  for (const scores of wearerScores.values()) scores.sort((left, right) => left - right);
  const recommendations = new Map<string, RelicRecommendation>();
  for (const subject of subjects) {
    const worn = new Set(subject.wornRelicIds);
    const candidates = ranked.get(subject.monsterId) ?? [];
    const ideal = candidates[0] ?? null;
    const chosen = candidates.find((candidate) => worn.has(candidate.relic.id)
      || (engravings.get(candidate.relic.id) ?? 0) < limit) ?? null;
    const blocked = Boolean(ideal && chosen?.relic.id !== ideal.relic.id);
    const unavailable = chosen ? null
      : subject.model.status !== 'ready' ? subject.model.status
        : !relics.length ? 'no-relics'
          : !candidates.length ? 'preferences' : 'capacity';
    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId, chosen, ideal,
      alreadyEngraved: chosen ? worn.has(chosen.relic.id) : false,
      limit: blocked ? 'capacity' : 'none', unavailable,
      displaceableWearers: blocked && ideal
        ? countBelow(wearerScores.get(ideal.relic.id) ?? [], ideal.value.score) : 0,
    });
  }
  const saturated = new Set([...engravings].filter(([, count]) => count >= limit).map(([id]) => id));
  return { recommendations, engravings, saturated };
}

export function assertRelicAllocation(
  allocation: RelicAllocation, subjects: readonly RelicAllocationSubject[], limit = relicEngravingLimit,
): void {
  const known = new Map(subjects.map((subject) => [subject.monsterId, new Set(subject.wornRelicIds)]));
  if (known.size !== subjects.length) throw new Error('Relic allocation received duplicate monster identifiers.');
  if (allocation.recommendations.size !== known.size) {
    throw new Error('Relic allocation must answer for every monster exactly once.');
  }
  for (const [monsterId, recommendation] of allocation.recommendations) {
    if (!known.has(monsterId)) throw new Error('Relic allocation answered for a monster outside its scope.');
    const relicId = recommendation.chosen?.relic.id;
    if (relicId === undefined || known.get(monsterId)?.has(relicId)) continue;
    if ((allocation.engravings.get(relicId) ?? 0) >= limit) {
      throw new Error(`Relic allocation recommended full relic ${relicId} to a new wearer.`);
    }
  }
}
