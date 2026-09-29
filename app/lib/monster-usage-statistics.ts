import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactProperty } from './artifact-properties';
import type { MonsterDefaults, RuneSlotKey } from './monster-defaults';
import { monsterDefaults, runeSlotKeys } from './monster-defaults';
import type { RelicMainProperty } from './relic-properties';
import { relicProperty, relicPropertyLabel } from './relic-properties';
import type { RuneSlotMain } from './rune-slot-mains';

/**
 * What the wider player base most commonly equips, ready to read.
 *
 * The defaults module already folds the three panels into bands; this turns the
 * same folding into ordered lists for the overlay's "most common" rows, so the
 * two can never disagree about one dataset. Nothing new is measured here.
 *
 * Every list is ordered by share, largest first, and carries the observation
 * count behind it: a share without its sample size is what the dataset itself
 * refuses to store, and the overlay says "from 41,203 builds" for the same
 * reason.
 */

export type UsageEntry = {
  /** What the row names, in the words the user reads it in. */
  label: string;
  share: number;
  /** Whether the share clears the cut that would make it a default. */
  wanted: boolean;
};

/** A substat or unique row, which the overlay can adopt by id. */
export type UsagePropertyEntry = UsageEntry & { id: number };

/** A row keyed by the vocabulary a preference is stated in. */
export type UsageChoiceEntry<T extends string> = UsageEntry & { value: T };

export type MonsterUsage = {
  runes?: {
    sets: UsageChoiceEntry<string>[];
    /** Whole builds, as the game's panel lists them — see `RuneDefaults.builds`. */
    builds: ReadonlyArray<{ label: string; share: number }>;
    slots: Record<RuneSlotKey, UsageChoiceEntry<RuneSlotMain>[]>;
    observations: number;
    /** Builds behind the set list, which the game truncates — see `RuneSetShareBasis`. */
    setObservations: number;
  };
  artifacts?: Partial<Record<ArtifactCategory, {
    main: UsageChoiceEntry<ArtifactMainProperty>[];
    sub: UsagePropertyEntry[];
    mainObservations: number;
    subObservations: number;
  }>>;
  relics?: {
    main: UsageChoiceEntry<RelicMainProperty>[];
    unique: UsagePropertyEntry[];
    mainObservations: number;
    uniqueObservations: number;
  };
};

function byShare(left: { share: number }, right: { share: number }): number {
  return right.share - left.share;
}

function choiceEntries<T extends string>(
  entries: Map<T, { band: string; share: number }> | undefined,
): UsageChoiceEntry<T>[] {
  if (!entries) return [];
  return [...entries]
    .map(([value, entry]) => ({ value, label: value, share: entry.share, wanted: entry.band !== 'unwanted' }))
    .sort(byShare);
}

function propertyEntries(
  entries: Map<number, { band: string; share: number }> | undefined,
  name: (id: number) => string | undefined,
): UsagePropertyEntry[] {
  if (!entries) return [];
  const rows: UsagePropertyEntry[] = [];
  for (const [id, entry] of entries) {
    const label = name(id);
    /* A property the vocabulary cannot name cannot be shown or adopted, so it
       is dropped rather than printed as a bare number. */
    if (label === undefined) continue;
    rows.push({ id, label, share: entry.share, wanted: entry.band !== 'unwanted' });
  }
  return rows.sort(byShare);
}

function runeUsage(defaults: MonsterDefaults): MonsterUsage['runes'] {
  const runes = defaults.runes;
  if (!runes) return undefined;
  const slots = {} as Record<RuneSlotKey, UsageChoiceEntry<RuneSlotMain>[]>;
  for (const key of runeSlotKeys) slots[key] = choiceEntries(runes.slots[key]);
  return {
    sets: choiceEntries(runes.sets),
    builds: runes.builds.map((entry) => ({ label: entry.build, share: entry.share })),
    slots,
    /* The slot distributions are the honest measure of how many builds stand
       behind this monster's rune panel: the set list is capped by the game. */
    observations: Math.max(...runeSlotKeys.map((key) => runes.slotObservations[key]), 0),
    setObservations: runes.setObservations,
  };
}

function artifactUsage(defaults: MonsterDefaults): MonsterUsage['artifacts'] {
  const artifacts = defaults.artifacts;
  if (!artifacts) return undefined;
  const usage: NonNullable<MonsterUsage['artifacts']> = {};
  for (const category of ['attribute', 'type'] as const) {
    const panel = artifacts[category];
    if (!panel) continue;
    usage[category] = {
      main: choiceEntries(panel.main),
      sub: propertyEntries(panel.sub, (id) => artifactProperty(id)?.name),
      mainObservations: panel.mainObservations,
      subObservations: panel.subObservations,
    };
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function relicUsage(defaults: MonsterDefaults): MonsterUsage['relics'] {
  const relics = defaults.relics;
  if (!relics) return undefined;
  return {
    main: choiceEntries(relics.main),
    unique: propertyEntries(relics.unique, (id) => {
      const definition = relicProperty(id);
      return definition ? relicPropertyLabel(definition) : undefined;
    }),
    mainObservations: relics.mainObservations,
    uniqueObservations: relics.uniqueObservations,
  };
}

/**
 * The most common choices for this monster's species, or an empty record where
 * the dataset has not captured it.
 *
 * An uncaptured monster is the ordinary case rather than an edge one — most of
 * the game's roster is not captured — so the overlay renders "not captured" in
 * the same reserved space rather than treating it as a fault.
 */
export function monsterUsage(masterId: unknown): MonsterUsage {
  const defaults = monsterDefaults(masterId);
  if (!defaults) return {};
  return {
    runes: runeUsage(defaults),
    artifacts: artifactUsage(defaults),
    relics: relicUsage(defaults),
  };
}
