#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { createMonsterCopyIndex, createMonsterSelectionIndex } = await server.ssrLoadModule('/app/domain/monsters/monster-selection.ts');
  const { monsterIdentity, monsterIdentityId, monsterSkillFamilyId } = await server.ssrLoadModule('/app/domain/monsters/monster-identity.ts');
  const { collaborationSpecies } = await server.ssrLoadModule('/app/domain/monsters/monster-species.ts');
  const haveLevel40 = { alreadyHaveLevel40: true, familyFullySkilled: false, fodderMon: false, notNeeded: false, candidateLevel: null };
  const familyMaxSkilled = { alreadyHaveLevel40: false, familyFullySkilled: true, fodderMon: false, notNeeded: false, candidateLevel: null };
  const both = { alreadyHaveLevel40: true, familyFullySkilled: true, fodderMon: false, notNeeded: false, candidateLevel: null };

  const trevor = createMonsterSelectionIndex([{ masterId: 20012, level: 40, maxSkilled: true, copies: 1 }]);
  assert.equal(trevor.matches(20002, haveLevel40), true,
    'a Lv. 40 Trevor must satisfy Neostone Fighter (Fire) ownership');
  assert.equal(trevor.matches(20002, both), true,
    'a max-skilled Lv. 40 Trevor must satisfy both Neostone Fighter conditions');

  const unskilledTrevor = createMonsterSelectionIndex([{ masterId: 20012, level: 40, maxSkilled: false, copies: 1 }]);
  assert.equal(unskilledTrevor.matches(20002, familyMaxSkilled), false,
    'one unskilled Lv. 40 family member must fail the family condition');
  assert.equal(unskilledTrevor.matches(20002, both), false,
    'two enabled conditions must combine with AND');

  const ryu = createMonsterSelectionIndex([{ masterId: 24012, level: 40, maxSkilled: true, copies: 1 }]);
  assert.equal(ryu.matches(24502, both), false,
    'a generic Striker must not satisfy conditions from a separate RYU collaboration monster');

  assert.equal(monsterIdentityId(10101), monsterIdentityId(10131),
    'an unawakened monster and its second awakening must share one identity');
  const secondAwakening = createMonsterSelectionIndex([{ masterId: 10131, level: 40, maxSkilled: true, copies: 1 }]);
  assert.equal(secondAwakening.matches(10101, both), true,
    'a Lv. 40 second awakening must satisfy both conditions for its base form');

  const noLevel40 = createMonsterSelectionIndex([{ masterId: 20012, level: 39, maxSkilled: true, copies: 1 }]);
  assert.equal(noLevel40.matches(20002, familyMaxSkilled), false,
    'a family with no Lv. 40 monster must not pass merely because it is empty');

  /* Copies are counted per form, not per entry: separate single entries
     count together, a stack counts its quantity, and neither may leave a
     form the list demonstrably holds twice out of a "have two" list. */
  assert.equal(createMonsterCopyIndex([{ masterId: 10101, copies: 1 }]).copies(10101), 1,
    'one entry of one copy is one copy');
  assert.equal(createMonsterCopyIndex([
    { masterId: 10101, copies: 1 },
    { masterId: 10101, copies: 1 },
  ]).copies(10101), 2, 'two separate single entries of one monster are two copies');
  assert.equal(createMonsterCopyIndex([{ masterId: 10101, copies: 2 }]).copies(10101), 2,
    'a shrine stack of two is two copies');
  /* "Have ≥" counts one form, unlike every other condition here
     (`ACCOUNT-TABLES.md` §4.1): an awakened copy does not inherit a shrine full
     of unawakened ones, and each stage keeps its own tally. */
  const threeStages = createMonsterCopyIndex([
    { masterId: 10101, copies: 12 },
    { masterId: 10111, copies: 1 },
    { masterId: 10131, copies: 1 },
  ]);
  assert.equal(threeStages.copies(10101), 12, 'the unawakened stack counts only itself');
  assert.equal(threeStages.copies(10111), 1, 'an awakened copy does not count its unawakened stack');
  assert.equal(threeStages.copies(10131), 1, 'a second awakening does not count its lesser stages');
  const awakened = createMonsterSelectionIndex([{ masterId: 10111, level: 40, maxSkilled: true, copies: 1 }]);
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

  /* Fodder has a real target: at least one Lv. 40 family member must still
     need skill-ups. A unique specific monster stays out, while a duplicate or
     an already-levelled specific monster is useful. A 2A target narrows the
     acceptable candidates to 2A forms of that family. */
  const fodder = createMonsterSelectionIndex([
    { masterId: 10111, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 10112, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 10113, level: 1, maxSkilled: false, copies: 2 },
    { masterId: 10102, level: 1, maxSkilled: false, copies: 1 },
    { masterId: 10104, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 10105, level: 1, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(fodder.matches(10104, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 40 }), false,
    'a unique Lv. 40 specific monster must not count itself as a spare copy');
  assert.equal(fodder.matches(10101, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 1 }), true,
    'an unawakened copy can feed its awakened Lv. 40 monster');
  assert.equal(fodder.matches(10102, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 1 }), true,
    'an unawakened copy of another element feeds a Lv. 40 monster of its family: skill-up fodder crosses elements');
  assert.equal(fodder.matches(10113, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 1 }), true,
    'a duplicated specific monster is fodder');
  assert.equal(fodder.matches(10105, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 1 }), false,
    'a unique specific monster without a Lv. 40 copy is not fodder');

  /* A family-wide Lv. 40 target does not make every element a spare copy.
     Praline and Madeleine Cookie are separate catalogue families, so an
     unskilled Lv. 40 Praline is not a target for either Cookie. */
  const madeleineFamily = createMonsterSelectionIndex([
    { masterId: 27113, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 26611, level: 1, maxSkilled: false, copies: 1 },
    { masterId: 26612, level: 1, maxSkilled: false, copies: 1 },
  ]);
  const fodderOnly = { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 1 };
  assert.equal(madeleineFamily.matches(26611, fodderOnly), false,
    'a unique Water Madeleine Cookie is not fodder for an unrelated Wind family target');
  assert.equal(madeleineFamily.matches(26612, fodderOnly), false,
    'a unique Fire Madeleine Cookie is not fodder for an unrelated Wind family target');
  assert.notEqual(monsterIdentityId(26611), monsterIdentityId(26612),
    'same-name monsters of different elements must have different identities');
  assert.notEqual(monsterSkillFamilyId(26611), monsterSkillFamilyId(27113),
    'a collaboration monster and a generic monster keep separate skill-up families');
  assert.notEqual(monsterIdentity(26612).identityId, monsterIdentity(26611).identityId,
    'the canonical identity record must preserve the element distinction');
  const separateMadeleineFamily = createMonsterSelectionIndex([
    { masterId: 27113, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 27112, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 26611, level: 1, maxSkilled: false, copies: 1 },
    { masterId: 26612, level: 1, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(separateMadeleineFamily.matches(26612, fodderOnly), false,
    'a generic Praline family target does not make Fire Madeleine Cookie fodder');
  assert.equal(separateMadeleineFamily.matches(26611, fodderOnly), false,
    'a generic Praline family target does not make Water Madeleine Cookie fodder');

  /* Every collaboration pairing is a statistics relationship only. It must
     never make the two catalogue lineages merge for storage, fodder or row
     quantities. This protects all pairings, not just the Cookie families. */
  for (const [speciesId, entry] of Object.entries(collaborationSpecies)) {
    for (const memberId of entry.members) {
      assert.notEqual(monsterIdentityId(speciesId), monsterIdentityId(memberId),
        `collaboration member ${memberId} must keep a separate monster identity from ${speciesId}`);
      assert.notEqual(monsterSkillFamilyId(speciesId), monsterSkillFamilyId(memberId),
        `collaboration member ${memberId} must keep a separate skill-up family from ${speciesId}`);
    }
  }

  const ordinaryElementFamily = createMonsterSelectionIndex([
    { masterId: 10111, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 10102, level: 1, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(ordinaryElementFamily.matches(10102, fodderOnly), false,
    'an ordinary family sibling of another element is not a duplicate');

  const secondAwakeningFodder = createMonsterSelectionIndex([
    { masterId: 10131, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 10132, level: 1, maxSkilled: false, copies: 2 },
    { masterId: 10101, level: 1, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(secondAwakeningFodder.matches(10132, fodderOnly), true,
    'a 2A family member can feed an unskilled 2A target');
  assert.equal(secondAwakeningFodder.matches(10101, fodderOnly), false,
    'a non-2A family member cannot feed an unskilled 2A target');

  const twoLevel40Copies = createMonsterSelectionIndex([
    { masterId: 10111, level: 40, maxSkilled: false, copies: 1 },
    { masterId: 10112, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 10112, level: 40, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(twoLevel40Copies.matches(10112, { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: true, notNeeded: false, candidateLevel: 40 }), true,
    'two copies of a specific Lv. 40 monster satisfy the current duplicate rule');

  /* Not needed mirrors Fodder mon: a levelled copy exists and no Lv. 40 of the
     family has a skill left to take, so there is nothing for this one to feed. */
  const notNeededOnly = { alreadyHaveLevel40: false, familyFullySkilled: false, fodderMon: false, notNeeded: true, candidateLevel: 1 };
  const finishedFamily = createMonsterSelectionIndex([
    { masterId: 10111, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 10101, level: 1, maxSkilled: false, copies: 1 },
    { masterId: 10102, level: 1, maxSkilled: false, copies: 1 },
  ]);
  assert.equal(finishedFamily.matches(10101, notNeededOnly), true,
    'an unawakened copy of a monster already levelled and max skilled is not needed');
  assert.equal(finishedFamily.matches(10102, notNeededOnly), false,
    'a sibling of another element is not levelled merely because its family is');
  assert.equal(finishedFamily.matches(10111, { ...notNeededOnly, candidateLevel: 40 }), false,
    'the only Lv. 40 copy must not count itself as the levelled one');
  assert.equal(fodder.matches(10101, notNeededOnly), false,
    'a family with an unskilled Lv. 40 still needs its fodder');
  assert.equal(createMonsterSelectionIndex([
    { masterId: 10111, level: 40, maxSkilled: true, copies: 1 },
    { masterId: 10131, level: 1, maxSkilled: false, copies: 1 },
  ]).matches(10131, notNeededOnly), false, 'a Lv. 40 1A does not make its 2A spare');
  assert.equal(noLevel40.matches(20002, notNeededOnly), false,
    'a family without any Lv. 40 is not settled yet');
  for (const [masterId, candidateLevel] of [[10101, 1], [10102, 1], [10113, 1], [10105, 1], [10104, 40]]) {
    const requirements = { alreadyHaveLevel40: false, familyFullySkilled: false, candidateLevel };
    assert.ok(!(fodder.matches(masterId, { ...requirements, fodderMon: true, notNeeded: false })
      && fodder.matches(masterId, { ...requirements, fodderMon: false, notNeeded: true })),
      `${masterId} must not be both fodder and not needed`);
  }

  console.log('Monster selection canonicalizes awakenings while keeping collaboration lineages and families separate.');
} finally {
  await server.close();
}
