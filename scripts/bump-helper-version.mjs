/**
 * Raises the helper's version in every place it is declared.
 *
 * Five files carry the number, and the reason it was never bumped for a change
 * is partly that bumping it meant five careful edits — one of them inside a
 * lockfile. A single command removes that excuse. The lockfiles are edited
 * through their own tooling rather than by hand: `npm version` for npm, `cargo`
 * for Rust, so neither lockfile can end up describing a package that does not
 * exist.
 *
 * Usage: npm run bump:helper [patch|minor|major|x.y.z]
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repositoryRoot } from './helper-fingerprint.mjs';

const requested = process.argv[2] ?? 'patch';

const appPath = path.join(repositoryRoot, 'app/domain/shared/helper-version.ts');
const cargoPath = path.join(repositoryRoot, 'helper/src-tauri/Cargo.toml');
const tauriPath = path.join(repositoryRoot, 'helper/src-tauri/tauri.conf.json');
const helperDirectory = path.join(repositoryRoot, 'helper');

const packageJson = JSON.parse(await readFile(path.join(helperDirectory, 'package.json'), 'utf8'));
const from = packageJson.version;
assert.match(from, /^\d+\.\d+\.\d+$/, 'helper/package.json must declare a semantic version');

function next(current, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [major, minor, patch] = current.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown version step "${how}". Use patch, minor, major or an explicit x.y.z.`);
}

const to = next(from, requested);
assert.notEqual(to, from, `The helper is already at v${from}.`);

/* Every file is edited by replacing the one version string in it, never by
   reparsing and reserialising. `npm version` and a JSON round-trip both
   reformat whatever they touch — the first expanded `engines` onto three
   lines, the second expanded every compact array in tauri.conf.json — and a
   version bump that rewrites unrelated lines makes its own diff unreadable. */
const replaceOnce = async (file, pattern, replacement, what) => {
  const source = await readFile(file, 'utf8');
  /* Counted with a separate match rather than from inside a replacer callback:
     a callback's return value is used verbatim, so the `$1` group references
     the replacements rely on would have been written into the file literally. */
  const matches = source.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
  assert.equal(matches?.length ?? 0, 1, `Expected exactly one ${what} in ${path.relative(repositoryRoot, file)}, found ${matches?.length ?? 0}.`);
  await writeFile(file, source.replace(pattern, replacement));
};

const escaped = from.replace(/\./g, '\\.');
const lockPath = path.join(helperDirectory, 'package-lock.json');

/* package.json and package-lock.json: the lockfile carries the package's own
   version twice — at the top and in the "" entry for the root package. */
await replaceOnce(
  path.join(helperDirectory, 'package.json'),
  new RegExp(`("version":\\s*")${escaped}(")`),
  `$1${to}$2`,
  'package version',
);
/* The lockfile names the helper's own version twice — once in the header and
   once in the "" entry for the root package — and both must move together.
   Each is anchored to the `"name": "jaswa-helper"` line above it, so a
   dependency sitting at the same version is never in range;
   `@rolldown/pluginutils` was at 1.0.1 while the helper was. */
const lockEntry = new RegExp(`("name":\\s*"jaswa-helper",\\s*\\n\\s*"version":\\s*")${escaped}(")`, 'g');
const lockSource = await readFile(lockPath, 'utf8');
const lockHits = lockSource.match(lockEntry)?.length ?? 0;
assert.equal(lockHits, 2, `Expected the helper's version twice in package-lock.json, found ${lockHits}.`);
await writeFile(lockPath, lockSource.replace(lockEntry, `$1${to}$2`));

/* Cargo.toml: the first `version =` at the start of a line belongs to
   [package]; the dependency versions below it are all `name = { version = … }`
   or sit after their own `[dependencies.…]` header. */
await replaceOnce(
  cargoPath,
  new RegExp(`^(version\\s*=\\s*")${escaped}(")`, 'm'),
  `$1${to}$2`,
  '[package] version',
);

/* Cargo.lock records the crate's own version too, anchored to its name so no
   dependency at the same version is in range. `cargo update` is not used: it
   reaches the network and can drag unrelated dependencies with it. */
await replaceOnce(
  path.join(repositoryRoot, 'helper/src-tauri/Cargo.lock'),
  new RegExp(`(name = "jaswa-helper"\\nversion = ")${escaped}(")`),
  `$1${to}$2`,
  'jaswa-helper lock entry',
);

await replaceOnce(
  tauriPath,
  new RegExp(`("version":\\s*")${escaped}(")`),
  `$1${to}$2`,
  'Tauri version',
);

await replaceOnce(
  appPath,
  new RegExp(`(recommendedHelperVersion = ')${escaped}(')`),
  `$1${to}$2`,
  'recommendedHelperVersion',
);

console.log(`Helper v${from} -> v${to} in app/domain/shared/helper-version.ts, helper/package.json (+lock), Cargo.toml (+lock) and tauri.conf.json.`);
console.log(`Next: run \`npm run package\` in helper/ to build, sign and record v${to} in helper/release.json.`);
