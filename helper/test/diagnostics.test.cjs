'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnosticPath, recordDiagnostic } = require('../src/diagnostics.cjs');

test('records local runtime errors without requiring a console', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jaswa-helper-diagnostics-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await recordDiagnostic('uncaught exception', new Error('Example failure'), directory);
  const content = await fs.readFile(diagnosticPath(directory), 'utf8');
  assert.match(content, /\[uncaught exception\] Error: Example failure/);
});
