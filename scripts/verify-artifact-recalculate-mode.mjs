import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { readPreferences } = await server.ssrLoadModule('/app/ingest/preferences.ts');
  const { defaultArtifactSettings } = await server.ssrLoadModule('/app/domain/profiles/preference-defaults.ts');
  const { scoringSettings } = await server.ssrLoadModule('/app/domain/artifacts/artifact-recommendations.ts');

  assert.equal(defaultArtifactSettings.recalculate, 'manual',
    'a whole-library calculation is work the user asks for, so manual is the default');

  /* A settings block saved before the mode existed still carries every other
     choice the user made. Only the missing mode starts from its default, so
     every view still reads a complete `ArtifactSettings`. */
  const stored = readPreferences(null, null);
  const incompleteArtifacts = { ...defaultArtifactSettings, acceptableWorth: 25 };
  delete incompleteArtifacts.recalculate;
  const incomplete = readPreferences({ ...stored, artifacts: incompleteArtifacts }, null);
  assert.equal(incomplete.artifacts.acceptableWorth, 25,
    'a settings block without the mode must keep the choices it does carry');
  assert.equal(incomplete.artifacts.recalculate, 'manual', 'the missing mode starts from its default');

  const chosen = readPreferences({ ...stored, artifacts: { ...defaultArtifactSettings, recalculate: 'on-change' } }, null);
  assert.equal(chosen.artifacts.recalculate, 'on-change', 'a stored choice must survive a round trip');

  /* A mode this settings page never offered did not come from it. */
  const bogus = readPreferences({ ...stored, artifacts: { ...defaultArtifactSettings, recalculate: 'whenever' } }, null);
  assert.equal(bogus.artifacts.recalculate, 'manual', 'an unknown mode must be rejected');

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

  console.log('Re-calculate mode: manual by default, a missing mode costs only the mode, and the mode never invalidates a result.');
} finally {
  await server.close();
}
