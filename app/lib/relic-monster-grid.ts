import { monsterPresentation } from './monster-catalog';
import type { MonsterArchetype } from './monster-catalog';
import { compareNumbersWithBlanks, compareTextWithBlanks } from './monster-grid';
import { relicPropertyLabel } from './relic-properties';
import type { Relic } from './relics';
import { relicEngravingLimit } from './relic-monster-fit';
import type { RelicCandidate, RelicRecommendation } from './relic-monster-fit';
import type { RelicUsageStatistics } from './relic-monster-statistics';

/**
 * What the plan asks of one monster.
 *
 * The four are a closed set, and the fourth is the one worth naming. A relic is
 * shared equipment with a hard ceiling, so an account can own relics, own
 * monsters, and still have monsters the plan can put nothing on — every relic
 * good enough to reach them is already carrying its full 150. That is a real
 * state of the account and not an error, so it gets a verdict of its own rather
 * than an empty cell.
 */
export type RelicMonsterVerdict = 'engrave' | 'replace' | 'keep' | 'none';

/** Most actionable first, which is the order the Advice column opens on. */
export const relicMonsterVerdictOrder: readonly RelicMonsterVerdict[] = [
  'engrave', 'replace', 'keep', 'none',
];

export const relicMonsterVerdictLabels: Record<RelicMonsterVerdict, string> = {
  engrave: 'Engrave',
  replace: 'Replace',
  keep: 'Keep',
  none: 'No capacity',
};

/**
 * Whether this monster can carry a relic at all.
 *
 * **Material monsters wear no equipment**, which `ENGRAVING-STATISTICS.md` §4
 * states as the reason the capture list leaves all twelve of them out. On this
 * page that is not a cosmetic matter: engraving capacity is finite, so a
 * Rainbowmon handed a place on the account's best relic takes it from a monster
 * that could have used it — and an account holds fodder by the dozen.
 *
 * It excludes only what the catalogue positively calls Material. An archetype of
 * `none` is an unmapped monster rather than a fodder one, and a monster JASWA
 * cannot classify stays in the plan: hiding a row on a guess is the failure
 * `AGENTS.md` §0.1 is about, and over-including one costs a place at worst.
 */
export function isRelicEngravableMonster(masterId: unknown): boolean {
  return monsterPresentation(masterId).archetype !== 'Material';
}

export type RelicMonsterSortKey =
  | 'index' | 'name' | 'element' | 'archetype' | 'level'
  | 'current' | 'recommended' | 'mainStat' | 'uniqueStat' | 'advice';

export type RelicMonsterRow = {
  unitId: string;
  masterId: string;
  index: number;
  name: string;
  secondaryName?: string;
  searchAliases?: string[];
  element?: string;
  archetype?: MonsterArchetype;
  imageFilename?: string;
  initial: string;
  /** In Monster Storage; its complement is the roster the game calls Inventory. */
  inStorage: boolean;
  level: number | null;
  /** The relics this monster wears today, in the order the export lists them. */
  worn: readonly Relic[];
  recommendation: RelicRecommendation;
  verdict: RelicMonsterVerdict;
  reason: string;
  /** The panel behind the two readings, for the title that makes them arguable. */
  usage: RelicUsageStatistics | undefined;
  /**
   * The recommended relic's two halves, each as a share of the best that half
   * could be on this monster (`relicHalvesAgainstOptimum`), and the same two
   * readings for the relic it wears today — which is what the columns are read
   * against when the page is asking for a change.
   */
  recommendedHalves: { main: number | null; unique: number | null };
  currentHalves: { main: number | null; unique: number | null };
};

export function relicMonsterVerdict(recommendation: RelicRecommendation, worn: readonly Relic[]): RelicMonsterVerdict {
  if (!recommendation.chosen) return 'none';
  if (recommendation.alreadyEngraved) return 'keep';
  return worn.length ? 'replace' : 'engrave';
}

/**
 * The one line under the verdict, and it stays empty unless there is something
 * the columns cannot already say.
 *
 * **Only two facts earn a line.** Capacity, because it is the sole reason the
 * row is showing anything but the monster's best relic and nothing else on the
 * page reveals that. And the state of the statistics, because it says how far
 * the Fit beside it can be trusted — a fit assembled from population averages
 * is a different claim from one measured on this monster, and the number alone
 * cannot tell them apart.
 *
 * **The tiers deliberately get no line.** A row saying "Both halves are
 * favoured here" next to a Fit of 100 % is the same fact written twice, and the
 * one in the Advice column is the vaguer of the two. The tiers and their
 * observed shares are in the Fit cell's own title, where they explain the
 * number rather than competing with it.
 *
 * The order is a priority and not a list: a row has one binding reason.
 */
