import statistics from '../data/engraving-statistics.json';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainProperties } from './artifact-properties';

type EffectCount = { effectId: number; count: number; slotId?: number };
type MonsterStatistics = { artifacts?: { primaryEffect?: EffectCount[]; secondaryEffect?: EffectCount[] } };

const monsterStatistics = (statistics as { monsters: Record<string, MonsterStatistics> }).monsters;

/* The category as the statistics slot it: the game serves both artifact slots
   from one panel, and slot 1 is the Attribute artifact, slot 2 the Type one —
   the same numbering the export's own `slot` field uses. */
const categorySlots: Record<ArtifactCategory, number> = { attribute: 1, type: 2 };

/**
 * Decision 29's thresholds, as shares of the property's own distribution.
 * Main Property has three values against each sub-property list's 23, so one
 * threshold would either discard useful main alternatives or call most sub
 * properties desirable.
 */
const thresholds = {
  main: { preferred: 0.4, acceptable: 0.1 },
  sub: { preferred: 0.1, acceptable: 0.05 },
} as const;

export type ArtifactPropertyPreferences = {
  main: Record<ArtifactMainProperty, ArtifactPropertyPreference>;
  sub: Map<number, ArtifactPropertyPreference>;
};

function classify(share: number, limits: { preferred: number; acceptable: number }): ArtifactPropertyPreference {
  if (share >= limits.preferred) return 'preferred';
  if (share >= limits.acceptable) return 'acceptable';
  return 'unwanted';
}

function totalCount(rows: EffectCount[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/**
 * What the community equips on this monster type, in this artifact category,
 * turned into preferences by decision 29's fixed shares.
 *
 * `undefined` where the dataset has not captured this monster type — 396 of
 * 1,086 are recorded, so an uncaptured type is the ordinary case rather than an
 * edge one, and decision 18 requires it to read as *not judged* rather than as
 * a score of zero.
 *
 * These are defaults only. When the user's own per-type preferences arrive they
 * take precedence wherever they are stated, and are consulted nowhere else
 * (decision 28).
 */
export function defaultPropertyPreferences(
  masterId: unknown,
  category: ArtifactCategory,
): ArtifactPropertyPreferences | undefined {
  const key = typeof masterId === 'number' || typeof masterId === 'string' ? String(masterId) : null;
  const artifacts = key === null ? undefined : monsterStatistics[key]?.artifacts;
  if (!artifacts) return undefined;

  const slot = categorySlots[category];
  const primary = (artifacts.primaryEffect ?? []).filter((row) => row.slotId === slot);
  const secondary = (artifacts.secondaryEffect ?? []).filter((row) => row.slotId === slot);
  /* A captured type with no observations in this slot cannot be judged either:
     dividing by its total would be a division by zero, and the honest answer is
     the same "not judged" an uncaptured type gets. */
  const primaryTotal = totalCount(primary);
  const secondaryTotal = totalCount(secondary);
  if (!primaryTotal || !secondaryTotal) return undefined;

  const main: Record<ArtifactMainProperty, ArtifactPropertyPreference> = {
    HP: 'unwanted', ATK: 'unwanted', DEF: 'unwanted',
  };
  for (const row of primary) {
    const property = artifactMainProperties[row.effectId];
    if (property) main[property] = classify(row.count / primaryTotal, thresholds.main);
  }

  const sub = new Map<number, ArtifactPropertyPreference>();
  for (const row of secondary) sub.set(row.effectId, classify(row.count / secondaryTotal, thresholds.sub));

  return { main, sub };
}
