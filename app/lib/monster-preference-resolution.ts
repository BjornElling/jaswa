import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import type {
  DefaultEntry, MonsterDefaults, PreferenceBand, RuneSlotKey,
} from './monster-defaults';
import { monsterDefaults, runeSlotKeys } from './monster-defaults';
import type {
  ArtifactSubPreference, MonsterCopyPreferences, StatedBand,
} from './monster-preferences';
import type { RelicMainProperty } from './relic-properties';
import type { PresetStatTargets, RuneMainStat } from './rune-potential-presets';
import { presetStatTargetKeys } from './rune-potential-presets';

/**
 * What one owned copy actually wants, once its owner's statements have been
 * laid over what the wider player base does.
 *
 * **The two are never blended** (`ARTIFACT-CANONICAL.md` §19.4). For each key
 * the answer comes from the user where they stated one and from the dataset
 * otherwise, and a key the user cleared answers from the user without falling
 * back. Keeping the merge to exactly that is what makes a recapture unable to
 * disturb anything the user decided: there is no reconciliation policy to get
 * wrong, because there is no reconciliation.
 *
 * This is the one place a per-copy statement meets a species-level default. The
 * user's statements are keyed on `unit_id`; the game's Statistics panels are
 * keyed on `unit_master_id` and cannot be otherwise. Both are taken here so no
 * other module has to know that.
 */

/**
 * Where one answer came from.
 *
 * Provenance travels with the value because the overlay has to show which of
 * the settings are the user's own and which are standing in — and a view that
 * reconstructed it would eventually reconstruct it differently.
 */
export type PreferenceSource = 'user' | 'default';

/**
 * One resolved band, with its provenance and the evidence behind it.
 *
 * `share` is the statistic that produced the default, or that *would have*
 * produced one had the user not spoken — kept on a user-sourced entry too, so
 * the overlay can say "you chose ATK; 68 % of players choose HP" without a
 * second lookup. It is absent only where the dataset has nothing to say.
 */
export type ResolvedEntry = {
  band: PreferenceBand;
  source: PreferenceSource;
  share?: number;
};

/**
 * A single-choice answer — an artifact's or a relic's main stat.
 *
 * An artifact carries one main, so the question is "which one", not "which
 * are acceptable". `value` is absent where neither the user nor the dataset
 * names one, which reads as *not judged* rather than as a main of nothing.
 */
export type ResolvedChoice<T> = {
  value?: T;
  source: PreferenceSource;
  share?: number;
};

/** A wanted substat: the floor the user asked for, and what the population does. */
export type ResolvedSubstat = {
  /** The user's floor in hundredths, or `undefined` for "at any roll". */
  minimumHundredths?: number;
  source: PreferenceSource;
  share?: number;
};

export type ResolvedRunes = {
  sets: Map<string, ResolvedEntry>;
  slots: Record<RuneSlotKey, Map<RuneMainStat, ResolvedEntry>>;
  /** `false` where neither the user nor the dataset says anything about runes. */
  judged: boolean;
};

export type ResolvedArtifactCategory = {
  main: ResolvedChoice<ArtifactMainProperty>;
  /** Wanted substats by property id, in descending community share. */
  sub: Map<number, ResolvedSubstat>;
  judged: boolean;
};

export type ResolvedRelics = {
  main: ResolvedChoice<RelicMainProperty>;
  unique: Map<number, ResolvedEntry>;
  judged: boolean;
};

/**
 * A stat target and where it came from.
 *
 * No panel reports what the player base *aims at*, so there is no statistics
 * default for a stat target: `source` is always `'user'` and the entry is
 * absent where nothing was stated. It carries the same shape as the others so
 * the overlay reads one vocabulary across four panels rather than three plus a
 * special case.
 */
export type ResolvedStatTarget = { value: number; source: 'user' };

