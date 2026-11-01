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
 * against the monster it is engraved on, at every value the acceptable-worth setting
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
import { createVerificationServer as createServer } from './verification-server.mjs';

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
  const { canEngraveArtifacts } = await server.ssrLoadModule('/app/lib/monster-engrave-eligibility.ts');
  const { monsterSpeciesId } = await server.ssrLoadModule('/app/lib/monster-species.ts');
  const { createImportedGame } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { speciesMainStatAdvice } = await server.ssrLoadModule('/app/lib/main-stat-model.ts');

  /* The app never scores the raw export: the import merges the engraved pieces
     into one artifact list first, so the comparison starts where the app does. */
  const raw = JSON.parse(readFileSync(exportPath, 'utf8'));
  const game = createImportedGame('agreement-check', raw, { knownSections: [], unknownMonsterIds: [] }).data;
  const artifacts = readArtifacts(game);
  const units = new Map((game.unit_list ?? []).map((unit) => [String(unit.unit_id), unit]));

  /* Grouped by the species it is engraved on, because a score matrix is indexed by
     species and one request then answers for every artifact on that species. */
  const bySpecies = new Map();
  for (const artifact of artifacts) {
    if (artifact.occupiedId === null) continue;
    const unit = units.get(String(artifact.occupiedId));
    if (!unit || !canEngraveArtifacts(unit)) continue;
    const species = monsterSpeciesId(unit.unit_master_id);
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push({ artifact, unit, masterId: unit.unit_master_id, unitId: String(unit.unit_id) });
  }

  const pairs = [...bySpecies.values()].reduce((total, entries) => total + entries.length, 0);
  assert.ok(pairs > 0,
    `No engraved artifact in ${exportPath} is engraved on a monster on the roster, so this check measured nothing.`);

  let compared = 0;
  let statedCompared = 0;
  let copyRowCompared = 0;
  for (const acceptableWorth of acceptableWorthChoices) {
    const settings = {
      acceptableWorth,
      onlyFactorInOwnedMonsters: false,
      onlyLevel40Monsters: false,
      /* The library column describes an artifact as it stands, so the routes
         are compared on the reading that has no conversion in it. The projected
         figure has only one producer and nothing to disagree with. */
      conversionStoneMode: 'none',
      conversionRoll: 'average',
      ignoreInsignificantDifferences: false,
      insignificantDifference: 3,
      includeIntangibleArtifacts: true,
      recalculate: 'manual',
    };
    const requests = buildArtifactScoreRequestsForMonsterIds(game, [...bySpecies.keys()], settings);

    for (const [species, entries] of bySpecies) {
      for (const { artifact, unit, masterId, unitId } of entries) {
        /* The library answers for the copy the artifact is engraved on, and a copy
           whose own runes give the main-stat model a different answer from its
           species has its own row — so the engine is asked for the copy, and
           falls back on the species row exactly where the copy has none. A copy
           that states its own answers is exercised below. */
        const library = artifactValueOnMonster(artifact, unit, settings);
        const engine = artifactPairScore(requests, artifact.id, species, { conversions: false, unitId });
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

        /* The same artifact again, on a copy rebuilt so the main-stat model
           reads it apart from its species: six runes lifting only the main its
           species' statistics value least. The fixture holds no such copy, and
           this is the row the library and the engine are likeliest to reach by
           different routes. */
        const speciesBands = speciesMainStatAdvice(species)?.artifact.bands;
        if (speciesBands !== undefined) {
          const least = ['HP', 'ATK', 'DEF'].find((stat) => speciesBands[stat] === 'unwanted')
            ?? ['HP', 'ATK', 'DEF'].find((stat) => speciesBands[stat] !== 'preferred');
          const effectId = { HP: 2, ATK: 4, DEF: 6 }[least];
          const blank = { 1: [3, 0], 2: [8, 0], 3: [5, 0], 4: [2, 0], 5: [1, 0], 6: [2, 0] };
          const runes = [1, 2, 3, 4, 5, 6].map((slot) => ({ slot_no: slot, set_id: 0, pri_eff: slot === 2 ? [effectId, 63] : blank[slot] }));
          const rebuilt = { con: 1000, atk: 1000, def: 1000, ...unit, runes };
          const rebuiltGame = { ...game, unit_list: game.unit_list.map((entry) => (String(entry.unit_id) === unitId ? rebuilt : entry)) };
          const rebuiltRequests = buildArtifactScoreRequestsForMonsterIds(rebuiltGame, [...bySpecies.keys()], settings);
          assert.ok(rebuiltRequests.some((request) => request.monsters.some((row) => row.ownerUnitId === unitId)),
            `copy ${unitId} built for ${least} has no row of its own beside species ${species}`);
          const rebuiltLibrary = artifactValueOnMonster(artifact, rebuilt, settings);
          const rebuiltEngine = artifactPairScore(rebuiltRequests, artifact.id, species, { conversions: false, unitId });
          const rebuiltWhere = `artifact ${artifact.id} on copy ${unitId} rebuilt for ${least} at acceptableWorth ${acceptableWorth} %`;
          assert.equal(rebuiltLibrary === undefined, rebuiltEngine === undefined, `${rebuiltWhere}: one reader judges and the other does not.`);
          if (rebuiltLibrary !== undefined) {
            assert.equal(Math.round(rebuiltLibrary * 100), rebuiltEngine.value,
              `${rebuiltWhere}: the library says ${Math.round(rebuiltLibrary * 100)} % and the packed scorer says ${rebuiltEngine.value} %.`);
            compared += 1;
            copyRowCompared += 1;
          }
        }

        /* The same artifact again, against two statements its owner could make.
           The first uses both bands: the main it carries only accepted, and the
           properties it carries split between preferred and accepted, so a
           disagreement about what an accepted line is worth cannot hide. The
           second empties both bands of both questions, which is no answer
           (`statedAnswer`): both readers must fall back to the defaults alike,
           rather than one of them reading the empty pair as a statement. */
        const carried = artifact.subProperties.filter((line) => line.maximumHundredths !== null);
        if (carried.length === 0) continue;
        const ids = carried.map((line) => line.definition.id);
        const statements = [
          {
            main: { preferred: ['HP', 'ATK', 'DEF'].filter((main) => main !== artifact.mainProperty), acceptable: [artifact.mainProperty] },
            sub: { preferred: ids.filter((_, at) => at % 2 === 0), acceptable: ids.filter((_, at) => at % 2 === 1) },
          },
          { main: { preferred: [], acceptable: [] }, sub: { preferred: [], acceptable: [] } },
        ];
        for (const { main, sub } of statements) {
          const stated = { unitId, mainStat: main, artifacts: { sub: { [artifact.category]: sub } } };
          const statedRequests = buildArtifactScoreRequestsForMonsterIds(
            game, [...bySpecies.keys()], settings, undefined, { [unitId]: stated },
          );
          const statedLibrary = artifactValueOnMonster(artifact, unit, settings, stated);
          const statedEngine = artifactPairScore(statedRequests, artifact.id, species, { conversions: false, unitId });
          const statedLibraryPercent = statedLibrary === undefined ? undefined : Math.round(statedLibrary * 100);
          const statedEnginePercent = statedEngine === undefined ? undefined : statedEngine.value;
          const statedWhere = `artifact ${artifact.id} on stated copy ${unitId}`
            + ` (${main.preferred.length + main.acceptable.length === 0 ? 'emptied' : 'banded'})`
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
  }

  assert.ok(copyRowCompared > 0, 'No copy with a main-stat row of its own was compared, so that path measured nothing.');
  assert.ok(statedCompared > 0,
    'No stated-preference reading was compared, so the per-copy path measured nothing.');
  console.log(`Both artifact score readers agree on ${compared} judged readings`
    + ` (${pairs} engraved artifacts across ${bySpecies.size} species,`
    + ` ${copyRowCompared} of them on a copy rebuilt so the main-stat model reads it apart from its species,`
    + ` at each of ${acceptableWorthChoices.length} acceptable-worth settings;`
    + ` ${statedCompared} of them against a per-copy statement in two bands or with both bands emptied).`);
} finally {
  await server.close();
}
