/**
 * The artifact score's scale, checked against the model it claims to implement
 * (`ARTIFACT-CANONICAL.md` §16).
 *
 * Three properties are worth a script rather than a reading, because each was
 * got wrong in shipped code and none shows up as a crash:
 *
 * 1. **The benchmark is reachable.** A finished artifact holds
 *    `maxContributions + 3` contributions across four lines, so a denominator
 *    assuming four full lines cannot be met by any artifact the game produces.
 * 2. **A higher grade scores higher.** Measuring each line against its own
 *    grade's ceiling made the score fall as the grade rose.
 * 3. **The main property adds; it does not multiply.** As a factor on the
 *    sub-property value it silently zeroed perfectly rolled artifacts whose main
 *    the monster happened not to want.
 *
 * It also holds the two backends to one answer: the WGSL benchmark is written
 * out by hand and would otherwise drift from the TypeScript silently.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const BEST_LINE_CONTRIBUTIONS = 5;
const ARTIFACT_MAIN_POINTS = 2;
const BENCHMARK_ACCEPTABLE_LINES = 3;
const BENCHMARK_PREFERRED_MAX_ROLLS = 4;
const NORMAL_CONVERSION_CONTRIBUTIONS = 1.5;
const gradeMaxContributions = { Normal: 1, Magic: 2, Rare: 3, Hero: 4, Legend: 5 };

/* The benchmark as `artifactScorePointBenchmark` computes it. Kept as an independent
   expression rather than an import, so a change to the source has to be made
   deliberately here too. */
const benchmark = (acceptableWorth) => ARTIFACT_MAIN_POINTS + BENCHMARK_PREFERRED_MAX_ROLLS
  + BENCHMARK_ACCEPTABLE_LINES * (acceptableWorth / 100);

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
function score(acceptableWorth, lines, mainBand = 'preferred') {
  const acceptable = acceptableWorth / 100;
  const weights = { preferred: 1, acceptable, unwanted: 0 };
  const weighted = lines.reduce(
    (total, [band, contributions]) => total + weights[band] * contributions, 0,
  );
  /* The main property is added in its own max-roll points, never multiplied
     across the four rolled lines. */
  return (weights[mainBand] * ARTIFACT_MAIN_POINTS + weighted) / benchmark(acceptableWorth);
}

const percent = (value) => Math.round(value * 100);

/* Two scores differ by a subtraction of ratios, so they agree to floating point
   rather than to the bit. The tolerance is far below the whole percentage point
   every score is compared on (§17.1), so it cannot hide a real disagreement. */
const agrees = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} against ${expected}`);

/* 1. The benchmark profile is exactly 100 %, and it is an artifact that exists:
      a preferred main property on a Legend whose preferred line holds four
      maximum rolls and whose three other lines are each one maximum roll of a
      property the monster accepts. That spends 7 of the Legend's 8
      contributions — a benchmark must be buildable, and this one leaves a
      power-up unspent rather than demanding more than the game grants. */
for (const acceptableWorth of [0, 25, 50, 75, 100]) {
  const profile = [
    ['preferred', BENCHMARK_PREFERRED_MAX_ROLLS],
    ['acceptable', 1], ['acceptable', 1], ['acceptable', 1],
  ];
  assert.ok(profile.reduce((total, [, c]) => total + c, 0) <= gradeMaxContributions.Legend + 3,
    'the benchmark profile must fit inside the Legend budget');
  assert.equal(profile.filter(([band]) => band === 'acceptable').length, BENCHMARK_ACCEPTABLE_LINES,
    'the benchmark profile carries the acceptable lines the denominator charges for');
  assert.equal(percent(score(acceptableWorth, profile)), 100,
    `the benchmark profile is 100 % at every acceptable worth (${acceptableWorth})`);
}

/* 1b. The main property adds its points; it never multiplies the rolled lines.
       This is the defect the September 12, 2026 change repairs: a perfectly
       rolled artifact scored zero for carrying a main the monster did not ask
       for, which threw away four lines of real stat over one flat one. */
const perfectLines = [['preferred', 5], ['preferred', 1], ['preferred', 1], ['preferred', 1]];
for (const acceptableWorth of [0, 50, 100]) {
  const withPreferredMain = score(acceptableWorth, perfectLines, 'preferred');
  const withUnwantedMain = score(acceptableWorth, perfectLines, 'unwanted');
  assert.ok(withUnwantedMain > 0,
    `an unwanted main must not zero a perfectly rolled artifact (${acceptableWorth})`);
  agrees(withPreferredMain - withUnwantedMain, ARTIFACT_MAIN_POINTS / benchmark(acceptableWorth),
    `the wrong main must cost exactly the main's own points (${acceptableWorth})`);
  /* An acceptable main sits between the two, and the gap is the same arithmetic
     applied to the acceptable weight rather than a second rule. */
  agrees(score(acceptableWorth, perfectLines, 'acceptable') - withUnwantedMain,
    (acceptableWorth / 100) * ARTIFACT_MAIN_POINTS / benchmark(acceptableWorth),
    `an acceptable main is worth the acceptable share of the main's points (${acceptableWorth})`);
}
/* The main is a minority of the benchmark, so sub properties still decide the
   ranking. A main worth more than the lines the benchmark asks for would make
   the score a main-stat filter wearing a percentage. */
