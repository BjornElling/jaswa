/**
 * **The artifact score matrix, packed for the graphics card.**
 *
 * The processor's version is `calculateArtifactScoresCpu` in `artifact-score-core.ts`
 * and it stays the reference: this packs the same request into buffers, runs the same
 * arithmetic in parallel, and reads back the same matrix.
 *
 * It used to own the device, the pipeline and every buffer besides. All of that moved
 * to `compute/gpu/gpu-context.ts` when a second calculation wanted it, so what is left
 * here is the part that is actually about artifacts: the stride layout, and the
 * agreement gate that proves this machine's card can be trusted with it.
 */
import { artifactPropertyAvailability, scoredArtifactProperties } from '../artifact-score-schema';
import { calculateArtifactScoresCpu } from '../artifact-score-core';
import type {
  ArtifactScoreRequest, PackedArtifactScoreInput, PackedMonsterScoreInput,
} from '../artifact-score-protocol';
import { artifactScoreLanes, artifactScoreShader } from '../webgpu/artifact-score-shader';
import type { GpuContext } from '../gpu/gpu-context';

/* Class codes run 0 (Intangible) through 5 (Dark), the widest of the two
   numberings, so one table shape serves both categories. */
const equipClassRows = 6;

/**
 * Half a percentage point. A score is rounded to whole points before it is compared
 * to anything (`ARTIFACT-CANONICAL.md` §17.1), so the two engines can only disagree
 * about a pair sitting within single-precision rounding of a half — and they must not
 * disagree by more than the rounding that produced it.
 */
const agreementTolerance = 0.5;

function packed(request: ArtifactScoreRequest) {
  /* The order here *is* the shader's stride layout — see `artifactStride` and
     `monsterStride` in artifact-score-shader.ts. A field added to one and not
     the other misreads every row after it, silently. */
  const artifacts = new Float32Array(request.artifacts.flatMap((artifact) => [
    artifact.category, artifact.restriction, artifact.mainProperty, artifact.convertedPropertyIndex,
    ...artifact.subPropertyIndexes, ...artifact.subPropertyRollPoints,
    /* A stride is fixed width, so an absent list is written as the zeroes it
       means rather than omitted — one short row would misalign every row
       after it, and the scores would be wrong rather than missing. */
    ...(artifact.subPropertyValueHundredths ?? [-1, -1, -1, -1]),
  ]));
  const monsters = new Float32Array(request.monsters.flatMap((monster) => [
    monster.element, monster.archetype, ...monster.mainPreferences,
    ...monster.subPropertyPreferences,
    ...(monster.subPropertyMinimums ?? scoredArtifactProperties.map(() => 0)),
  ]));
  /* One row of flags per equip class, indexed by the class code the artifacts
     carry, because a stone converts only the class it was engraved for. The
     table is sized to the highest class code rather than to the number of
     classes, so row 0 — the Intangible code — is simply never written and
     never read: an Intangible cannot be converted (§10.1). */
  const owned = new Int32Array(equipClassRows * scoredArtifactProperties.length);
  for (const [classCode, indexes] of Object.entries(request.ownedConversionPropertyIndexesByClass)) {
    const row = Number(classCode);
    if (!Number.isInteger(row) || row < 0 || row >= equipClassRows) continue;
    for (const propertyIndex of indexes) {
      if (propertyIndex >= 0 && propertyIndex < scoredArtifactProperties.length) {
        owned[row * scoredArtifactProperties.length + propertyIndex] = 1;
      }
    }
  }
  const parameters = new ArrayBuffer(32);
  const parameterView = new DataView(parameters);
  parameterView.setUint32(0, request.artifacts.length, true);
  parameterView.setUint32(4, request.monsters.length, true);
  parameterView.setUint32(8, request.conversionMode, true);
  parameterView.setFloat32(12, request.acceptableWorth / 100, true);
  parameterView.setFloat32(16, request.insignificantDifference, true);
  return { artifacts, monsters, owned, parameters: new Uint8Array(parameters) };
}

