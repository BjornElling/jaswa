import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { blankPreferences, restoredPreferences } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const helperGame = { helperSession: { instanceId: 'helper', sessionId: 1 } };
  const fileGame = { fileName: 'account.json' };
  const validFilePreference = { ...blankPreferences(), importRoute: 'file' };
  const malformedPreference = { ...blankPreferences(), artifacts: {} };

  assert.equal(restoredPreferences(malformedPreference, helperGame).importRoute, 'direct',
    'a rejected preferences record must retain the helper source recorded on the imported game');
  assert.equal(restoredPreferences(null, fileGame).importRoute, 'file',
    'a file import keeps the neutral file source when preferences are unavailable');
  assert.equal(restoredPreferences(validFilePreference, helperGame).importRoute, 'file',
    'a valid explicit file choice must not be overridden by an older helper game');

  console.log('Helper-backed imports retain their source when preferences are rejected.');
} finally {
  await server.close();
}
