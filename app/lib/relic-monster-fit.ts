import { relicEngravingLimit } from './relic-properties';
import type { Relic } from './relics';
import type { MonsterCopyPreferences } from './monster-preferences';
import { statedBand } from './monster-preferences';
import { honouredMainStat } from './main-stat-model';
import { relicMonsterValue } from './relic-monster-value';
import type { RelicMonsterModel, RelicMonsterValue } from './relic-monster-value';

export { relicEngravingLimit };
export type RelicCandidate = { relic: Relic; value: RelicMonsterValue };

/**
 * How well a relic answers the copy's stated choices: `0` where every stated
 * question is answered from its preferred band, `1` where one is answered only
 * from its acceptable band, and `undefined` where one is not answered at all.
 * A question never stated, or cleared to `Any`, is answered by every relic.
 *
 * The tier ranks ahead of the score, as a preferred artifact conversion
 * displaces an acceptable one (`ARTIFACT-CANONICAL.md` §17.5): accepting a
 * property says it will do when nothing preferred is to hand, so a strong
 * acceptable relic does not outrank a preferred one that is merely weaker.
 */
function relicTier(relic: Relic, preferences?: MonsterCopyPreferences): 0 | 1 | undefined {
  /* A main answer with nothing preferred is not an answer yet (`mainStatStatement`). */
  const mainStat = honouredMainStat(preferences);
  const bands = [
    mainStat === undefined ? 'preferred' : statedBand(mainStat, relic.mainProperty),
    preferences?.relics?.unique === undefined ? 'preferred' : statedBand(preferences.relics.unique, relic.unique.definition.id),
  ];
  if (bands.includes('unwanted')) return undefined;
  return bands.includes('acceptable') ? 1 : 0;
}

/** Only floating-point ties are suppressed, never a small mathematical upgrade. */
export const relicScoreTolerance = 1e-10;

export function rankRelicsForMonster(
  relics: readonly Relic[], model: RelicMonsterModel,
  engraved: ReadonlySet<string> = new Set(), preferences?: MonsterCopyPreferences,
): RelicCandidate[] {
  const candidates: Array<RelicCandidate & { tier: number }> = [];
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
  }).map(({ relic, value }) => ({ relic, value }));
}

export type RelicRecommendation = {
  monsterId: string;
  chosen: RelicCandidate | null;
  ideal: RelicCandidate | null;
  alreadyEngraved: boolean;
  limit: 'none' | 'capacity';
  unavailable: 'missing-stats' | 'no-priorities' | 'no-relics' | 'preferences' | 'capacity' | null;
  /** The sole roster-dependent annotation; it never affects the recommendation. */
  displaceableMonsters: number;
};

export type RelicAllocationSubject = {
  monsterId: string;
  model: RelicMonsterModel;
  engravedRelicIds: readonly string[];
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
 * new monstersByUnitId; proposals for other monsters never reserve places. Filters cannot
 * reach this calculation. A full relic stays available to its current monstersByUnitId.
 */
export function allocateRelicEngravings(
  subjects: readonly RelicAllocationSubject[], relics: readonly Relic[],
  currentEngravings: ReadonlyMap<string, number>, limit = relicEngravingLimit,
): RelicAllocation {
  const engravings = new Map(relics.map((relic) => [relic.id, currentEngravings.get(relic.id) ?? 0]));
  const ranked = new Map<string, RelicCandidate[]>();
  const engravedScores = new Map<string, number[]>();
  for (const subject of subjects) {
    const engraved = new Set(subject.engravedRelicIds);
    ranked.set(subject.monsterId, rankRelicsForMonster(relics, subject.model, engraved, subject.preferences));
    // Preferences constrain recommendations, not the value the monster it is engraved on receives.
    for (const relic of relics) {
      if (!engraved.has(relic.id)) continue;
      const value = relicMonsterValue(relic, subject.model);
      if (!value) continue;
      const scores = engravedScores.get(relic.id);
      if (scores) scores.push(value.score);
      else engravedScores.set(relic.id, [value.score]);
    }
  }
  for (const scores of engravedScores.values()) scores.sort((left, right) => left - right);
  const recommendations = new Map<string, RelicRecommendation>();
  for (const subject of subjects) {
    const engraved = new Set(subject.engravedRelicIds);
    const candidates = ranked.get(subject.monsterId) ?? [];
    const ideal = candidates[0] ?? null;
    const chosen = candidates.find((candidate) => engraved.has(candidate.relic.id)
      || (engravings.get(candidate.relic.id) ?? 0) < limit) ?? null;
    const blocked = Boolean(ideal && chosen?.relic.id !== ideal.relic.id);
    const unavailable = chosen ? null
      : subject.model.status !== 'ready' ? subject.model.status
        : !relics.length ? 'no-relics'
          : !candidates.length ? 'preferences' : 'capacity';
    recommendations.set(subject.monsterId, {
      monsterId: subject.monsterId, chosen, ideal,
      alreadyEngraved: chosen ? engraved.has(chosen.relic.id) : false,
      limit: blocked ? 'capacity' : 'none', unavailable,
      displaceableMonsters: blocked && ideal
        ? countBelow(engravedScores.get(ideal.relic.id) ?? [], ideal.value.score) : 0,
    });
  }
  const saturated = new Set([...engravings].filter(([, count]) => count >= limit).map(([id]) => id));
  return { recommendations, engravings, saturated };
}

export function assertRelicAllocation(
  allocation: RelicAllocation, subjects: readonly RelicAllocationSubject[], limit = relicEngravingLimit,
): void {
  const known = new Map(subjects.map((subject) => [subject.monsterId, new Set(subject.engravedRelicIds)]));
  if (known.size !== subjects.length) throw new Error('Relic allocation received duplicate monster identifiers.');
  if (allocation.recommendations.size !== known.size) {
    throw new Error('Relic allocation must answer for every monster exactly once.');
  }
  for (const [monsterId, recommendation] of allocation.recommendations) {
    if (!known.has(monsterId)) throw new Error('Relic allocation answered for a monster outside its scope.');
    const relicId = recommendation.chosen?.relic.id;
    if (relicId === undefined || known.get(monsterId)?.has(relicId)) continue;
    if ((allocation.engravings.get(relicId) ?? 0) >= limit) {
      throw new Error(`Relic allocation recommended full relic ${relicId} to another monster.`);
    }
  }
}
