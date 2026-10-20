import type { Artifact, ArtifactSubProperty } from './artifacts';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { ArtifactCategory, ArtifactGrade } from './artifact-properties';
import { artifactCategoryLabels, artifactGradeOrder, artifactIntangibleLabel } from './artifact-properties';
import { monsterNameCollator } from './monster-grid';

/**
 * The orderings the artifact table offers. Every rendered column is here
 * (`ACCOUNT-TABLES.md` §1), plus `subProperty` for the substat-specific ranking the filter
 * dropdown drives, which has no column of its own.
 *
 * `refinement` and `subProperty` are ordered by the table component itself
 * rather than by `compareArtifactRows`: the first reads a flag off the artifact
 * and the second needs the chosen property, which is not a property of the two
 * rows being compared.
 */
import type { Engraving } from './presets';

export type ArtifactSortKey = 'index' | 'location' | 'value' | 'category' | 'engraveClass' | 'grade' | 'mainProperty' | 'subProperties' | 'refinement' | 'subProperty';

export type ArtifactRow = {
  artifact: Artifact;
  index: number;
  /**
   * Every place the artifact is engraved — a monster in Scenario or in a preset
   * (`DECK-PRESETS.md` §1) — in words, "monster — preset", or `Inventory` where
   * it is on none. What a sort and a search read; the cell shows the places.
   */
  location: string;
  places: readonly Engraving[];
  /* The one monster this row names, where it is engraved in a single place and
     the roster has that monster. Carried so the Location cell can open that
     monster's overlay rather than naming a monster it could not point at. */
  /** The one place it is engraved, where it has one: its monster, in that place's preset. */
  engravedOn?: { unitId: string; masterId: string; presetId: string };
  /**
   * How well the artifact scores on the monster it is engraved on, in whole percentage
   * points, or `undefined` when nothing judged it — an artifact in the
   * inventory, or a monster with no recorded preferences. Whole points because
   * that is what a score *is* (`ARTIFACT-CANONICAL.md` §17.1), so the row
   * carries the number the column shows and the band is read from the same
   * value the user sees rather than from an unrounded one behind it.
   */
  valuePercent: number | undefined;
  mainPropertyPreference: ArtifactPropertyPreference;
  subProperties: ArtifactSubProperty[];
  /** `null` means this artifact is not currently engraved on a judged monster. */
  subPropertyPreferences: ReadonlyMap<number, ArtifactPropertyPreference> | null;
};

/* Text sorts ascending because a name list reads from A; the value column
   sorts descending, because the question it answers is "which are best". */
export const defaultArtifactSortDirections: Record<ArtifactSortKey, boolean> = {
  index: true, location: true, value: false, category: true,
  engraveClass: true, grade: false, mainProperty: true, subProperties: true,
  /* Both gather their interesting rows at the descending end: the unrefined
     flag marks work to do, and a substat ranking leads with the best roll. */
  refinement: false, subProperty: false,
};

/** Grade sorts by rarity rather than alphabetically: Legend outranks Rare. */
const gradeRank = new Map<ArtifactGrade, number>(artifactGradeOrder.map((grade, index) => [grade, index]));

/**
 * The single class this artifact restricts to, or `null` when it restricts to
 * none. Use `artifactEngraveClassLabel` for display: `null` means Intangible, not
 * unknown, and every reader must have already rejected a class it cannot name.
 */
export function artifactEngraveClass(artifact: Artifact): string | null {
  return artifact.category === 'attribute' ? artifact.element : artifact.archetype;
}

/**
 * The engrave class as the interface names it — an element, a monster type, or
 * `Intangible` for the wildcard the game calls an "Intangible Type Artifact".
 *
 * Always returns a name. An artifact whose class JASWA cannot name never
 * reaches the interface, because `readArtifact` rejects it under `AGENTS.md`
 * §0.1 rather than importing a piece it would then hide.
 */
export function artifactEngraveClassLabel(artifact: Artifact): string {
  return artifactEngraveClass(artifact) ?? artifactIntangibleLabel;
}

