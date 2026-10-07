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
 * preferred one, and the maximum rolls that preferred line holds.
 *
 * *Changed September 15, 2026, from `1` acceptable line and a 5-roll preferred
 * line.* An artifact has four lines, and the old benchmark left two of them
 * empty: it described one preferred line that had taken every power-up, one
 * acceptable line, and nothing else. The profile here fills all four — a
 * preferred line of four maximum rolls and three acceptable lines — which is
 * both what a real artifact looks like and what the monsters ask for. Across the
 * 902 monster types the statistics cover, 830 have exactly **one** preferred sub
 * property out of 23, with a mean of about four acceptable ones, so the lines
 * beside the preferred one are overwhelmingly acceptable rather than empty.
 *
 * **The profile is reachable**, which every benchmark here has had to be: a
 * Legend holds `maxContributions + 3` = 8 contributions across its four lines
 * (§3), and this spends 4 + 1 + 1 + 1 = 7 of them.
 *
 * At the default 50 % tolerance the total is unchanged — `2 + 5 + 0.5` and
 * `2 + 4 + 3 × 0.5` are both 7.5 — so the scale a user sees by default did not
 * move. Away from the default it does: the acceptable term now carries three
 * times the weight, so the denominator ranges 6 to 9 across the tolerance
 * settings where it used to range 7 to 8.
 */
export const benchmarkAcceptableLines = 3;

/**
 * The maximum rolls the benchmark's preferred line holds. Four rather than the
 * five a line can reach, because this benchmark spends the artifact's other
 * three lines on acceptable properties rather than leaving them empty, and the
 * eight contributions a finished Legend holds have to cover all four.
 */
export const benchmarkPreferredMaxRolls = 4;

/**
 * The weighted max-roll points the benchmark artifact holds. It is the best
 * artifact the game can build on the profile the monsters actually offer,
 * **carrying the main property that monster wants**:
 *
 * ```text
 * benchmark points = 2 + 4 + 3a
 * ```
 *
 * — the main property (`artifactMainPropertyPoints`), one preferred sub property
 * holding four maximum rolls, and three acceptable lines, all at maximum rolls.
 *
 * **The profile is reachable**, which every benchmark here has had to be: its
 * four lines hold 4 + 1 + 1 + 1 = 7 of the eight contributions a finished Legend
 * has to spend (§3), every line keeping at least its own.
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
    + benchmarkPreferredMaxRolls
    + benchmarkAcceptableLines * acceptableWeight;
}

/**
 * What one rolled line is worth, in points: **the number of maximum natural
 * rolls it amounts to** (`ARTIFACT-CANONICAL.md` §16, `pᵢ = rolled valueᵢ /
 * maxRollᵢ`). One maximum roll is one point, so *Additional Damage by ATK* —
 * whose maximum roll is 4 % — scores 3 points at 12 %, because 12 % is three
 * maximum rolls.
 *
 * The caller holds `lineMaximum`, the ceiling of a **full** line: the per-roll
 * maximum times the five contributions the game's best line can collect (§3).
 * Dividing by it and multiplying by five is the same arithmetic, which is what
 * this used to do — and it buried the factor of five in every line, so a reader
 * could not see that 12 % of a 4 % roll is simply three rolls. Same score, one
 * fewer round trip through a number nobody wanted.
 *
 * Deliberately measured against the *property's* roll, never the line's own
 * contributions or its grade's ceiling: §16 records both of those as corrections
 * already made, each of which gave every artifact a number and the wrong one.
 */
export function artifactLineMaxRolls(value: number, lineMaximum: number): number {
  return value * bestArtifactLineContributions / lineMaximum;
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
    weightedRollPoints += weight * artifactLineMaxRolls(subProperty.value, subProperty.maximum);
  }

  return artifactScoreFromPoints(mainPoints, weightedRollPoints, input.acceptableWorth);
}
