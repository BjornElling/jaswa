'use strict';

const { execFile } = require('node:child_process');
const { mkdir, readdir, rename, rm } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { signTool } = require('./signing.cjs');

const run = promisify(execFile);

async function main() {
  const thumbprint = process.env.JASWA_SIGNING_THUMBPRINT?.replace(/\s/g, '');
  if (!/^[A-Fa-f0-9]{40}$/.test(thumbprint ?? '')) {
    throw new Error('JASWA_SIGNING_THUMBPRINT must name a trusted 40-character Authenticode certificate. Refusing to create an unsigned installer.');
  }
  const tauriDirectory = path.join(__dirname, '..', 'src-tauri');
  const publicDirectory = path.join(__dirname, '..', '..', 'public');
  const bundleDirectory = path.join(tauriDirectory, 'target', 'release', 'bundle', 'nsis');
  const publishedInstaller = path.join(publicDirectory, 'JASWA-Helper-Setup.exe');
  await run(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'build', '--bundles', 'nsis'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  const installers = (await readdir(bundleDirectory))
    .filter((file) => file.endsWith('-setup.exe'));
  if (installers.length !== 1) {
    throw new Error(`Expected one Tauri NSIS installer in ${bundleDirectory}, found ${installers.length}.`);
  }
  const stagedInstaller = path.join(bundleDirectory, installers[0]);
  await run(signTool(), ['verify', '/pa', '/tw', stagedInstaller], { stdio: 'inherit' });
  await mkdir(publicDirectory, { recursive: true });
  await rm(publishedInstaller, { force: true });
  await rename(stagedInstaller, publishedInstaller);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
