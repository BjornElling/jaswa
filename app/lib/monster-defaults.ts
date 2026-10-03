import statistics from '../data/engraving-statistics.json';
import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainProperties } from './artifact-properties';
import { monsterSpeciesId, monsterStatisticsId } from './monster-identity';
import type { RelicMainProperty } from './relic-properties';
import { relicMainProperties } from './relic-properties';
import type { RuneSlotMain } from './rune-slot-mains';
import { runeSlotMainByEffect } from './rune-slot-mains';
import { runeSetName, runeSetPieceCount } from './rune-sets';
import { brokenRuneBuildPart, runeBuildName } from './rune-set-pairs';

/**
 * Where a monster's preferences start from, before its owner says anything.
 *
 * Every statistics-derived default in JASWA is produced here and nowhere else,
 * and it is consulted for exactly one purpose: as the fallback in
 * `monster-preference-resolution.ts`. Nothing scores, ranks, filters or sorts on
 * a default directly. They are provisional values — what the wider player base
 * does, offered so the user is not handed a roster of empty forms — and the
 * user's own statement replaces them wherever it exists
 * (`ARTIFACT-CANONICAL.md` §19.4).
 *
 * **Defaults are keyed by species; the user's statements are keyed by owned
 * copy.** The game's three Statistics panels are keyed on `unit_master_id` and
 * cannot be otherwise — two copies of one monster can never report different
 * numbers — while §19.2 holds that what a *copy* is for is its owner's to say.
 * The two keyings meet in one place, `resolveMonsterPreferences`, and nowhere
 * else.
 */

/** The three bands every panel classifies into. */
export type PreferenceBand = 'preferred' | 'acceptable' | 'unwanted';

/**
 * A default, with the evidence that produced it. The share travels with the
 * band because the overlay shows both — what the population does, and what that
 * amounts to as a preference — and a view that recomputed the band from the
 * share would eventually recompute it differently.
 */
export type DefaultEntry = { band: PreferenceBand; share: number };

/** Slots 1, 3 and 5 carry a fixed main stat, so only these three have a choice. */
export type RuneSlotKey = 'slot2' | 'slot4' | 'slot6';
export const runeSlotKeys: readonly RuneSlotKey[] = ['slot2', 'slot4', 'slot6'];

const runeSlotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/*
 * A slot's mains are read in `rune-slot-mains.ts`'s vocabulary, which names the
 * flat HP +, ATK + and DEF + as well. They used to be dropped from the
 * denominator because the preset vocabulary had no word for them; a monster's
 * slots now offer every main the game does, so every main the population wears
 * is counted and shown.
 */

/**
 * How a rune-set share was measured, carried in the data because the basis is a
 * real limitation rather than a footnote.
 *
 * The game's `runeset` response is a **top-ten list**, not a full distribution:
 * across all 1,044 captured monsters it never exceeds ten rows, and those rows
 * sum to a median 74 % of the same monster's slot-2 main total. So a set's share
 * here is its share *of the builds that reached the top ten* — which is exactly
 * what the game's own panel shows the player.
 *
 * It is the only honest denominator available. Normalising against the main-stat
 * total instead would divide one population's counts by another's, the error
 * each effect group must be normalised against its own total. The
 * unmeasured tail is by construction made of combinations rarer than the tenth
 * row, so it cannot promote anything into a band; it can only make a share read
 * higher than it would against the whole population, which is what the rune-set
 * threshold in `defaultThresholds` is set to absorb.
 *
 * `ENGRAVING-STATISTICS.md` §1 is corrected to say the rune panel is truncated
 * where the artifact panels are not.
 */
export type RuneSetShareBasis = 'observed-top-ten';

/** One row of the game's rune-set list: a whole build and its share of the list. */
export type RuneBuildShare = { build: string; share: number };

