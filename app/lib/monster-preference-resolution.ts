import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import type {
  DefaultEntry, MonsterDefaults, RuneSlotKey,
} from './monster-defaults';
import { monsterDefaults, runeSlotKeys } from './monster-defaults';
import type {
  ArtifactSubPreference, MonsterCopyPreferences, MonsterStatTargets,
} from './monster-preferences';
import { monsterStatTargetKeys } from './monster-preferences';
import type { RelicMainProperty } from './relic-properties';
import type { RuneSlotMain } from './rune-slot-mains';

/**
 * What one owned copy actually wants, once its owner's statements have been
 * laid over what the wider player base does.
 *
 * **The two are never blended** (`ARTIFACT-CANONICAL.md` §19.4). For each
 * question the answer comes from the user where they stated one and from the
 * dataset otherwise, and a question the user answered with "none of these"
 * answers from the user without falling back. Keeping the merge to exactly that
 * is what makes a recapture unable to disturb anything the user decided: there
 * is no reconciliation policy to get wrong, because there is no reconciliation.
 *
 * This is the one place a per-copy statement meets a species-level default. The
 * user's statements are keyed on `unit_id`; the game's Statistics panels are
 * keyed on `unit_master_id` and cannot be otherwise. Both are taken here so no
 * other module has to know that.
 *
 * **A resolved answer is a list, not a ranking.** The user says which options
 * they will take; the community share travels beside each one as evidence, and
 * the overlay shows it as reference. Nothing here ranks an option above another.
 */

/**
 * Where one answer came from.
 *
 * Provenance travels with the value because the optimizer has to know whether
 * it is honouring a decision or falling back on a statistic — and a caller that
 * reconstructed it would eventually reconstruct it differently.
 */
export type PreferenceSource = 'user' | 'default';

/**
 * One resolved list, with its provenance and the evidence behind each entry.
 *
 * `shares` carries the statistic that produced the default, or that *would
 * have* had the user not spoken — kept on a user-sourced answer too, so a view
 * can say "you chose ATK; 68 % of players choose HP" without a second lookup.
 * An entry is absent from it only where the dataset has nothing to say.
 */
export type ResolvedChoices<T> = {
  /** What the user will take, in the dataset's descending order of use. */
  chosen: readonly T[];
  source: PreferenceSource;
  shares: ReadonlyMap<T, number>;
};

/** A wanted substat: the floor the user asked for, and what the population does. */
export type ResolvedSubstat = {
  /** The user's floor in hundredths, or `undefined` for "at any roll". */
  minimumHundredths?: number;
  source: PreferenceSource;
  share?: number;
};

export type ResolvedRunes = {
  /** The exact builds wanted, as `rune-set-pairs.ts` names them. */
  sets: ResolvedChoices<string>;
  slots: Record<RuneSlotKey, ResolvedChoices<RuneSlotMain>>;
  /** Whether an Intangible rune may complete a set that is one short. */
  allowIntangible: boolean;
  /** `false` where neither the user nor the dataset says anything about runes. */
  judged: boolean;
};

export type ResolvedArtifactCategory = {
  main: ResolvedChoices<ArtifactMainProperty>;
  /** Wanted substats by property id, in descending community share. */
  sub: Map<number, ResolvedSubstat>;
  /** Whether the substats are the user's own statement rather than the population's. */
  subSource: PreferenceSource;
  judged: boolean;
};

export type ResolvedRelics = {
  main: ResolvedChoices<RelicMainProperty>;
  unique: ResolvedChoices<number>;
  judged: boolean;
};

/**
 * A stat target and where it came from.
 *
 * No panel reports what the player base *aims at*, so there is no statistics
 * default for a stat target: `source` is always `'user'` and the entry is
 * absent where nothing was stated.
 */
export type ResolvedStatTarget = { value: number; source: 'user' };

export type ResolvedMonsterPreferences = {
  unitId: string;
  /** The species the defaults were read from, or `undefined` for an uncaptured monster. */
  speciesId?: string;
  runes: ResolvedRunes;
  artifacts: Record<ArtifactCategory, ResolvedArtifactCategory>;
  relics: ResolvedRelics;
  statTargets: Partial<Record<keyof MonsterStatTargets, ResolvedStatTarget>>;
  /** The figure to maximise once every target is met, where one was named. */
  runeSuggestionStat?: keyof MonsterStatTargets;
};

