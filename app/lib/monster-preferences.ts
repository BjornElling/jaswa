import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainPropertyOrder, artifactProperty } from './artifact-properties';
import type { RuneSlotKey } from './monster-defaults';
import { runeSlotKeys } from './monster-defaults';
import type { RelicMainProperty } from './relic-properties';
import { relicMainPropertyOrder, relicProperty } from './relic-properties';
import type { PresetStatTargets, RuneMainStat } from './rune-potential-presets';
import { presetStatTargetKeys, presetTargetMaximum, runeMainStats } from './rune-potential-presets';
import { presetRuneSetNameList } from './rune-sets';

/**
 * What one owned copy of a monster is for, as its owner has said so.
 *
 * **Keyed by `unit_id`, one record per owned copy.** A player runs two Lushens,
 * one built for speed in arena and one for damage in a dungeon, and a model
 * that cannot say so is describing the game rather than the account.
 * `unit_id` is the game's own persistent per-copy identifier — an artifact
 * names its wearer by it — so a record survives re-importing the same account;
 * only selling the copy ends it.
 *
 * The defaults these start from stay species-level, because the game's
 * Statistics panels are keyed on `unit_master_id` and cannot be otherwise.
 * `monster-preference-resolution.ts` is the one place the two keyings meet.
 *
 * Nothing here is scored, ranked or recommended against. The overlay states
 * what the user wants and reports where the account does not match it; the
 * artifact optimization pages keep their own species-level calculation
 * untouched.
 */

/**
 * One statement about one set, property or main stat.
 *
 * `ARTIFACT-CANONICAL.md` §19.4 needs three states, and this is where they are
 * kept apart:
 *
 * | State | How it is stored | Where the answer comes from |
 * | --- | --- | --- |
 * | Stated preferred or acceptable | `'preferred'` / `'acceptable'` | the user |
 * | Never stated | **no key at all** | the default |
 * | Deliberately cleared | `'unwanted'` | the user — *not* the default |
 *
 * The third row is the one that gets got wrong. `'unwanted'` is a *statement*
 * and an absent key is a *silence*, and collapsing them lets a default silently
 * overrule someone who went to the trouble of clearing it. Key presence is the
 * signal because JSON has no other: `undefined` does not survive
 * `JSON.stringify`, so a key that is present must always carry a real band.
 */
export type StatedBand = 'preferred' | 'acceptable' | 'unwanted';

const statedBands: readonly StatedBand[] = ['preferred', 'acceptable', 'unwanted'];

/**
 * A wanted substat, and how good it has to be.
 *
 * `minimumHundredths` is the floor in the same hundredths of a percentage point
 * the import stores (`ArtifactSubProperty.valueHundredths`), so the comparison
 * is exact integer arithmetic rather than a float that nearly matches. It is
 * what makes the ordinary real preference sayable: *an HP artifact carrying
 * Damage Taken from Wind at 15 % or better, and nothing else.*
 *
 * `undefined` means the property is wanted at any roll. That is a different
 * statement from a floor of `0`, and both have to survive a reload
 * (`AGENTS.md` §3).
 */
export type ArtifactSubPreference = { minimumHundredths?: number };

/** The most a substat floor may be asked for, in hundredths — well past any real roll. */
export const substatMinimumMaximum = 100_00;

export type ArtifactCategoryPreference = {
  /**
   * The one main stat this copy wants in this category. An artifact carries a
   * single main, so this is a single answer rather than a list of bands: the
   * user picks one, and until they do the species default stands in.
   */
  main?: ArtifactMainProperty;
  /** Wanted substats by property id, written decimal because JSON has no numeric key. */
  sub?: Record<string, ArtifactSubPreference>;
};

export type MonsterCopyPreferences = {
  /** The owned copy's `unit_id`. The record's own key in the map repeats it. */
  unitId: string;
  /** The user's own name for this copy, shown in place of the game's. */
  label?: string;
  /** By rune set name, as `rune-sets.ts` names them. */
  runeSets?: Record<string, StatedBand>;
  /** Slots 1, 3 and 5 carry a fixed main, so only these three can be stated. */
  runeSlots?: Partial<Record<RuneSlotKey, Record<string, StatedBand>>>;
  artifacts?: Partial<Record<ArtifactCategory, ArtifactCategoryPreference>>;
  relics?: {
    /** The one main this copy wants, on the same reasoning as an artifact's. */
    main?: RelicMainProperty;
    /** By the unique-property ids `RELIC-CANONICAL.md` §4 numbers. */
    unique?: Record<string, StatedBand>;
  };
  /**
   * The stats this copy is being built toward.
   *
   * Deliberately `PresetStatTargets` rather than a shape of its own: the eight
   * stats a rune preset aims at are the eight a monster aims at, and two lists
   * that have to agree are one list. The three composites are *not* stored —
   * `AGENTS.md` §6 forbids keeping a derived figure twice, and
   * `withRefreshedMetrics` derives DMG, E.HP and E.HP D wherever they are shown.
   *
   * A stat left `undefined` is one this copy does not aim at; an explicit `0`
   * is a stated target of nothing.
   */
  statTargets?: PresetStatTargets;
};

/** The user's whole per-copy vocabulary, as it travels in a `.sw` file. */
export type MonsterPreferences = Record<string, MonsterCopyPreferences>;

/** The most a user's own name for a copy may run to. */
export const monsterLabelMaximum = 60;

/**
 * A copy the user has not said anything about.
 *
 * Nothing is seeded from the defaults. §19.4's first rule is that only what the
 * user actually stated is stored, and a seeded record would make every default
 * look like a decision the moment the overlay was opened.
 */
export function blankMonsterCopyPreferences(unitId: string): MonsterCopyPreferences {
  return { unitId };
}

