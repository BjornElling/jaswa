#!/usr/bin/env node
/**
 * Awakening scope — "this monster, or a more awakened form of it" is directional
 * and stays inside one element's chain (`ACCOUNT-TABLES.md` §3).
 *
 * The catalogue ids used here: 24801 Poison Master (Water) → 24811 Kyle, its
 * Fire sibling 24802 Poison Master (Fire) → 24812 Todd, and the three-stage
 * 10101 Fairy (Water) → 10111 Elucia → 10131 Elucia (2A).
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const {
    isSameOrHigherAwakening, monsterAwakeningPosition, withHigherAwakenings,
  } = await server.ssrLoadModule('/app/lib/monster-identity.ts');

  assert.deepEqual(monsterAwakeningPosition(24801), { lineageId: '248_1', tier: 0 },
    'an unawakened monster is tier 0 of its own element lineage');
  assert.equal(monsterAwakeningPosition(24811).tier, 1, 'an awakened monster is tier 1');
  assert.equal(monsterAwakeningPosition(10131).tier, 3, 'a second awakening is tier 3');
  assert.notEqual(monsterAwakeningPosition(24801).lineageId, monsterAwakeningPosition(24802).lineageId,
    'two elements of one family are separate lineages');

  /* Directional: upwards yes, downwards no. */
  assert.equal(isSameOrHigherAwakening(24811, 24801), true,
    'the awakened form satisfies a question asked about the unawakened one');
  assert.equal(isSameOrHigherAwakening(24801, 24801), true, 'a monster is its own same-or-higher form');
  assert.equal(isSameOrHigherAwakening(24801, 24811), false,
    'the unawakened form must not satisfy a question asked about the awakened one');
  assert.equal(isSameOrHigherAwakening(10131, 10101), true, 'a 2A satisfies a question about the base form');
  assert.equal(isSameOrHigherAwakening(10131, 10111), true, 'a 2A satisfies a question about the awakened form');
  assert.equal(isSameOrHigherAwakening(10111, 10131), false, 'an awakened form is below a 2A');

  /* Element is a boundary, not a step. */
  assert.equal(isSameOrHigherAwakening(24812, 24801), false,
    'the Fire awakening must not satisfy a question about the Water monster');
  assert.equal(isSameOrHigherAwakening(10132, 10101), false,
    'a 2A of another element is a different monster');

  /* An id outside the awakening scheme has no chain, so it matches only itself. */
  assert.equal(isSameOrHigherAwakening(99999999, 99999999), true,
    'an uncatalogued id matches itself');
  assert.equal(isSameOrHigherAwakening(99999999, 24801), false,
    'an uncatalogued id is not a higher form of a real monster');

  /* Widening a search's name matches. */
  const account = [24801, 24811, 24802, 24812, 10101, 10111, 10131];
  const fromUnawakened = withHigherAwakenings([24801], account);
  assert.equal(fromUnawakened.has('24811'), true, 'searching the base name reaches the awakened form');
  assert.equal(fromUnawakened.has('24812'), false, 'searching the base name stays out of another element');
  assert.equal(fromUnawakened.has('24802'), false, 'searching one element does not pull in its sibling');

  const fromAwakened = withHigherAwakenings([24811], account);
  assert.equal(fromAwakened.has('24811'), true, 'the searched form itself is kept');
  assert.equal(fromAwakened.has('24801'), false,
    'searching the awakened name must not show the unawakened form');

  /* A name shared by every element — "Poison Master" — matches all five, and
     each lineage then contributes its own higher forms, but no others. */
  const bothElements = withHigherAwakenings([24801, 24802], account);
  assert.deepEqual([...bothElements].sort(), ['24801', '24802', '24811', '24812'],
    'each matched lineage contributes its own awakenings and nothing else');

  /* Where a search matched two stages of one lineage, the lower is the floor:
     the higher stays in for its own name match rather than raising the bar. */
  const twoStages = withHigherAwakenings([10101, 10131], account);
  assert.deepEqual([...twoStages].sort(), ['10101', '10111', '10131'],
    'the lowest matched stage sets the floor for its lineage');

  /* Nothing is invented: a higher form the account does not hold is not added. */
  const sparse = withHigherAwakenings([10101], [10101, 10111]);
  assert.equal(sparse.has('10131'), false, 'a form the list does not hold is not conjured into the results');

  console.log('Awakening scope reaches higher forms only, within one element lineage, from what the account holds.');
} finally {
  await server.close();
}
