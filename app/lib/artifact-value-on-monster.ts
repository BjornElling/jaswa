import { calculateArtifactOptimalValue } from './artifact-optimal-value';
import { artifactPreferenceStatus, defaultPropertyPreferences } from './artifact-preferences';
import { scoringSettings } from './artifact-recommendations';
import { artifactFitsMonster } from './compute/artifact-score-input';
import { artifactPropertyIndex } from './compute/artifact-score-schema';
import { monsterSpeciesId } from './monster-identity';
import { canEquipArtifacts } from './monster-equipment-eligibility';
import type { Artifact } from './artifacts';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { MonsterCopyPreferences } from './monster-preferences';
import { statedBand } from './monster-preferences';
import type { ArtifactSettings } from './types';
import type { GameRecord } from './game-data';

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
  monster: GameRecord,
  /* The whole settings object, not the one field this happens to need today.
     `scoringSettings` is the single classification of which settings define a
     calculation, so taking the object puts this reader through the same door as
     the packed scorer: a setting added there reaches the library column by
     being used here, rather than by somebody remembering to widen a parameter
     list. The library column used to take a bare `acceptableWorth`, and that is
     precisely how one view came to read one setting where the others read
     eight. */
  settings: ArtifactSettings,
  /* What the copy wearing this artifact says it is for, where its owner has
     said anything. Optional because most callers are asking about a species —
     "what is this artifact worth on a Lushen" — and only a caller holding one
     owned copy can answer for that copy. */
  stated?: MonsterCopyPreferences,
): number | undefined {
  if (!canEquipArtifacts(monster)) return undefined;
  const masterId = monster.unit_master_id;
  const { acceptableWorth } = scoringSettings(settings);
  const preferences = defaultPropertyPreferences(masterId, artifact.category);
  if (!preferences) return undefined;
  if (artifactPreferenceStatus(masterId, artifact.category) !== 'scorable') return undefined;
  /* The equip rule (§1) decides whether the question can be asked at all. This
     reader used to score whatever pair it was handed, so an artifact the game
     would never let a monster wear still got a number here while the
     optimization pages, which do apply the rule, called it not judged. */
  if (!artifactFitsMonster(artifact, monsterSpeciesId(masterId))) return undefined;

  /* The user's own answers replace the statistics rather than blending with
     them (§19.4), band for band — the same `statedBand` the packed scorer
     reads, so the two cannot place one property differently. A legacy property
     is outside every vocabulary the user answers from — even `Any` — exactly as
     it is outside the packed scorer's. */
  const statedSubs = stated?.artifacts?.sub?.[artifact.category];
  const statedMains = stated?.mainStat;
  const preferenceFor = (id: number): ArtifactPropertyPreference => {
    if (statedSubs === undefined) return preferences.sub.get(id) ?? 'unwanted';
    return artifactPropertyIndex.has(id) ? statedBand(statedSubs, id) : 'unwanted';
  };

  const subProperties = [];
  for (const subProperty of artifact.subProperties) {
    const preference = preferenceFor(subProperty.definition.id);
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
    mainPreference: statedMains === undefined
      ? preferences.main[artifact.mainProperty]
      : statedBand(statedMains, artifact.mainProperty),
    subProperties,
  });
}
