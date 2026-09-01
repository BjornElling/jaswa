/**
 * The hook itself, run on the module loader thread. See `json-module-hook.mjs`,
 * which registers it, for why this exists.
 *
 * Two gaps between how the bundler reads the app's source and how Node does:
 * a JSON import needs an explicit attribute, and a relative import is written
 * without its `.ts` extension. Both are supplied here so the app source stays
 * written for the bundler.
 */
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function exists(url) {
  try {
    await access(fileURLToPath(url));
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') || !context.parentURL) throw error;
    for (const extension of ['.ts', '.tsx', '/index.ts']) {
      const candidate = new URL(specifier + extension, context.parentURL);
      if (await exists(candidate)) return nextResolve(candidate.href, context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) return nextLoad(url, { ...context, importAttributes: { type: 'json' } });
  return nextLoad(url, context);
}
