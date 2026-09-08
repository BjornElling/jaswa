import { bestArtifactLineContributions } from './artifact-properties';

export type ArtifactPropertyPreference = 'preferred' | 'acceptable' | 'unwanted';

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
 * The number of weighted max-roll points the benchmark artifact holds: one
 * preferred sub property that took every power-up, plus one acceptable line,
 * both at their maximum rolls.
 *
 * Its preferred line therefore holds all five contributions and the rest hold
 * one each, because a finished artifact has only eight to spend (§3) and every
 * line must keep at least its own. Measured on `bestArtifactLineContributions`,
 * that is a preferred line at `5/5` and an acceptable line at `1/5`:
 *
 * ```text
 * benchmark points = 5 + a
 * ```
 *
 * **It must stay a fixed denominator**, not the weights of the properties this
 * artifact happened to roll: deriving it from the artifact lets one max
 * preferred line and three irrelevant lines score like four desired ones. Nor
 * may it be derived from the monster, which would let a monster wanting one
 * property be perfectly served by an artifact carrying only that one.
 *
 * **And it must stay reachable.** Two earlier versions were not. `1 + 3a`
 * assumed four lines that had each collected five contributions — twenty,
 * against the eight that exist — so it sat 2.5× above anything the game could
 * produce and capped a perfect Legend at 64 %. `1 + 0.6a` fixed the arithmetic
 * but kept three acceptable lines, a profile the defaults almost never grant,
 * and topped the real account out at 90 %.
 *
 * Scores above 100 % are intended and mean an artifact beats this profile — a
 * second preferred line, or an acceptable line that took power-ups of its own.
 * The best artifact in the captured account reaches 106 %.
 */
export function artifactScorePointBenchmark(acceptableWorth: number): number {
  const acceptableWeight = acceptableWorth / 100;
  return bestArtifactLineContributions + benchmarkAcceptableLines * acceptableWeight;
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

function preferenceWeight(preference: ArtifactPropertyPreference, acceptableWorth: number): number {
  if (preference === 'preferred') return 1;
  if (preference === 'acceptable') return acceptableWorth / 100;
  return 0;
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
 * `artifactScorePointBenchmark`. More preferred lines can exceed it, which lets the
 * recommendation distinguish a broad match from a narrow one without calling an
 * exceptional artifact mediocre.
 *
 * `undefined` means the monster category has no property preferences and is
 * therefore not judged. Zero is a real result for a judged monster whose
 * artifact matches none of its choices.
 */
export function calculateArtifactOptimalValue(input: ArtifactOptimalValueInput): number | undefined {
  if (!input.hasPropertyPreferences) return undefined;
  if (!Number.isFinite(input.acceptableWorth)
    || input.acceptableWorth < 0
    || input.acceptableWorth > 100
    || input.subProperties.length !== 4) return undefined;

  const mainWeight = preferenceWeight(input.mainPreference, input.acceptableWorth);
  const benchmark = artifactScorePointBenchmark(input.acceptableWorth);
  let weightedRollPoints = 0;

  for (const subProperty of input.subProperties) {
    if (!isRollFraction(subProperty.value, subProperty.maximum)) return undefined;
    const weight = preferenceWeight(subProperty.preference, input.acceptableWorth);
    /* One maximum natural roll is one point. The stored maximum is a full
       five-roll line, so converting here keeps grades comparable without
       hiding a Legend line's extra contributions. */
    const rollPoints = subProperty.value * bestArtifactLineContributions / subProperty.maximum;
    weightedRollPoints += weight * rollPoints;
  }

  return mainWeight * (weightedRollPoints / benchmark);
}
