import { calculateArtifactOptimalValue } from './artifact-optimal-value';
import { defaultPropertyPreferences } from './artifact-preferences';
import type { Artifact } from './artifacts';

/**
 * How fully an artifact rolled on what its current wearer's monster type wants.
 * The one measure, `calculateArtifactOptimalValue`, is left to do the judging;
 * this only supplies it with the preferences and the roll fractions.
 *
 * `undefined` means the question does not apply — the artifact is unequipped,
 * the wearer is unknown, the monster type has no recorded preferences, or a
 * legacy line makes the artifact unjudgeable. Under §19.5 that is shown
 * as *not judged*, never as a zero: every artifact would score zero against an
 * unjudged type, and a zero sorts and reads as an answer.
 */
export function artifactValueOnMonster(
  artifact: Artifact,
  masterId: unknown,
  acceptableWorth: number,
): number | undefined {
  const preferences = defaultPropertyPreferences(masterId, artifact.category);
  if (!preferences) return undefined;

  const subProperties = [];
  for (const subProperty of artifact.subProperties) {
    const preference = preferences.sub.get(subProperty.definition.id) ?? 'unwanted';
    /* A legacy line has no known range (§12), so how well it rolled cannot be
       computed — but it also cannot matter. The statistics record only what the
       drop pool still produces, so a property absent from them is `unwanted`,
       and an unwanted line weighs zero whatever it rolled. Standing in a
       full roll for it keeps the arithmetic honest rather than discarding an
       otherwise judgeable artifact; a legacy line the user could somehow
       prefer is refused instead of guessed at. */
    if (subProperty.maximumHundredths === null) {
      if (preference !== 'unwanted') return undefined;
      subProperties.push({ preference, value: 1, maximum: 1 });
      continue;
    }
    subProperties.push({
      preference,
      value: subProperty.valueHundredths,
      maximum: subProperty.maximumHundredths,
    });
  }

  return calculateArtifactOptimalValue({
    acceptableWorth,
    hasPropertyPreferences: true,
    mainPreference: preferences.main[artifact.mainProperty],
    subProperties,
  });
}