const noChoices = <T,>(): ResolvedChoices<T> => ({ chosen: [], source: 'default', shares: new Map<T, number>() });

function sharesOf<T>(defaults: Map<T, DefaultEntry> | undefined): Map<T, number> {
  const shares = new Map<T, number>();
  if (defaults) for (const [key, entry] of defaults) shares.set(key, entry.share);
  return shares;
}

/**
 * One stated list resolved against one default map.
 *
 * Where the user has spoken their list is the whole answer — including an empty
 * one, which says none of these are wanted and is not topped back up from the
 * population. Where they have not, the options the dataset calls wanted stand
 * in, most used first. The shares travel either way.
 */
function resolveChoices<T>(
  stated: readonly T[] | undefined,
  defaults: Map<T, DefaultEntry> | undefined,
): ResolvedChoices<T> {
  const shares = sharesOf(defaults);
  if (stated !== undefined) {
    /* The user's own order is not meaningful — they ticked boxes — so the list
       is read back in the order the population uses them, which is the order
       every other row in the overlay is in. */
    const chosen = [...stated].sort((left, right) => (shares.get(right) ?? 0) - (shares.get(left) ?? 0));
    return { chosen, source: 'user', shares };
  }
  const chosen: T[] = [];
  if (defaults) {
    for (const [key, entry] of defaults) if (entry.band !== 'unwanted') chosen.push(key);
    chosen.sort((left, right) => (shares.get(right) ?? 0) - (shares.get(left) ?? 0));
  }
  return { chosen, source: 'default', shares };
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
): { sub: Map<number, ResolvedSubstat>; source: PreferenceSource } {
  const shareOf = (id: number) => defaults?.get(id)?.share;
  const entries: Array<[number, ResolvedSubstat]> = [];
  const source: PreferenceSource = stated !== undefined ? 'user' : 'default';

  if (stated !== undefined) {
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
  return { sub: new Map(entries), source };
}

function resolveRunes(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
): ResolvedRunes {
  const runeDefaults = defaults?.runes;
  /*
   * The dataset counts how often each *set* is equipped and never which sets
   * were worn together, so it cannot name a build. A user who has stated no
   * builds therefore gets none rather than a guess assembled from two popular
   * sets — which is exactly the inference this model exists to stop making.
   */
  const sets: ResolvedChoices<string> = stated?.runeSets === undefined
    ? noChoices<string>()
    : resolveChoices<string>(stated.runeSets, undefined);

  const slots = {} as Record<RuneSlotKey, ResolvedChoices<RuneSlotMain>>;
  for (const key of runeSlotKeys) {
    slots[key] = resolveChoices(stated?.runeSlots?.[key] as RuneSlotMain[] | undefined, runeDefaults?.slots[key]);
  }
  const judged = sets.chosen.length > 0 || runeSlotKeys.some((key) => slots[key].chosen.length > 0);
  return {
    sets,
    slots,
    /* Off by default: spending the one Intangible rune is a concession, and a
       concession nobody asked for is not one to make on their behalf. */
    allowIntangible: stated?.allowIntangibleRunes ?? false,
    judged,
  };
}

function resolveArtifactCategory(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
  category: ArtifactCategory,
): ResolvedArtifactCategory {
  const categoryDefaults = defaults?.artifacts?.[category];
  const categoryStated = stated?.artifacts?.[category];
  const main = resolveChoices(categoryStated?.main, categoryDefaults?.main);
  const { sub, source } = resolveSubstats(categoryStated?.sub, categoryDefaults?.sub);
  return { main, sub, subSource: source, judged: main.chosen.length > 0 || sub.size > 0 };
}

function resolveRelics(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
): ResolvedRelics {
  const relicDefaults = defaults?.relics;
  const main = resolveChoices(stated?.relics?.main, relicDefaults?.main);
  const unique = resolveChoices(stated?.relics?.unique, relicDefaults?.unique);
  return { main, unique, judged: main.chosen.length > 0 || unique.chosen.length > 0 };
}

function resolveStatTargets(
  stated: MonsterStatTargets | undefined,
): Partial<Record<keyof MonsterStatTargets, ResolvedStatTarget>> {
  const targets: Partial<Record<keyof MonsterStatTargets, ResolvedStatTarget>> = {};
  if (!stated) return targets;
  for (const key of monsterStatTargetKeys) {
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
    ...(stated?.runeSuggestionStat === undefined ? {} : { runeSuggestionStat: stated.runeSuggestionStat }),
  };
}
