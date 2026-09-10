#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { createMonsterCopyIndex, createMonsterSelectionIndex, monsterIdentityId } = await server.ssrLoadModule('/app/lib/monster-selection.ts');
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

  /* Copies are counted per monster, not per entry: separate single entries
     count together, a stack counts its quantity, and neither may leave a
     monster the list demonstrably holds twice out of a "have two" list. */
  assert.equal(createMonsterCopyIndex([{ masterId: 10101, copies: 1 }]).copies(10101), 1,
    'one entry of one copy is one copy');
  assert.equal(createMonsterCopyIndex([
    { masterId: 10101, copies: 1 },
    { masterId: 10101, copies: 1 },
  ]).copies(10101), 2, 'two separate single entries of one monster are two copies');
  assert.equal(createMonsterCopyIndex([{ masterId: 10101, copies: 2 }]).copies(10101), 2,
    'a shrine stack of two is two copies');
  assert.equal(createMonsterCopyIndex([
    { masterId: 10101, copies: 1 },
    { masterId: 10131, copies: 1 },
  ]).copies(10101), 2, 'an awakening is a copy of the same monster');
  /* All three stages of one monster at once — unawakened, awakened and second
     awakened — count as three copies, and the tally reads the same whichever
     stage asks for it. */
  const threeStages = createMonsterCopyIndex([
    { masterId: 10101, copies: 1 },
    { masterId: 10111, copies: 1 },
    { masterId: 10131, copies: 1 },
  ]);
  for (const stage of [10101, 10111, 10131]) {
    assert.equal(threeStages.copies(stage), 3,
      `an unawakened, an awakened and a second awakened copy are three of the same monster, asked via ${stage}`);
  }
  const awakened = createMonsterSelectionIndex([{ masterId: 10111, level: 40, maxSkilled: true }]);
  assert.equal(awakened.matches(10101, both), true,
    'a Lv. 40 awakened copy must satisfy both conditions for its unawakened form');
  assert.equal(createMonsterCopyIndex([
    { masterId: 10101, copies: 1 },
    { masterId: 10102, copies: 1 },
  ]).copies(10101), 1, 'a sibling of another element is a different monster');
  assert.equal(createMonsterCopyIndex([
    { masterId: 99999999, copies: 1 },
    { masterId: 99999999, copies: 1 },
  ]).copies(99999999), 2, 'a monster the catalogue does not carry still counts its own copies');
  assert.equal(createMonsterCopyIndex([{ masterId: 10101, copies: 1 }]).copies(10102), 0,
    'a monster the list does not hold has no copies');

  console.log('Monster selection canonicalizes awakenings, second awakenings, collaboration releases, and counts copies per monster.');
} finally {
  await server.close();
}
