import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileMonsterCatalogue } from './monster-catalog-compiler.mjs';

const snapshot = JSON.parse(await readFile(new URL('../app/data/swarfarm-monsters.json', import.meta.url), 'utf8'));
assert.deepEqual(compileMonsterCatalogue(snapshot.monsters), snapshot.monsters);
assert.equal(snapshot.totalCount, snapshot.monsters.length);
const source = { com2us_id: 123, name: 'Fairy', image_filename: 'fairy.png', archetype: 'Support', unused: 42 };
assert.deepEqual(compileMonsterCatalogue([source]), [{ com2us_id: 123, name: 'Fairy', image_filename: 'fairy.png', archetype: 'Support' }]);
for (const invalid of [
  { ...source, com2us_id: 0 }, { ...source, name: '' },
  { ...source, image_filename: null }, { ...source, archetype: 'unknown' },
]) assert.throws(() => compileMonsterCatalogue([invalid]));
assert.throws(() => compileMonsterCatalogue([source, source]), /Duplicate/);
console.log('Monster catalogue compiler: snapshot and malformed source checks passed.');
