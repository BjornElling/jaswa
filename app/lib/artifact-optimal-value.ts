export type ArtifactPropertyPreference = 'preferred' | 'acceptable' | 'unwanted';

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
 * One is the benchmark: a preferred main property plus max rolls on one
 * preferred and three acceptable sub properties. More preferred max rolls can
 * exceed it, which lets the recommendation distinguish a broad match from a
 * narrow one without calling an exceptional artifact mediocre.
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
  const acceptableWeight = input.acceptableWorth / 100;
  const benchmark = 1 + 3 * acceptableWeight;
  let weightedRolls = 0;

  for (const subProperty of input.subProperties) {
    if (!isRollFraction(subProperty.value, subProperty.maximum)) return undefined;
    const weight = preferenceWeight(subProperty.preference, input.acceptableWorth);
    weightedRolls += weight * (subProperty.value / subProperty.maximum);
  }

  return mainWeight * (weightedRolls / benchmark);
}
