import type { ArtifactCategory } from '../artifacts/artifact-properties';
import { artifactProperty } from '../artifacts/artifact-properties';
import type { RuneSlotKey } from '../profiles/monster-defaults';
import { monsterDefaults, runeSlotKeys } from '../profiles/monster-defaults';
import { relicProperty, relicPropertyLabel } from '../relics/relic-properties';
import { runeSlotMainEffect } from '../runes/rune-slot-mains';
import { runeStatName } from '../runes/runes';

/**
 * What the wider player base engraves on one monster, ready to read on the
 * statistics overlay.
 *
 * The defaults module already folds the game's three panels; this turns the
 * same folding into ordered lists, so the overlay and the defaults can never
 * disagree about one dataset. Nothing new is measured here.
 *
 * Every list is ordered by share, largest first, and every panel carries the
 * count behind it and the day it was seen: a share without its sample size is
 * what the dataset itself refuses to store.
 */

export type UsageEntry = {
  /** What the row names, in the words the user reads it in. */
  label: string;
  share: number;
};

export type MonsterUsage = {
  runes?: {
    /** Whole builds, as the game's panel lists them — see `RuneDefaults.builds`. */
    builds: UsageEntry[];
    slots: Record<RuneSlotKey, UsageEntry[]>;
    /** Each sub property's share of every sub line. */
    subs: UsageEntry[];
  };
  artifacts?: {
    categories: Partial<Record<ArtifactCategory, { main: UsageEntry[]; sub: UsageEntry[] }>>;
  };
  relics?: {
    main: UsageEntry[];
    unique: UsageEntry[];
  };
};

function byShare(left: { share: number }, right: { share: number }): number {
  return right.share - left.share;
}

/* A property the vocabulary cannot name cannot be shown, so it is dropped rather
   than printed as a bare number. */
function entries<K>(shares: Iterable<[K, number]>, name: (key: K) => string | undefined): UsageEntry[] {
  const rows: UsageEntry[] = [];
  for (const [key, share] of shares) {
    const label = name(key);
    if (label !== undefined) rows.push({ label, share });
  }
  return rows.sort(byShare);
}

function shares<K>(banded: Map<K, { share: number }>): Iterable<[K, number]> {
  return [...banded].map(([key, entry]) => [key, entry.share] as [K, number]);
}

const ownName = <K extends string>(key: K) => key;

/**
 * The game's statistics for this monster's species, or an empty record where
 * the dataset has not captured it.
 *
 * An uncaptured monster is the ordinary case rather than an edge one — most of
 * the game's roster is not captured — so the overlay says "not captured" in
 * the same place rather than treating it as a fault.
 */
export function monsterUsage(masterId: unknown): MonsterUsage {
  const defaults = monsterDefaults(masterId);
  if (!defaults) return {};
  const usage: MonsterUsage = {};

  const runes = defaults.runes;
  if (runes) {
    const slots = {} as Record<RuneSlotKey, UsageEntry[]>;
    /* In the game's words, as the sub properties beside them are: `SPD` and
       `HP %` rather than the role vocabulary's `Spd` and `HP%`. */
    for (const key of runeSlotKeys) {
      slots[key] = entries(shares(runes.slots[key]), (main) => runeStatName(runeSlotMainEffect(main)));
    }
    usage.runes = {
      builds: runes.builds.map((entry) => ({ label: entry.build, share: entry.share })),
      slots,
      subs: entries(runes.subShares, runeStatName),
    };
  }

  const artifacts = defaults.artifacts;
  if (artifacts) {
    const categories: NonNullable<MonsterUsage['artifacts']>['categories'] = {};
    for (const category of ['attribute', 'type'] as const) {
      const panel = artifacts[category];
      if (!panel) continue;
      categories[category] = {
        main: entries(shares(panel.main), ownName),
        sub: entries(shares(panel.sub), (id) => artifactProperty(id)?.name),
      };
    }
    usage.artifacts = { categories };
  }

  const relics = defaults.relics;
  if (relics) {
    usage.relics = {
      main: entries(shares(relics.main), ownName),
      unique: entries(shares(relics.unique), (id) => {
        const definition = relicProperty(id);
        return definition ? relicPropertyLabel(definition) : undefined;
      }),
    };
  }
  return usage;
}
