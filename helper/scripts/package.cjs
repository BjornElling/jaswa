'use strict';

const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdir, readdir, readFile, rename, rm, writeFile } = require('node:fs/promises');
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
  const helperVersion = require('../package.json').version;
  const publicDirectory = path.join(__dirname, '..', '..', 'public');
  const bundleDirectory = path.join(tauriDirectory, 'target', 'release', 'bundle', 'nsis');
  const publishedInstaller = path.join(publicDirectory, `JASWA-Helper-Setup-${helperVersion}.exe`);
  await run(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'build', '--bundles', 'nsis'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  // A signed outer installer does not prove that its executable was signed.
  await run(signTool(), ['verify', '/pa', '/tw', path.join(tauriDirectory, 'target', 'release', 'jaswa-helper.exe')], { stdio: 'inherit' });
  const installers = (await readdir(bundleDirectory))
    .filter((file) => file.endsWith(`_${helperVersion}_x64-setup.exe`));
  if (installers.length !== 1) {
    throw new Error(`Expected one Tauri NSIS installer for helper v${helperVersion} in ${bundleDirectory}, found ${installers.length}.`);
  }
  const stagedInstaller = path.join(bundleDirectory, installers[0]);
  await run(signTool(), ['verify', '/pa', '/tw', stagedInstaller], { stdio: 'inherit' });
  await mkdir(publicDirectory, { recursive: true });
  await rm(publishedInstaller, { force: true });
  await rename(stagedInstaller, publishedInstaller);

  /* The published site is built from git, so the installer is tracked — and
     only the current one. Nothing links an older release: the app offers the
     version it recommends, and a running helper asks for the newest a page
     announces. Keeping every release would grow each deploy by one more
     copy of a program nobody can reach. */
  for (const file of await readdir(publicDirectory)) {
    if (/^JASWA-Helper-Setup-\d+\.\d+\.\d+\.exe$/.test(file) && file !== path.basename(publishedInstaller)) {
      await rm(path.join(publicDirectory, file));
    }
  }

  /* Record what was actually shipped. `verify:helper-version` reads this to
     tell "the helper changed and nobody bumped the version" apart from "the
     version was bumped and nobody built the installer" — the two failures that
     let the app recommend a version that was never released — and checks the
     tracked installer against the hash recorded here.

     The fingerprint comes from the same module the verifier uses, so the value
     written here and the value checked there cannot drift apart. */
  const { fingerprint, manifestPath } = await import('../../scripts/helper-fingerprint.mjs');
  const installer = await readFile(publishedInstaller);
  const manifest = {
    /* Written by helper/scripts/package.cjs; read by scripts/verify-helper-version.mjs. */
    version: helperVersion,
    fingerprint: await fingerprint(),
    installer: {
      bytes: installer.byteLength,
      sha256: createHash('sha256').update(installer).digest('hex'),
    },
    packagedAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Published helper v${helperVersion} and recorded it in helper/release.json (${manifest.fingerprint.slice(0, 12)}).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
