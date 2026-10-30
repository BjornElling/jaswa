import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainPropertyOrder } from './artifact-properties';
import type { GameRecord } from './game-data';
import type { GearMainAdvice, MainStatAdvice } from './main-stat-model';
import { copyMainStatAdvice, honouredMainStat, speciesMainStatAdvice } from './main-stat-model';
import type {
  DefaultEntry, MonsterDefaults, RuneSlotKey,
} from './monster-defaults';
import { monsterDefaults, runeSlotKeys } from './monster-defaults';
import type {
  BandedChoices, MonsterCopyPreferences, MonsterStatTargets,
} from './monster-preferences';
import { monsterStatTargetKeys, statedAnswer, statedLeads } from './monster-preferences';
import { ledStats } from './monster-stats';
import type { Leads, TeammateSets } from './monster-stats';
import type { AutomaticStatLine, PassiveStatRule } from './passive-stat-bonuses';
import { noTeamBonuses } from './team-leads';
import type { TeamBonuses } from './team-leads';
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
 * **A rune answer is a list; a gear answer is two bands.** The user says which
 * runes they will take, and which gear they prefer and which they merely accept;
 * the community share travels beside each option as evidence, and the overlay
 * shows it as reference. The share orders a list for reading and ranks nothing.
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

/**
 * One resolved gear answer, in its two bands, with provenance and evidence.
 *
 * Where the user has spoken, their two bands are the whole answer; where they
 * have not, the dataset's own bands stand in. An option in neither is not
 * wanted — unless both are empty, which narrows nothing.
 */
export type ResolvedBands<T> = {
  /** In the dataset's descending order of use, as every other row is. */
  preferred: readonly T[];
  acceptable: readonly T[];
  source: PreferenceSource;
  shares: ReadonlyMap<T, number>;
};

/** Every option a resolved answer names, preferred first. */
export function resolvedOptions<T>(bands: ResolvedBands<T>): T[] {
  return [...bands.preferred, ...bands.acceptable];
}

export type ResolvedRunes = {
  /** The exact builds wanted, as `rune-set-pairs.ts` names them. */
  sets: ResolvedChoices<string>;
  slots: Record<RuneSlotKey, ResolvedChoices<RuneSlotMain>>;
  /** Whether runes that complete no set may be engraved. */
  allowBroken: boolean;
  /** Whether an Intangible rune may complete a set that is one short. */
  allowIntangible: boolean;
  /** `false` where neither the user nor the dataset says anything about runes. */
  judged: boolean;
};

export type ResolvedArtifactCategory = {
  /** The copy's one main answer, or this category's own default where it gave none. */
  main: ResolvedBands<ArtifactMainProperty>;
  /** Substats by property id. */
  sub: ResolvedBands<number>;
  judged: boolean;
};

export type ResolvedRelics = {
  main: ResolvedBands<RelicMainProperty>;
  unique: ResolvedBands<number>;
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
  /** The most each figure may reach, where the owner said; the upper end of each range. */
  statCeilings: Partial<Record<keyof MonsterStatTargets, ResolvedStatTarget>>;
  /** The figure to maximise once every target is met, where one was named. */
  runeSuggestionStat?: keyof MonsterStatTargets;
  /** Whether every figure is counted at a certain crit (`monster-stats.ts` `alwaysCritsFloor`). */
  alwaysCrits: boolean;
  alwaysElementAdvantage: boolean;
  /**
   * What its leaders add, stat by stat; a stat none names gets nothing. Read off
   * the preset's leaders (`team-leads.ts`), and stated by hand only in Scenario.
   */
  leads: Leads;
  /** Derived from the chosen preset, never a stored profile choice. */
  teammateSets: TeammateSets;
  /** Battle-start rules that derive one stat from another. */
  leadRules: readonly PassiveStatRule[];
  /** Source detail for the automatic rows already included in `leads`. */
  automaticLeadLines: readonly AutomaticStatLine[];
  /**
   * What the main-stat model makes of this copy (`main-stat-model.ts`) — the
   * default its gear mains fall back on, and what a stated main is checked
   * against. Absent where no source can say.
   */
  mainStatAdvice?: MainStatAdvice;
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
 * One stated pair of bands resolved against one default map: the user's two
 * bands where they spoke — including two empty ones, which are not topped back
 * up — and the dataset's own bands otherwise.
 */
function resolveBands<T extends string | number>(
  stated: BandedChoices<T> | undefined,
  defaults: Map<T, DefaultEntry> | undefined,
): ResolvedBands<T> {
  const shares = sharesOf(defaults);
  const ordered = (values: Iterable<T>) => [...values].sort((left, right) =>
    (shares.get(right) ?? 0) - (shares.get(left) ?? 0) || String(left).localeCompare(String(right)));
  if (stated !== undefined) {
    return { preferred: ordered(stated.preferred), acceptable: ordered(stated.acceptable), source: 'user', shares };
  }
  const inBand = (band: 'preferred' | 'acceptable') =>
    ordered([...(defaults ?? new Map<T, DefaultEntry>())].filter(([, entry]) => entry.band === band).map(([key]) => key));
  return { preferred: inBand('preferred'), acceptable: inBand('acceptable'), source: 'default', shares };
}

const answers = <T,>(bands: ResolvedBands<T>) => bands.preferred.length + bands.acceptable.length > 0;

function resolveRunes(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
): ResolvedRunes {
  const runeDefaults = defaults?.runes;
  /*
   * The dataset counts how often each *set* is engraved and never which sets
   * were engraved together, so it cannot name a build. A user who has stated no
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
    /* On unless the owner switched them off. An Intangible rune and an Immemorial
       item are owned to be spent, and a build that leaves them out answers a
       narrower question than the one asked; the owner who is saving them says so. */
    allowIntangible: stated?.allowIntangibleRunes ?? true,
    /* Off unless the owner switched it on: a broken set is stats given away, and
       an optimizer that offered one unasked would be answering a looser question. */
    allowBroken: stated?.allowBrokenSets ?? false,
    judged,
  };
}

