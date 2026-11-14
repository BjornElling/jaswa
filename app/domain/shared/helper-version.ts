/* The current app carries the helper version it was built and tested against.
   Keeping this contract explicit makes an old helper visible before a stale
   snapshot is mistaken for a data problem. The release check below keeps the
   repeated version strings in sync at build time. */
export const recommendedHelperVersion = '1.0.58';

const helperVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

export function isHelperVersion(value: unknown): value is string {
  return typeof value === 'string' && helperVersionPattern.test(value);
}

function versionParts(value: string): [number, number, number] {
  const match = helperVersionPattern.exec(value);
  if (!match) throw new Error(`Invalid helper version: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function helperUpdateAvailable(version: string | null): boolean {
  if (!version) return true;
  const current = versionParts(version);
  const recommended = versionParts(recommendedHelperVersion);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== recommended[index]) return current[index] < recommended[index];
  }
  return false;
}
