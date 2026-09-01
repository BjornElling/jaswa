/**
 * Lets a Node script import the app's modules unchanged.
 *
 * The app imports its data as `import data from '../data/x.json'`, which the
 * bundler accepts and Node does not: Node requires `with { type: 'json' }`.
 * Supplying the attribute in a loader hook keeps the app source written for the
 * bundler while a verifier still exercises the real module rather than a copy
 * of its logic — the copy being exactly what a verifier must not test.
 *
 * Used as `node --experimental-strip-types --import ./scripts/json-module-hook.mjs`.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./json-module-hook-resolver.mjs', pathToFileURL(import.meta.filename));
