import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainPropertyOrder, artifactProperty } from './artifact-properties';
import type { RuneSlotKey } from './monster-defaults';
import { runeSlotKeys } from './monster-defaults';
import type { RelicMainProperty } from './relic-properties';
import { relicMainPropertyOrder, relicProperty } from './relic-properties';
import type { PresetTargets } from './rune-potential-presets';
import { presetStatTargetKeys, presetTargetMaximum } from './rune-potential-presets';
import type { RuneSlotMain } from './rune-slot-mains';
import { runeSlotMainsBySlot } from './rune-slot-mains';
import { runeBuild, runeBuildKey } from './rune-set-pairs';

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
 * The eleven figures a copy may be built toward: the eight stats a rune preset
 * states, and the three composites `RUNE-PRESET-METRICS.md` defines.
 *
 * It is `PresetTargets` rather than a shape of its own because the eleven a
 * preset reads are the eleven a monster aims at, and two lists that have to
 * agree are one list. What differs is only who states them — see
 * `MonsterCopyPreferences.statTargets`.
 */
export type MonsterStatTargets = PresetTargets;

/** The eleven, in the order the overlay offers them. */
export const monsterStatTargetKeys: ReadonlyArray<keyof MonsterStatTargets> = [
  ...presetStatTargetKeys, 'dmg', 'ehp', 'ehpD',
];

/*
 * **A user's statement is yes or no, never a band.**
 *
 * This reverses `ARTIFACT-CANONICAL.md` §19.4's three-state model, in which the
 * user cycled every set and property through preferred, acceptable and cleared.
 * Two things were wrong with it. A preferred-versus-acceptable *ranking* is only
 * meaningful where something weighs it, and the only consumer — a future rune
 * and artifact optimizer — asks one question: may this be suggested or not. And
 * three states over twenty-three set names and eight main stats per slot made
 * the overlay a wall of chips to answer a yes/no question twenty times over.
 *
 * So a preference is now a **list of what the user will take**. The three
 * states collapse to two, and the distinction §19.4 was protecting survives in
 * the list itself rather than in a band:
 *
 * | State | How it is stored | Where the answer comes from |
 * | --- | --- | --- |
 * | Chosen | in the list | the user |
 * | Never stated | **no list at all** | the default |
 * | Deliberately cleared | an **empty list** | the user — *not* the default |
 *
 * The third row is still the one that gets got wrong, and it is still the
 * presence of the key that carries it: an empty array survives
 * `JSON.stringify` where `undefined` does not, so a user who cleared every
 * choice keeps that answer across a reload instead of having the defaults
 * quietly returned to them.
 */

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
   * The main stats this copy will accept in this category.
   *
   * A single artifact carries one main, but the *question* is which mains are
   * worth equipping, and a user building for bulk may be equally happy with HP
   * or DEF. Naming both says so; naming one says the other is not wanted.
   *
   * **This reverses the earlier single-choice model.** `ARTIFACT-CANONICAL.md`
   * §19.2 held that a main is one choice because a piece carries one, which
   * confused what a piece *has* with what a user will *take*. The score matrix
   * has carried a band per main all along
   * (`PackedMonsterScoreInput.mainPreferences`), so a list is also the shape the
   * optimizer already reads.
   *
   * An empty list is a statement that none is wanted; an absent one is a
   * silence the default answers.
   */
  main?: ArtifactMainProperty[];
  /** Wanted substats by property id, written decimal because JSON has no numeric key. */
  sub?: Record<string, ArtifactSubPreference>;
};