export type RuneDefaults = {
  /** By rune set name, as `rune-sets.ts` names them. */
  sets: Map<string, DefaultEntry>;
  /**
   * The builds themselves, largest share first, written as `runeBuildName`
   * writes them. This is what the game's panel shows: each `setList` row is
   * one combination, and its percentage is its count over the list's total —
   * a partition that sums to 1, where `sets` is a participation rate that
   * does not.
   */
  builds: RuneBuildShare[];
  basis: RuneSetShareBasis;
  /** Builds behind the set distribution, after the game's truncation. */
  setObservations: number;
  slots: Record<RuneSlotKey, Map<RuneSlotMain, DefaultEntry>>;
  /** Observations behind each slot. */
  slotObservations: Record<RuneSlotKey, number>;
};

export type ArtifactCategoryDefaults = {
  main: Map<ArtifactMainProperty, DefaultEntry>;
  /** By the sub-property ids `ARTIFACT-CANONICAL.md` §15.4 numbers. */
  sub: Map<number, DefaultEntry>;
  mainObservations: number;
  subObservations: number;
};

export type ArtifactDefaults = Record<ArtifactCategory, ArtifactCategoryDefaults | undefined>;

export type RelicDefaults = {
  main: Map<RelicMainProperty, DefaultEntry>;
  /** By the unique-property ids `RELIC-CANONICAL.md` §4 numbers. */
  unique: Map<number, DefaultEntry>;
  mainObservations: number;
  uniqueObservations: number;
};

/**
 * Everything one monster species starts from.
 *
 * Each panel is independently `undefined`, because a species carrying two
 * panels and not the third is the ordinary case: 1,044 species carry runes and
 * artifacts, 1,035 carry relics. A missing panel reads as *not judged*
 * (§19.5) — never as a zero, and never as a licence to invent the missing half.
 */
export type MonsterDefaults = {
  speciesId: string;
  runes?: RuneDefaults;
  artifacts?: ArtifactDefaults;
  relics?: RelicDefaults;
};

type EffectCount = { effectId: number; count: number; slotId?: number };
type RuneSetCount = { setList: number[]; count: number };
type PanelStatistics = { observedAt?: string; primaryEffect?: EffectCount[]; secondaryEffect?: EffectCount[] };
type RunePanelStatistics = PanelStatistics & { runeSets?: RuneSetCount[] };
type MonsterStatistics = { runes?: RunePanelStatistics; artifacts?: PanelStatistics; relics?: PanelStatistics };

const recordedStatistics = (statistics as { monsters: Record<string, MonsterStatistics> }).monsters;

/* A collaboration pair is one monster the game released under two names, and it
   serves both ids one distribution — `MONSTER-SPECIES-DECISION.md` owns that
   rule. The later observation wins rather than the two being summed: they are
   one observation seen twice, so adding them would claim twice the evidence
   that exists. Resolving here, at the point of reading, keeps the dataset on
   disk a faithful record of what was seen under each name. */
function latestObservation(entry: MonsterStatistics | undefined): string {
  if (!entry) return '';
  return [entry.runes?.observedAt, entry.artifacts?.observedAt, entry.relics?.observedAt]
    .filter((stamp): stamp is string => typeof stamp === 'string')
    .sort()
    .at(-1) ?? '';
}

const monsterStatistics: Record<string, MonsterStatistics> = {};
for (const [masterId, recorded] of Object.entries(recordedStatistics)) {
  const speciesId = monsterStatisticsId(masterId);
  const existing = monsterStatistics[speciesId];
  if (!existing || latestObservation(recorded) > latestObservation(existing)) monsterStatistics[speciesId] = recorded;
}

/** Every species the defaults cover, for the verifier and for callers choosing a scope. */
export const defaultedMonsterSpeciesIds: readonly string[] = Object.keys(monsterStatistics);

