/** Arrays are deliberate ordered choices; objects hold independently editable choices. */
export function sameChoice(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameChoice(value, b[index]));
  if (!choiceObject(a) || !choiceObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameChoice(a[key], b[key]));
}

export function choiceObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class PreferenceConflict extends Error {
  constructor() { super('Both copies contain different choices. Download a .sw backup, then choose which copy to keep.'); }
}

function identifiedChoices(value: unknown[]): { order: string[]; entries: Map<string, unknown> } | null {
  const order: string[] = [];
  const entries = new Map<string, unknown>();
  for (const entry of value) {
    if (!choiceObject(entry) || !Object.hasOwn(entry, 'id') || typeof entry.id !== 'string' || !entry.id || entries.has(entry.id)) return null;
    order.push(entry.id);
    entries.set(entry.id, entry);
  }
  return { order, entries };
}

/** Names and targets belong to a role or preset, independently of its list order. */
function mergeIdentifiedChoices(base: unknown[], local: unknown[], sharedBase: unknown[], shared: unknown[]): unknown[] | null {
  const before = identifiedChoices(base);
  const here = identifiedChoices(local);
  const thereBefore = identifiedChoices(sharedBase);
  const there = identifiedChoices(shared);
  if (!before || !here || !thereBefore || !there) return null;
  const reorderedHere = !sameChoice(before.order, here.order);
  const reorderedThere = !sameChoice(thereBefore.order, there.order);
  if (reorderedHere && (!sameChoice(before.order, thereBefore.order)
    || (reorderedThere && !sameChoice(here.order, there.order)))) throw new PreferenceConflict();
  const entries = new Map<string, unknown>();
  for (const id of new Set([...before.order, ...here.order, ...thereBefore.order, ...there.order])) {
    const merged = mergePreferenceChoices(before.entries.get(id), here.entries.get(id), thereBefore.entries.get(id), there.entries.get(id));
    if (merged !== undefined) entries.set(id, merged);
  }
  return (reorderedHere ? here.order : there.order).filter((id) => entries.has(id)).map((id) => entries.get(id));
}

/**
 * Only locally changed leaves travel. The shared copy can contain choices this
 * build does not know yet, so serializing the local reader's result over it
 * would erase choices whenever development and publication differ.
 */
export function mergePreferenceChoices(base: unknown, local: unknown, sharedBase: unknown, shared: unknown): unknown {
  if (sameChoice(base, local)) return shared;
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(sharedBase) && Array.isArray(shared)) {
    const merged = mergeIdentifiedChoices(base, local, sharedBase, shared);
    if (merged) return merged;
    // Without identities, guessing which raw record a normalized entry came
    // from could discard a choice only the other build understands.
    if (!sameChoice(base, sharedBase) && !sameChoice(local, shared)) throw new PreferenceConflict();
  }
  if ((base === undefined || choiceObject(base)) && choiceObject(local)
    && (sharedBase === undefined || choiceObject(sharedBase)) && choiceObject(shared)) {
    const localBase = base ?? {};
    const remoteBase = sharedBase ?? {};
    const merged = { ...shared };
    const own = (object: Record<string, unknown>, key: string) => Object.hasOwn(object, key) ? object[key] : undefined;
    for (const key of new Set([...Object.keys(localBase), ...Object.keys(local)])) {
      if (key === 'updatedAt') continue;
      const next = mergePreferenceChoices(own(localBase, key), own(local, key), own(remoteBase, key), own(shared, key));
      if (next === undefined) delete merged[key];
      else Object.defineProperty(merged, key, { value: next, enumerable: true, configurable: true, writable: true });
    }
    return merged;
  }
  if (sameChoice(sharedBase, shared) || sameChoice(local, shared)) return local;
  throw new PreferenceConflict();
}

export function withoutPreferenceTime(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'updatedAt'));
}
