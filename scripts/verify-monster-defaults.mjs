#!/usr/bin/env node

/**
 * Holds the preference defaults to what their thresholds were chosen to mean.
 *
 * `app/lib/monster-defaults.ts` turns three captured distributions into
 * provisional preferences, and every cut in `defaultThresholds` was chosen by
 * measuring what it produces across the whole dataset — one preferred main per
 * rune slot, about two preferred rune sets because a monster carries two, and a
 * relic unique band that still distinguishes something
 * (`ENGRAVING-STATISTICS.md` §10).
 *
 * Those measurements are the justification, so they have to stay true. A
 * recapture changes every count in the dataset, and a threshold whose meaning
 * quietly moved with it is the worst kind of wrong: nothing breaks, the defaults
 * simply start saying something else. This script is what makes that visible.
 *
 * It also holds two invariants that would each produce a default nothing can
 * act on, which is `AGENTS.md` §0.1's third failure:
 *
 * - no share exceeds 1, which would mean a distribution was divided by the
 *   wrong denominator;
 * - no captured species ends up with every panel empty.
 *
 * Usage: node scripts/verify-monster-defaults.mjs
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

/* The bands each panel was tuned to produce, as averages over every captured
   species. The window is wide enough that ordinary drift between recaptures
   passes and a threshold that changed meaning does not. */
const expectations = [
  { panel: 'rune sets', preferred: [1.6, 2.4], acceptable: [2.0, 3.0] },
  { panel: 'rune slot 2', preferred: [0.8, 1.3], acceptable: [0.6, 1.2] },
  { panel: 'rune slot 4', preferred: [0.8, 1.3], acceptable: [0.7, 1.3] },
  { panel: 'rune slot 6', preferred: [0.8, 1.3], acceptable: [0.6, 1.2] },
  { panel: 'artifact attribute main', preferred: [0.8, 1.3], acceptable: [0.5, 1.2] },
  { panel: 'artifact attribute sub', preferred: [2.9, 4.3], acceptable: [0, 0] },
  { panel: 'artifact type main', preferred: [0.8, 1.3], acceptable: [0.9, 1.7] },
  { panel: 'artifact type sub', preferred: [2.9, 4.3], acceptable: [0, 0] },
  { panel: 'relic main', preferred: [0.9, 1.5], acceptable: [0.4, 1.1] },
  { panel: 'relic unique', preferred: [0.8, 1.6], acceptable: [1.5, 2.6] },
];

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { monsterDefaults, defaultedMonsterSpeciesIds, runeSlotKeys } =
    await server.ssrLoadModule('/app/lib/monster-defaults.ts');

  assert.ok(defaultedMonsterSpeciesIds.length > 0, 'the dataset covers no species at all');

  const tally = new Map(expectations.map(({ panel }) => [panel, { preferred: 0, acceptable: 0, seen: 0 }]));
  const count = (panel, entries) => {
    const row = tally.get(panel);
    row.seen += 1;
    for (const { band } of entries.values()) {
      if (band === 'preferred') row.preferred += 1;
      else if (band === 'acceptable') row.acceptable += 1;
    }
  };

  let judged = 0;

  for (const speciesId of defaultedMonsterSpeciesIds) {
    const defaults = monsterDefaults(speciesId);
    /* A species whose every panel was empty is dropped by the reader rather
       than returned hollow, so an absent record here is an answer, not a gap. */
    if (!defaults) continue;
    judged += 1;

    const shares = [];
    if (defaults.runes) {
      count('rune sets', defaults.runes.sets);
      shares.push(...[...defaults.runes.sets.values()].map((entry) => entry.share));
      for (const key of runeSlotKeys) {
        count(`rune slot ${key.slice(-1)}`, defaults.runes.slots[key]);
        shares.push(...[...defaults.runes.slots[key].values()].map((entry) => entry.share));
      }
    }
    for (const category of ['attribute', 'type']) {
      const panel = defaults.artifacts?.[category];
      if (!panel) continue;
      count(`artifact ${category} main`, panel.main);
      count(`artifact ${category} sub`, panel.sub);
      shares.push(...[...panel.main.values(), ...panel.sub.values()].map((entry) => entry.share));
    }
    if (defaults.relics) {
      count('relic main', defaults.relics.main);
      count('relic unique', defaults.relics.unique);
      shares.push(...[...defaults.relics.main.values(), ...defaults.relics.unique.values()].map((entry) => entry.share));
    }

    for (const share of shares) {
      assert.ok(
        Number.isFinite(share) && share >= 0 && share <= 1,
        `${speciesId}: a share of ${share} means a distribution was divided by the wrong total`,
      );
    }
  }

  assert.ok(judged > 0, 'every captured species produced no defaults at all');

  const failures = [];
  for (const { panel, preferred, acceptable } of expectations) {
    const row = tally.get(panel);
    if (!row.seen) {
      failures.push(`${panel}: no species carried this panel`);
      continue;
    }
    for (const [band, [low, high]] of [['preferred', preferred], ['acceptable', acceptable]]) {
      const average = row[band] / row.seen;
      if (average < low || average > high) {
        failures.push(`${panel}: ${average.toFixed(2)} ${band} per species, outside ${low}–${high}`);
      }
    }
  }

  assert.deepEqual(failures, [], `thresholds no longer produce what they were chosen for:\n  ${failures.join('\n  ')}`);

  console.log(`Monster defaults: ${judged} species judged, every threshold still means what it was chosen to mean.`);
} finally {
  await server.close();
}