assert.ok(ARTIFACT_MAIN_POINTS < BEST_LINE_CONTRIBUTIONS,
  'the main property must not outweigh the sub properties the benchmark asks for');

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
assert.equal(ceilings.at(-1).ceiling, 133,
  'a Legend with four preferred lines is 133 % at the default acceptable worth');
/* The scale is calibrated so a perfect artifact reads about 100 %, not two or
   three times it. The main property joins both sides of the fraction, which is
   what keeps this where it was before the main became a term. */
assert.ok(ceilings.at(-1).ceiling < 150,
  'the best artifact the game can build must read as about one benchmark, not several');

/* 3. The scale has to spread: an artifact that matches one line weakly must
      still rank below the benchmark, and far below one that rolled out. */
const weakMatch = percent(score(50, [['preferred', 2], ['unwanted', 2], ['unwanted', 2], ['unwanted', 2]]));
assert.ok(weakMatch < 60, 'an artifact matching one line weakly must not read as nearly perfect');

/* The benchmark is exceeded by the things that genuinely beat it: a line that
   collected power-ups, or a second line the monster wanted. */
assert.ok(percent(score(50, [['preferred', 5], ['acceptable', 1], ['acceptable', 1], ['unwanted', 1]])) > 100,
  'a preferred line that took every power-up must beat the benchmark');
assert.ok(percent(score(50, [['preferred', 4], ['preferred', 2], ['unwanted', 1], ['unwanted', 1]])) > 100,
  'a second preferred line must beat the benchmark');
/* Contributions are what separate two artifacts carrying the same properties,
   so a line that took power-ups must outscore one that did not. */
assert.ok(score(50, [['preferred', 5], ['acceptable', 1], ['unwanted', 1], ['unwanted', 1]])
  > score(50, [['preferred', 1], ['acceptable', 1], ['unwanted', 1], ['unwanted', 1]]),
'a preferred line holding five contributions must outscore one holding its own');

/* 4. The two backends divide by the same number. The shader writes the formula
      out in WGSL, so it is compared as a computed value, not as text. */
