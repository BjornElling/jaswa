import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { craftItemCount } = await server.ssrLoadModule('/app/lib/formatting.ts');

  assert.equal(craftItemCount([]), 0);
  assert.equal(craftItemCount([
    { craft_item_id: 1, amount: 1 },
    { craft_item_id: 2, amount: 4 },
    { craft_item_id: 3, amount: 7 },
  ]), 12);
  assert.equal(craftItemCount([
    { craft_item_id: 1, amount: 2 },
    { craft_item_id: 2, amount: 0 },
    { craft_item_id: 3, amount: -1 },
    { craft_item_id: 4, amount: 1.5 },
    { craft_item_id: 5, amount: '3' },
    null,
  ]), 2);
  console.log('Verified empty, stacked and malformed craft-item totals.');
} finally {
  await server.close();
}
