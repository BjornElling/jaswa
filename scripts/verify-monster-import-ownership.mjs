/**
 * Monster ownership regression — the file route must not accept a mixed
 * account snapshot whose unit list contains another wizard's monster.
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { validateGameFile } = await server.ssrLoadModule('/app/ingest/game-export.ts');
  const account = (unit_list) => ({
    wizard_id: 7,
    unit_list,
    /* `extra` is the rarity, which the rune reader requires
       (`AGENTS.md` §0.1): the account here has to be valid for the ownership
       assertions to mean anything. */
    runes: [{ rune_id: 20, set_id: 1, slot_no: 1, class: 6, rank: 5, extra: 5, upgrade_curr: 0, occupied_type: 2, occupied_id: 0, pri_eff: [3, 22], prefix_eff: [0, 0], sec_eff: [] }],
    artifacts: [],
    relics: [],
    rune_craft_item_list: [],
  });
  const owned = { unit_id: 10, wizard_id: 7, unit_master_id: 14314, unit_level: 40 };

  assert.equal(validateGameFile(account([owned])).valid, true,
    'a snapshot containing this account\'s monster remains importable');

  const intangible = (rune_id, slot_no) => ({
    rune_id, set_id: 25, slot_no, class: 6, rank: 5, extra: 5, upgrade_curr: 0,
    occupied_type: 1, occupied_id: 10, pri_eff: [3, 22], prefix_eff: [0, 0], sec_eff: [],
  });
  const twoIntangible = validateGameFile({
    ...account([owned]),
    runes: [intangible(21, 1), intangible(22, 2)],
  });
  assert.equal(twoIntangible.valid, false,
    'a monster with two engraved Intangible Runes must be rejected by the import boundary');
  assert.match(twoIntangible.message, /more than one Intangible Rune/);

  const twoLocations = validateGameFile({
    ...account([owned]),
    unit_storage_normal_list: [{ unit_id: 10, unit_master_id: 14314, unit_level: 1 }],
  });
  assert.equal(twoLocations.valid, false,
    'one unit id cannot describe both Inventory and the normal Sealed Shrine');
  assert.match(twoLocations.message, /Inventory and Sealed Shrine at once/);

  const foreign = validateGameFile(account([
    owned,
    { unit_id: 11, wizard_id: 99, unit_master_id: 13815, unit_level: 40 },
  ]));
  assert.equal(foreign.valid, false,
    'a snapshot containing another wizard\'s monster is rejected');
  assert.match(foreign.message, /cannot verify as belonging to this account/);

  const unverifiable = validateGameFile(account([
    owned,
    { unit_id: 12, unit_master_id: 13815, unit_level: 40 },
  ]));
  assert.equal(unverifiable.valid, false,
    'a snapshot containing a monster without an ownership identity is rejected');

  /* A monster is counted the moment it is accepted, so a field every page
     reads it by must be one JASWA can act on (AGENTS.md §0.1, part 3). */
  for (const [field, value] of [['unit_master_id', 'x'], ['unit_master_id', undefined], ['class', 7], ['unit_level', 41],
    ['unit_level', 0], ['skills', 'none'], ['skills', [[1]]], ['skills', [[1, 0]]]]) {
    const unit = { ...owned, [field]: value };
    if (value === undefined) delete unit[field];
    const report = validateGameFile(account([unit]));
    assert.equal(report.valid, false, `a monster with ${field} ${JSON.stringify(value)} is refused`);
    assert.match(report.message, /monster JASWA cannot read/);
  }
  assert.equal(validateGameFile(account([{ ...owned, class: 6, skills: [[1, 1], [2, 5]] }])).valid, true,
    'a monster with a grade and skills the game can produce is read');
  assert.equal(validateGameFile({ ...account([]), unit_storage_normal_list: [{ unit_id: 30, unit_master_id: 14314, unit_level: 99 }] }).valid, false,
    'a Normal Sealed Shrine unit is held to the same contract as a roster one');

  /* In Scenario a rune or artifact is engraved on one monster at most. */
  const engravedRune = { ...intangible(23, 1), set_id: 1 };
  const twice = validateGameFile(account([
    { ...owned, runes: [engravedRune] },
    { ...owned, unit_id: 13, runes: [{ ...engravedRune, occupied_id: 13 }] },
  ]));
  assert.equal(twice.valid, false, 'one rune under two Scenario monsters is refused');
  assert.match(twice.message, /one rune on two monsters/);

  /* An item's own record and the monsters' lists say the same about where it
     is: Scenario reads the lists, its location reads the record. A rune left
     saying "engraved on Lyn" in the account list after Lyn's swap took it off
     was labelled Lyn's and treated as free at once. */
  const carried = { ...owned, runes: [engravedRune] };
  assert.equal(validateGameFile({ ...account([carried]), runes: [engravedRune] }).valid, true,
    'a prepared account repeats an engraved rune with the same placement');
  const stale = validateGameFile({ ...account([owned]), runes: [engravedRune] });
  assert.equal(stale.valid, false, 'a rune whose record names a monster that does not carry it is refused');
  assert.match(stale.message, /rune on a monster that does not carry it/);
  const both = validateGameFile({ ...account([carried]), runes: [{ ...engravedRune, occupied_type: 2, occupied_id: 0 }] });
  assert.equal(both.valid, false, 'a rune in the inventory and on a monster is refused');
  const artifact = { rid: 50, wizard_id: 7, occupied_id: 10, slot: 1, type: 1, attribute: 1, unit_style: 0, natural_rank: 5, rank: 5, level: 15,
    pri_effect: [100, 1500, 0, 0, 0], sec_effects: [], locked: 0, source: 0, extra: [] };
  const staleArtifact = validateGameFile({ ...account([owned]), artifacts: [artifact] });
  assert.equal(staleArtifact.valid, false, 'an artifact whose record names a monster that does not carry it is refused');
  assert.match(staleArtifact.message, /artifact on a monster that does not carry it/);

  /* A nested Summoned list is validated, published, counted and listed exactly
     as a root one, and a stack at zero is neither counted nor shown. */
  const { createImportedGame } = await server.ssrLoadModule('/app/ingest/game-export.ts');
  const { accountCounts } = await server.ssrLoadModule('/app/lib/account-counts.ts');
  const { summonedShrineRecords } = await server.ssrLoadModule('/app/lib/sealed-shrine-storage.ts');
  const nested = (stacks) => ({ ...account([owned]), GetWizardDataPart1: { GetUnitStorageList: { unit_storage_list: stacks } } });
  assert.equal(validateGameFile(nested([{ unit_master_id: 10101, quantity: -1 }])).valid, false,
    'a nested Summoned stack is validated like a root one');
  assert.equal(validateGameFile(nested([{ unit_master_id: 'x', quantity: 1 }])).valid, false);
  const stacks = nested([{ unit_master_id: 10101, quantity: 3, class: 3 }, { unit_master_id: 10102, quantity: 0, class: 3 }]);
  const report = validateGameFile(stacks);
  assert.equal(report.valid, true, report.message);
  const prepared = createImportedGame('nested.json', stacks, report).data;
  assert.deepEqual(prepared.unit_storage_list, [{ unit_master_id: 10101, quantity: 3, class: 3 }],
    'the nested tab is published at the root without its emptied stack');
  assert.equal(accountCounts(prepared).monsters, 1 + 3, 'the badge counts the roster and the three summoned copies');
  assert.deepEqual(summonedShrineRecords(stacks).map((stack) => stack.quantity), [3], 'a zero stack is never listed, even unprepared');
  assert.deepEqual(prepared.unit_storage_list, summonedShrineRecords(prepared), 'the table reads exactly what is counted');
  assert.equal(validateGameFile({ ...account([owned]), sealedShrineNormal: [{ unit_master_id: 'x' }] }).valid, true,
    'a key no capture shows is neither read nor validated');
  assert.equal(accountCounts({ ...account([owned]), sealedShrineNormal: [{ unit_id: 40, unit_master_id: 10101 }] }).monsters, 1,
    'nor counted');

  console.log('Monster imports keep the account ownership boundary intact.');
} finally {
  await server.close();
}