/**
 * The cuts, all six panels in one table so they can be read against each other
 * rather than drifting apart in six files.
 *
 * `ARTIFACT-CANONICAL.md` §19.3 sets the rule: a cut is chosen relative to the
 * size of the distribution it partitions, then checked against what it actually
 * produces. Each row below was measured across all 1,044 captured monsters, and
 * no panel leaves a captured monster with nothing at all.
 *
 * - **Artifact main** is §19.3's own, unchanged: three values against an even
 *   33 %.
 * - **Artifact sub** is deliberately *not* §19.3's 10 %, and this is the one
 *   place the overlay's cuts and the scorer's part company. They answer
 *   different questions. The scorer asks "how much is this roll worth", where a
 *   narrow preferred band keeps the benchmark meaningful and §16's measured
 *   breadth depends on it — that 10 % stays exactly where it is, in
 *   `artifact-preferences.ts`, and nothing here touches it. The overlay asks
 *   "what should this monster's substats be", and a default of one property for
 *   93 % of monsters — with *none at all* for 7 % — is not a set of choices, it
 *   is a single guess. At 6 % the same fixed percentage yields 3.6 properties on
 *   average, the largest group gets exactly four, and no captured monster gets
 *   zero. It stays one fixed share rather than a fixed count, so a monster whose
 *   population really does use only two substats still shows two.
 * - **Rune slot main** keeps the artifact main's cuts even though its slots hold
 *   seven or eight values. The measurement is why: at 40 % each slot averages
 *   almost exactly *one* preferred main, which is the right answer for a slot
 *   that holds one rune. These distributions are far from even — a slot's leader
 *   routinely takes half of it — so 40 % discriminates here despite the count.
 * - **Rune set** is the one panel whose cuts could not be inherited. Its shares
 *   are *participation rates*, not a partition: a build wearing two sets votes
 *   for both, so they sum to about 1.7 rather than 1, and a cut therefore has to
 *   sit higher to mean "a clear leader". A monster also wears two sets at once,
 *   so the right answer is about two preferred sets, not one: 35 % yields 1.96,
 *   where 40 % undershoots at 1.67 and 30 % overshoots at 2.30. It also absorbs
 *   the inflation `RuneSetShareBasis` describes.
 * - **Relic main** is identical to artifact main by construction. Two 3-value
 *   distributions asking the same question cannot have two sets of cuts.
 * - **Relic unique** has sixteen values, so chance is exactly 6.25 % — and that
 *   is the acceptable cut: a property at or above chance is worth accepting.
 *   Preferred at 15 % is 2.4× chance, the same multiple §19.3 uses for artifact
 *   subs. Artifact sub's own 10 %/5 % was measured here and is too loose: it
 *   yields 3.24 acceptable per monster, at which point the second band stops
 *   distinguishing anything.
 */
export const defaultThresholds = {
  runeSets: { preferred: 0.35, acceptable: 0.12 },
  runeSlotMain: { preferred: 0.4, acceptable: 0.1 },
  artifactMain: { preferred: 0.4, acceptable: 0.1 },
  /* One cut, not two. A second band here would hold fourteen properties out of
     twenty-three, which distinguishes nothing — and the user states substats as
     a list of what they want, with a minimum roll, rather than as two tiers. */
  artifactSub: { preferred: 0.06, acceptable: 0.06 },
  relicMain: { preferred: 0.4, acceptable: 0.1 },
  relicUnique: { preferred: 0.15, acceptable: 0.0625 },
} as const;

/**
 * A share against one panel's two cuts. The single classifier every panel uses,
 * so one change of mind about what "preferred" means cannot leave six panels
 * disagreeing.
 */
export function classifyShare(share: number, limits: { preferred: number; acceptable: number }): PreferenceBand {
  if (share >= limits.preferred) return 'preferred';
  if (share >= limits.acceptable) return 'acceptable';
  return 'unwanted';
}

