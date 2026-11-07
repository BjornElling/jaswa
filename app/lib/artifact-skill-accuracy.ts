import type { Artifact } from './artifacts';
import type { ArtifactCategory, ArtifactGrade } from './artifact-properties';
import type { MonsterArchetype } from './monster-catalog';

/**
 * The Accuracy an engraved artifact adds to one skill — `[Skill 1] Accuracy`
 * through `[Skill 3] Accuracy` — for *Leads and bonuses* to name beside the
 * leads.
 *
 * **Shown, never counted.** The line raises the Accuracy of one skill as it is
 * used, not the monster's ACC, so no ACC figure, range, shortfall or build
 * search reads it: counting it into ACC would credit every skill with what only
 * one gets, and the Accuracy goal would look met by a skill that never applies
 * a debuff. That is why this lives apart from `TeamLeadReading.bonuses`, which
 * every calculation reads (`RUNE-OPTIMIZATION.md` §2.2.3).
 */
export type ArtifactSkillAccuracy = {
  artifactId: string;
  category: ArtifactCategory;
  /* What the line's emblem draws: the artifact's grade and class. */
  grade: ArtifactGrade;
  element: string | null;
  archetype: MonsterArchetype | null;
  skill: 1 | 2 | 3;
  /** Hundredths of a percentage point, as the artifact line carries it. */
  valueHundredths: number;
};

const skillOfProperty: Readonly<Record<number, 1 | 2 | 3>> = { 407: 1, 408: 2, 409: 3 };

/** Every skill-Accuracy line on the given artifacts, by skill. */
export function artifactSkillAccuracy(artifacts: readonly Artifact[]): ArtifactSkillAccuracy[] {
  return artifacts.flatMap((artifact) => artifact.subProperties.flatMap((line) => {
    const skill = skillOfProperty[line.definition.id];
    return skill === undefined ? []
      : [{ artifactId: artifact.id, category: artifact.category, grade: artifact.grade, element: artifact.element,
        archetype: artifact.archetype, skill, valueHundredths: line.valueHundredths }];
  })).sort((left, right) => left.skill - right.skill);
}
