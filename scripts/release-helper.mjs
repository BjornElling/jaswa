/**
 * Release the helper in one step: raise the version, then build, sign and
 * record the installer.
 *
 * Both halves already existed — `bump:helper` and, in helper/, `package` — but
 * only as two commands with nothing joining them, so a helper change reliably
 * ended in the half-done state `verify:helper-version` calls failure (2): the
 * five declarations naming a version whose installer was never built, and the
 * app offering a download that is still the previous release. Doing them
 * together is the whole point; this is that pair, made one command.
 *
 * Packaging is deliberately not automatic on commit or on test. It runs a
 * release Rust build and touches the Authenticode key, which is neither
 * something to do on every save nor something to do without meaning to.
 *
 * Usage: npm run release:helper
 *        npm run release:helper -- --package-only   (the source already carries
 *                                                    an unbuilt version bump)
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fingerprint, readManifest, repositoryRoot } from './helper-fingerprint.mjs';

const run = promisify(execFile);
const helper = path.join(repositoryRoot, 'helper');

/* Inherited, because both halves are long-running and their progress is the
   only sign the release is moving: a Rust release build with `lto = true` is
   minutes of silence otherwise. */
const step = (file, args, cwd) => run(process.execPath, [file, ...args], { cwd, stdio: 'inherit' });

/* Everything but our own flag belongs to the bump — `minor`, `major` or an
   explicit `x.y.z`, exactly as `bump:helper` takes them. */
const argv = process.argv.slice(2);
const packageOnly = argv.includes('--package-only');
const bumpArguments = argv.filter((entry) => entry !== '--package-only');

/* A bump with nothing behind it is failure (3) in the verifier — the version
   moves while the source is byte-for-byte a release already shipped. Checking
   here turns that into a refusal to start rather than a build that ends in a
   red check. */
const manifest = await readManifest();
if (manifest && manifest.fingerprint === await fingerprint() && !packageOnly) {
  console.error('The helper is byte-for-byte the release already packaged as v'
    + `${manifest.version}. There is nothing to release.\n`
    + '  Make the change first, then run this again.');
  process.exit(1);
}

if (!packageOnly) {
  await step(path.join(repositoryRoot, 'scripts/bump-helper-version.mjs'), bumpArguments, repositoryRoot);
}
await step(path.join(helper, 'scripts/package.cjs'), [], helper);
/* The verifier is the definition of done, so the release runs it rather than
   trusting that the two steps above added up. */
await step(path.join(repositoryRoot, 'scripts/verify-helper-version.mjs'), [], repositoryRoot);
console.log('\nThe helper is released. Commit helper/release.json with the version bump it records.');
