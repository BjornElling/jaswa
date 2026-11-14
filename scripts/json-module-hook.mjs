/**
 * Lets a Node script import the app's modules unchanged.
 *
 * Two gaps separate how the bundler reads the app's source from how Node does:
 * a JSON import (`import data from '../data/x.json'`) needs an explicit
 * `with { type: 'json' }`, and a relative import is written without its `.ts`
 * extension. Both are supplied here, so the app source stays written for the
 * bundler while a verifier still exercises the real module rather than a copy
 * of its logic — the copy being exactly what a verifier must not test.
 *
 * The hooks run in-thread through `registerHooks`; the off-thread
 * `module.register` they replace is deprecated in Node 26 (DEP0205).
 *
 * Used as `node --import ./scripts/json-module-hook.mjs`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.') || !context.parentURL) throw error;
      for (const extension of ['.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) return nextLoad(url, { ...context, importAttributes: { type: 'json' } });
    return nextLoad(url, context);
  },
});