const shader = readFileSync(new URL('../app/lib/compute/webgpu/artifact-score-shader.ts', import.meta.url), 'utf8');
for (const constant of [
  'const ARTIFACT_MAIN_POINTS: f32 = ${artifactMainPropertyPoints}.0;',
  'const BENCHMARK_PREFERRED_MAX_ROLLS: f32 = ${benchmarkPreferredMaxRolls}.0;',
  'const BENCHMARK_ACCEPTABLE_LINES: f32 = ${benchmarkAcceptableLines}.0;',
]) {
  assert.ok(shader.includes(constant), `the shader must interpolate rather than hard-code: ${constant}`);
}
assert.ok(shader.includes(
  'let benchmark = ARTIFACT_MAIN_POINTS + BENCHMARK_PREFERRED_MAX_ROLLS\n'
  + '    + BENCHMARK_ACCEPTABLE_LINES * parameters.acceptableWorth;'),
'the shader benchmark must match artifactScorePointBenchmark()');
/* The main must be added in the shader too. A multiplication here would give the
   GPU backend a different candidate set for the same account, silently. */
assert.ok(shader.includes(
  'let mainPoints = preferenceWeight(i32(monsters[monsterOffset + 2u + mainProperty])) * ARTIFACT_MAIN_POINTS;'),
'the shader must weight the main property into its own points');
assert.ok(!/mainWeight\s*\*/.test(shader),
  'the shader must not multiply anything by a main-property weight');
assert.ok(shader.includes('scorePercent((mainPoints + weighted) / benchmark)'),
  'the shader must add the main points to the numerator');
/* The shader is handed the worth as a fraction, the TypeScript as 0-100. */
for (const acceptableWorth of [0, 25, 50, 100]) {
  const shaderBenchmark = ARTIFACT_MAIN_POINTS + BENCHMARK_PREFERRED_MAX_ROLLS
    + BENCHMARK_ACCEPTABLE_LINES * (acceptableWorth / 100);
  assert.equal(shaderBenchmark, benchmark(acceptableWorth),
    `the backends must agree on the benchmark at ${acceptableWorth}`);
}

/* 5. A conversion reaches one and a half contributions of the best line, on
      every grade — the Repeat Convert dialog's `maxRoll × 1.5` (§10). */
const conversionCeiling = NORMAL_CONVERSION_CONTRIBUTIONS / BEST_LINE_CONTRIBUTIONS;
assert.equal(conversionCeiling, 0.3, 'a conversion reaches three tenths of a full line');
assert.ok(conversionCeiling < 1, 'a conversion must never score as a full line, whatever the grade');

