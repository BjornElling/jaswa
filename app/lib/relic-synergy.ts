import table from '../data/relic-synergy.json';
import type { RelicMainProperty } from './relic-properties';

/**
 * How well a relic's main property and its unique property go together, taken
 * from what the wider player base actually engraves.
 *
 * `docs/RELIC-CANONICAL.md` §5 states the method and why it is this one rather
 * than a hand-written table of opinions. The short version: the game's own
 * Relic Engraving Statistics panel reports, per monster, which main properties
 * and which unique properties are engraved on it. Monsters differ in what they
 * want, so a main property and a unique property that suit the same monsters
 * appear together more often than two drawn independently would. That excess is
 * the measurement — and it is a measurement, over millions of engravings, not a
 * ranking somebody wrote down.
 *
 * It needs nothing to be known about what a unique property *does*, which is
 * what makes it usable across all sixteen families while only five have been
 * read off the panel.
 *
 * **The table is derived, not read live.** `scripts/build-relic-synergy.mjs`
 * reduces the 6.5 MB capture to these 48 numbers, because a page that imported
 * the capture would make every visitor download the whole archive to be told
 * that HP and Valiant go together. `npm run verify:relic-synergy` re-derives it
 * from the statistics and fails if the committed file has drifted, which is
 * what keeps one derived value from becoming a second source of truth.
 */

export type RelicSynergyBand = 'exceptional' | 'strong' | 'neutral' | 'weak' | 'poor';

export type RelicSynergy = {
  band: RelicSynergyBand;
  /**
   * The association in standard deviations, within this main property's own
   * sixteen. Positive means the pair is engraved together more than chance.
   */
  score: number;
  /** Observed pairings over expected-under-independence; `1` is chance. */
  lift: number;
  /** The pair's share of every relic engraving observed, as a fraction. */
  reach: number;
};

type SynergyFile = {
  monsterTypes: number;
  engravings: number;
  cells: Record<string, { score: number; lift: number; reach: number }>;
};

const file = table as SynergyFile;

/**
 * The five bands, on the standardised score.
 *
 * Symmetric by construction, so a band is a statement about the evidence rather
 * than a quota: the outer pair name an association a standard deviation clear
 * of this main property's average partner, the inner pair a third of one, and
 * the middle band is the range in which the evidence does not separate the pair
 * from an ordinary one. Across the 48 cells they come out at 11 / 8 / 11 / 9 /
 * 9, which is what `npm run verify:relic-synergy` holds them to.
 */
const bandBoundaries: ReadonlyArray<{ band: RelicSynergyBand; atLeast: number }> = [
  { band: 'exceptional', atLeast: 1 },
  { band: 'strong', atLeast: 0.35 },
  { band: 'neutral', atLeast: -0.35 },
  { band: 'weak', atLeast: -1 },
  { band: 'poor', atLeast: Number.NEGATIVE_INFINITY },
];

function bandFor(score: number): RelicSynergyBand {
  for (const boundary of bandBoundaries) if (score >= boundary.atLeast) return boundary.band;
  return 'poor';
}

/* Banded once, on read of the module, so no view can arrive at a different
   grade for the same score. */
const synergyTable = new Map<string, RelicSynergy>(
  Object.entries(file.cells).map(([key, cell]) => [key, { ...cell, band: bandFor(cell.score) }]),
);

/**
 * The synergy of one main property with one unique property, or `null` when the
 * statistics hold nothing about the pair. `null` is not a low grade: it means
 * unjudged, and every view has to keep the two apart.
 */
export function relicSynergy(main: RelicMainProperty, propertyId: number): RelicSynergy | null {
  return synergyTable.get(`${main}:${propertyId}`) ?? null;
}

export const relicSynergyBandOrder: readonly RelicSynergyBand[] = [
  'exceptional', 'strong', 'neutral', 'weak', 'poor',
];

export const relicSynergyBandLabels: Record<RelicSynergyBand, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  neutral: 'Neutral',
  weak: 'Weak',
  poor: 'Poor',
};

/**
 * Ascending, weakest fit first, which is the direction `useSortedRows` expects
 * a comparison to be written in — the table reverses it for the descending pass
 * the column opens on. An unjudged pair has no place in the ranking and sorts
 * to the end of the ascending pass.
 */
export function compareRelicSynergy(left: RelicSynergy | null, right: RelicSynergy | null): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return left.score - right.score;
}

/** How many monster types the panels behind this table were captured from. */
export const relicSynergyMonsterCount = file.monsterTypes;
/** How many relic engravings those panels report. */
export const relicSynergyEngravingCount = file.engravings;
