/**
 * Monster ownership regression — the file route must not accept a mixed
 * account snapshot whose unit list contains another wizard's monster.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { validateGameFile } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const account = (unit_list) => ({
    wizard_id: 7,
    unit_list,
    runes: [{ rune_id: 20, set_id: 1 }],
    artifacts: [],
    relics: [],
    rune_craft_item_list: [],
  });
  const owned = { unit_id: 10, wizard_id: 7, unit_master_id: 14314, unit_level: 40 };

  assert.equal(validateGameFile(account([owned])).valid, true,
    'a snapshot containing this account\'s monster remains importable');

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

  console.log('Monster imports keep the account ownership boundary intact.');
} finally {
  await server.close();
}
