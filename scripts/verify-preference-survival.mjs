import assert from 'node:assert/strict';
import { createServer } from 'vite';

/*
 * A change to the preferences contract must never cost the user the choices it
 * did not touch. Every stored copy used to be accepted whole or not at all, so
 * adding `speedTuning` rejected every saved document and the next dev-server
 * restart put the presets, the import mode and the Rune Clean-up settings back
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
  const { withRefreshedMetrics } = await server.ssrLoadModule('/app/lib/rune-potential-presets.ts');
  const { speedContents } = await server.ssrLoadModule('/app/lib/speed-contents.ts');

  assert.equal(defaultDirectImportMode, 'live', 'a connected helper keeps the workspace synchronized by default');

  const blank = blankPreferences();
  const [firstPreset, ...otherPresets] = blank.runePotentialPresets;
  const chosen = {
    ...blank,
    updatedAt: '2026-09-01T12:00:00.000Z',
    hardwareAcceleration: false,
    importRoute: 'direct',
    directImportMode: 'on-load',
    general: { ...blank.general, numberFormat: 'european', hourCycle: 'h23' },
    monsterPreferences: { 17: { unitId: '17', label: 'Arena defence', allowBrokenRuneSets: true } },
    runePotential: { ...blank.runePotential, powerUpPolicy: 2, gemGrade: 'Legend', keepMoreForLargerSets: true },
    runePotentialPresets: [withRefreshedMetrics({ ...firstPreset, name: 'My nuker', targets: { ...firstPreset.targets, atk: 3100 } }), otherPresets[0]],
    artifacts: { ...blank.artifacts, acceptableWorth: 75, recalculate: 'on-change' },
    speedTuning: {
      teams: [{ id: 'team-a', content: speedContents[0].id, members: [{ unitId: '17' }], leaderUnitId: '17', marginEnabled: true, margin: 2 }],
      rules: [],
    },
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

  /* A preset the contract has grown past still keeps what the user wrote in it. */
  const { artifacts: _artifacts, ...presetWithoutArtifacts } = chosen.runePotentialPresets[0];
  const grownPast = readPreferences({ ...chosen, runePotentialPresets: [{ ...presetWithoutArtifacts, retired: true }, otherPresets[0]] }, null);
  assert.equal(grownPast.runePotentialPresets.length, 2, 'a preset missing a field is kept');
  assert.equal(grownPast.runePotentialPresets[0].name, 'My nuker', 'its name survives');
  assert.equal(grownPast.runePotentialPresets[0].targets.atk, 3100, 'its targets survive');
  assert.deepEqual(grownPast.runePotentialPresets[0].artifacts, { atk: false, def: false, hp: false }, 'the missing field starts empty');

  /* Composites are derived: a stale stored copy is recomputed, not a reason to lose the preset. */
  const stale = readPreferences({ ...chosen, runePotentialPresets: [{ ...chosen.runePotentialPresets[0], targets: { ...chosen.runePotentialPresets[0].targets, dmg: 1 } }] }, null);
  assert.deepEqual(stale.runePotentialPresets[0], chosen.runePotentialPresets[0], 'a stale composite is recomputed');

  /* Only a preset that can no longer be told apart or named is dropped, and alone. */
  const unnamed = readPreferences({ ...chosen, runePotentialPresets: [{ ...chosen.runePotentialPresets[0], name: '' }, otherPresets[0]] }, null);
  assert.deepEqual(unnamed.runePotentialPresets, [otherPresets[0]], 'an unnamed preset costs only itself');

  /* Undefined and empty stay different answers. */
  assert.deepEqual(readPreferences({ ...chosen, runePotentialPresets: [] }, null).runePotentialPresets, [], 'a list the user emptied stays empty');
  assert.equal(readPreferences({ ...chosen, runePotentialPresets: undefined }, null).runePotentialPresets.length, blank.runePotentialPresets.length, 'no list at all gets the shipped presets');

  /* A monster copy loses the field it cannot read, not the copy. */
  const monster = readPreferences({ ...chosen, monsterPreferences: { 17: { ...chosen.monsterPreferences[17], runeSets: ['NotASet'], retired: 1 } } }, null);
  assert.deepEqual(monster.monsterPreferences, chosen.monsterPreferences, 'an unreadable monster field costs only that field');

  /* A team that fails costs that team. */
  const badTeam = { ...chosen.speedTuning.teams[0], id: 'team-b', margin: 9 };
  const speed = readPreferences({ ...chosen, speedTuning: { teams: [chosen.speedTuning.teams[0], badTeam], rules: [] } }, null);
  assert.deepEqual(speed.speedTuning, chosen.speedTuning, 'an unreadable team costs only itself');

  /* A key the contract does not name is not a reason to reject anything. */
  assert.deepEqual(readPreferences({ ...chosen, retiredSection: { anything: true } }, null), chosen, 'an unknown section is ignored');

  console.log('Preferences survive a contract change: one unreadable choice costs that choice and nothing beside it.');
} finally {
  await server.close();
}