function totalCount(rows: readonly { count: number }[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/**
 * One distribution folded into bands, keyed by whatever vocabulary the caller
 * resolves an effect id into. A row whose id the vocabulary does not cover is
 * dropped: it cannot be shown, chosen or compared, so carrying it would produce
 * a default nothing can act on.
 */
function classifyDistribution<T>(
  rows: readonly EffectCount[],
  total: number,
  resolve: (effectId: number) => T | undefined,
  limits: { preferred: number; acceptable: number },
): Map<T, DefaultEntry> {
  const entries = new Map<T, DefaultEntry>();
  if (total <= 0) return entries;
  for (const row of rows) {
    const key = resolve(row.effectId);
    if (key === undefined) continue;
    const share = row.count / total;
    entries.set(key, { band: classifyShare(share, limits), share });
  }
  return entries;
}

/* The artifact and relic panels serve both slots from one response, and the
   slot numbering is the export's own: for artifacts slot 1 is the Attribute
   piece and slot 2 the Type one. */
const artifactCategorySlots: Record<ArtifactCategory, number> = { attribute: 1, type: 2 };

function runeDefaults(panel: RunePanelStatistics | undefined): RuneDefaults | undefined {
  if (!panel) return undefined;

  /* A set's share is the summed count of every build containing it, counted
     once per build however many copies that build wore. `[1, 1, 1]` is one
     build's vote for Energy, not three: the question is whether a build uses
     the set, and three 2-piece Energys is still one answer of yes. Counting the
     multiplicity would let a single popular triple-set build make one set look
     three times as chosen as it is. Shares therefore do not sum to 1 — a
     two-set build votes twice — which is correct for a participation rate. */
  const setRows = panel.runeSets ?? [];
  const setObservations = totalCount(setRows);
  const setCounts = new Map<string, number>();
  for (const row of setRows) {
    if (!Array.isArray(row.setList)) continue;
    for (const setId of new Set(row.setList)) {
      const name = runeSetName(setId);
      if (name === undefined) continue;
      setCounts.set(name, (setCounts.get(name) ?? 0) + row.count);
    }
  }
  const sets = new Map<string, DefaultEntry>();
  if (setObservations > 0) {
    for (const [name, count] of setCounts) {
      const share = count / setObservations;
      sets.set(name, { band: classifyShare(share, defaultThresholds.runeSets), share });
    }
  }

  const builds: RuneBuildShare[] = [];
  if (setObservations > 0) {
    for (const row of setRows) {
      if (!Array.isArray(row.setList)) continue;
      const names = row.setList.map(runeSetName);
      if (names.some((name) => name === undefined)) continue;
      /* The game lists a combination by set id; JASWA writes a build with its
         four-set first, and names the slots the list leaves unfilled — `[13]`
         is Violent and two runes of anything, which is `Violent/Broken`. */
      const ordered = [
        ...(names as string[]).filter((name) => runeSetPieceCount[name] === 4),
        ...(names as string[]).filter((name) => runeSetPieceCount[name] !== 4),
      ];
      const filled = ordered.reduce((total, name) => total + (runeSetPieceCount[name] ?? 2), 0);
      builds.push({
        build: runeBuildName(filled < 6 ? [...ordered, brokenRuneBuildPart] : ordered),
        share: row.count / setObservations,
      });
    }
    builds.sort((left, right) => right.share - left.share);
  }

  const primary = panel.primaryEffect ?? [];
  const slots = {} as Record<RuneSlotKey, Map<RuneSlotMain, DefaultEntry>>;
  const slotObservations = {} as Record<RuneSlotKey, number>;
  for (const key of runeSlotKeys) {
    const all = primary.filter((row) => row.slotId === runeSlotNumbers[key]);
    const total = totalCount(all);
    slots[key] = classifyDistribution(all, total, runeSlotMainByEffect, defaultThresholds.runeSlotMain);
    slotObservations[key] = total;
  }

  /* A panel that yielded neither a set nor a single expressible main is a panel
     nothing can start from, and saying so is not the same as saying the
     preference is empty. */
  const hasSlots = runeSlotKeys.some((key) => slots[key].size > 0);
  if (sets.size === 0 && !hasSlots) return undefined;

  return { sets, builds, basis: 'observed-top-ten', setObservations, slots, slotObservations };
}

function artifactCategoryDefaults(
  panel: PanelStatistics | undefined,
  category: ArtifactCategory,
): ArtifactCategoryDefaults | undefined {
  if (!panel) return undefined;
  const slot = artifactCategorySlots[category];
  const primary = (panel.primaryEffect ?? []).filter((row) => row.slotId === slot);
  const secondary = (panel.secondaryEffect ?? []).filter((row) => row.slotId === slot);
  const mainObservations = totalCount(primary);
  const subObservations = totalCount(secondary);
  /* A captured species with no observations in this slot cannot be judged:
     dividing by its total would be a division by zero, and the honest answer is
     the same "not judged" an uncaptured species gets. */
  if (!mainObservations || !subObservations) return undefined;
  return {
    main: classifyDistribution(
      primary, mainObservations, (id) => artifactMainProperties[id], defaultThresholds.artifactMain,
    ),
    sub: classifyDistribution(secondary, subObservations, (id) => id, defaultThresholds.artifactSub),
    mainObservations,
    subObservations,
  };
}

function artifactDefaults(panel: PanelStatistics | undefined): ArtifactDefaults | undefined {
  if (!panel) return undefined;
  const attribute = artifactCategoryDefaults(panel, 'attribute');
  const type = artifactCategoryDefaults(panel, 'type');
  if (!attribute && !type) return undefined;
  return { attribute, type };
}

function relicDefaults(panel: PanelStatistics | undefined): RelicDefaults | undefined {
  if (!panel) return undefined;
  const primary = panel.primaryEffect ?? [];
  const secondary = panel.secondaryEffect ?? [];
  const mainObservations = totalCount(primary);
  const uniqueObservations = totalCount(secondary);
  if (!mainObservations && !uniqueObservations) return undefined;
  return {
    main: classifyDistribution(
      primary, mainObservations, (id) => relicMainProperties[id], defaultThresholds.relicMain,
    ),
    unique: classifyDistribution(secondary, uniqueObservations, (id) => id, defaultThresholds.relicUnique),
    mainObservations,
    uniqueObservations,
  };
}

/* The folding is pure and the dataset is 6.6 MB, while the overlay opens on one
   monster at a time and re-reads it on every render. Memoising by species keeps
   that from refolding three panels per keystroke. */
const resolved = new Map<string, MonsterDefaults | undefined>();

/**
 * What the wider player base equips on this monster species, across all three
 * panels, as the provisional preferences a copy of it starts from.
 *
 * A master id resolves to its species first, so a collaboration monster and its
 * generic twin answer alike whichever name the player's copy carries, and an
 * unawakened copy answers with its awakened form's statistics.
 *
 * `undefined` where the dataset has not captured this species at all — most of
 * the game's roster is not captured, so that is the ordinary case rather than an
 * edge one, and §19.5 requires it to read as *not judged* rather than as a
 * score of zero.
 */
export function monsterDefaults(masterId: unknown): MonsterDefaults | undefined {
  if (typeof masterId !== 'number' && typeof masterId !== 'string') return undefined;
  const speciesId = monsterSpeciesId(masterId);
  const cached = resolved.get(speciesId);
  if (cached !== undefined || resolved.has(speciesId)) return cached;

  const recorded = monsterStatistics[speciesId];
  const defaults = recorded === undefined ? undefined : ((): MonsterDefaults | undefined => {
    const runes = runeDefaults(recorded.runes);
    const artifacts = artifactDefaults(recorded.artifacts);
    const relics = relicDefaults(recorded.relics);
    if (!runes && !artifacts && !relics) return undefined;
    return { speciesId, runes, artifacts, relics };
  })();

  resolved.set(speciesId, defaults);
  return defaults;
}
