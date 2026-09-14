import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { restoredPreferences, defaultArtifactSettings } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { scoringSettings } = await server.ssrLoadModule('/app/lib/artifact-recommendations.ts');

  assert.equal(defaultArtifactSettings.recalculate, 'manual',
    'a whole-library calculation is work the user asks for, so manual is the default');

  /* A settings block missing the mode is not a complete answer to the contract
     JASWA asks today, and there is no earlier form of the document to honour
     (`AGENTS.md` §0). It is rejected whole rather than filled in, which is what
     keeps every view reading a complete `ArtifactSettings`. */
  const stored = restoredPreferences(null, null);
  const incompleteArtifacts = { ...defaultArtifactSettings, acceptableWorth: 25 };
  delete incompleteArtifacts.recalculate;
  const incomplete = restoredPreferences({ ...stored, artifacts: incompleteArtifacts }, null);
  assert.equal(incomplete.artifacts.acceptableWorth, defaultArtifactSettings.acceptableWorth,
    'a settings block without the mode is not the current contract and must be discarded whole');

  const chosen = restoredPreferences({ ...stored, artifacts: { ...defaultArtifactSettings, recalculate: 'on-change' } }, null);
  assert.equal(chosen.artifacts.recalculate, 'on-change', 'a stored choice must survive a round trip');

  /* A mode this settings page never offered did not come from it. */
  const bogus = restoredPreferences({ ...stored, artifacts: { ...defaultArtifactSettings, recalculate: 'whenever' } }, null);
  assert.notEqual(bogus.artifacts.recalculate, 'whenever', 'an unknown mode must be rejected');

  /* The mode decides *when* a table re-runs, never what it produces. Left in
     the key the views compare a held result against, switching it would mark
     every result stale — and in the on-change mode that reads as the setting
     recalculating the page merely by being chosen. */
  const manual = scoringSettings({ ...defaultArtifactSettings, recalculate: 'manual' });
  const automatic = scoringSettings({ ...defaultArtifactSettings, recalculate: 'on-change' });
  assert.equal(JSON.stringify(manual), JSON.stringify(automatic),
    'switching the mode must not invalidate a result that is still current');
  assert.ok(!('recalculate' in manual), 'the mode is not scoring input');
  /* Every other setting is, so a change to one still makes a held result stale. */
  for (const [key, value] of Object.entries(defaultArtifactSettings)) {
    if (key === 'recalculate') continue;
    assert.ok(key in manual, `${key} decides what a score is and must stay in the key`);
    assert.deepEqual(manual[key], value, `${key} must be carried through unchanged`);
  }

  console.log('Re-calculate mode: manual by default, an incomplete settings block is discarded whole, and the mode never invalidates a result.');
} finally {
  await server.close();
}