export function artifactCategoryLabel(category: ArtifactCategory): string {
  return artifactCategoryLabels[category];
}

/**
 * How well an artifact scores, in the three bands the interface reads it in:
 * worth acting on, respectable, and not worth the slot. The boundaries are
 * whole percentage points because scores are (`ARTIFACT-CANONICAL.md` §17.1).
 *
 * They live here rather than in each view because the recommendation table and
 * the library judge the same number, and two tables disagreeing about what
 * counts as a good score would be worse than either boundary being wrong.
 */
export const artifactValueBands = { strong: 75, fair: 50 } as const;

/**
 * The `data-tint` value that paints a score, for spreading onto an element:
 * `<td {...artifactValueTint(percent)}>`. Gold at the top band — the one place
 * a *fact* wears the accent, and it earns it by being the fact the user acts
 * on; full ink in the middle; the established dim for a score that argues
 * against using the artifact at all.
 *
 * An absent score is not a low one but an unjudged one, and keeps the separate
 * `muted` reading its callers already give it — so this takes a number, and a
 * caller with nothing to show does not call it.
 */
export function artifactValueTint(percent: number): { 'data-tint': string } {
  if (percent >= artifactValueBands.strong) return { 'data-tint': 'score-strong' };
  if (percent >= artifactValueBands.fair) return { 'data-tint': 'score-fair' };
  return { 'data-tint': 'score-weak' };
}

/**
 * The text portion of a sub property. The number goes through the caller's
 * formatter so the list follows the user's regional settings the way every
 * other figure in the app does — `formatNumber` needs the settings, which a
 * lib module has no business reaching for itself. The caller adds visual marks
 * for conversion and power-ups around this stable text.
 */
export function displaySubProperty(
  subProperty: ArtifactSubProperty,
  format: (value: number) => string,
): string {
  return `${subProperty.definition.name} ${subProperty.definition.valueSign ?? '+'}${format(subProperty.valueHundredths / 100)}%`;
}

export function compareArtifactRows(
  left: ArtifactRow,
  right: ArtifactRow,
  key: ArtifactSortKey,
  direction: number,
): number {
  if (key === 'value') {
    /* An unjudged artifact has no place in the ranking either way round, so it
       sorts last in both directions rather than leading the ascending pass. */
    if (left.valuePercent === undefined || right.valuePercent === undefined) {
      if (left.valuePercent === right.valuePercent) return 0;
      return left.valuePercent === undefined ? 1 : -1;
    }
    return (left.valuePercent - right.valuePercent) * direction;
  }
  if (key === 'grade') {
    return ((gradeRank.get(left.artifact.grade) ?? 0) - (gradeRank.get(right.artifact.grade) ?? 0)) * direction;
  }
  /* Named here rather than left to the text fallback, which would compare these
     two on their substat names and quietly return a plausible wrong order. Both
     are ordered where they are declared — see `ArtifactSortKey`. */
  if (key === 'index' || key === 'refinement' || key === 'subProperty') return 0;
  const text = (row: ArtifactRow): string | null => {
    if (key === 'location') return row.location;
    if (key === 'category') return artifactCategoryLabel(row.artifact.category);
    /* Intangible sorts under its own name rather than as a missing value: it is
       a class the user can look for, not an absence. */
    if (key === 'engraveClass') return artifactEngraveClassLabel(row.artifact);
    if (key === 'mainProperty') return row.artifact.mainProperty;
    /* Sorted on the property names alone: the column groups artifacts that
       carry the same properties, and folding the rolled values in would order
       it by a number the user is not looking at. */
    return row.subProperties.map((subProperty) => subProperty.definition.name).join(' ');
  };
  const leftText = text(left);
  const rightText = text(right);
  if (leftText === null || rightText === null) {
    if (leftText === rightText) return 0;
    return leftText === null ? 1 : -1;
  }
  return monsterNameCollator.compare(leftText, rightText) * direction;
}