export type ResolvedMonsterPreferences = {
  unitId: string;
  /** The species the defaults were read from, or `undefined` for an uncaptured monster. */
  speciesId?: string;
  runes: ResolvedRunes;
  artifacts: Record<ArtifactCategory, ResolvedArtifactCategory>;
  relics: ResolvedRelics;
  statTargets: Partial<Record<keyof PresetStatTargets, ResolvedStatTarget>>;
};

/* A cleared statement and a silence are the same band once resolved — both say
   the property is not wanted — but they are not the same answer, because only
   one of them can be overruled by the dataset. That distinction is made before
   this point, by whether the key is there at all. */
function statedEntry(band: StatedBand, share: number | undefined): ResolvedEntry {
  return share === undefined ? { band, source: 'user' } : { band, source: 'user', share };
}

function defaultedEntry(entry: DefaultEntry): ResolvedEntry {
  return { band: entry.band, source: 'default', share: entry.share };
}

/**
 * One band map resolved against one default map.
 *
 * Every key either side knows about appears in the answer, so the overlay can
 * offer the union rather than only what the user has already touched. Where
 * both speak, the user wins and keeps the population's share beside their
 * choice.
 */
function resolveBands<T extends string>(
  stated: Record<string, StatedBand> | undefined,
  defaults: Map<T, DefaultEntry> | undefined,
  isKnown: (key: string) => key is T,
): Map<T, ResolvedEntry> {
  const resolved = new Map<T, ResolvedEntry>();
  if (defaults) for (const [key, entry] of defaults) resolved.set(key, defaultedEntry(entry));
  if (stated) {
    for (const [key, band] of Object.entries(stated)) {
      if (!isKnown(key)) continue;
      resolved.set(key, statedEntry(band, defaults?.get(key)?.share));
    }
  }
  return resolved;
}

function resolveNumericBands(
  stated: Record<string, StatedBand> | undefined,
  defaults: Map<number, DefaultEntry> | undefined,
): Map<number, ResolvedEntry> {
  const resolved = new Map<number, ResolvedEntry>();
  if (defaults) for (const [id, entry] of defaults) resolved.set(id, defaultedEntry(entry));
  if (stated) {
    for (const [key, band] of Object.entries(stated)) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      resolved.set(id, statedEntry(band, defaults?.get(id)?.share));
    }
  }
  return resolved;
}

/**
 * The one main a category wants.
 *
 * The user's pick wins outright. Absent one, the default is the *leading*
 * preferred entry rather than every entry above a cut: an artifact carries one
 * main, so offering three would be answering a different question than the one
 * asked.
 */
function resolveMain<T extends string>(
  stated: T | undefined,
  defaults: Map<T, DefaultEntry> | undefined,
): ResolvedChoice<T> {
  if (stated !== undefined) {
    const share = defaults?.get(stated)?.share;
    return share === undefined ? { value: stated, source: 'user' } : { value: stated, source: 'user', share };
  }
  let leader: { value: T; share: number } | undefined;
  if (defaults) {
    for (const [value, entry] of defaults) {
      if (entry.band === 'unwanted') continue;
      if (!leader || entry.share > leader.share) leader = { value, share: entry.share };
    }
  }
  return leader === undefined
    ? { source: 'default' }
    : { value: leader.value, source: 'default', share: leader.share };
}

/**
 * The substats a category wants, ordered by how widely they are used.
 *
 * Where the user has stated any substat at all, their list is the whole answer:
 * a user who asked for one property and no others means the others are not
 * wanted, so the defaults do not top the list back up. Where they have stated
 * none, the population's preferred properties stand in — at no floor, since the
 * dataset records which properties are chosen and never how high they rolled.
 */
