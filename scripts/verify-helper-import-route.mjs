import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { blankPreferences, readPreferences } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const helperGame = { helperSession: { instanceId: 'helper', sessionId: 1 } };
  const fileGame = { fileName: 'account.json' };
  const validFilePreference = { ...blankPreferences(), importRoute: 'file' };
  const unreadableRoute = { ...blankPreferences(), importRoute: 'carrier-pigeon' };

  assert.equal(readPreferences(unreadableRoute, helperGame).importRoute, 'direct',
    'an unreadable route must follow the helper source recorded on the imported game');
  assert.equal(readPreferences(null, helperGame).importRoute, 'direct',
    'missing preferences must follow the helper source recorded on the imported game');
  assert.equal(readPreferences(null, fileGame).importRoute, 'file',
    'a file import keeps the neutral file source when preferences are unavailable');
  assert.equal(readPreferences(validFilePreference, helperGame).importRoute, 'file',
    'a valid explicit file choice must not be overridden by an older helper game');

  console.log('Helper-backed imports retain their source when the stored route cannot be read.');
} finally {
  await server.close();
}
