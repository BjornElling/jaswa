import { isRecord } from './preference-reading';
import type { Preset } from './presets';

/**
 * **Lock and Exclude: what the user says about one rune for one monster.**
 *
 * The one model behind every Lock and Exclude control in JASWA — the build
 * overlay's, the rune overlay's — and the one the build search and the
 * re-reading of a found build read. Both words bind a rune to a monster in one
 * **scope**: a preset, or the pool several presets share
 * (`DECK-PRESETS.md` §1, rule 4), Default being a scope of its own. Nothing binds
 * outside it, because a rune in another preset is another placement.
 *
 * - **Locked** is the rune engraved on the monster and staying there: the
 *   search takes it as the slot's one answer and never offers it to another
 *   monster of the scope. Locking a rune engraves it first, so a lock always
 *   names a rune the monster carries, and one rune is locked to one monster.
 * - **Excluded** keeps the rune out of every build the search finds for that
 *   monster, and says nothing about any other.
 *
 * Both belong to the import, not to the preferences: they are stored with the
 * game data (`ImportedGame.runeLocks`) and go with it, so a new file, a new
 * game session or a live sync starts with none — the game knows no such thing
 * and its data is the account as it now is. While the helper keeps JASWA
 * synchronized they are off altogether, since the next sync would undo the
 * engraving a lock makes.
 */
export type RuneLock = 'locked' | 'excluded';

/** By scope, then the monster's `unit_id`, then the `rune_id`. */
export type RuneLocks = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, RuneLock>>>>>>;

export const noRuneLocks: RuneLocks = {};

/** The scope a preset's locks live in: the shared pool where its content has one, else the preset itself. */
export function runeLockScope(preset: Pick<Preset, 'id' | 'content'>): string {
  return preset.content?.sharedPool ? `pool:${preset.content.id}` : preset.id;
}

export function runeLockOf(locks: RuneLocks, scope: string, unitId: string, runeId: string): RuneLock | undefined {
  return locks[scope]?.[unitId]?.[runeId];
}

/**
 * What one monster's search reads, by rune: `locked` for every rune locked in
 * the scope — to this monster or to another, which the search tells apart by
 * where the rune is engraved — and `excluded` for this monster's own exclusions.
 */
export function runeLocksFor(locks: RuneLocks, scope: string, unitId: string): Record<string, RuneLock> {
  const read: Record<string, RuneLock> = {};
  for (const [runeId, lock] of Object.entries(locks[scope]?.[unitId] ?? {})) if (lock === 'excluded') read[runeId] = lock;
  for (const byRune of Object.values(locks[scope] ?? {})) {
    for (const [runeId, lock] of Object.entries(byRune)) if (lock === 'locked') read[runeId] = lock;
  }
  return read;
}

/** Every rune locked to a monster anywhere, which Rune Clean-up keeps whatever it reads the rune as. */
export function lockedRuneIds(locks: RuneLocks): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const byUnit of Object.values(locks)) for (const byRune of Object.values(byUnit)) {
    for (const [runeId, lock] of Object.entries(byRune)) if (lock === 'locked') ids.add(runeId);
  }
  return ids;
}

function pruned(locks: Record<string, Record<string, Record<string, RuneLock>>>): RuneLocks {
  for (const [scope, byUnit] of Object.entries(locks)) {
    for (const [unitId, byRune] of Object.entries(byUnit)) if (Object.keys(byRune).length === 0) delete byUnit[unitId];
    if (Object.keys(byUnit).length === 0) delete locks[scope];
  }
  return locks;
}

function copied(locks: RuneLocks): Record<string, Record<string, Record<string, RuneLock>>> {
  return Object.fromEntries(Object.entries(locks).map(([scope, byUnit]) => [scope,
    Object.fromEntries(Object.entries(byUnit).map(([unitId, byRune]) => [unitId, { ...byRune }]))]));
}

/**
 * One choice set or taken off. A lock takes the rune from any other monster of
 * the scope it was locked to, and the place of any rune locked into the same
 * slot of this monster, which the engraving that comes with it has just
 * replaced. `slotOf` names a rune's slot. Lock and Exclude are one choice, so
 * setting either replaces the other.
 */
export function withRuneLock(locks: RuneLocks, scope: string, unitId: string, runeId: string, lock: RuneLock | null,
  slotOf: (runeId: string) => number | undefined): RuneLocks {
  const next = copied(locks);
  const byUnit = next[scope] ?? {};
  next[scope] = byUnit;
  if (lock === 'locked') {
    const slot = slotOf(runeId);
    for (const [other, byRune] of Object.entries(byUnit)) {
      if (byRune[runeId] === 'locked' && other !== unitId) delete byRune[runeId];
      if (other !== unitId) continue;
      for (const [id, held] of Object.entries(byRune)) if (held === 'locked' && id !== runeId && slotOf(id) === slot) delete byRune[id];
    }
  }
  const byRune = byUnit[unitId] ?? {};
  byUnit[unitId] = byRune;
  if (lock === null) delete byRune[runeId]; else byRune[runeId] = lock;
  return pruned(next);
}

/**
 * The locks that still hold against the account's placement: a lock while its
 * rune is engraved on its monster in a preset of the scope, an exclusion while
 * the scope exists. Derived on every read rather than kept in step by every
 * write, so an engraving that moves a locked rune away, or a preset deleted,
 * cannot leave a lock behind that the search would still obey.
 */
export function heldRuneLocks(locks: RuneLocks, presets: readonly Preset[]): RuneLocks {
  const byScope = new Map<string, Preset[]>();
  for (const preset of presets) {
    const scope = runeLockScope(preset);
    byScope.set(scope, [...byScope.get(scope) ?? [], preset]);
  }
  const next = copied(locks);
  for (const [scope, byUnit] of Object.entries(next)) {
    const scopePresets = byScope.get(scope);
    if (!scopePresets) { delete next[scope]; continue; }
    for (const [unitId, byRune] of Object.entries(byUnit)) {
      for (const [runeId, lock] of Object.entries(byRune)) {
        if (lock === 'locked' && !scopePresets.some((preset) => preset.runeOwner.get(runeId) === unitId)) delete byRune[runeId];
      }
    }
  }
  return pruned(next);
}

const isIdentifier = (value: string) => value.length > 0 && value.length <= 64;

/**
 * The stored record read back one choice at a time (`AGENTS.md` §6): an entry
 * that is not a rune id against `locked` or `excluded` is dropped, and the rest
 * kept. A second lock of one rune in one scope keeps the first.
 */
export function readRuneLocks(value: unknown): RuneLocks | undefined {
  if (!isRecord(value)) return undefined;
  const read: Record<string, Record<string, Record<string, RuneLock>>> = {};
  for (const [scope, byUnit] of Object.entries(value)) {
    if (!isIdentifier(scope) || !isRecord(byUnit)) continue;
    const lockedInScope = new Set<string>();
    const units: Record<string, Record<string, RuneLock>> = {};
    for (const [unitId, byRune] of Object.entries(byUnit)) {
      if (!isIdentifier(unitId) || !isRecord(byRune)) continue;
      const runes: Record<string, RuneLock> = {};
      for (const [runeId, lock] of Object.entries(byRune)) {
        if (!isIdentifier(runeId) || (lock !== 'locked' && lock !== 'excluded')) continue;
        if (lock === 'locked') {
          if (lockedInScope.has(runeId)) continue;
          lockedInScope.add(runeId);
        }
        runes[runeId] = lock;
      }
      units[unitId] = runes;
    }
    read[scope] = units;
  }
  const kept = pruned(read);
  return Object.keys(kept).length > 0 ? kept : undefined;
}
