import { calculateArtifactOptimalValue } from './artifact-optimal-value';
import { artifactPreferenceStatus, defaultPropertyPreferences } from './artifact-preferences';
import { scoringSettings } from './artifact-recommendations';
import { artifactFitsMonster } from './compute/artifact-score-input';
import { monsterSpeciesId } from './monster-species';
import type { Artifact } from './artifacts';
import type { ArtifactSettings } from './types';

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
 *
 * That last point is why `artifactPreferenceStatus` gates this and not just
 * `defaultPropertyPreferences`. A species whose statistics exist but express no
 * usable property is `empty`, and against it every artifact scores exactly
 * zero — the number §19.5 forbids standing in for "not judged". The packed
 * scorer has always refused those, so the library did too or the same artifact
 * would read "0 %" here and "not judged" on the optimization pages. Nothing in
 * the shipped statistics is `empty` today; the gate is here so the two readers
 * cannot answer differently on the day one is.
 */
export function artifactValueOnMonster(
  artifact: Artifact,
  masterId: unknown,
  /* The whole settings object, not the one field this happens to need today.
     `scoringSettings` is the single classification of which settings define a
     calculation, so taking the object puts this reader through the same door as
     the packed scorer: a setting added there reaches the library column by
     being used here, rather than by somebody remembering to widen a parameter
     list. The library column used to take a bare `acceptableWorth`, and that is
     precisely how one view came to read one setting where the others read
     eight. */
  settings: ArtifactSettings,
): number | undefined {
  const { acceptableWorth } = scoringSettings(settings);
  const preferences = defaultPropertyPreferences(masterId, artifact.category);
  if (!preferences) return undefined;
  if (artifactPreferenceStatus(masterId, artifact.category) !== 'scorable') return undefined;
  /* The equip rule (§1) decides whether the question can be asked at all. This
     reader used to score whatever pair it was handed, so an artifact the game
     would never let a monster wear still got a number here while the
     optimization pages, which do apply the rule, called it not judged. */
  if (!artifactFitsMonster(artifact, monsterSpeciesId(masterId))) return undefined;

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
