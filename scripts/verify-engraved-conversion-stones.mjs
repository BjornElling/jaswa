/**
 * Engraved conversion stones live in `artifact_crafts`, not in
 * `rune_craft_item_list`. This script pins the `master_id` encoding recorded in
 * `ARTIFACT-CANONICAL.md` §15.12 and the class-matched availability rule the
 * conversion model depends on.
 *
 * The earlier version of this file asserted the opposite — that craft type 6 of
 * `rune_craft_item_list` named artifact properties. Those records are rune
 * grindstones and enchanted gems whose ids read `<set><stat><grade>`, and
 * decoding them as artifact properties resolved 2 of the account's 40 owned
 * property/class pairs while inventing ids such as -487.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const {
    engravedConversionStoneCounts, isReadableEngravedConversionStone,
    readEngravedConversionStone, readEngravedConversionStones,
  } = await server.ssrLoadModule('/app/lib/artifact-conversion-stones.ts');
  const { validateGameFile } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { ownedConversionPropertyIndexesFor } =
    await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { artifactPropertyIndex } = await server.ssrLoadModule('/app/lib/compute/artifact-score-schema.ts');

  assert.deepEqual(readEngravedConversionStones({}), []);
  assert.deepEqual(readEngravedConversionStones({ artifact_crafts: [] }), []);

  /* An attribute stone: category 101, Water (010), archetype 0 with grade 5,
     property 301 (Damage Dealt on Water). */
  assert.deepEqual(readEngravedConversionStone({ master_id: 101010005301, quantity: 2 }), {
    category: 'attribute', engraveClassCode: 1, grade: 'Legend', propertyId: 301, valued: true, quantity: 2,
  });
  /* A type stone: category 102, no element, archetype 1 (Attack) with grade 3,
     property 407 ([Skill 1] Accuracy). */
  assert.deepEqual(readEngravedConversionStone({ master_id: 102000103407, quantity: 1 }), {
    category: 'type', engraveClassCode: 1, grade: 'Rare', propertyId: 407, valued: true, quantity: 1,
  });

  /* A stone naming a property v8.0.0 retired remains usable in the game, so it
     is read and counted — and marked not valued, because a conversion to a
     property no monster wants is worth nothing. It must never vanish. */
  assert.deepEqual(readEngravedConversionStone({ master_id: 101010005201, quantity: 1 }), {
    category: 'attribute', engraveClassCode: 1, grade: 'Legend', propertyId: 201, valued: false, quantity: 1,
  });
  assert.deepEqual(
    engravedConversionStoneCounts({ artifact_crafts: [
      { master_id: 101010005201, quantity: 3 }, { master_id: 101010005301, quantity: 2 },
    ] }),
    { valued: 2, notValued: 3 },
    'every owned stone is counted, valued or not');
  assert.equal(engravedConversionStoneCounts({}), undefined, 'no stone collection is not the same as owning none');
  /* A retired-property stone never reaches a conversion. */
  assert.deepEqual(ownedConversionPropertyIndexesFor(
    { artifact_crafts: [{ master_id: 101010005201, quantity: 1 }] }, 'attribute', 1), []);
  /* Both class fields filled names a stone this encoding does not describe. */
  assert.equal(readEngravedConversionStone({ master_id: 101010105301, quantity: 1 }), undefined);
  /* A grade outside the natural ranks, a negative quantity and a short id are
     all malformed rather than merely unusual. An empty stack is not: it reads,
     and owns nothing. */
  assert.equal(readEngravedConversionStone({ master_id: 101010009301, quantity: 1 }), undefined);
  assert.equal(readEngravedConversionStone({ master_id: 101010005301, quantity: -1 }), undefined);
  assert.equal(readEngravedConversionStone({ master_id: 1010005301, quantity: 1 }), undefined);
  assert.ok(isReadableEngravedConversionStone({ master_id: 101010005301, quantity: 0 }));
  assert.deepEqual(readEngravedConversionStones({ artifact_crafts: [{ master_id: 101010005301, quantity: 0 }] }), []);

  /* An undecodable stone fails the import loudly, as an unreadable artifact
     does, rather than dropping out of every count. */
  const account = (crafts) => ({
    unit_list: [{ unit_id: 1, unit_master_id: 10101, class: 6, unit_level: 40 }],
    runes: [],
    artifact_crafts: crafts,
  });
  const stoneRefusal = 'This file contains an engraved conversion stone JASWA cannot read.';
  assert.notEqual(validateGameFile(account([{ rid: 1, master_id: 101010005201, quantity: 1 }])).message, stoneRefusal,
    'a retired-property stone is a legal stone and passes the import');
  assert.equal(validateGameFile(account([{ rid: 1, master_id: 101010009301, quantity: 1 }])).message, stoneRefusal);
  assert.equal(validateGameFile(account([{ master_id: 101010005301, quantity: 1 }])).message, stoneRefusal,
    'a stone record without its own id is refused like any other identified collection');

  /* A type-only property may not be engraved onto an attribute stone. */
  assert.equal(readEngravedConversionStone({ master_id: 101010005407, quantity: 1 }), undefined);
  assert.equal(readEngravedConversionStone({ master_id: 102000103301, quantity: 1 }), undefined);

  /* The class binds: a Water stone is available to a Water artifact and to
     nothing else. */
  const crafts = [
    { master_id: 101010005301, quantity: 1 },
    { master_id: 101020004302, quantity: 1 },
    { master_id: 102000103407, quantity: 1 },
  ];
  const water = ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'attribute', 1);
  assert.deepEqual(water, [artifactPropertyIndex.get(301)]);
  const fire = ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'attribute', 2);
  assert.deepEqual(fire, [artifactPropertyIndex.get(302)]);
  /* §10.1: an Intangible artifact cannot be converted at all, so no stone is
     usable on one. The wildcard that makes it fit every monster is the same
     fact that leaves it no class for a stone to match — this used to report the
     category-wide union, which was an answer to a question the rules forbid. */
  assert.deepEqual(ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'attribute', 0), []);
  assert.deepEqual(ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'type', 0), []);
  const attack = ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'type', 1);
  assert.deepEqual(attack, [artifactPropertyIndex.get(407)]);
  /* A category with no stone at all reports none rather than borrowing the
     other category's inventory. */
  assert.deepEqual(ownedConversionPropertyIndexesFor({ artifact_crafts: crafts }, 'type', 2), []);

  console.log('Verified the artifact_crafts stone encoding and class-matched availability.');
} finally {
  await server.close();
}
