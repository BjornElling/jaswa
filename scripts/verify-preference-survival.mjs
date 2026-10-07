import assert from 'node:assert/strict';
import { createServer } from 'vite';

/*
 * A change to the preferences contract must never cost the user the choices it
 * did not touch. Every stored copy used to be accepted whole or not at all, so
 * adding `speedTuning` rejected every saved document and the next dev-server
 * restart put the roles, the import mode and the Rune Clean-up settings back
 * to their defaults at once. This holds the reader to the opposite rule: one
 * choice the contract cannot honour costs that one choice.
 */

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { blankPreferences, readPreferences, defaultDirectImportMode } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { withRefreshedMetrics } = await server.ssrLoadModule('/app/lib/rune-roles.ts');
  const { speedContents } = await server.ssrLoadModule('/app/lib/speed-contents.ts');

  assert.equal(defaultDirectImportMode, 'live', 'a connected helper keeps the workspace synchronized by default');

  const blank = blankPreferences();
  const [firstRole, ...otherRoles] = blank.runePotentialPresets;
  const chosen = {
    ...blank,
    updatedAt: '2026-09-01T12:00:00.000Z',
    hardwareAcceleration: false,
    importRoute: 'direct',
    directImportMode: 'on-load',
    general: { ...blank.general, numberFormat: 'european', hourCycle: 'h23' },
    monsterPreferences: { 17: { unitId: '17', label: 'Arena defence', allowIntangibleRunes: true } },
    runeHolds: { 901: { unsellable: true }, 902: { unsellable: true, locked: true } },
    runePotential: { ...blank.runePotential, powerUpPolicy: 2, gemGrade: 'Legend', keepMoreForLargerSets: true },
    runePotentialPresets: [withRefreshedMetrics({ ...firstRole, name: 'My nuker', targets: { ...firstRole.targets, atk: 3100 } }), otherRoles[0]],
    artifacts: { ...blank.artifacts, acceptableWorth: 75, recalculate: 'on-change' },
    speedTuning: {
      teams: [{ id: 'team-a', content: speedContents[0].id, members: [{ unitId: '17' }], leaderUnitId: '17' }],
      rules: [
        { id: 'rule-a', unitId: '17', must: { kind: 'move-before', unitId: '18' }, displaySpeed: true, dungeonSpeed: false, arenaSpeed: true },
        { id: 'rule-b', unitId: '18', must: { kind: 'stay-between', minimum: 150, maximum: 160 }, displaySpeed: false, dungeonSpeed: false, arenaSpeed: false },
      ],
    },
    monsterPriority: ['18', '17'],
    runeOptimization: { ...blank.runeOptimization, includeHigherPriority: true },
  };

  assert.deepEqual(readPreferences(chosen, null), chosen, 'a complete stored document must read back unchanged');

  /* The incident itself, then every other section in turn: the one missing
     starts from its default and nothing beside it moves. */
  for (const section of Object.keys(chosen)) {
    if (section === 'updatedAt') continue;
    const stored = { ...chosen };
    delete stored[section];
    const read = readPreferences(stored, null);
    for (const other of Object.keys(chosen)) {
      if (other === section) continue;
      assert.deepEqual(read[other], chosen[other], `a stored copy without "${section}" must keep "${other}"`);
    }
    assert.deepEqual(read[section], blankPreferences()[section] ?? read[section], `a missing "${section}" starts from its default`);
  }

  /* Inside a section, one field is one choice. */
  const retiredField = readPreferences({ ...chosen, runePotential: { ...chosen.runePotential, retiredSetting: 3, runeQuality: 99 } }, null);
  assert.equal(retiredField.runePotential.powerUpPolicy, 2, 'an unreadable Rune Clean-up setting must not reset its neighbours');
  assert.equal(retiredField.runePotential.runeQuality, blank.runePotential.runeQuality, 'the unreadable setting starts from its default');
  assert.ok(!('retiredSetting' in retiredField.runePotential), 'a setting the contract no longer names is not carried');

  /* A role the contract has grown past still keeps what the user wrote in it. */
  const { artifacts: _artifacts, ...roleWithoutArtifacts } = chosen.runePotentialPresets[0];
  const grownPast = readPreferences({ ...chosen, runePotentialPresets: [{ ...roleWithoutArtifacts, retired: true }, otherRoles[0]] }, null);
  assert.equal(grownPast.runePotentialPresets.length, 2, 'a role missing a field is kept');
  assert.equal(grownPast.runePotentialPresets[0].name, 'My nuker', 'its name survives');
  assert.equal(grownPast.runePotentialPresets[0].targets.atk, 3100, 'its targets survive');
  assert.deepEqual(grownPast.runePotentialPresets[0].artifacts, { atk: false, def: false, hp: false }, 'the missing field starts empty');

  /* Composites are derived: a stale stored copy is recomputed, not a reason to lose the role. */
  const stale = readPreferences({ ...chosen, runePotentialPresets: [{ ...chosen.runePotentialPresets[0], targets: { ...chosen.runePotentialPresets[0].targets, dmg: 1 } }] }, null);
  assert.deepEqual(stale.runePotentialPresets[0], chosen.runePotentialPresets[0], 'a stale composite is recomputed');

  /* Only a role that can no longer be told apart or named is dropped, and alone. */
  const unnamed = readPreferences({ ...chosen, runePotentialPresets: [{ ...chosen.runePotentialPresets[0], name: '' }, otherRoles[0]] }, null);
  assert.deepEqual(unnamed.runePotentialPresets, [otherRoles[0]], 'an unnamed role costs only itself');

  /* Undefined and empty stay different answers. */
  assert.deepEqual(readPreferences({ ...chosen, runePotentialPresets: [] }, null).runePotentialPresets, [], 'a list the user emptied stays empty');
  assert.equal(readPreferences({ ...chosen, runePotentialPresets: undefined }, null).runePotentialPresets.length, blank.runePotentialPresets.length, 'no list at all gets the shipped roles');

  /* A monster copy loses the field it cannot read, not the copy. */
  const monster = readPreferences({ ...chosen, monsterPreferences: { 17: { ...chosen.monsterPreferences[17], runeSets: ['NotASet'], retired: 1 } } }, null);
  assert.deepEqual(monster.monsterPreferences, chosen.monsterPreferences, 'an unreadable monster field costs only that field');
  /* Gear is four questions, and one the contract no longer honours — here a
     relic unique in both bands, and an artifact sub no Type artifact rolls —
     costs that question and not the ones beside it. */
  const gear = {
    mainStat: { preferred: ['HP'], acceptable: ['DEF'] },
    artifacts: { sub: { attribute: { preferred: [206], acceptable: [] }, type: { preferred: [301], acceptable: [] } } },
    relics: { unique: { preferred: [1], acceptable: [1] } },
  };
  const geared = readPreferences({ ...chosen, monsterPreferences: { 17: { ...chosen.monsterPreferences[17], ...gear } } }, null);
  assert.deepEqual(geared.monsterPreferences[17].mainStat, gear.mainStat, 'a readable main survives its unreadable neighbours');
  assert.deepEqual(geared.monsterPreferences[17].artifacts, { sub: { attribute: gear.artifacts.sub.attribute } },
    'an unreadable artifact question costs only that question');
  assert.equal(geared.monsterPreferences[17].relics, undefined, 'an unreadable relic question costs only that question');

  /* A rune hold loses the choice it cannot read, not the rune's other choice or any other rune. */
  const holds = readPreferences({ ...chosen, runeHolds: { ...chosen.runeHolds, 902: { unsellable: true, locked: 'yes' }, 903: { locked: false } } }, null);
  assert.deepEqual(holds.runeHolds, { 901: { unsellable: true }, 902: { unsellable: true } }, 'an unreadable rune hold costs only that choice');

  /* A priority entry that cannot be read costs that entry; the order of the rest stands. */
  const priority = readPreferences({ ...chosen, monsterPriority: ['18', 5, '', '17', '18'] }, null);
  assert.deepEqual(priority.monsterPriority, ['18', '17'], 'an unreadable or repeated priority entry costs only itself');
  assert.deepEqual(readPreferences({ ...chosen, monsterPriority: [] }, null).monsterPriority, [], 'a priority list the user emptied stays empty');

  const optimization = { ...chosen.runeOptimization, fillEmptySlotsOnly: true, oddSlotsAtTwelve: true,
    limitChanges: true, maxChanges: 6, gems: 'theoretical', gemGrade: 'Legend' };
  assert.deepEqual(readPreferences({ ...chosen, runeOptimization: optimization }, null).runeOptimization,
    optimization, 'every optimization choice survives');
  for (const bad of [0, 7, 1.5, '3', null]) {
    const read = readPreferences({ ...chosen, runeOptimization: { ...optimization, maxChanges: bad } }, null);
    const { maxChanges, ...kept } = read.runeOptimization;
    assert.equal(maxChanges, undefined, 'an invalid limit starts blank');
    const { maxChanges: ignored, ...expected } = optimization;
    assert.equal(ignored, 6);
    assert.deepEqual(kept, expected, 'a rejected limit keeps every neighbouring choice');
  }
  for (const added of ['fillEmptySlotsOnly', 'oddSlotsAtTwelve', 'limitChanges', 'maxChanges']) {
    const stored = { ...optimization }; delete stored[added];
    const read = readPreferences({ ...chosen, runeOptimization: stored }, null).runeOptimization;
    for (const key of Object.keys(stored)) assert.equal(read[key], stored[key], 'a missing setting keeps all other choices');
  }

  /* A team that fails costs that team. */
  const badTeam = { ...chosen.speedTuning.teams[0], id: 'team-b', leaderUnitId: '99' };
  const badRule = { ...chosen.speedTuning.rules[0], id: 'rule-c', must: { kind: 'stay-between', minimum: 160, maximum: 150 } };
  const speed = readPreferences({ ...chosen, speedTuning: { teams: [chosen.speedTuning.teams[0], badTeam], rules: [...chosen.speedTuning.rules, badRule] } }, null);
  assert.deepEqual(speed.speedTuning, chosen.speedTuning, 'an unreadable team or rule costs only itself');

  /* A team field the page no longer offers is left out, and the team kept. */
  const retiredTeamField = readPreferences({ ...chosen, speedTuning: { ...chosen.speedTuning, teams: [{ ...chosen.speedTuning.teams[0], marginEnabled: true, margin: 2 }] } }, null);
  assert.deepEqual(retiredTeamField.speedTuning, chosen.speedTuning, 'a retired team field costs nothing');

  /* A key the contract does not name is not a reason to reject anything. */
  assert.deepEqual(readPreferences({ ...chosen, retiredSection: { anything: true } }, null), chosen, 'an unknown section is ignored');

  console.log('Preferences survive a contract change: one unreadable choice costs that choice and nothing beside it.');
} finally {
  await server.close();
}
