import { bestArtifactLineContributions } from './artifact-properties';

export type ArtifactPropertyPreference = 'preferred' | 'acceptable' | 'unwanted';

/**
 * What the main property is worth, in the same max-roll points the sub
 * properties are measured in: **two maximum rolls of a preferred sub property**.
 *
 * *Changed September 12, 2026.* The main was previously a multiplier on the
 * whole sub-property value, and that was wrong in a way no artifact could
 * escape: a perfectly rolled set of preferred sub properties scored **zero** on
 * an unwanted main, and every artifact with an acceptable main was halved
 * however it rolled. The main property is one flat stat (§2) — +1,500 HP, +100
 * ATK or +100 DEF — so it is one addition to the artifact's worth, not a gate on
 * the other four lines.
 *
 * As an addition it also cannot be a veto: an artifact whose main the monster
 * does not want still delivers whatever its sub properties deliver, and now
 * scores as such. What the wrong main costs is exactly these two points, no
 * more.
 */
export const artifactMainPropertyPoints = 2;

/**
 * The number of acceptable lines the benchmark artifact carries beside its
 * preferred one. It is 1 because that is what the monsters actually ask for:
 * across the 902 monster types the statistics cover, 830 have exactly **one**
 * preferred sub property out of 23, and the best profile any of them offers a
 * real artifact is `1 preferred + 1 acceptable` or `1 preferred + 2 acceptable`
 * — 1,161 of the account's 1,555 artifacts. Benchmarking against three
 * acceptable lines would measure every artifact against a monster that does not
 * exist.
 */
export const benchmarkAcceptableLines = 1;

/**
 * The weighted max-roll points the benchmark artifact holds. It is the best
 * artifact the game can build on the profile the monsters actually offer,
 * **wearing the main property that monster wants**:
 *
 * ```text
 * benchmark points = 2 + 5 + a
 * ```
 *
 * — the main property (`artifactMainPropertyPoints`), one preferred sub property
 * that took every power-up, and one acceptable line, all at maximum rolls.
 *
 * **The profile is reachable**, which every benchmark here has had to be. Its
 * preferred line holds all five contributions and the other three hold one each,
 * because a finished artifact has only eight to spend (§3) and every line must
 * keep at least its own.
 *
 * **It must stay a fixed denominator**, not the weights of the properties this
 * artifact happened to roll: deriving it from the artifact lets one max
 * preferred line and three irrelevant lines score like four desired ones. Nor
 * may it be derived from the monster, which would let a monster wanting one
 * property be perfectly served by an artifact carrying only that one.
 *
 * **The main's worth appears here and in the numerator, from this one
 * constant.** The benchmark carries a *preferred* main, so an artifact that has
 * one neither gains nor loses against it on that term, and the two places the
 * figure is used cannot drift apart. Adding the main to both is also what keeps
 * the scale where it was before the main became a term: a perfect artifact still
 * reads about 100 %, and the grade ceilings still run 80 % to 133 %.
 *
 * Scores above 100 % are intended and mean an artifact beats this profile — a
 * second preferred line, or an acceptable line that took power-ups of its own.
 */
export function artifactScorePointBenchmark(acceptableWorth: number): number {
  const acceptableWeight = acceptableWorth / 100;
  return artifactMainPropertyPoints
    + bestArtifactLineContributions
    + benchmarkAcceptableLines * acceptableWeight;
}

export type ArtifactOptimalValueInput = {
  acceptableWorth: number;
  hasPropertyPreferences: boolean;
  mainPreference: ArtifactPropertyPreference;
  subProperties: readonly {
    preference: ArtifactPropertyPreference;
    value: number;
    maximum: number;
  }[];
};

/**
 * The preference codes the packed score protocol carries. They are declared
 * here, beside the weights they resolve to, because a code and its weight are
 * one decision: the scorer used to hold its own copy of both, and two copies of
 * "what is an acceptable line worth" is exactly the kind of pair that agrees
 * until the day somebody changes one.
 */
