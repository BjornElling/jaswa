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
 * `undefined` means the monster category has no property preferences and is
 * therefore not judged. A number is always a 0–1 fraction; zero is a real
 * result for a judged monster whose artifact matches none of its choices.
 */
export function calculateArtifactOptimalValue(input: ArtifactOptimalValueInput): number | undefined {
  if (!input.hasPropertyPreferences) return undefined;
  if (!Number.isFinite(input.acceptableWorth)
    || input.acceptableWorth < 0
    || input.acceptableWorth > 100
    || input.subProperties.length !== 4) return undefined;

  const mainWeight = preferenceWeight(input.mainPreference, input.acceptableWorth);
  let weightedRolls = 0;
  let totalWeight = 0;

  for (const subProperty of input.subProperties) {
    if (!isRollFraction(subProperty.value, subProperty.maximum)) return undefined;
    const weight = preferenceWeight(subProperty.preference, input.acceptableWorth);
    weightedRolls += weight * (subProperty.value / subProperty.maximum);
    totalWeight += weight;
  }

  // A judged category can still have no matching sub property on this artifact.
  // Its value is zero, while an unjudged category above remains undefined.
  if (totalWeight === 0) return 0;
  return mainWeight * (weightedRolls / totalWeight);
}