export async function calculateArtifactScoresOnGpu(
  request: ArtifactScoreRequest, context: GpuContext,
): Promise<Float32Array> {
  const pairCount = request.artifacts.length * request.monsters.length;
  if (pairCount === 0) return new Float32Array(0);
  const buffers = packed(request);
  const output = await context.run({
    shader: 'artifact-score',
    code: artifactScoreShader,
    inputs: [
      { data: buffers.artifacts },
      { data: buffers.monsters },
      { data: new Int32Array(artifactPropertyAvailability) },
      { data: buffers.owned },
      { data: new Float32Array(request.conversionRollFractions) },
      { data: buffers.parameters, kind: 'uniform' },
    ],
    outputBytes: pairCount * Float32Array.BYTES_PER_ELEMENT,
    workgroups: Math.ceil(pairCount / artifactScoreLanes),
  });
  return new Float32Array(output);
}

/**
 * Does this card score the same artifacts the same way?
 *
 * The battery is built here rather than taken from an import, so it exists before
 * anything has been imported. It covers the four branches the shader could get wrong
 * on its own: an artifact its monster's equip class refuses, one it accepts, a line
 * below a stated floor, and a conversion the import owns a stone for.
 */
export async function artifactScoreAgreement(context: GpuContext): Promise<boolean> {
  const request = agreementRequest();
  const theirs = await calculateArtifactScoresOnGpu(request, context);
  const ours = calculateArtifactScoresCpu(request);
  if (theirs.length !== ours.length) return false;
  for (let at = 0; at < ours.length; at += 1) {
    /* An ineligible pair is `-1` on both sides and must stay exactly that: it is a
       verdict, not a score, and a card that turned it into a number would put an
       artifact on a monster that cannot wear it. */
    if (ours[at] < 0 !== theirs[at] < 0) return false;
    if (Math.abs(theirs[at] - ours[at]) > agreementTolerance) return false;
  }
  return true;
}

function agreementRequest(): ArtifactScoreRequest {
  const properties = scoredArtifactProperties.length;
  const zeros = Array.from({ length: properties }, () => 0);
  const artifact = (
    category: 1 | 2, restriction: number, mainProperty: 0 | 1 | 2, convertedPropertyIndex: number,
    subPropertyIndexes: readonly [number, number, number, number],
    subPropertyRollPoints: readonly [number, number, number, number],
  ): PackedArtifactScoreInput => ({
    id: `agreement-${category}-${restriction}-${mainProperty}`,
    category, restriction, mainProperty, convertedPropertyIndex,
    subPropertyIndexes, subPropertyRollPoints,
    subPropertyValueHundredths: [1200, 900, 600, 300],
  });
  const monster = (
    id: string, element: number, archetype: number, minimum: number,
  ): PackedMonsterScoreInput => ({
    id, name: id, element, archetype,
    mainPreferences: [2, 1, 0],
    /* A preferred band, an accepted one and a great many unwanted ones, so a wrong
       weight cannot hide behind a uniform preference. */
    subPropertyPreferences: zeros.map((_, index) => (index % 7 === 0 ? 2 : index % 5 === 0 ? 1 : 0)),
    subPropertyMinimums: zeros.map((_, index) => (index === 0 ? minimum : 0)),
    subPropertyShares: zeros.map((_, index) => (index % 3) / 10),
  });
  return {
    artifacts: [
      artifact(1, 1, 0, -1, [0, 5, 7, 9], [100, 60, 30, 10]),
      artifact(1, 2, 1, 0, [0, 5, 7, 9], [100, 60, 30, 10]),
      artifact(2, 1, 2, -1, [1, 2, 3, 4], [90, 80, 70, 60]),
    ],
    monsters: [monster('fire-attack', 1, 1, 0), monster('water-support', 2, 3, 40)],
    acceptableWorth: 50,
    conversionMode: 1,
    conversionRollFractions: zeros.map(() => 0.75),
    insignificantDifference: 1,
    ownedConversionPropertyIndexes: [0, 5],
    ownedConversionPropertyIndexesByClass: { 1: [0, 5], 2: [5] },
  };
}
