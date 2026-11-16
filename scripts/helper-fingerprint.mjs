/**
 * What the helper is made of, and a hash of it.
 *
 * The version used to be five hand-maintained strings that were only ever
 * checked against each other. They agreed, so the check passed — while the
 * dashboard's own React and CSS were rewritten underneath them and the app went
 * on recommending the same version it had recommended before the change. Five
 * copies of a number cannot answer "is this the helper the user has?"; only the
 * content can.
 *
 * This module is that content, defined once. `verify-helper-version.mjs` reads
 * it to fail when the source moved without a bump, and `helper/scripts/
 * package.cjs` reads it to stamp what it actually shipped. Sharing one
 * definition is the point: a file that changes the installed program must not be
 * able to enter the build without also entering the fingerprint.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const manifestPath = path.join(repositoryRoot, 'helper/release.json');

/**
 * Every tracked file that can change the installed helper, relative to the
 * repository root.
 *
 * Deliberately a list rather than a directory walk. A walk would silently
 * absorb anything that appeared beside these — notes, scratch files, an
 * editor's leavings — and a fingerprint that changes when a stray file lands
 * next to the source is a fingerprint nobody trusts, which is how a check like
 * this ends up disabled. Adding a real source file means adding it here; the
 * guard below refuses a list that has drifted from what is tracked, so that
 * step cannot be forgotten either.
 *
 * The lockfiles are in: a dependency bump changes the shipped binary without
 * touching a line of the helper's own source. `README.md` is out — it documents
 * the helper, it is not compiled into it.
 */
export const fingerprintedFiles = [
  'helper/index.html',
  'helper/package.json',
  'helper/package-lock.json',
  'helper/tsconfig.json',
  'helper/vite.config.ts',
  'helper/src/App.tsx',
  'helper/src/main.tsx',
  'helper/src/styles.css',
  'helper/src-tauri/Cargo.toml',
  'helper/src-tauri/Cargo.lock',
  'helper/src-tauri/build.rs',
  'helper/src-tauri/tauri.conf.json',
  'helper/src-tauri/capabilities/default.json',
  'helper/src-tauri/sign.cjs',
  'helper/src-tauri/windows/hooks.nsh',
  'helper/src-tauri/src/config.rs',
  'helper/src-tauri/src/diagnostics.rs',
  'helper/src-tauri/src/game_session.rs',
  'helper/src-tauri/src/incidents.rs',
  'helper/src-tauri/src/lib.rs',
  'helper/src-tauri/src/main.rs',
  'helper/src-tauri/src/preferences.rs',
  'helper/src-tauri/src/profile.rs',
  'helper/src-tauri/src/profile/live.rs',
  'helper/src-tauri/src/protocol.rs',
  'helper/src-tauri/src/service.rs',
  'helper/src-tauri/src/traffic.rs',
  'helper/src-tauri/src/windows.rs',
];

/**
 * The fingerprint of the helper's current source.
 *
 * The file's path is hashed alongside its bytes, so moving identical content
 * from one file to another changes the result. Line endings are normalised
 * because this repository is developed on Windows and a checkout that converts
 * them must not read as a changed helper.
 */
export async function fingerprint() {
  const digest = createHash('sha256');
  for (const file of fingerprintedFiles) {
    const contents = await readFile(path.join(repositoryRoot, file), 'utf8');
    digest.update(file);
    digest.update('\0');
    digest.update(contents.replace(/\r\n/g, '\n'));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** The recorded release, or `null` when the helper has never been packaged. */
export async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
