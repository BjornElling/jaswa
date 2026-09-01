import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { readOwnedEngravedConversionPropertyIndexes } = await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { artifactPropertyIndex } = await server.ssrLoadModule('/app/lib/compute/artifact-score-schema.ts');

  assert.deepEqual(readOwnedEngravedConversionPropertyIndexes({ rune_craft_item_list: [] }), []);

  const propertyIds = [206, 214, 300, 411];
  const stonePrefixes = [140_000, 220_000, 1_410_000];
  const records = Array.from({ length: 463 }, (_, index) => ({
    craft_item_id: index + 1,
    craft_type: 6,
    craft_type_id: stonePrefixes[index % stonePrefixes.length] + 600 + propertyIds[index % propertyIds.length],
  }));
  records.push(
    { craft_item_id: 464, craft_type: 5, craft_type_id: 140_814 },
    { craft_item_id: 465, craft_type: 6, craft_type_id: 140_800 },
    { craft_item_id: 466, craft_type: 6, craft_type_id: '140814' },
  );

  assert.deepEqual(
    readOwnedEngravedConversionPropertyIndexes({ rune_craft_item_list: records }),
    propertyIds.map((id) => artifactPropertyIndex.get(id)),
  );
  console.log('Verified empty and 463-stone engraved conversion inventories.');
} finally {
  await server.close();
}