/* The model's answer for one piece in the shape a default takes, its worth
   standing where a population share stands elsewhere. */
function modelDefaults(advice: GearMainAdvice | undefined): Map<ArtifactMainProperty, DefaultEntry> | undefined {
  if (advice === undefined) return undefined;
  return new Map(artifactMainPropertyOrder.map((stat) => [stat, { band: advice.bands[stat], share: advice.worth[stat] }]));
}

function resolveArtifactCategory(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
  advice: MainStatAdvice | undefined,
  category: ArtifactCategory,
): ResolvedArtifactCategory {
  const categoryDefaults = defaults?.artifacts?.[category];
  /* The main is the model's, not the population's: both categories carry the
     same three mains at the same values, so the model answers them alike. */
  const main = resolveBands(honouredMainStat(stated), modelDefaults(advice?.artifact));
  const sub = resolveBands(statedAnswer(stated?.artifacts?.sub?.[category]), categoryDefaults?.sub);
  return { main, sub, judged: answers(main) || answers(sub) };
}

function resolveRelics(
  stated: MonsterCopyPreferences | undefined,
  defaults: MonsterDefaults | undefined,
  advice: MainStatAdvice | undefined,
): ResolvedRelics {
  const relicDefaults = defaults?.relics;
  /* The one main answer serves the relic as it serves both artifacts; where it
     was never given, the model's answer for a relic stands in. */
  const main = resolveBands(honouredMainStat(stated), modelDefaults(advice?.relic));
  const unique = resolveBands(statedAnswer(stated?.relics?.unique), relicDefaults?.unique);
  return { main, unique, judged: answers(main) || answers(unique) };
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

/** The leads a copy fights under: its preset's leaders', or in Scenario the ones its profile states. */
export function fightLeads(team: TeamBonuses, stated: MonsterCopyPreferences | undefined): Leads {
  const values = { ...team.leads.bonuses };
  if (team.leads.scenario) {
    const statedValues = statedLeads(stated);
    for (const stat of ledStats) {
      const value = statedValues[stat];
      if (value !== undefined) values[stat] = (values[stat] ?? 0) + value;
    }
  }
  return values;
}

/**
 * What this owned copy wants, with every answer carrying where it came from.
 *
 * `masterId` is taken rather than derived from the copy, so a species with no
 * copy can be answered too. `monster` is the copy's own record where the caller
 * holds one: the main-stat model reads its runes and base stats, and without it
 * answers for the species.
 */
export function resolveMonsterPreferences(
  unitId: string,
  masterId: unknown,
  stated: MonsterCopyPreferences | undefined,
  monster?: GameRecord,
  team: TeamBonuses = noTeamBonuses,
): ResolvedMonsterPreferences {
  const defaults = monsterDefaults(masterId);
  const advice = monster === undefined ? speciesMainStatAdvice(masterId) : copyMainStatAdvice(monster);
  return {
    unitId,
    ...(defaults === undefined ? {} : { speciesId: defaults.speciesId }),
    runes: resolveRunes(stated, defaults),
    artifacts: {
      attribute: resolveArtifactCategory(stated, defaults, advice, 'attribute'),
      type: resolveArtifactCategory(stated, defaults, advice, 'type'),
    },
    relics: resolveRelics(stated, defaults, advice),
    statTargets: resolveStatTargets(stated?.statTargets),
    statCeilings: resolveStatTargets(stated?.statCeilings),
    ...(stated?.runeSuggestionStat === undefined ? {} : { runeSuggestionStat: stated.runeSuggestionStat }),
    alwaysCrits: stated?.alwaysCrits ?? false,
    alwaysElementAdvantage: stated?.alwaysElementAdvantage ?? false,
    leads: fightLeads(team, stated),
    teammateSets: team.teammateSets,
    leadRules: team.leads.rules,
    automaticLeadLines: team.leads.automaticLines,
    ...(advice === undefined ? {} : { mainStatAdvice: advice }),
  };
}