export type MonsterCopyPreferences = {
  /** The owned copy's `unit_id`. The record's own key in the map repeats it. */
  unitId: string;
  /** The user's own name for this copy, shown in place of the game's. */
  label?: string;
  /**
   * The exact rune builds this copy will accept, as `rune-set-pairs.ts` names
   * them — `Violent/Blade` or `Violent/Broken`, not `Violent` and `Blade`
   * separately.
   *
   * **This reverses the earlier per-set model.** Stating sets one at a time
   * cannot distinguish `Despair / Revenge` from `Revenge / Revenge / Revenge`,
   * so a user who asked for both sets could be handed a build of one of them
   * repeated. A combination is the whole answer and leaves nothing to infer.
   *
   * These are yes/no statements, not bands: a build is one the user will take
   * or it is not. An empty list means none of them; an absent one is a silence.
   * Broken slots are part of the build that accepts them, so there is no
   * separate switch saying a broken pair will do.
   */
  runeSets?: string[];
  /** Whether an Intangible rune may stand in for the one rune a set is short. */
  allowIntangibleRunes?: boolean;
  /**
   * The main stats wanted in slots 2, 4 and 6 — several may be, so each slot
   * holds a list. Slots 1, 3 and 5 carry a fixed main and cannot be stated.
   */
  runeSlots?: Partial<Record<RuneSlotKey, string[]>>;
  artifacts?: Partial<Record<ArtifactCategory, ArtifactCategoryPreference>>;
  relics?: {
    /** The mains this copy will accept, on the same reasoning as an artifact's. */
    main?: RelicMainProperty[];
    /**
     * The unique properties wanted, by the ids `RELIC-CANONICAL.md` §4 numbers.
     * A yes/no list rather than bands: the optimizer asks only whether a unique
     * is one the user will take.
     */
    unique?: number[];
  };
  /**
   * The stats this copy is being built toward.
   *
   * Deliberately `MonsterStatTargets` rather than a shape of its own: the eight
   * stats a rune preset aims at are the eight a monster aims at, and two lists
   * that have to agree are one list.
   *
   * **The three composites are targets here, not derived figures.** `AGENTS.md`
   * §6 forbids storing a figure that follows from another, and a *displayed*
   * DMG or E.HP still follows from the copy's own stats and is still derived
   * wherever it is shown. A target is the opposite direction: "get this copy to
   * 60,000 E.HP" is a goal its owner states, and no combination of the eight
   * stat targets expresses it — a build may reach it through HP, through DEF, or
   * through both. So it is stored, and the current value beside it is derived.
   *
   * A stat left `undefined` is one this copy does not aim at; an explicit `0`
   * is a stated target of nothing.
   */
  statTargets?: MonsterStatTargets;
  /**
   * Which figure to maximise once every stated target is met.
   *
   * The targets say what the build must reach; they do not say what to do with
   * the slack left over, and a rune optimizer handed two builds that both clear
   * every target has to break the tie on something. This is the user naming it,
   * rather than the program picking a stat on their behalf.
   *
   * Absent means no preference: any build meeting the targets is as good as
   * another.
   */
  runeSuggestionStat?: keyof MonsterStatTargets;
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

/**
 * Whether a record still says anything at all.
 *
 * The write route drops an empty one rather than keeping a husk, so a user who
 * clears everything they set leaves no trace and a count of records is a count
 * of decisions. **An empty list is not nothing:** a user who cleared every rune
 * build they had chosen is saying they want none of them, which is a different
 * answer from never having opened the overlay, and it has to survive a reload
 * (`AGENTS.md` §6).
 */
export function statesSomething(preferences: MonsterCopyPreferences): boolean {
  if (preferences.label !== undefined && preferences.label.length > 0) return true;
  if (preferences.runeSets !== undefined) return true;
  if (preferences.allowIntangibleRunes !== undefined) return true;
  if (runeSlotKeys.some((key) => preferences.runeSlots?.[key] !== undefined)) return true;
  for (const category of ['attribute', 'type'] as const) {
    const artifact = preferences.artifacts?.[category];
    if (artifact?.main !== undefined) return true;
    if (artifact?.sub !== undefined && Object.keys(artifact.sub).length > 0) return true;
  }
  if (preferences.relics?.main !== undefined) return true;
  if (preferences.relics?.unique !== undefined) return true;
  if (preferences.runeSuggestionStat !== undefined) return true;
  const targets = preferences.statTargets;
  if (targets !== undefined && monsterStatTargetKeys.some((key) => targets[key] !== undefined)) return true;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A chosen list, checked entry by entry against the vocabulary it draws on.
 *
 * A duplicate is rejected rather than folded away: the editor cannot produce
 * one, so a document carrying one was not written by this contract and is not
 * quietly repaired into a shape that was (`AGENTS.md` §6).
 */
function isChosenList<T>(value: unknown, allows: (entry: unknown) => entry is T): value is T[] {
  if (!Array.isArray(value)) return false;
  if (!value.every(allows)) return false;
  return new Set(value).size === value.length;
}

function isSubstatId(key: string): boolean {
  const id = Number(key);
  return Number.isInteger(id) && String(id) === key && artifactProperty(id) !== null;
}

function isRelicUniqueId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && relicProperty(value) !== undefined;
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

function isArtifactMain(value: unknown): value is ArtifactMainProperty {
  return typeof value === 'string' && artifactMainPropertyOrder.includes(value as ArtifactMainProperty);
}

function isRelicMain(value: unknown): value is RelicMainProperty {
  return typeof value === 'string' && relicMainPropertyOrder.includes(value as RelicMainProperty);
}

/* Per slot, not against the whole vocabulary: a wish for a main the slot cannot
   roll is one no rune can ever satisfy, and a stored preference carrying one is
   malformed rather than merely unlucky. */
function isRuneMainStatIn(slot: RuneSlotKey) {
  return (value: unknown): value is RuneSlotMain =>
    typeof value === 'string' && runeSlotMainsBySlot[slot].includes(value as RuneSlotMain);
}

function isRuneBuildId(value: unknown): value is string {
  return typeof value === 'string' && runeBuild(value) !== undefined;
}

/* Two spellings of one build — `Destroy/Blade/Will` and `Will/Blade/Destroy` —
   are a duplicate the editor refuses to add, so a list carrying both is held to
   the same rule as a list naming one build twice. */
function isRuneBuildList(value: unknown): value is string[] {
  if (!isChosenList(value, isRuneBuildId)) return false;
  return new Set(value.map((id) => runeBuildKey(runeBuild(id)!))).size === value.length;
}

function isArtifactPreference(value: unknown): value is ArtifactCategoryPreference {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => key === 'main' || key === 'sub')) return false;
  if (value.main !== undefined && !isChosenList(value.main, isArtifactMain)) return false;
  return value.sub === undefined || isSubPreferences(value.sub);
}