export const artifactPreferenceCodes = { unwanted: 0, acceptable: 1, preferred: 2 } as const;

/**
 * What one line counts for, given how the monster ranks its property.
 *
 * A preferred line counts fully, an acceptable one counts for whatever the user
 * said second choice is worth (`ARTIFACT-CANONICAL.md` §19.6), and an unwanted
 * line counts for nothing. Both readers go through this — the library's
 * per-artifact reader by name, the packed scorer by code — so the setting has
 * one meaning wherever a score appears.
 */
export function artifactPreferenceWeight(
  preference: ArtifactPropertyPreference | number | undefined,
  acceptableWorth: number,
): number {
  const code = typeof preference === 'number'
    ? preference
    : artifactPreferenceCodes[preference ?? 'unwanted'];
  if (code === artifactPreferenceCodes.preferred) return 1;
  return code === artifactPreferenceCodes.acceptable ? acceptableWorth / 100 : 0;
}

/**
 * The score itself, out of the two sums that make it: what the main property
 * contributed and what the four rolled lines contributed, both already in
 * weighted max-roll points.
 *
 * It is three symbols of arithmetic and it still belongs here rather than at
 * each reader, because it is *the* definition — the benchmark in the
 * denominator is what fixes the scale every view compares on, and a reader that
 * composed its own could put a different scale on screen without anything
 * failing.
 */
export function artifactScoreFromPoints(
  mainPoints: number,
  weightedSubPoints: number,
  acceptableWorth: number,
): number {
  return (mainPoints + weightedSubPoints) / artifactScorePointBenchmark(acceptableWorth);
}

function isRollFraction(value: number, maximum: number): boolean {
  return Number.isFinite(value)
    && Number.isFinite(maximum)
    && maximum > 0
    && value >= 0
    && value <= maximum;
}

/**
 * The one measure of how closely an artifact matches a monster's declared
 * preferences. It intentionally measures the roll, not combat output: users
 * decide which properties matter, and the calculation says how well this
 * artifact rolled on those choices.
 *
 * One is the benchmark: a preferred main property on the best artifact the game
 * can build with one preferred and one acceptable sub property — see
 * `artifactScorePointBenchmark`. More preferred lines can exceed it, which lets
 * the recommendation distinguish a broad match from a narrow one without
 * calling an exceptional artifact mediocre.
 *
 * **The main property is added, not multiplied** (`artifactMainPropertyPoints`).
 * An artifact carrying a main the monster does not want keeps every point its
 * sub properties earned and forfeits only the main's own two.
 *
 * `undefined` means the monster category has no property preferences and is
 * therefore not judged. Zero is a real result for a judged monster whose
 * artifact matches none of its choices — main property included.
 */
export function calculateArtifactOptimalValue(input: ArtifactOptimalValueInput): number | undefined {
  if (!input.hasPropertyPreferences) return undefined;
  if (!Number.isFinite(input.acceptableWorth)
    || input.acceptableWorth < 0
    || input.acceptableWorth > 100
    || input.subProperties.length !== 4) return undefined;

  /* The main property is one flat stat, so it is worth a fixed number of
     max-roll points rather than a factor on the four rolled lines. */
  const mainPoints = artifactPreferenceWeight(input.mainPreference, input.acceptableWorth)
    * artifactMainPropertyPoints;
  let weightedRollPoints = 0;

  for (const subProperty of input.subProperties) {
    if (!isRollFraction(subProperty.value, subProperty.maximum)) return undefined;
    const weight = artifactPreferenceWeight(subProperty.preference, input.acceptableWorth);
    /* One maximum natural roll is one point. The stored maximum is a full
       five-roll line, so converting here keeps grades comparable without
       hiding a Legend line's extra contributions. */
    const rollPoints = subProperty.value * bestArtifactLineContributions / subProperty.maximum;
    weightedRollPoints += weight * rollPoints;
  }

  return artifactScoreFromPoints(mainPoints, weightedRollPoints, input.acceptableWorth);
}
