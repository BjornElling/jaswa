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
  const { monsterCopyNamesIn } = await server.ssrLoadModule('/app/lib/monster-names.ts');
  const { monsterProfileScope, monsterProfileAreas } = await server.ssrLoadModule('/app/lib/monster-profile-scope.ts');

  assert.equal(defaultDirectImportMode, 'live', 'a connected helper keeps the workspace synchronized by default');

  const blank = blankPreferences();
  const [firstRole, ...otherRoles] = blank.runeRoles;
  const chosen = {
    ...blank,
    updatedAt: '2026-09-01T12:00:00.000Z',
    hardwareAcceleration: false,
    importRoute: 'direct',
    directImportMode: 'on-load',
    general: { ...blank.general, numberFormat: 'european', hourCycle: 'h23' },
    monsterPreferences: {
      scenario: { 17: { unitId: '17', label: 'Arena defence', allowIntangibleRunes: true } },
      'content:arena-attack': { 17: { unitId: '17', statCeilings: { spd: 180 } }, 18: { unitId: '18', alwaysCrits: true } },
    },
    runeHolds: { 901: { unsellable: true }, 902: { unsellable: true } },
    craftIgnores: { selected: [{ runeId: '901', kind: 'grindstone', statId: 8 }], missing: [{ runeId: '902', kind: 'gem', statId: 4 }] },
    runePotential: { ...blank.runePotential, powerUpPolicy: 2, gemGrade: 'Legend', keepMoreForLargerSets: true },
    runeRoles: [withRefreshedMetrics({ ...firstRole, name: 'My nuker', targets: { ...firstRole.targets, atk: 3100 } }), otherRoles[0]],
    artifacts: { ...blank.artifacts, acceptableWorth: 75, recalculate: 'on-change' },
    speedTuning: {
      presets: {
        'deck-24-101': { order: ['18', '17'], whatIfs: { 17: 140 }, noSpeedTuning: false },
        'own-arena': { order: ['17'], whatIfs: {}, noSpeedTuning: true },
      },
    },
    monsterPriority: ['18', '17'],
    presets: [
      { id: 'own-arena', name: 'Arena draft', content: 'arena-attack', members: ['17', '18'], leaderUnitId: '18', gear: null },
      { id: 'own-geared', name: 'Geared', content: null, members: ['17'], leaderUnitId: null,
        gear: { 17: { runeIds: ['901', '902'], artifactIds: ['7001'] } } },
    ],
    presetPriority: { 'deck-1-4': ['18', '17'], 'deck-24-101': ['17'] },
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
  const { artifacts: _artifacts, ...roleWithoutArtifacts } = chosen.runeRoles[0];
  const grownPast = readPreferences({ ...chosen, runeRoles: [{ ...roleWithoutArtifacts, retired: true }, otherRoles[0]] }, null);
  assert.equal(grownPast.runeRoles.length, 2, 'a role missing a field is kept');
  assert.equal(grownPast.runeRoles[0].name, 'My nuker', 'its name survives');
  assert.equal(grownPast.runeRoles[0].targets.atk, 3100, 'its targets survive');
  assert.deepEqual(grownPast.runeRoles[0].artifacts, { atk: false, def: false, hp: false }, 'the missing field starts empty');

  /* Composites are derived: a stale stored copy is recomputed, not a reason to lose the role. */
  const stale = readPreferences({ ...chosen, runeRoles: [{ ...chosen.runeRoles[0], targets: { ...chosen.runeRoles[0].targets, dmg: 1 } }] }, null);
  assert.deepEqual(stale.runeRoles[0], chosen.runeRoles[0], 'a stale composite is recomputed');

  /* Only a role that can no longer be told apart or named is dropped, and alone. */
  const unnamed = readPreferences({ ...chosen, runeRoles: [{ ...chosen.runeRoles[0], name: '' }, otherRoles[0]] }, null);
  assert.deepEqual(unnamed.runeRoles, [otherRoles[0]], 'an unnamed role costs only itself');

  /* The roles' former stored key still carries them: a copy written while
     roles were called presets keeps every role the user made. */
  const { runeRoles: _roles, ...withoutRoles } = chosen;
  const formerKey = readPreferences({ ...withoutRoles, runePotentialPresets: chosen.runeRoles }, null);
  assert.deepEqual(formerKey.runeRoles, chosen.runeRoles, 'roles stored under their former key survive the rename');
  assert.ok(!('runePotentialPresets' in formerKey), 'the former key is read, never written');
  assert.deepEqual(readPreferences({ ...chosen, runePotentialPresets: [otherRoles[0]] }, null).runeRoles, chosen.runeRoles,
    'where both keys exist, the current one wins');

  /* Undefined and empty stay different answers. */
  assert.deepEqual(readPreferences({ ...chosen, runeRoles: [] }, null).runeRoles, [], 'a list the user emptied stays empty');
  assert.equal(readPreferences({ ...chosen, runeRoles: undefined }, null).runeRoles.length, blank.runeRoles.length, 'no list at all gets the shipped roles');

  /* A monster copy loses the field it cannot read, not the copy, nor the same
     copy's profile in another context. */
  const withScenario = (copy) => ({ ...chosen.monsterPreferences, scenario: { 17: copy } });
  const scenarioCopy = chosen.monsterPreferences.scenario[17];
  const renamed = readPreferences({ ...chosen, monsterPreferences: {
    default: { 17: { ...scenarioCopy, runeSets: ['NotASet'] } },
    'content:arena-attack': { 17: { unitId: '17', label: 'Area opener' } },
  } }, null);
  assert.deepEqual(renamed.monsterPreferences.scenario[17], scenarioCopy,
    'renaming Scenario retains saved choices and rejects only an unreadable field');
  assert.equal(renamed.monsterPreferences['content:arena-attack'][17].label, 'Area opener');
  assert.equal('default' in renamed.monsterPreferences, false, 'new documents write only the Scenario key');
  assert.deepEqual(readPreferences({ ...chosen, monsterPreferences: {
    default: { 17: scenarioCopy }, scenario: {},
  } }, null).monsterPreferences, {}, 'an explicitly cleared Scenario profile stays cleared');
  assert.deepEqual({ ...renamed, monsterPreferences: chosen.monsterPreferences }, chosen,
    'the context rename changes no other preference section');
  const monster = readPreferences({ ...chosen, monsterPreferences: withScenario({ ...scenarioCopy, runeSets: ['NotASet'], retired: 1 }) }, null);
  assert.deepEqual(monster.monsterPreferences, chosen.monsterPreferences, 'an unreadable monster field costs only that field');
  const unreadableContext = readPreferences({ ...chosen, monsterPreferences: { ...chosen.monsterPreferences, 'deck-9-9': 'x', '': { 17: scenarioCopy } } }, null);
  assert.deepEqual(unreadableContext.monsterPreferences, chosen.monsterPreferences, 'an unreadable context costs only itself');

  /* Team scopes and contextless documents are outside the current contract.
     Reject only those choices; keep every readable area and other section. */
  const obsolete = readPreferences({ ...chosen, monsterPreferences: {
    ...chosen.monsterPreferences, 'deck-1-4': { 17: scenarioCopy }, 18: { unitId: '18', label: 'Opener' },
    'content:missing': { 17: scenarioCopy },
  } }, null);
  assert.deepEqual(obsolete, chosen, 'obsolete scopes cost only their own choices');

  /* A team's identity must never become a profile key, including in engraving
     tooltips and in the deduplicated area menu. */
  const arenaScope = monsterProfileScope('game', 'arena-attack');
  assert.equal(monsterProfileScope('own', 'arena-attack'), arenaScope, 'game and own teams share an area profile');
  assert.notEqual(monsterProfileScope('game', 'arena-defense'), arenaScope, 'offence and defence are separate areas');
  const teams = [
    { id: 'scenario', kind: 'scenario', profileScope: 'scenario', members: ['17'] },
    { id: 'deck-1-1', kind: 'game', profileScope: arenaScope, members: ['17'] },
    { id: 'deck-1-2', kind: 'game', profileScope: arenaScope, members: ['17'] },
    { id: 'own-arena', kind: 'own', profileScope: arenaScope, members: ['17'] },
  ];
  assert.deepEqual(monsterProfileAreas(teams, '17', 'deck-1-2').map((team) => team.id), ['scenario', 'deck-1-2'],
    'an area appears once and keeps the opened team as its gear source');
  const names = monsterCopyNamesIn([{ unit_id: 17, unit_master_id: 10101 }], {
    scenario: { 17: { unitId: '17', label: 'Scenario job' } },
    [arenaScope]: { 17: { unitId: '17', label: 'Area opener' } },
  }, teams);
  assert.match(names('17', 'scenario'), /Scenario job/);
  assert.match(names('17', 'deck-1-1'), /Area opener/);
  assert.equal(names('17', 'deck-1-1'), names('17', 'deck-1-2'), 'engraving names share the area profile');
  assert.equal(names('17', 'own-arena'), names('17', 'deck-1-2'), 'an own team reads the same shared name');
  assert.equal(names('missing', 'deck-1-2'), undefined, 'a missing monster has no invented name');
  /* Gear is four questions, and one the contract no longer honours — here a
     relic unique in both bands, and an artifact sub no Type artifact rolls —
     costs that question and not the ones beside it. */
  const gear = {
    mainStat: { preferred: ['HP'], acceptable: ['DEF'] },
    artifacts: { sub: { attribute: { preferred: [206], acceptable: [] }, type: { preferred: [301], acceptable: [] } } },
    relics: { unique: { preferred: [1], acceptable: [1] } },
  };
  const geared = readPreferences({ ...chosen, monsterPreferences: withScenario({ ...scenarioCopy, ...gear }) }, null).monsterPreferences.scenario;
  assert.deepEqual(geared[17].mainStat, gear.mainStat, 'a readable main survives its unreadable neighbours');
  assert.deepEqual(geared[17].artifacts, { sub: { attribute: gear.artifacts.sub.attribute } },
    'an unreadable artifact question costs only that question');
  assert.equal(geared[17].relics, undefined, 'an unreadable relic question costs only that question');

  /* A rune hold loses what it cannot read — a lock, which lives with the import now — not the rune's other choice or any other rune. */
  const holds = readPreferences({ ...chosen, runeHolds: { ...chosen.runeHolds, 902: { unsellable: true, locked: true }, 903: { locked: true } } }, null);
  assert.deepEqual(holds.runeHolds, { 901: { unsellable: true }, 902: { unsellable: true } }, 'an unreadable rune hold costs only that choice');

  /* An ignored craft suggestion that cannot be read, or is listed twice, costs only that entry. */
  const ignores = readPreferences({ ...chosen, craftIgnores: {
    selected: [...chosen.craftIgnores.selected, { runeId: '901', kind: 'grindstone', statId: 8 }, { runeId: '903', kind: 'relic', statId: 8 }, { runeId: '', kind: 'gem', statId: 8 }],
    missing: 'unreadable',
  } }, null);
  assert.deepEqual(ignores.craftIgnores, { selected: chosen.craftIgnores.selected, missing: [] }, 'an unreadable ignore costs only that entry or that view');

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

  /* A preset's speed tuning that fails costs that preset; inside one, a what-if
     or an order entry that fails costs only itself. */
  const speed = readPreferences({ ...chosen, speedTuning: { presets: {
    ...chosen.speedTuning.presets,
    'deck-1-9': 'not a tuning',
    'deck-24-101': { order: ['18', 18, '17', '18'], whatIfs: { 17: 140, 18: 0 }, noSpeedTuning: 'no', marginEnabled: true },
  } } }, null);
  assert.deepEqual(speed.speedTuning, chosen.speedTuning, 'an unreadable preset tuning, order entry or what-if costs only itself');

  /* The teams-and-rules shape that came before presets is nothing the contract
     names: it reads as nothing tuned, and costs no other section anything. */
  const oldSpeed = readPreferences({ ...chosen, speedTuning: {
    teams: [{ id: 'team-a', content: speedContents[0].id, members: [{ unitId: '17' }], leaderUnitId: '17' }],
    rules: [{ id: 'rule-a', unitId: '17', must: { kind: 'move-before', unitId: '18' }, displaySpeed: true, dungeonSpeed: false, arenaSpeed: true }],
  } }, null);
  assert.deepEqual(oldSpeed.speedTuning, { presets: {} }, 'teams and rules read as nothing tuned');
  for (const other of Object.keys(chosen)) {
    if (other !== 'speedTuning') assert.deepEqual(oldSpeed[other], chosen[other], `an old speedTuning must keep "${other}"`);
  }

  /* A preset built here is judged whole — its fields bind one another — but
     one that fails costs only itself, never its neighbours or another section. */
  const brokenPresets = readPreferences({ ...chosen, presets: [
    chosen.presets[0],
    { ...chosen.presets[0], id: 'own-lost-leader', leaderUnitId: '99' },
    { ...chosen.presets[1], id: 'own-twice', members: ['17', '18'], gear: { 17: { runeIds: ['901'], artifactIds: [] }, 18: { runeIds: ['901'], artifactIds: [] } } },
    { ...chosen.presets[0], id: 'not-own' },
    chosen.presets[1],
    { ...chosen.presets[1], name: 'Same id again' },
  ] }, null);
  assert.deepEqual(brokenPresets.presets, chosen.presets, 'an unreadable own preset costs only itself');
  for (const other of Object.keys(chosen)) {
    if (other !== 'presets') assert.deepEqual(brokenPresets[other], chosen[other], `a broken own preset must keep "${other}"`);
  }
  assert.deepEqual(readPreferences({ ...chosen, presets: [] }, null).presets, [], 'an emptied preset list stays empty');

  /* A game preset's order loses the entry it cannot read, not the preset or its neighbours. */
  const order = readPreferences({ ...chosen, presetPriority: { ...chosen.presetPriority, 'deck-1-4': ['18', 5, '18', '', '17'], 'deck-99-1': 'x', '': ['17'] } }, null);
  assert.deepEqual(order.presetPriority, chosen.presetPriority, 'an unreadable preset order entry costs only itself');

  /* A key the contract does not name is not a reason to reject anything. */
  assert.deepEqual(readPreferences({ ...chosen, retiredSection: { anything: true } }, null), chosen, 'an unknown section is ignored');

  console.log('Preferences survive a contract change: one unreadable choice costs that choice and nothing beside it.');
} finally {
  await server.close();
}
