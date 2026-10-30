'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { signTool } = require('../scripts/signing.cjs');

const run = promisify(execFile);

async function main() {
  const thumbprint = process.env.JASWA_SIGNING_THUMBPRINT?.replace(/\s/g, '');
  const target = process.argv[2];
  if (!/^[A-Fa-f0-9]{40}$/.test(thumbprint ?? '') || !target) {
    throw new Error('A trusted JASWA_SIGNING_THUMBPRINT and signing target are required. Refusing to create an unsigned executable.');
  }
  await run(signTool(), ['sign', '/sha1', thumbprint, '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', target], { stdio: 'inherit' });
  await run(signTool(), ['verify', '/pa', '/tw', target], { stdio: 'inherit' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
