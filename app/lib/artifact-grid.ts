import type { Artifact, ArtifactSubProperty } from './artifacts';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { ArtifactCategory, ArtifactGrade } from './artifact-properties';
import { artifactCategoryLabels, artifactGradeOrder } from './artifact-properties';
import { monsterNameCollator } from './monster-grid';

export type ArtifactSortKey = 'index' | 'location' | 'value' | 'category' | 'equipClass' | 'grade' | 'mainProperty' | 'subProperties';

export type ArtifactRow = {
  artifact: Artifact;
  index: number;
  /** The wearer's display name, or `null` while the artifact sits in the inventory. */
  location: string | null;
  value: number | undefined;
  subProperties: ArtifactSubProperty[];
  /** `null` means this artifact is not currently worn by a judged monster. */
  subPropertyPreferences: ReadonlyMap<number, ArtifactPropertyPreference> | null;
};

/* Text sorts ascending because a name list reads from A; the value column
   sorts descending, because the question it answers is "which are best". */
export const defaultArtifactSortDirections: Record<ArtifactSortKey, boolean> = {
  index: true, location: true, value: false, category: true,
  equipClass: true, grade: false, mainProperty: true, subProperties: true,
};

/** Grade sorts by rarity rather than alphabetically: Legend outranks Rare. */
const gradeRank = new Map<ArtifactGrade, number>(artifactGradeOrder.map((grade, index) => [grade, index]));

export function artifactEquipClass(artifact: Artifact): string | null {
  return artifact.category === 'attribute' ? artifact.element : artifact.archetype;
}

export function artifactCategoryLabel(category: ArtifactCategory): string {
  return artifactCategoryLabels[category];
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
    if (left.value === undefined || right.value === undefined) {
      if (left.value === right.value) return 0;
      return left.value === undefined ? 1 : -1;
    }
    return (left.value - right.value) * direction;
  }
  if (key === 'grade') {
    return ((gradeRank.get(left.artifact.grade) ?? 0) - (gradeRank.get(right.artifact.grade) ?? 0)) * direction;
  }
  const text = (row: ArtifactRow): string | null => {
    if (key === 'location') return row.location;
    if (key === 'category') return artifactCategoryLabel(row.artifact.category);
    if (key === 'equipClass') return artifactEquipClass(row.artifact);
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