function isRelicPreference(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => key === 'main' || key === 'unique')) return false;
  if (value.main !== undefined && !isChosenList(value.main, isRelicMain)) return false;
  return value.unique === undefined || isChosenList(value.unique, isRelicUniqueId);
}

/*
 * A target is a whole number within the reach of the figure it names. The
 * composites run an order of magnitude above a raw stat — the contract's own
 * worked example is an E.HP of 63,951 against a HP of 15,319 — so one ceiling
 * for all eleven would either reject a legitimate E.HP or admit an absurd SPD.
 */
export const monsterCompositeTargetMaximum = 1_000_000;

const compositeTargetKeys: ReadonlySet<string> = new Set(['dmg', 'ehp', 'ehpD']);

function targetCeiling(key: string): number {
  return compositeTargetKeys.has(key) ? monsterCompositeTargetMaximum : presetTargetMaximum;
}

function isStatTargets(value: unknown): value is MonsterStatTargets {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => monsterStatTargetKeys.includes(key as keyof MonsterStatTargets))) return false;
  return monsterStatTargetKeys.every((key) => {
    const target = value[key];
    return target === undefined
      || (typeof target === 'number' && Number.isInteger(target) && target >= 0 && target <= targetCeiling(key));
  });
}

function isRuneSlots(value: unknown): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, slot]) =>
      runeSlotKeys.includes(key as RuneSlotKey) && isChosenList(slot, isRuneMainStatIn(key as RuneSlotKey)));
}

function isArtifactPreferences(value: unknown): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, preference]) =>
      (key === 'attribute' || key === 'type') && isArtifactPreference(preference));
}

/*
 * Every band is one of three strings, every set name and property id is one the
 * editor could have offered, every target is a whole number in range. Each
 * field is its own decision and is checked alone, so one the contract no longer
 * honours costs that field and not the rest of the copy.
 */
const copyFieldChecks: Record<Exclude<keyof MonsterCopyPreferences, 'unitId'>, (value: unknown) => boolean> = {
  label: (value) => typeof value === 'string' && value.trim() === value && value.length <= monsterLabelMaximum,
  runeSets: isRuneBuildList,
  allowIntangibleRunes: (value) => typeof value === 'boolean',
  runeSlots: isRuneSlots,
  artifacts: isArtifactPreferences,
  relics: isRelicPreference,
  statTargets: isStatTargets,
  runeSuggestionStat: (value) => monsterStatTargetKeys.includes(value as keyof MonsterStatTargets),
};

/**
 * The stored map, copy by copy and field by field (`preference-reading.ts`).
 * A copy is kept under its own `unitId` only, and only while what survives the
 * checks still states something — the same rule the write route keeps.
 */
export function readMonsterPreferences(value: unknown): MonsterPreferences {
  if (!isRecord(value)) return {};
  const read: MonsterPreferences = {};
  for (const [unitId, stored] of Object.entries(value)) {
    if (unitId.length === 0 || !isRecord(stored) || stored.unitId !== unitId) continue;
    const copy: Record<string, unknown> = { unitId };
    for (const [key, check] of Object.entries(copyFieldChecks)) {
      if (stored[key] !== undefined && check(stored[key])) copy[key] = stored[key];
    }
    const preferences = copy as MonsterCopyPreferences;
    if (statesSomething(preferences)) read[unitId] = preferences;
  }
  return read;
}
