#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { createMonsterSelectionIndex, monsterIdentityId } = await server.ssrLoadModule('/app/lib/monster-selection.ts');
  const haveLevel40 = { alreadyHaveLevel40: true, familyFullySkilled: false };
  const familyMaxSkilled = { alreadyHaveLevel40: false, familyFullySkilled: true };
  const both = { alreadyHaveLevel40: true, familyFullySkilled: true };

  const trevor = createMonsterSelectionIndex([{ masterId: 20012, level: 40, maxSkilled: true }]);
  assert.equal(trevor.matches(20002, haveLevel40), true,
    'a Lv. 40 Trevor must satisfy Neostone Fighter (Fire) ownership');
  assert.equal(trevor.matches(20002, both), true,
    'a max-skilled Lv. 40 Trevor must satisfy both Neostone Fighter conditions');

  const unskilledTrevor = createMonsterSelectionIndex([{ masterId: 20012, level: 40, maxSkilled: false }]);
  assert.equal(unskilledTrevor.matches(20002, familyMaxSkilled), false,
    'one unskilled Lv. 40 family member must fail the family condition');
  assert.equal(unskilledTrevor.matches(20002, both), false,
    'two enabled conditions must combine with AND');

  const ryu = createMonsterSelectionIndex([{ masterId: 24012, level: 40, maxSkilled: true }]);
  assert.equal(ryu.matches(24502, both), true,
    'a Lv. 40 RYU must satisfy both conditions for its Fire Striker re-release');

  assert.equal(monsterIdentityId(10101), monsterIdentityId(10131),
    'an unawakened monster and its second awakening must share one identity');
  const secondAwakening = createMonsterSelectionIndex([{ masterId: 10131, level: 40, maxSkilled: true }]);
  assert.equal(secondAwakening.matches(10101, both), true,
    'a Lv. 40 second awakening must satisfy both conditions for its base form');

  const noLevel40 = createMonsterSelectionIndex([{ masterId: 20012, level: 39, maxSkilled: true }]);
  assert.equal(noLevel40.matches(20002, familyMaxSkilled), false,
    'a family with no Lv. 40 monster must not pass merely because it is empty');

  console.log('Monster selection canonicalizes awakenings, second awakenings, and collaboration releases.');
} finally {
  await server.close();
}
