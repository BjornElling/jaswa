import statistics from '../data/engraving-statistics.json';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { speciesMainStatAdvice } from './main-stat-model';
import { monsterSpeciesId, monsterStatisticsId } from './monster-identity';

type EffectCount = { effectId: number; count: number; slotId?: number };
type MonsterStatistics = { artifacts?: { observedAt?: string; primaryEffect?: EffectCount[]; secondaryEffect?: EffectCount[] } };

const recordedStatistics = (statistics as { monsters: Record<string, MonsterStatistics> }).monsters;

/* A collaboration pair is one monster the game released under two names, and the
   game's own Statistics panel proves it: for all 112 pairs captured on both
   sides, the two ids return byte-identical distributions down to the last count.
   The population is shared, not merely comparable.

   So the two rows are one observation seen twice, and the merge takes the later
   one rather than adding them — summing would double every count and claim twice
   the evidence that exists. The shares below are unchanged by the choice of
   member, which is what makes it safe.

   Resolving happens here, at the point of reading, so the dataset on disk stays a
   faithful record of what was observed under each name, and a catalogue sync that
   corrects a pairing takes effect without rewriting 3.9 MB of history. */
function observedAt(entry: MonsterStatistics | undefined): string {
  return entry?.artifacts?.observedAt ?? '';
}

const monsterStatistics: Record<string, MonsterStatistics> = {};
for (const [masterId, recorded] of Object.entries(recordedStatistics)) {
  const speciesId = monsterSpeciesId(masterId);
  const existing = monsterStatistics[speciesId];
  if (!existing || observedAt(recorded) > observedAt(existing)) monsterStatistics[speciesId] = recorded;
}

/** Monster species whose recorded distributions can support a real judgement. */
export const recordedArtifactPreferenceMonsterIds = Object.keys(monsterStatistics);

/* The category as the statistics slot it: the game serves both artifact slots
   from one panel, and slot 1 is the Attribute artifact, slot 2 the Type one —
   the same numbering the export's own `slot` field uses. */
const categorySlots: Record<ArtifactCategory, number> = { attribute: 1, type: 2 };

/**
 * `ARTIFACT-CANONICAL.md` §19.3's sub-property thresholds, as shares of the
 * property's own distribution. The main is not polled at all: it is the
 * main-stat model's answer for the species (`main-stat-model.ts`).
 */
const thresholds = {
  sub: { preferred: 0.1, acceptable: 0.05 },
} as const;

export type ArtifactPropertyPreferences = {
  main: Record<ArtifactMainProperty, ArtifactPropertyPreference>;
  sub: Map<number, ArtifactPropertyPreference>;
  /** Each sub property's share of its own slot's distribution, for ordering within one preference band. */
  subShares: Map<number, number>;
};

/** A category can only produce a useful score when both its main and sub-property
 * distributions express at least one preference. A partial panel is not a
 * licence to invent the missing half of the judgement. */
export type ArtifactPreferenceStatus = 'scorable' | 'missing' | 'empty';

function classify(share: number, limits: { preferred: number; acceptable: number }): ArtifactPropertyPreference {
  if (share >= limits.preferred) return 'preferred';
  if (share >= limits.acceptable) return 'acceptable';
  return 'unwanted';
}

function totalCount(rows: EffectCount[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/**
 * What this monster species wants in this artifact category: the main from the
 * main-stat model, the substats from what the community engraves, turned into
 * preferences by `ARTIFACT-CANONICAL.md` §19.3's fixed shares. A
 * master id resolves to its species first, so a collaboration monster and its
 * generic twin answer alike whichever name the player's copy carries.
 *
 * `undefined` where the dataset has not captured this species — most are not, so
 * an uncaptured one is the ordinary case rather than an edge one, and §19.5
 * requires it to read as *not judged* rather than as a score of zero.
 *
 * These are defaults only. When the user's own per-type preferences arrive they
 * take precedence wherever they are stated, and are consulted nowhere else
 * (§19.4).
 */
export function defaultPropertyPreferences(
  masterId: unknown,
  category: ArtifactCategory,
): ArtifactPropertyPreferences | undefined {
  const key = typeof masterId === 'number' || typeof masterId === 'string'
    ? monsterStatisticsId(masterId)
    : null;
  const artifacts = key === null ? undefined : monsterStatistics[key]?.artifacts;
  if (!artifacts) return undefined;

  const slot = categorySlots[category];
  const secondary = (artifacts.secondaryEffect ?? []).filter((row) => row.slotId === slot);
  /* A captured type with no observations in this slot cannot be judged either:
     dividing by its total would be a division by zero, and the honest answer is
     the same "not judged" an uncaptured type gets. */
  const secondaryTotal = totalCount(secondary);
  const advice = speciesMainStatAdvice(masterId);
  if (!secondaryTotal || advice === undefined) return undefined;

  const main: Record<ArtifactMainProperty, ArtifactPropertyPreference> = { ...advice.artifact.bands };

  const sub = new Map<number, ArtifactPropertyPreference>();
  const subShares = new Map<number, number>();
  for (const row of secondary) {
    const share = row.count / secondaryTotal;
    sub.set(row.effectId, classify(share, thresholds.sub));
    subShares.set(row.effectId, share);
  }

  return { main, sub, subShares };
}

/**
 * Keeps the two honest non-score answers distinct in every caller: statistics
 * may be absent altogether, or they may exist but express no usable property.
 */
export function artifactPreferenceStatus(
  masterId: unknown,
  category: ArtifactCategory,
): ArtifactPreferenceStatus {
  const preferences = defaultPropertyPreferences(masterId, category);
  if (!preferences) return 'missing';
  const hasMain = Object.values(preferences.main).some((preference) => preference !== 'unwanted');
  const hasSub = [...preferences.sub.values()].some((preference) => preference !== 'unwanted');
  return hasMain && hasSub ? 'scorable' : 'empty';
}
