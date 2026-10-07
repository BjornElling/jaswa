/**
 * `rune_craft_item_list` holds the account's Enchanted Gems and Grindstones,
 * and `docs/RUNE-CRAFT-ITEMS.md` records how their two ids read. This script
 * pins that decoding and the placement rules built on it.
 *
 * It exists for the reason `verify-engraved-conversion-stones.mjs` does: the
 * same collection was once decoded as artifact properties, which produced ids
 * such as −487 and two resolved pairs out of forty. A misread of a six-value
 * `craft_type` is just as quiet — a Grindstone read as a Gem would simply offer
 * itself to the wrong runes — so the mapping is asserted rather than trusted.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { readCraftItem, readCraftItems, craftValueRange, craftRollValue, roundAwayFromZero } =
    await server.ssrLoadModule('/app/lib/rune-craft-items.ts');
  const { readRune } = await server.ssrLoadModule('/app/lib/runes.ts');
  const { craftItemFit, craftReach } = await server.ssrLoadModule('/app/lib/rune-craft-plan.ts');

  const stack = (craftType, craftTypeId, amount = 1) => ({
    craft_item_id: craftTypeId * 10 + craftType, craft_type: craftType, craft_type_id: craftTypeId, amount,
  });

  assert.deepEqual(readCraftItems({}), []);
  assert.deepEqual(readCraftItems({ rune_craft_item_list: [] }), []);

  /* The six craft types, each with an id that says set, stat and grade. */
  assert.deepEqual(readCraftItem(stack(1, 13_08_05, 3)), {
    id: '1308051', kind: 'gem', lineage: 'standard', setId: 13, setName: 'Violent',
    statId: 8, statName: 'SPD', grade: 'Legend', amount: 3, range: { minimum: 7, maximum: 10 },
  });
  assert.deepEqual(readCraftItem(stack(2, 13_08_04)), {
    id: '1308042', kind: 'grindstone', lineage: 'standard', setId: 13, setName: 'Violent',
    statId: 8, statName: 'SPD', grade: 'Hero', amount: 1, range: { minimum: 3, maximum: 4 },
  });
  assert.deepEqual(readCraftItem(stack(3, 99_11_05)), {
    id: '9911053', kind: 'gem', lineage: 'immemorial', setId: null, setName: null,
    statId: 11, statName: 'Resistance', grade: 'Legend', amount: 1, range: { minimum: 8, maximum: 11 },
  });
  assert.equal(readCraftItem(stack(4, 99_04_04)).kind, 'grindstone');
  assert.equal(readCraftItem(stack(4, 99_04_04)).lineage, 'immemorial');

  /* Ancient items number their grades ten above the ordinary ranks and read
     their own measured table — not the ordinary range and not a multiplier. */
  const ancientGem = readCraftItem(stack(5, 13_08_14));
  assert.equal(ancientGem.lineage, 'ancient');
  assert.equal(ancientGem.kind, 'gem');
  assert.equal(ancientGem.grade, 'Hero');
  assert.deepEqual(ancientGem.range, { minimum: 5, maximum: 9 });
  const ancientStone = readCraftItem(stack(6, 13_08_15));
  assert.equal(ancientStone.kind, 'grindstone');
  assert.equal(ancientStone.grade, 'Legend');
  assert.deepEqual(ancientStone.range, { minimum: 4, maximum: 6 });
  /* An ordinary grade code on an Ancient type, or an Ancient one on an ordinary
     type, is a record this encoding does not describe. */
  assert.equal(readCraftItem(stack(5, 13_08_04)), null);
  assert.equal(readCraftItem(stack(1, 13_08_14)), null);

  /* A Grindstone may only ever carry one of the seven grindable stats (§8).
     This is the check that keeps a misread craft_type from passing silently. */
  assert.equal(readCraftItem(stack(2, 13_10_05)), null, 'a CRI Dmg grindstone does not exist');
  assert.notEqual(readCraftItem(stack(1, 13_10_05)), null, 'a CRI Dmg gem does');

  /* Set 99 belongs to the Immemorial types and to nothing else, in either
     direction. */
  assert.equal(readCraftItem(stack(1, 99_08_05)), null);
  assert.equal(readCraftItem(stack(3, 13_08_05)), null);
  /* An unknown set, an unknown stat, a craft type outside the six, an empty
     stack: all rejected rather than half-read. */
  assert.equal(readCraftItem(stack(1, 12_08_05)), null, 'set 12 is not a rune set');
  assert.equal(readCraftItem(stack(1, 13_07_05)), null, 'effect 7 is not a rune property');
  assert.equal(readCraftItem(stack(7, 13_08_05)), null);
  assert.equal(readCraftItem(stack(1, 13_08_05, 0)), null);

  /* The §8 tables, spot-checked at both ends of both kinds. */
  assert.deepEqual(craftValueRange('gem', 'standard', 1, 'Normal'), { minimum: 100, maximum: 150 });
  assert.deepEqual(craftValueRange('gem', 'standard', 1, 'Legend'), { minimum: 400, maximum: 580 });
  assert.deepEqual(craftValueRange('grindstone', 'standard', 8, 'Legend'), { minimum: 4, maximum: 5 });
  assert.deepEqual(craftValueRange('gem', 'standard', 4, 'Hero'), { minimum: 7, maximum: 11 });
  assert.equal(craftValueRange('grindstone', 'standard', 10, 'Legend'), undefined, 'CRI Dmg cannot be ground');
  assert.deepEqual(craftValueRange('gem', 'ancient', 8, 'Legend'), { minimum: 7, maximum: 11 });
  assert.deepEqual(craftValueRange('grindstone', 'ancient', 2, 'Legend'), { minimum: 5, maximum: 12 });
  assert.equal(craftValueRange('grindstone', 'ancient', 10, 'Legend'), undefined,
    'Ancient does not make an ungrindable stat grindable');

  const spd = { minimum: 7, maximum: 10 };
  assert.equal(craftRollValue(spd, 'minimum'), 7);
  assert.equal(craftRollValue(spd, 'one-third'), 8);
  assert.equal(craftRollValue({ minimum: 2, maximum: 7 }, 'one-third'), 4, 'one third rounds to the nearest whole, like every stop');
  assert.equal(craftRollValue(spd, 'average'), 9);
  assert.equal(craftRollValue(spd, 'three-quarters'), 9);
  assert.equal(craftRollValue(spd, 'maximum'), 10);
  assert.equal(roundAwayFromZero(1.5), 2);
  assert.equal(roundAwayFromZero(-1.5), -2);

  /* ------------------------------------------------------------- placement */

  /* `extra` is the default grade, which every real export carries and the reader
     requires: a rune whose rarity the vocabulary does not cover is rejected
     rather than given a fallback (`AGENTS.md` §0.1). */
  const runeRecord = {
    rune_id: 1, set_id: 13, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 12,
    occupied_type: 2, occupied_id: 0,
    pri_eff: [4, 63], prefix_eff: [0, 0],
    sec_eff: [[2, 8, 0, 0], [9, 6, 0, 0], [10, 5, 0, 0], [8, 5, 0, 3]],
  };
  const rune = (overrides = {}) => {
    const parsed = readRune({ ...runeRecord, ...overrides });
    if (parsed) return parsed;
    /* These two cases deliberately make an otherwise invalid rune to test the
       placement diagnostic. The import reader must reject it, so alter the
       already-read fixture only after that rejection has been observed. */
    const base = readRune(runeRecord);
    assert.ok(base);
    if (overrides.pri_eff) {
      return { ...base, mainStatId: overrides.pri_eff[0], mainValue: overrides.pri_eff[1] };
    }
    if (overrides.prefix_eff) {
      return {
        ...base,
        prefixStatId: overrides.prefix_eff[0] || null,
        prefixValue: overrides.prefix_eff[1] || 0,
      };
    }
    throw new Error('The rune fixture override was rejected unexpectedly.');
  };
  assert.equal(readRune({ ...runeRecord, pri_eff: [8, 42] }), null,
    'an imported main property may not duplicate a sub property');
  assert.equal(readRune({ ...runeRecord, prefix_eff: [8, 5] }), null,
    'an imported prefix may not duplicate a sub property');

  const violentSpdGem = readCraftItem(stack(1, 13_08_05));
  const violentHpGem = readCraftItem(stack(1, 13_02_05));
  const violentSpdStone = readCraftItem(stack(2, 13_08_05));
  const fatalSpdGem = readCraftItem(stack(1, 8_08_05));
  const immemorialSpdGem = readCraftItem(stack(3, 99_08_05));
  const ancientSpdGem = readCraftItem(stack(5, 13_08_15));

  /* A gem must match the set; Immemorial matches every set; Ancient matches
     Ancient runes of its own set and nothing else, in either direction (§7). */
  assert.equal(craftItemFit(violentSpdGem, rune()).fits, true);
  assert.equal(craftItemFit(fatalSpdGem, rune()).fits, false);
  assert.equal(craftItemFit(fatalSpdGem, rune()).block, 'set');
  assert.equal(craftItemFit(immemorialSpdGem, rune()).fits, true);
  assert.equal(craftItemFit(ancientSpdGem, rune()).fits, false);
  assert.equal(craftItemFit(violentSpdGem, rune({ class: 16 })).fits, false, 'an ordinary gem is no fallback');
  assert.equal(craftItemFit(immemorialSpdGem, rune({ class: 16 })).fits, false);
  assert.equal(craftItemFit(ancientSpdGem, rune({ class: 16 })).fits, true);
  assert.equal(craftItemFit(ancientSpdGem, rune({ class: 16, set_id: 8 })).fits, false,
    'an Ancient item still names its own set');

  /* A gem needs +12 (§8) and a slot that can carry the stat (§5). */
  assert.equal(craftItemFit(violentSpdGem, rune({ upgrade_curr: 9 })).block, 'level');
  /* §5: slot 1 can carry ATK % but never DEF + or DEF %, whatever else is on
     the rune. SPD, by contrast, is legal in every slot — the table forbids
     types, not the stats a slot happens not to roll often. */
  const violentDefGem = readCraftItem(stack(1, 13_06_05));
  assert.equal(craftItemFit(violentDefGem, rune({ slot_no: 1, pri_eff: [3, 160] })).block, 'slot');
  assert.equal(craftItemFit(violentDefGem, rune({ slot_no: 2 })).fits, true);
  /* A grindstone has no level requirement of its own. */
  assert.equal(craftItemFit(violentSpdStone, rune({ upgrade_curr: 0 })).fits, true);

  /* The stat may not repeat the main property, the innate, or another sub. */
  assert.equal(craftItemFit(violentSpdGem, rune({ pri_eff: [8, 42] })).block, 'duplicate');
  assert.equal(craftItemFit(violentSpdGem, rune({ prefix_eff: [8, 5] })).block, 'duplicate');
  /* A rune that already carries SPD has exactly one legal target: that same
     property, re-rolled — every other target would duplicate it. */
  const reroll = craftItemFit(violentSpdGem, rune());
  assert.deepEqual(reroll.targets.map((target) => target.index), [3]);
  /* A rune without the gem's stat offers every sub property instead. */
  assert.deepEqual(
    craftItemFit(violentSpdGem, rune({ sec_eff: [[2, 8, 0, 0], [9, 6, 0, 0]] })).targets.map((t) => t.index),
    [0, 1],
  );
  /* A gem whose stat the rune has nowhere legal to take it. */
  assert.equal(craftItemFit(violentHpGem, rune({ sec_eff: [] })).block, 'target');

  /* A grindstone lands on a property of its own stat, and only where its
     ceiling could beat the bonus already there (§8). */
  assert.deepEqual(craftItemFit(violentSpdStone, rune()).targets.map((t) => t.index), [3]);
  assert.equal(craftItemFit(violentSpdStone, rune({ sec_eff: [[8, 5, 0, 10]] })).block, 'target',
    'a Legend SPD stone tops out at 5 and cannot beat a bonus of 10');
  assert.equal(craftItemFit(violentSpdStone, rune({ sec_eff: [[2, 8, 0, 0]] })).block, 'target');

  /* Reach is measured over every rune and splits out the ones in inventory,
     which is the difference between spending an item tonight and taking a
     monster's build apart first. */
  const box = [
    readRune({ rune_id: 1, set_id: 13, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 12, occupied_type: 2, occupied_id: 0, pri_eff: [4, 63], prefix_eff: [0, 0], sec_eff: [[2, 8, 0, 0]] }),
    readRune({ rune_id: 2, set_id: 13, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 12, occupied_type: 1, occupied_id: 77, pri_eff: [4, 63], prefix_eff: [0, 0], sec_eff: [[2, 8, 0, 0]] }),
    readRune({ rune_id: 3, set_id: 13, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 9, occupied_type: 2, occupied_id: 0, pri_eff: [4, 63], prefix_eff: [0, 0], sec_eff: [[2, 8, 0, 0]] }),
    readRune({ rune_id: 4, set_id: 8, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 12, occupied_type: 2, occupied_id: 0, pri_eff: [4, 63], prefix_eff: [0, 0], sec_eff: [[2, 8, 0, 0]] }),
  ];
  assert.equal(box.every(Boolean), true, 'every fixture rune reads');
  const engraved = new Set(box.filter((rune) => rune.occupiedId !== null).map((rune) => rune.id));
  const reach = craftReach([violentSpdGem, fatalSpdGem], box, engraved);
  assert.deepEqual(reach.get(violentSpdGem.id), { fits: 2, spare: 1, block: null });
  assert.deepEqual(reach.get(fatalSpdGem.id), { fits: 1, spare: 1, block: null });
  /* Nothing fits: the blocker reported is the nearest miss across the box, not
     the first one met. Rune 3 is the right set and merely under-levelled, so
     "no rune has reached +12" is the honest line, not "you own no Violent rune". */
  const blocked = craftReach([violentSpdGem], [box[2], box[3]], engraved);
  assert.equal(blocked.get(violentSpdGem.id).fits, 0);
  assert.equal(blocked.get(violentSpdGem.id).block, 'level');

  console.log('Verified the rune_craft_item_list encoding, its value tables and its placement rules.');
} finally {
  await server.close();
}
