/**
 * The two readers of one artifact score, held to one answer.
 *
 * A score reaches the screen by two routes, and they cannot be collapsed into
 * one without losing something real:
 *
 * - **The packed scorer** (`compute/artifact-score-core.ts`) reads typed arrays
 *   and is written to be run over hundreds of thousands of pairs at once, on
 *   the CPU or, in the same shape, on the graphics card. The optimization pages
 *   rank with it.
 * - **The per-artifact reader** (`artifact-value-on-monster.ts`) reads one
 *   artifact object against one monster and answers immediately. The artifact
 *   library's "Value on mon" column is 1,862 independent questions, not a
 *   ranking, so it uses this.
 *
 * Both now take their weights, their main-property points and the benchmark in
 * the denominator from `artifact-optimal-value.ts`, so the *definition* is one.
 * What this script holds is the *result*: for every artifact on an account,
 * against the monster wearing it, at every value the acceptable-worth setting
 * can take, the two routes must agree to the whole percentage point — and must
 * agree about which pairs are not judged at all.
 *
 * Worth a script rather than a reading because the failure is silent and
 * expensive: the same artifact showing 62 % in the library and 61 % on the
 * optimization page is not a crash, it is a user slowly losing confidence in
 * every number the app prints.
 *
 * It runs on the repository's own fixture, so any checkout can run it. Point it
 * at a real export for a wider sweep:
 *   node scripts/verify-artifact-score-agreement.mjs <path-to-export.json>
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const fixture = fileURLToPath(new URL('../tests/fixtures/synthetic-account.json', import.meta.url));
const exportPath = process.argv[2] ?? process.env.JASWA_IMPORT ?? fixture;

/* Every value the slider offers (`ARTIFACT-CANONICAL.md` §19.6). The two routes
   weight an acceptable line differently only if one of them has drifted, and
   the ends are where such a drift would show first. */