/* 6. The shipped code agrees with all of the above. The checks so far restate
      the model; these run it, so an implementation that drifted from the model
      fails here rather than passing a check written against itself. */
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });
try {
  const {
    artifactMainPropertyPoints, artifactScorePointBenchmark, benchmarkAcceptableLines,
    benchmarkPreferredMaxRolls, calculateArtifactOptimalValue,
  } = await server.ssrLoadModule('/app/lib/artifact-optimal-value.ts');
  const {
    artifactPropertyMaximum, artifactProperty, bestArtifactLineContributions,
    artifactNormalConversionContributions, artifactTotalContributions,
  } = await server.ssrLoadModule('/app/lib/artifact-properties.ts');
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  assert.equal(bestArtifactLineContributions, BEST_LINE_CONTRIBUTIONS);
  assert.equal(artifactMainPropertyPoints, ARTIFACT_MAIN_POINTS,
    'the main property is worth two maximum rolls of a preferred sub property');
  assert.equal(benchmarkAcceptableLines, BENCHMARK_ACCEPTABLE_LINES);
  assert.equal(benchmarkPreferredMaxRolls, BENCHMARK_PREFERRED_MAX_ROLLS,
    'the benchmark preferred line holds four maximum rolls, not a full five-roll line');
  assert.equal(artifactNormalConversionContributions, NORMAL_CONVERSION_CONTRIBUTIONS);
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

  /* A Legend whose preferred line took all four power-ups at maximum and whose
     three others hold one maximum roll each, under the main property the monster
     wants. This is no longer the benchmark profile itself — that one spends a
     power-up fewer on its preferred line (see `benchmarkLegend` below) — but it
     is the record the grade-ceiling and wrong-main checks are stated against. */
  const legend = readArtifact({
    rid: 1, type: 1, attribute: 1, natural_rank: 5, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 25, 4, 0, 0], [301, 5, 0, 0, 0], [302, 5, 0, 0, 0], [303, 5, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  });
  assert.ok(legend, 'the benchmark artifact must be a legal record');
  assert.deepEqual(legend.subProperties.map((line) => line.maximumHundredths), [2500, 2500, 2500, 2500],
    'every line is measured against the same absolute ceiling, whatever it collected');

  /* The benchmark profile itself (§16): a preferred line of four maximum rolls
     and three acceptable lines of one each. It spends 7 of the 8 contributions a
     finished Legend holds, so — unlike a four-full-line denominator — it is an
     artifact the game can actually produce. */
  const benchmarkLegend = readArtifact({
    rid: 3, type: 1, attribute: 1, natural_rank: 5, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 20, 3, 0, 0], [301, 5, 0, 0, 0], [302, 5, 0, 0, 0], [303, 5, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  });
  assert.ok(benchmarkLegend, 'the benchmark artifact must be a legal record');

  /** Scores a read record against a band per line, through the shipped function. */
  const shippedScore = (artifact, bands, mainPreference = 'preferred') => calculateArtifactOptimalValue({
    acceptableWorth: 50,
    hasPropertyPreferences: true,
    mainPreference,
    subProperties: artifact.subProperties.map((line, index) => ({
      preference: bands[index], value: line.valueHundredths, maximum: line.maximumHundredths,
    })),
  });

  const benchmarkScore = shippedScore(benchmarkLegend,
    ['preferred', 'acceptable', 'acceptable', 'acceptable']);
  assert.equal(percent(benchmarkScore), 100,
    'the shipped calculation must put the benchmark artifact at 100 %');

  /* The same artifact against a monster that prefers all four: above the
     benchmark, because it carries more than one preferred line. */
  const perfectScore = shippedScore(legend, ['preferred', 'preferred', 'preferred', 'preferred']);
  assert.ok(perfectScore > benchmarkScore, 'more preferred lines must score higher than the benchmark');
  assert.equal(percent(perfectScore), 133, 'a Legend whose every line is preferred is 133 %');

  /* A Normal artifact of the same properties must score far below the Legend,
     which is the defect the absolute per-line ceiling repairs. */
  const normal = readArtifact({
    rid: 2, type: 1, attribute: 1, natural_rank: 1, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 5, 0, 0, 0], [301, 5, 0, 0, 0], [302, 5, 0, 0, 0], [303, 5, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  });
  assert.ok(normal, 'the Normal artifact must be a legal record');
  const normalScore = shippedScore(normal, ['preferred', 'preferred', 'preferred', 'preferred']);
  assert.equal(percent(normalScore), 80, 'a max-rolled Normal artifact preferred throughout is 80 %');
  assert.ok(normalScore < perfectScore,
    'a max-rolled Normal artifact must never outscore a perfect Legend');

  /* The main property through the shipped function: an unwanted main costs its
     own two points and leaves every rolled line standing. Before September 12,
     2026 this returned exactly zero — the whole reason for the change. */
  const unwantedMain = shippedScore(legend, ['preferred', 'preferred', 'preferred', 'preferred'], 'unwanted');
  assert.equal(percent(unwantedMain), 107,
    'a perfect Legend on an unwanted main keeps its sub-property points');
  agrees(perfectScore - unwantedMain, artifactMainPropertyPoints / artifactScorePointBenchmark(50),
    'the shipped calculation must charge exactly the main property for a wrong main');
  assert.ok(unwantedMain > 1,
    'a perfect artifact on a wrong main must still beat the benchmark, not read as worthless');
  /* And the benchmark artifact itself on a wrong main: a real score, clearly
     reduced, nowhere near the zero the multiplier model returned. */
  assert.equal(percent(shippedScore(legend, ['preferred', 'acceptable', 'unwanted', 'unwanted'], 'unwanted')), 73,
    'an ordinary good artifact on a wrong main is 73 %, not 0 %');
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