export function relicMonsterReason(row: {
  recommendation: RelicRecommendation;
  verdict: RelicMonsterVerdict;
}): string {
  const { recommendation, verdict } = row;
  if (verdict === 'none') return 'Every fit relic is full.';
  const chosen = recommendation.chosen;
  if (!chosen) return '';
  if (recommendation.limit === 'capacity') return `Best one is at its ${relicEngravingLimit} limit.`;
  if (chosen.suitability.status === 'missing') return 'No statistics; using averages.';
  return '';
}

/** A relic as this table names it: the property, then its main and its level. */
export function relicMonsterRelicLabel(relic: Relic): string {
  return relicPropertyLabel(relic.unique.definition);
}

/**
 * The main property and the power-up level, under the property's name.
 *
 * The level is written `(lvl. 12)` rather than `+12` because it sits directly
 * beside a main property, and `HP +12` reads as twelve points of HP — which is
 * exactly the quantity `AGENTS.md` §5 says a main property never states. The
 * library table's own `+12` column has no stat next to it and keeps the short
 * form.
 */
export function relicMonsterRelicDetail(relic: Relic): string {
  return `${relic.mainProperty} (lvl. ${relic.level})`;
}

/**
 * The text a relic column orders by, or `null` where the row carries no relic.
 * Ordering on the property name puts a monster's relics together by family,
 * which is what a reader scanning for "who else is on Nimble Primal" wants; the
 * level only breaks ties inside one family.
 */
function relicSortText(relic: Relic | undefined): string | null {
  return relic ? `${relicMonsterRelicLabel(relic)} ${relic.mainProperty}` : null;
}

function currentRelic(row: RelicMonsterRow): Relic | undefined {
  return row.worn[0];
}

function chosenCandidate(row: RelicMonsterRow): RelicCandidate | null {
  return row.recommendation.chosen;
}

/**
 * Which way a column points when it is first clicked: the useful end. Identity
 * columns open at their natural start, and everything that carries a judgement
 * or a magnitude opens at its largest.
 */
export const defaultRelicMonsterSortDirections: Record<RelicMonsterSortKey, boolean> = {
  index: true, name: true, element: true, archetype: true,
  level: false, current: true, recommended: true,
  mainStat: false, uniqueStat: false, advice: true,
};

/**
 * Every comparison is written ascending — the one direction `useSortedRows`
 * accepts — and the row's import order is the stated fallback, so equal rows
 * keep one order whichever way a column points.
 */
export function compareRelicMonsterRows(
  left: RelicMonsterRow, right: RelicMonsterRow, key: RelicMonsterSortKey,
): number {
  switch (key) {
    case 'index':
      return left.index - right.index;
    case 'name':
      return compareTextWithBlanks(left.name, right.name, 1);
    case 'element':
      return compareTextWithBlanks(left.element ?? null, right.element ?? null, 1);
    case 'archetype':
      return compareTextWithBlanks(left.archetype ?? null, right.archetype ?? null, 1);
    case 'level':
      return compareNumbersWithBlanks(left.level, right.level, 1);
    case 'current':
      return compareTextWithBlanks(relicSortText(currentRelic(left)), relicSortText(currentRelic(right)), 1)
        || (currentRelic(left)?.level ?? 0) - (currentRelic(right)?.level ?? 0);
    case 'recommended':
      return compareTextWithBlanks(
        relicSortText(chosenCandidate(left)?.relic), relicSortText(chosenCandidate(right)?.relic), 1,
      ) || (chosenCandidate(left)?.relic.level ?? 0) - (chosenCandidate(right)?.relic.level ?? 0);
    case 'mainStat':
      return compareNumbersWithBlanks(left.recommendedHalves.main, right.recommendedHalves.main, 1);
    case 'uniqueStat':
      return compareNumbersWithBlanks(left.recommendedHalves.unique, right.recommendedHalves.unique, 1);
    case 'advice':
      return relicMonsterVerdictOrder.indexOf(left.verdict) - relicMonsterVerdictOrder.indexOf(right.verdict);
    default:
      return 0;
  }
}

/**
 * What a row answers to in the search field: everything the row shows and
 * nothing it does not. A search that matched a hidden figure would return rows
 * for no visible reason.
 */
export function relicMonsterSearchText(row: RelicMonsterRow): string {
  const chosen = row.recommendation.chosen;
  return [
    row.name,
    row.secondaryName ?? '',
    row.element ?? '',
    row.worn.map((relic) => `${relicMonsterRelicLabel(relic)} ${relicMonsterRelicDetail(relic)}`).join(' '),
    chosen ? `${relicMonsterRelicLabel(chosen.relic)} ${relicMonsterRelicDetail(chosen.relic)}` : '',
    relicMonsterVerdictLabels[row.verdict],
    row.reason,
  ].join(' ').toLowerCase();
}