function resolveSubstats(
  stated: Record<string, ArtifactSubPreference> | undefined,
  defaults: Map<number, DefaultEntry> | undefined,
): Map<number, ResolvedSubstat> {
  const shareOf = (id: number) => defaults?.get(id)?.share;
  const entries: Array<[number, ResolvedSubstat]> = [];

  if (stated !== undefined && Object.keys(stated).length > 0) {
    for (const [key, preference] of Object.entries(stated)) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      const share = shareOf(id);
      entries.push([id, {
        ...(preference.minimumHundredths === undefined ? {} : { minimumHundredths: preference.minimumHundredths }),
        source: 'user',
        ...(share === undefined ? {} : { share }),
      }]);
    }
  } else if (defaults) {
    for (const [id, entry] of defaults) {
      if (entry.band === 'unwanted') continue;
      entries.push([id, { source: 'default', share: entry.share }]);
    }
  }

  entries.sort(([leftId, left], [rightId, right]) => (right.share ?? 0) - (left.share ?? 0) || leftId - rightId);
  return new Map(entries);
}

function resolveRunes(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
): ResolvedRunes {
  const runeDefaults = defaults?.runes;
  const sets = resolveBands(
    stated?.runeSets,
    runeDefaults?.sets,
    (key): key is string => key.length > 0,
  );
  const slots = {} as Record<RuneSlotKey, Map<RuneMainStat, ResolvedEntry>>;
  for (const key of runeSlotKeys) {
    slots[key] = resolveBands(
      stated?.runeSlots?.[key],
      runeDefaults?.slots[key],
      (candidate): candidate is RuneMainStat => candidate.length > 0,
    );
  }
  const judged = sets.size > 0 || runeSlotKeys.some((key) => slots[key].size > 0);
  return { sets, slots, judged };
}

function resolveArtifactCategory(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
  category: ArtifactCategory,
): ResolvedArtifactCategory {
  const categoryDefaults = defaults?.artifacts?.[category];
  const categoryStated = stated?.artifacts?.[category];
  const main = resolveMain(categoryStated?.main, categoryDefaults?.main);
  const sub = resolveSubstats(categoryStated?.sub, categoryDefaults?.sub);
  return { main, sub, judged: main.value !== undefined || sub.size > 0 };
}

function resolveRelics(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
): ResolvedRelics {
  const relicDefaults = defaults?.relics;
  const main = resolveMain(stated?.relics?.main, relicDefaults?.main);
  const unique = resolveNumericBands(stated?.relics?.unique, relicDefaults?.unique);
  return { main, unique, judged: main.value !== undefined || unique.size > 0 };
}

function resolveStatTargets(
  stated: PresetStatTargets | undefined,
): Partial<Record<keyof PresetStatTargets, ResolvedStatTarget>> {
  const targets: Partial<Record<keyof PresetStatTargets, ResolvedStatTarget>> = {};
  if (!stated) return targets;
  for (const key of presetStatTargetKeys) {
    const value = stated[key];
    /* An absent target is a stat this copy does not aim at; an explicit `0` is a
       stated target of nothing and is a real answer (`AGENTS.md` §3). */
    if (value === undefined) continue;
    targets[key] = { value, source: 'user' };
  }
  return targets;
}

/**
 * What this owned copy wants, with every answer carrying where it came from.
 *
 * `masterId` is taken rather than derived from the copy, because the caller
 * already holds the monster record and re-deriving it here would make this
 * module depend on the account data.
 */
export function resolveMonsterPreferences(
  unitId: string,
  masterId: unknown,
  stated: MonsterCopyPreferences | undefined,
): ResolvedMonsterPreferences {
  const defaults = monsterDefaults(masterId);
  return {
    unitId,
    ...(defaults === undefined ? {} : { speciesId: defaults.speciesId }),
    runes: resolveRunes(stated, defaults),
    artifacts: {
      attribute: resolveArtifactCategory(stated, defaults, 'attribute'),
      type: resolveArtifactCategory(stated, defaults, 'type'),
    },
    relics: resolveRelics(stated, defaults),
    statTargets: resolveStatTargets(stated?.statTargets),
  };
}
