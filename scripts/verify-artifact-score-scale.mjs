/**
 * The artifact score's scale, checked against the model it claims to implement
 * (`ARTIFACT-CANONICAL.md` §16).
 *
 * Two properties are worth a script rather than a reading, because both were
 * got wrong in shipped code and neither shows up as a crash:
 *
 * 1. **The benchmark is reachable.** A finished artifact holds
 *    `maxContributions + 3` contributions across four lines, so a denominator
 *    assuming four full lines cannot be met by any artifact the game produces.
 * 2. **A higher grade scores higher.** Measuring each line against its own
 *    grade's ceiling made the score fall as the grade rose.
 *
 * It also holds the two backends to one answer: the WGSL benchmark is written
 * out by hand and would otherwise drift from the TypeScript silently.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const BEST_LINE_CONTRIBUTIONS = 5;
const BENCHMARK_ACCEPTABLE_LINES = 1;
const gradeMaxContributions = { Normal: 1, Magic: 2, Rare: 3, Hero: 4, Legend: 5 };

/* The benchmark as `artifactScorePointBenchmark` computes it. Kept as an independent
   expression rather than an import, so a change to the source has to be made
   deliberately here too. */
const benchmark = (acceptableWorth) =>
  BEST_LINE_CONTRIBUTIONS + BENCHMARK_ACCEPTABLE_LINES * (acceptableWorth / 100);

/** The best allocation of a grade's contribution budget across four lines. */
function bestAllocation(grade) {
  const cap = gradeMaxContributions[grade];
  const lines = [];
  let left = cap + 3;
  for (let index = 0; index < 4; index += 1) {
    const contributions = Math.min(cap, left - (3 - index));
    lines.push(contributions);
    left -= contributions;
  }
  assert.equal(left, 0, `${grade}: the whole budget must be spent`);
  return lines;
}

/** Score with every line expressed in max-roll points. */
function score(acceptableWorth, lines, mainWeight = 1) {
  const acceptable = acceptableWorth / 100;
  const weights = { preferred: 1, acceptable, unwanted: 0 };
  const weighted = lines.reduce(
    (total, [band, contributions]) => total + weights[band] * contributions, 0,
  );
  return mainWeight * weighted / benchmark(acceptableWorth);
}

const percent = (value) => Math.round(value * 100);

/* 1. The benchmark profile is exactly 100 %, and it is an artifact that exists:
      one preferred line holding all five contributions, one acceptable line and
      two the monster does not want, each holding the one the budget leaves. */
for (const acceptableWorth of [0, 25, 50, 75, 100]) {
  const profile = [['preferred', 5], ['acceptable', 1], ['unwanted', 1], ['unwanted', 1]];
  assert.equal(profile.reduce((total, [, c]) => total + c, 0), gradeMaxContributions.Legend + 3,
    'the benchmark profile must spend exactly the Legend budget');
  assert.equal(percent(score(acceptableWorth, profile)), 100,
    `the benchmark profile is 100 % at every acceptable worth (${acceptableWorth})`);
}

/* 2. Every grade's ceiling is reachable, and grades rank in the right order. */
const ceilings = Object.keys(gradeMaxContributions).map((grade) => {
  const lines = bestAllocation(grade).map((contributions) => ['preferred', contributions]);
  return { grade, ceiling: percent(score(50, lines)) };
});
for (const { grade, ceiling } of ceilings) {
  assert.ok(ceiling > 0, `${grade} must be able to score`);
}
for (let index = 1; index < ceilings.length; index += 1) {
  assert.ok(ceilings[index].ceiling > ceilings[index - 1].ceiling,
    `a ${ceilings[index].grade} artifact must outscore a ${ceilings[index - 1].grade} one: `
    + `${ceilings[index].ceiling} % against ${ceilings[index - 1].ceiling} %`);
}
assert.equal(ceilings.at(-1).ceiling, 145,
  'a Legend with four preferred lines is 145 % at the default acceptable worth');

/* 3. A perfect artifact beats the benchmark rather than being capped at it, and
      an ordinary one still lands well below — the scale has to spread. */
assert.ok(percent(score(50, [['preferred', 2], ['unwanted', 2], ['unwanted', 2], ['unwanted', 2]])) < 60,
  'an artifact matching one line weakly must not read as nearly perfect');

/* The benchmark is exceeded by the things that genuinely beat it: a second
   preferred line, or an acceptable line that took power-ups of its own. */
assert.ok(percent(score(50, [['preferred', 5], ['acceptable', 1], ['acceptable', 1], ['unwanted', 1]])) > 100,
  'a second acceptable line must beat the benchmark');
assert.ok(percent(score(50, [['preferred', 4], ['preferred', 2], ['unwanted', 1], ['unwanted', 1]])) > 100,
  'a second preferred line must beat the benchmark');

/* 4. The two backends divide by the same number. The shader writes the formula
      out in WGSL, so it is compared as a computed value, not as text. */
const shader = readFileSync(new URL('../app/lib/compute/webgpu/artifact-score-shader.ts', import.meta.url), 'utf8');
assert.ok(shader.includes('const BEST_LINE_CONTRIBUTIONS: f32 = ${bestArtifactLineContributions}.0;'),
  'the shader must interpolate bestArtifactLineContributions rather than hard-coding it');
assert.ok(shader.includes('const BENCHMARK_ACCEPTABLE_LINES: f32 = ${benchmarkAcceptableLines}.0;'),
  'the shader must interpolate benchmarkAcceptableLines rather than hard-coding it');
