/**
 * The helper's version must be true, not merely consistent.
 *
 * This check used to compare the five places the version is written and pass
 * when they agreed. They always agreed — they are edited together — so it
 * proved only that nobody had mistyped a digit. It said nothing about whether
 * the number still described the program: the dashboard's React and CSS were
 * rewritten while all five sat at 1.0.1, and the app went on telling the user
 * that 1.0.1 was the newest helper available.
 *
 * `helper/release.json` closes that gap by recording a fingerprint of the
 * helper's source next to the version it was packaged as, so three separate
 * lies are now catchable:
 *
 *   1. The source changed and the version did not — the fingerprint moved while
 *      the version stood still.
 *   2. The version changed and no installer was built — the manifest still
 *      names the version it last shipped, and it is not this one.
 *   3. The five version strings disagree — the original check, kept.
 *
 * Usage: npm run verify:helper-version
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fingerprint, fingerprintedFiles, readManifest, repositoryRoot } from './helper-fingerprint.mjs';

const run = promisify(execFile);
const failures = [];
const fail = (message) => failures.push(message);

function versionFromCargo(source) {
  const match = source.match(/^version\s*=\s*"(\d+\.\d+\.\d+)"/m);
  assert.ok(match, 'Cargo.toml must declare a helper version');
  return match[1];
}

function versionFromApp(source) {
  const match = source.match(/recommendedHelperVersion\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(match, 'The app must declare the helper version it supports');
  return match[1];
}

const [cargo, tauri, packageJson, lock, app, download, packager] = await Promise.all([
  readFile(path.join(repositoryRoot, 'helper/src-tauri/Cargo.toml'), 'utf8'),
  readFile(path.join(repositoryRoot, 'helper/src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'helper/package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'helper/package-lock.json'), 'utf8').then(JSON.parse),
  readFile(path.join(repositoryRoot, 'app/lib/helper-version.ts'), 'utf8'),
  readFile(path.join(repositoryRoot, 'app/components/helper-download.tsx'), 'utf8'),
  readFile(path.join(repositoryRoot, 'helper/scripts/package.cjs'), 'utf8'),
]);

/* ---------------------------------------------------------------- (3) agreement
   The five declarations, still checked against each other. A mistyped digit
   here would otherwise be read as a deliberate bump by everything below. */
const versions = {
  cargo: versionFromCargo(cargo),
  tauri: tauri.version,
  package: packageJson.version,
  lockfile: lock.packages?.['']?.version,
  app: versionFromApp(app),
};
for (const [source, version] of Object.entries(versions)) {
  assert.match(String(version), /^\d+\.\d+\.\d+$/, `${source} must use semantic patch versions`);
}
assert.equal(new Set(Object.values(versions)).size, 1, `Helper versions disagree: ${JSON.stringify(versions)}`);
const version = versions.app;

/* The download name is part of the release contract: a user must be able to
identify the exact installer after the browser has saved it. The app and the
packager derive it from the one version value rather than maintaining a sixth
literal that can drift. */
assert.match(
  download,
  /JASWA-Helper-Setup-\$\{recommendedHelperVersion\}\.exe/,
  'The helper download link must include the recommended version',
);
assert.match(
  packager,
  /JASWA-Helper-Setup-\$\{helperVersion\}\.exe/,
  'The packager must publish the installer under its versioned filename',
);

/* ------------------------------------------------------------- the file list
   A source file that changes the installed helper but is missing from
   `fingerprintedFiles` is invisible to this whole check, so the list is
   reconciled against what git actually tracks rather than trusted. This is the
   one guard that keeps the fingerprint honest as the helper grows. */
const tracked = (await run('git', ['ls-files', 'helper'], { cwd: repositoryRoot })).stdout
  .split('\n')
  .map((line) => line.trim().replaceAll('\\', '/'))
  .filter(Boolean);
/* Documentation, the helper's own verifiers and the release record itself do
   not go into the installer. Everything else that is tracked under `helper/`
   does.

   `release.json` in particular must stay out: it holds the fingerprint, so
   including it would make every packaging run change the value it was trying
   to record. */
const notShipped = new Set([
  'helper/README.md',
  'helper/release.json',
  'helper/scripts/package.cjs',
  'helper/scripts/signing.cjs',
  'helper/scripts/verify-command-contract.mjs',
  'helper/scripts/verify-dashboard-flow.mjs',
  'helper/scripts/verify-installer-upgrade.mjs',
  'helper/src-tauri/examples/replay_profile.rs',
]);
const shouldFingerprint = tracked.filter((file) => !notShipped.has(file));
const fingerprinted = new Set(fingerprintedFiles);
const unlisted = shouldFingerprint.filter((file) => !fingerprinted.has(file));
const stale = fingerprintedFiles.filter((file) => !tracked.includes(file));
if (unlisted.length) {
  fail(`${unlisted.length} tracked helper file(s) are missing from the fingerprint, so a change to them would not require a new version:\n${unlisted.map((file) => `    ${file}`).join('\n')}\n  Add them to fingerprintedFiles in scripts/helper-fingerprint.mjs, or to notShipped in this check if they genuinely do not reach the installer.`);
}
if (stale.length) {
  fail(`${stale.length} fingerprinted file(s) are no longer tracked:\n${stale.map((file) => `    ${file}`).join('\n')}\n  Remove them from fingerprintedFiles in scripts/helper-fingerprint.mjs.`);
}

/* ------------------------------------------------------- (1) and (2) the truth */
const current = await fingerprint();
const manifest = await readManifest();

if (!manifest) {
  fail('helper/release.json is missing, so nothing records which helper the published installer contains.\n  Run `npm run release:helper -- --package-only` to build and record a release.');
} else {
  assert.match(String(manifest.version ?? ''), /^\d+\.\d+\.\d+$/, 'helper/release.json must record a semantic version');
  assert.ok(typeof manifest.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(manifest.fingerprint), 'helper/release.json must record a sha256 fingerprint');

  const changed = manifest.fingerprint !== current;
  if (changed && manifest.version === version) {
    /* (1) The failure that started this: the helper was edited and the number
       stayed put, so the app cannot tell the user anything has changed. */
    fail(`The helper's source has changed since v${version} was packaged, but the version is unchanged.\n  recorded fingerprint ${manifest.fingerprint}\n  current fingerprint  ${current}\n  Every change to the helper needs a new version. Run \`npm run release:helper\` to raise all five declarations, then build, sign and record the installer.`);
  } else if (changed) {
    /* (2) The version moved, so the intent is clear — but nothing has built the
       installer the user would download, and the published .exe is still the
       old one. */
    fail(`Helper v${version} has never been packaged: helper/release.json still records v${manifest.version}.\n  The app offers public/JASWA-Helper-Setup-${version}.exe while the release record names v${manifest.version}.\n  Run \`npm run release:helper -- --package-only\` to build, sign and record v${version} without bumping again.`);
  } else if (manifest.version !== version) {
    /* The source matches a packaged release, but the declarations name a
       different one — a bump with no change behind it. */
    fail(`The version says v${version} but the source is byte-for-byte the helper packaged as v${manifest.version}.\n  Either make the change v${version} is meant to carry, or return the five declarations to v${manifest.version}.`);
  }
}

if (failures.length) {
  console.error(`Helper version check failed (${failures.length} problem${failures.length === 1 ? '' : 's'}):\n`);
  for (const message of failures) console.error(`  ${message}\n`);
  process.exitCode = 1;
} else {
  console.log(`Helper v${version} is consistent across the app, Cargo, Tauri and npm metadata, and its ${fingerprintedFiles.length} source files match the packaged installer (${current.slice(0, 12)}).`);
}
