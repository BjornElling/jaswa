'use strict';

const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);

async function main() {
  const nativeDirectory = path.join(__dirname, '..', 'native');
  await run('cargo', ['build', '--release', '--manifest-path', path.join(nativeDirectory, 'Cargo.toml')], { stdio: 'inherit' });
  await run(process.env.NSIS_MAKENSIS || 'makensis.exe', [path.join(nativeDirectory, 'installer.nsi')], { stdio: 'inherit' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
