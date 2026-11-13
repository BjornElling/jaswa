import { calculateArtifactOptimalValue } from './artifact-optimal-value';
import { artifactPreferenceStatus, defaultPropertyPreferences } from '../profiles/artifact-preferences';
import { scoringSettings } from './artifact-recommendations';
import { artifactFitsMonster } from './score/artifact-score-input';
import { copyArtifactMainBands } from '../combat/main-stat-model';
import { artifactPropertyIndex } from './score/artifact-score-schema';
import { monsterSpeciesId } from '../monsters/monster-identity';
import { canEngraveArtifacts } from '../monsters/monster-engrave-eligibility';
import type { Artifact } from './artifacts';
import type { ArtifactPropertyPreference } from './artifact-optimal-value';
import type { MonsterCopyPreferences } from '../profiles/monster-preferences';
import { statedAnswer, statedBand } from '../profiles/monster-preferences';
import type { ArtifactSettings } from '../model';
import type { GameRecord } from '../account/game-record';

/**
 * How fully an artifact rolled on what the type of the monster it is engraved on wants.
 * The one measure, `calculateArtifactOptimalValue`, is left to do the judging;
 * this only supplies it with the preferences and the roll fractions.
 *
 * `undefined` means the question does not apply — the artifact is in inventory,
 * the monster it is engraved on is unknown, the monster type has no recorded preferences, or the
 * engrave rule does not let the monster take it. Under §19.5 that is shown
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
  /* What the copy this artifact is engraved on says it is for, where its owner has
     said anything. Optional because most callers are asking about a species —
     "what is this artifact worth on a Lushen" — and only a caller holding one
     owned copy can answer for that copy. */
  stated?: MonsterCopyPreferences,
): number | undefined {
  return artifactJudgementOnMonster(artifact, monster, settings, stated).value;
}

/**
 * The bands the monster puts this artifact's main and sub properties in — the
 * one reading its score is computed from. A view that marks a line preferred or
 * acceptable beside the score takes the marks from here, so the marks and the
 * number cannot answer from two different sets of preferences: the library row
 * once marked its lines from the species statistics while its score came from
 * the copy's stated answers and its runes' main-stat model.
 */
export type ArtifactPreferenceReading = {
  main: ArtifactPropertyPreference;
  sub: ReadonlyMap<number, ArtifactPropertyPreference>;
};

/**
 * `artifactValueOnMonster` together with the preference reading behind it.
 * `preferences` is `undefined` only where the species has no recorded
 * preferences at all; it is present whenever there is something to mark, even
 * where the score itself is not judged.
 */
export function artifactJudgementOnMonster(
  artifact: Artifact,
  monster: GameRecord,
  settings: ArtifactSettings,
  stated?: MonsterCopyPreferences,
): { value: number | undefined; preferences: ArtifactPreferenceReading | undefined } {
  const masterId = monster.unit_master_id;
  const recorded = defaultPropertyPreferences(masterId, artifact.category);
  if (!recorded) return { value: undefined, preferences: undefined };

  /* The user's own answers replace the statistics rather than blending with
     them (§19.4), band for band — the same `statedBand` the packed scorer
     reads, so the two cannot place one property differently. A property
     outside the scored vocabulary — every legacy one — is unwanted on both
     paths, exactly as the packed scorer, which has no index for it, weighs it. */
  const statedSubs = statedAnswer(stated?.artifacts?.sub?.[artifact.category]);
  const preferenceFor = (id: number): ArtifactPropertyPreference => {
    if (!artifactPropertyIndex.has(id)) return 'unwanted';
    return statedSubs === undefined ? recorded.sub.get(id) ?? 'unwanted' : statedBand(statedSubs, id);
  };
  /* The main as this copy wants it — stated, or the model's answer for its own
     runes — through the reading the packed scorer's copy row takes. */
  const copyMains = copyArtifactMainBands(monster, stated);
  const preferences: ArtifactPreferenceReading = {
    main: (copyMains ?? recorded.main)[artifact.mainProperty],
    sub: new Map(artifact.subProperties.map((line) => [line.definition.id, preferenceFor(line.definition.id)])),
  };

  if (!canEngraveArtifacts(monster)) return { value: undefined, preferences };
  if (artifactPreferenceStatus(masterId, artifact.category) !== 'scorable') return { value: undefined, preferences };
  /* The engrave rule (§1) decides whether the question can be asked at all. This
     reader used to score whatever pair it was handed, so an artifact the game
     would never let a monster take still got a number here while the
     optimization pages, which do apply the rule, called it not judged. */
  if (!artifactFitsMonster(artifact, monsterSpeciesId(masterId))) return { value: undefined, preferences };

  const { acceptableWorth } = scoringSettings(settings);
  const subProperties = artifact.subProperties.map((line) => ({
    preference: preferences.sub.get(line.definition.id) ?? 'unwanted',
    /* A legacy line has no known range (§12), so how well it rolled cannot be
       computed — and it cannot matter, because it is unwanted and weighs zero
       whatever it rolled. It enters as an empty line, which contributes
       nothing and judges nothing. */
    value: line.maximumHundredths === null ? 0 : line.valueHundredths,
    maximum: line.maximumHundredths ?? 1,
  }));

  return {
    value: calculateArtifactOptimalValue({
      acceptableWorth,
      hasPropertyPreferences: true,
      mainPreference: preferences.main,
      subProperties,
    }),
    preferences,
  };
}