function statesBand(bands: Record<string, StatedBand> | undefined): boolean {
  return bands !== undefined && Object.keys(bands).length > 0;
}

/**
 * Whether a record still says anything at all.
 *
 * The write route drops an empty one rather than keeping a husk, so a user who
 * clears everything they set leaves no trace and a count of records is a count
 * of decisions. An explicitly cleared band is *not* empty: `'unwanted'` is a
 * statement, and a record holding only cleared bands still says something.
 */
export function statesSomething(preferences: MonsterCopyPreferences): boolean {
  if (preferences.label !== undefined && preferences.label.length > 0) return true;
  if (statesBand(preferences.runeSets)) return true;
  if (runeSlotKeys.some((key) => statesBand(preferences.runeSlots?.[key]))) return true;
  for (const category of ['attribute', 'type'] as const) {
    const artifact = preferences.artifacts?.[category];
    if (artifact?.main !== undefined) return true;
    if (artifact?.sub !== undefined && Object.keys(artifact.sub).length > 0) return true;
  }
  if (preferences.relics?.main !== undefined) return true;
  if (statesBand(preferences.relics?.unique)) return true;
  const targets = preferences.statTargets;
  if (targets !== undefined && presetStatTargetKeys.some((key) => targets[key] !== undefined)) return true;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A band map, checked key by key against the vocabulary that may appear in it.
 *
 * A key holding `null` — or present but holding nothing — is rejected rather
 * than treated as a silence: an absent statement is an absent *key*, so a key
 * carrying nothing is a document this contract did not produce.
 */
function isBandMap(value: unknown, allows: (key: string) => boolean): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, band]) =>
    allows(key) && typeof band === 'string' && statedBands.includes(band as StatedBand));
}

function isSubstatId(key: string): boolean {
  const id = Number(key);
  return Number.isInteger(id) && String(id) === key && artifactProperty(id) !== null;
}

function isRelicUniqueId(key: string): boolean {
  const id = Number(key);
  return Number.isInteger(id) && String(id) === key && relicProperty(id) !== undefined;
}

function isSubPreferences(value: unknown): value is Record<string, ArtifactSubPreference> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, preference]) => {
    if (!isSubstatId(key) || !isRecord(preference)) return false;
    if (!Object.keys(preference).every((field) => field === 'minimumHundredths')) return false;
    const minimum = preference.minimumHundredths;
    return minimum === undefined
      || (typeof minimum === 'number' && Number.isInteger(minimum)
        && minimum >= 0 && minimum <= substatMinimumMaximum);
  });
}

function isArtifactPreference(value: unknown): value is ArtifactCategoryPreference {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => key === 'main' || key === 'sub')) return false;
  if (value.main !== undefined && !artifactMainPropertyOrder.includes(value.main as ArtifactMainProperty)) return false;
  return value.sub === undefined || isSubPreferences(value.sub);
}

function isRelicPreference(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => key === 'main' || key === 'unique')) return false;
  if (value.main !== undefined && !relicMainPropertyOrder.includes(value.main as RelicMainProperty)) return false;
  return value.unique === undefined || isBandMap(value.unique, isRelicUniqueId);
}

function isStatTargets(value: unknown): value is PresetStatTargets {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => presetStatTargetKeys.includes(key as keyof PresetStatTargets))) return false;
  return presetStatTargetKeys.every((key) => {
    const target = value[key];
    return target === undefined
      || (typeof target === 'number' && Number.isInteger(target) && target >= 0 && target <= presetTargetMaximum);
  });
}

const copyPreferenceKeys = new Set([
  'unitId', 'label', 'runeSets', 'runeSlots', 'artifacts', 'relics', 'statTargets',
]);

/**
 * Accept only the complete current contract.
 *
 * Preferences are a file the user can edit, so everything read back is checked
 * before it reaches the interface: every band is one of three strings, every
 * set name and property id is one the editor could have offered, every target
 * is a whole number in range, and no key carries nothing. A malformed record is
 * discarded rather than repaired into a newer shape (`AGENTS.md` §6).
 */
export function isCurrentMonsterCopyPreferences(value: unknown): value is MonsterCopyPreferences {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => copyPreferenceKeys.has(key))) return false;
  if (typeof value.unitId !== 'string' || value.unitId.length === 0) return false;
  if (value.label !== undefined
    && (typeof value.label !== 'string' || value.label.trim() !== value.label || value.label.length > monsterLabelMaximum)) return false;
  if (value.runeSets !== undefined && !isBandMap(value.runeSets, (key) => presetRuneSetNameList.includes(key))) return false;
  if (value.runeSlots !== undefined) {
    if (!isRecord(value.runeSlots)) return false;
    if (!Object.keys(value.runeSlots).every((key) => runeSlotKeys.includes(key as RuneSlotKey))) return false;
    if (!Object.values(value.runeSlots).every((slot) =>
      isBandMap(slot, (key) => runeMainStats.includes(key as RuneMainStat)))) return false;
  }
  if (value.artifacts !== undefined) {
    if (!isRecord(value.artifacts)) return false;
    if (!Object.keys(value.artifacts).every((key) => key === 'attribute' || key === 'type')) return false;
    if (!Object.values(value.artifacts).every(isArtifactPreference)) return false;
  }
  if (value.relics !== undefined && !isRelicPreference(value.relics)) return false;
  return value.statTargets === undefined || isStatTargets(value.statTargets);
}

/** The whole map, with every record's own `unitId` matching the key it sits under. */
export function isCurrentMonsterPreferences(value: unknown): value is MonsterPreferences {
  return isRecord(value)
    && Object.entries(value).every(([unitId, preferences]) =>
      isCurrentMonsterCopyPreferences(preferences) && preferences.unitId === unitId);
}