const acceptableWorthChoices = [0, 25, 50, 75, 100];

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { readArtifacts } = await server.ssrLoadModule('/app/lib/artifacts.ts');
  const { artifactValueOnMonster } = await server.ssrLoadModule('/app/lib/artifact-value-on-monster.ts');
  const { buildArtifactScoreRequestsForMonsterIds } = await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { artifactPairScore } = await server.ssrLoadModule('/app/lib/artifact-recommendations.ts');
  const { monsterSpeciesId } = await server.ssrLoadModule('/app/lib/monster-species.ts');
  const { createImportedGame } = await server.ssrLoadModule('/app/lib/file-imports.ts');

  /* The app never scores the raw export: the import merges the equipped pieces
     into one artifact list first, so the comparison starts where the app does. */
  const raw = JSON.parse(readFileSync(exportPath, 'utf8'));
  const game = createImportedGame('agreement-check', raw, { knownSections: [], unknownMonsterIds: [] }).data;
  const artifacts = readArtifacts(game);
  const units = new Map((game.unit_list ?? []).map((unit) => [String(unit.unit_id), unit]));

  /* Grouped by the wearer's species, because a score matrix is indexed by
     species and one request then answers for every artifact on that species. */
  const bySpecies = new Map();
  for (const artifact of artifacts) {
    if (artifact.occupiedId === null) continue;
    const unit = units.get(String(artifact.occupiedId));
    if (!unit) continue;
    const species = monsterSpeciesId(unit.unit_master_id);
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push({ artifact, masterId: unit.unit_master_id, unitId: String(unit.unit_id) });
  }

  const pairs = [...bySpecies.values()].reduce((total, entries) => total + entries.length, 0);
  assert.ok(pairs > 0,
    `No equipped artifact in ${exportPath} has a wearer on the roster, so this check measured nothing.`);

  let compared = 0;
  let statedCompared = 0;
  for (const acceptableWorth of acceptableWorthChoices) {
    const settings = {
      acceptableWorth,
      onlyFactorInOwnedMonsters: false,
      onlyLevel40Monsters: false,
      /* The library column describes an artifact as it stands, so the routes
         are compared on the reading that has no conversion in it. The projected
         figure has only one producer and nothing to disagree with. */
      conversionStoneMode: 'none',
      conversionStoneValue: 2,
      ignoreInsignificantDifferences: false,
      insignificantDifference: 3,
      includeIntangibleArtifacts: true,
      recalculate: 'manual',
    };
    const requests = buildArtifactScoreRequestsForMonsterIds(game, [...bySpecies.keys()], settings);

    for (const [species, entries] of bySpecies) {
      for (const { artifact, masterId, unitId } of entries) {
        /* A copy that states its own answers is scored on those, under its own
           row keyed by `unit_id`. Both readers have to reach the same number
           through the user's statement exactly as they do through the
           statistics — the floors and the plural mains are the two parts that
           can silently diverge, so the stated case is exercised below. */
        const library = artifactValueOnMonster(artifact, masterId, settings);
        const engine = artifactPairScore(requests, artifact.id, species, { conversions: false });
        const libraryPercent = library === undefined ? undefined : Math.round(library * 100);
        const enginePercent = engine === undefined ? undefined : engine.value;
        const where = `artifact ${artifact.id} on species ${species} at acceptableWorth ${acceptableWorth} %`;

        /* "Not judged" has to mean the same thing on both pages. A number on
           one and a dash on the other is the same defect as two numbers. */
        assert.equal(libraryPercent === undefined, enginePercent === undefined,
          `${where}: the library ${libraryPercent === undefined ? 'does not judge' : `says ${libraryPercent} %`}`
          + ` but the packed scorer ${enginePercent === undefined ? 'does not judge' : `says ${enginePercent} %`}.`);
        if (libraryPercent === undefined) continue;
        assert.equal(libraryPercent, enginePercent,
          `${where}: the library says ${libraryPercent} % and the packed scorer says ${enginePercent} %.`);
        compared += 1;

        /* The same artifact again, against a statement its owner made: both
           mains wanted, and every property the artifact actually carries wanted
           at a floor just above the roll it has. Every line therefore falls
           short, which is the case that distinguishes "below its floor" from
           "wanted at any roll" — and the two readers must agree on it. */
        const carried = artifact.subProperties.filter((line) => line.maximumHundredths !== null);
        if (carried.length === 0) continue;
        const stated = {
          unitId,
          artifacts: {
            [artifact.category]: {
              main: ['HP', 'ATK', 'DEF'],
              sub: Object.fromEntries(carried.map((line) =>
                [String(line.definition.id), { minimumHundredths: line.valueHundredths + 1 }])),
            },
          },
        };
        const statedRequests = buildArtifactScoreRequestsForMonsterIds(
          game, [...bySpecies.keys()], settings, undefined, { [unitId]: stated },
        );
        const statedLibrary = artifactValueOnMonster(artifact, masterId, settings, stated);
        const statedEngine = artifactPairScore(statedRequests, artifact.id, unitId, { conversions: false });
        const statedLibraryPercent = statedLibrary === undefined ? undefined : Math.round(statedLibrary * 100);
        const statedEnginePercent = statedEngine === undefined ? undefined : statedEngine.value;
        const statedWhere = `artifact ${artifact.id} on stated copy ${unitId}`
          + ` at acceptableWorth ${acceptableWorth} %`;
        assert.equal(statedLibraryPercent === undefined, statedEnginePercent === undefined,
          `${statedWhere}: the library ${statedLibraryPercent === undefined ? 'does not judge' : `says ${statedLibraryPercent} %`}`
          + ` but the packed scorer ${statedEnginePercent === undefined ? 'does not judge' : `says ${statedEnginePercent} %`}.`);
        if (statedLibraryPercent === undefined) continue;
        assert.equal(statedLibraryPercent, statedEnginePercent,
          `${statedWhere}: the library says ${statedLibraryPercent} %`
          + ` and the packed scorer says ${statedEnginePercent} %.`);
        compared += 1;
        statedCompared += 1;
      }
    }
  }

  assert.ok(statedCompared > 0,
    'No stated-preference reading was compared, so the per-copy path measured nothing.');
  console.log(`Both artifact score readers agree on ${compared} judged readings`
    + ` (${pairs} equipped artifacts across ${bySpecies.size} species,`
    + ` at each of ${acceptableWorthChoices.length} acceptable-worth settings;`
    + ` ${statedCompared} of them against a per-copy statement with substat floors).`);
} finally {
  await server.close();
}