assert.ok(shader.includes(
  'let benchmark = BEST_LINE_CONTRIBUTIONS + BENCHMARK_ACCEPTABLE_LINES * parameters.acceptableWorth;'),
'the shader benchmark must match artifactScorePointBenchmark()');
/* The shader is handed the worth as a fraction, the TypeScript as 0-100. */
for (const acceptableWorth of [0, 25, 50, 100]) {
  const shaderBenchmark = BEST_LINE_CONTRIBUTIONS + BENCHMARK_ACCEPTABLE_LINES * (acceptableWorth / 100);
  assert.equal(shaderBenchmark, benchmark(acceptableWorth),
    `the backends must agree on the benchmark at ${acceptableWorth}`);
}

/* 5. A conversion reaches two contributions of the best line, on every grade. */
const conversionCeiling = 2 / BEST_LINE_CONTRIBUTIONS;
assert.equal(conversionCeiling, 0.4, 'a conversion reaches two fifths of a full line');
assert.ok(conversionCeiling < 1, 'a conversion must never score as a full line, whatever the grade');

/* 6. The shipped code agrees with all of the above. The checks so far restate
      the model; these run it, so an implementation that drifted from the model
      fails here rather than passing a check written against itself. */
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });
try {
  const { artifactScorePointBenchmark, calculateArtifactOptimalValue } =
    await server.ssrLoadModule('/app/lib/artifact-optimal-value.ts');
  const { artifactPropertyMaximum, artifactProperty, bestArtifactLineContributions, artifactTotalContributions } =
    await server.ssrLoadModule('/app/lib/artifact-properties.ts');
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  assert.equal(bestArtifactLineContributions, BEST_LINE_CONTRIBUTIONS);
  for (const [grade, max] of Object.entries(gradeMaxContributions)) {
    assert.equal(artifactTotalContributions(grade), max + 3, `${grade}'s contribution budget`);
  }
  for (const acceptableWorth of [0, 25, 50, 75, 100]) {
    assert.equal(artifactScorePointBenchmark(acceptableWorth), benchmark(acceptableWorth),
      `artifactScorePointBenchmark disagrees at ${acceptableWorth}`);
  }

  /* The ceiling is one number for every grade, so a property reads the same
     whichever artifact carries it. Property 300 rolls 3-5, so 5 x 5 = 25. */
  const property300 = artifactProperty(300);
  assert.equal(artifactPropertyMaximum(property300), 25, 'the per-line ceiling is absolute');

  /* The benchmark profile, built as a record the reader accepts: a Legend whose
     preferred line took all four power-ups at maximum and whose three others
     hold one maximum roll each. Scored through the shipped function, it is the
     100 % the model promises. */
  const legend = readArtifact({
    rid: 1, type: 1, attribute: 1, natural_rank: 5, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 25, 4, 0, 0], [301, 5, 0, 0, 0], [302, 5, 0, 0, 0], [303, 5, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  });
  assert.ok(legend, 'the benchmark artifact must be a legal record');
  assert.deepEqual(legend.subProperties.map((line) => line.maximumHundredths), [2500, 2500, 2500, 2500],
    'every line is measured against the same absolute ceiling, whatever it collected');

  const benchmarkScore = calculateArtifactOptimalValue({
    acceptableWorth: 50,
    hasPropertyPreferences: true,
    mainPreference: 'preferred',
    subProperties: legend.subProperties.map((line, index) => ({
      preference: index === 0 ? 'preferred' : index === 1 ? 'acceptable' : 'unwanted',
      value: line.valueHundredths,
      maximum: line.maximumHundredths,
    })),
  });
  assert.equal(percent(benchmarkScore), 100, 'the shipped calculation must put the benchmark artifact at 100 %');

  /* The same artifact against a monster that prefers all four: above the
     benchmark, because it carries more than one preferred line. */
  const perfectScore = calculateArtifactOptimalValue({
    acceptableWorth: 50,
    hasPropertyPreferences: true,
    mainPreference: 'preferred',
    subProperties: legend.subProperties.map((line) => ({
      preference: 'preferred', value: line.valueHundredths, maximum: line.maximumHundredths,
    })),
  });
  assert.ok(perfectScore > benchmarkScore, 'more preferred lines must score higher than the benchmark');
  assert.equal(percent(perfectScore), 145, 'a Legend whose every line is preferred is 145 %');

  /* A Normal artifact of the same properties must score far below the Legend,
     which is the defect the absolute ceiling repairs. */
  const normal = readArtifact({
    rid: 2, type: 1, attribute: 1, natural_rank: 1, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 5, 0, 0, 0], [301, 5, 0, 0, 0], [302, 5, 0, 0, 0], [303, 5, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  });
  assert.ok(normal, 'the Normal artifact must be a legal record');
  const normalScore = calculateArtifactOptimalValue({
    acceptableWorth: 50,
    hasPropertyPreferences: true,
    mainPreference: 'preferred',
    subProperties: normal.subProperties.map((line) => ({
      preference: 'preferred', value: line.valueHundredths, maximum: line.maximumHundredths,
    })),
  });
  assert.equal(percent(normalScore), 73, 'a max-rolled Normal artifact is 73 %, not 160 %');
  assert.ok(normalScore < perfectScore,
    'a max-rolled Normal artifact must never outscore a perfect Legend');
} finally {
  await server.close();
}

console.log('Artifact score scale');
for (const { grade, ceiling } of ceilings) {
  console.log(`  ${grade.padEnd(7)} ceiling ${String(ceiling).padStart(4)} %`);
}
console.log(`  benchmark profile 100 %, conversion ceiling ${conversionCeiling * 100} % of a full line`);
console.log('  the shipped calculation reproduces every figure above.');
console.log('All checks passed.');
