import type { ArtifactCategory, ArtifactMainProperty } from './artifact-properties';
import { artifactMainPropertyOrder, artifactPropertiesFor } from './artifact-properties';
import type { RuneSlotKey } from './monster-defaults';
import { runeSlotKeys } from './monster-defaults';
import { isMonsterProfileScope } from './monster-profile-scope';
import type { MonsterProfileScope } from './monster-profile-scope';
import { relicProperty } from './relic-properties';
import type { LeadStat, Leads } from './monster-stats';
import { leadStats } from './monster-stats';
import type { RoleTargets } from './rune-roles';
import { roleStatTargetKeys, roleTargetMaximum } from './rune-roles';
import type { RuneSlotMain } from './rune-slot-mains';
import { runeSlotMainsBySlot } from './rune-slot-mains';
import { runeBuild, runeBuildKey } from './rune-set-pairs';

/**
 * One owned copy's choices in Scenario or one content-area. All teams in an
 * area read the same profile; placements and speed tuning remain per team.
 * Species-level defaults apply only where that area has no stated choice.
 */

/**
 * The eleven figures a copy may be built toward: the eight stats a rune role
 * states, and the three composites `RUNE-ROLE-METRICS.md` defines.
 *
 * It is `RoleTargets` rather than a shape of its own because the eleven a
 * role reads are the eleven a monster aims at, and two lists that have to
 * agree are one list. What differs is only who states them — see
 * `MonsterCopyPreferences.statTargets`.
 */
export type MonsterStatTargets = RoleTargets;

/** The eleven, in the order the overlay offers them. */
export const monsterStatTargetKeys: ReadonlyArray<keyof MonsterStatTargets> = [
  ...roleStatTargetKeys, 'dmg', 'ehp', 'ehpD',
];

/*
 * **Runes are stated yes or no; gear is stated in two bands.**
 *
 * A rune build or a slot main is one the copy will take or it is not: the rune
 * optimizer asks only whether a build may be suggested, so a ranking there would
 * be weighed by nothing. Artifacts and relics are different, because their
 * consumers do weigh a ranking — the artifact score counts an acceptable line at
 * the user's acceptable worth (§19.6), and the relic plan offers a preferred
 * match ahead of an acceptable one. So a gear answer is a `BandedChoices`: what
 * the copy prefers, and what it will accept when nothing preferred is to hand.
 *
 * The states `ARTIFACT-CANONICAL.md` §19.4 protects are carried by the
 * presence of the key:
 *
 * | State | How it is stored | Where the answer comes from |
 * | --- | --- | --- |
 * | Chosen | in the list (or one of the two bands) | the user |
 * | Never stated | **no key at all** | the default |
 * | A rune list cleared | an **empty list** | the user — *not* the default |
 * | A gear answer cleared | **no key at all** | the default |
 *
 * The two kinds part at the cleared row on purpose. A rune list emptied says
 * "none of these" and has to survive a reload as that. A gear answer emptied
 * used to read `Any` — every property preferred — and that made a copy whose
 * owner had merely taken their choices back the best home for every artifact
 * it could wear, at scores far above the benchmark. So a gear answer with both
 * bands empty is no answer: it is not stored, not read back, and the default
 * stands in, one question at a time (`statedAnswer`).
 */

/**
 * One gear question answered in two bands. An option sits in at most one of
 * them; one in neither is not wanted. Both empty is not an answer at all
 * (`statedAnswer`).
 */
export type BandedChoices<T> = { preferred: T[]; acceptable: T[] };

/**
 * What a copy wants from its two artifacts beyond the main: the substats, per
 * category. They are not one question — the two categories roll from different
 * pools, and a `(category, property)` pair is the key `ARTIFACT-CANONICAL.md`
 * §19.2 insists on. The main is `MonsterCopyPreferences.mainStat`.
 */
export type ArtifactPreferences = {
  /** By the sub-property ids §15.4 numbers. */
  sub?: Partial<Record<ArtifactCategory, BandedChoices<number>>>;
};

export type RelicPreferences = {
  /** By the unique-property ids `RELIC-CANONICAL.md` §4 numbers. */
  unique?: BandedChoices<number>;
};

/** Every option a banded answer names, preferred first. */
export function bandedChoices<T>(choices: BandedChoices<T> | undefined): T[] {
  return choices === undefined ? [] : [...choices.preferred, ...choices.acceptable];
}

/**
 * A gear answer where it is one, `undefined` where both bands are empty — the
 * same as never stated, so the default answers that question. Every reader of
 * a copy's gear takes its answer through this, and the write route and the
 * stored-copy reader drop an empty one, so no reader can find `Any` in two
 * empty bands again.
 */
export function statedAnswer<T>(choices: BandedChoices<T> | undefined): BandedChoices<T> | undefined {
  if (choices === undefined) return undefined;
  return choices.preferred.length > 0 || choices.acceptable.length > 0 ? choices : undefined;
}

/**
 * A profile with every gear answer that says nothing taken out, each question
 * on its own: an emptied main leaves the substats and uniques as stated.
 */
export function withGearStated(profile: MonsterCopyPreferences): MonsterCopyPreferences {
  const kept = { ...profile };
  const mainStat = statedAnswer(profile.mainStat);
  if (mainStat === undefined) delete kept.mainStat;
  else kept.mainStat = mainStat;
  const sub: Partial<Record<ArtifactCategory, BandedChoices<number>>> = {};
  for (const category of ['attribute', 'type'] as const) {
    const stated = statedAnswer(profile.artifacts?.sub?.[category]);
    if (stated !== undefined) sub[category] = stated;
  }
  if (Object.keys(sub).length > 0) kept.artifacts = { sub };
  else delete kept.artifacts;
  const unique = statedAnswer(profile.relics?.unique);
  if (unique !== undefined) kept.relics = { unique };
  else delete kept.relics;
  return kept;
}

/**
 * The band a stated answer puts one option in — the single reading every scorer
 * of a copy's gear takes. Only an answer from `statedAnswer` reaches it.
 */
export function statedBand<T>(choices: BandedChoices<T>, option: T): 'preferred' | 'acceptable' | 'unwanted' {
  if (choices.preferred.includes(option)) return 'preferred';
  return choices.acceptable.includes(option) ? 'acceptable' : 'unwanted';
}

export type MonsterCopyPreferences = {
  /** The owned copy's `unit_id`. The record's own key in the map repeats it. */
  unitId: string;
  /** The user's own name for this copy, shown in place of the game's. */
  label?: string;
  /**
   * The exact rune builds this copy will accept, as `rune-set-pairs.ts` names
   * them — `Violent/Blade` or `Violent`, not `Violent` and `Blade` as two
   * separate wishes.
   *
   * **This reverses the earlier per-set model.** Stating sets one at a time
   * cannot distinguish `Despair / Revenge` from `Revenge / Revenge / Revenge`,
   * so a user who asked for both sets could be handed a build of one of them
   * repeated. A combination is the whole answer and leaves nothing to infer.
   *
   * These are yes/no statements, not bands: a build is one the user will take
   * or it is not. An empty list means none of them; an absent one is a silence.
   * A build names only the sets it must hold; whether the slots it leaves may
   * stay broken is `allowBrokenSets`, one answer for the whole copy.
   */
  runeSets?: string[];
  /**
   * Whether a build may hold runes that complete no set — the free slots a build
   * like `Violent` leaves, or a whole build where none is named. Absent is no: a
   * build is six runes in finished sets unless the owner says otherwise.
   */
  allowBrokenSets?: boolean;
  /** Whether an Intangible rune may stand in for the one rune a set is short. Absent is yes. */
  allowIntangibleRunes?: boolean;
  /**
   * Whether every hit this copy lands is a crit, whatever its CRI Rate — a skill,
   * a leader or a team that guarantees one. Every figure is then counted at a
   * certain crit (`alwaysCritsFloor`), and a CRI Rate target is met by definition.
   * Absent is no.
   */
  alwaysCrits?: boolean;
  /** Whether every target has elemental disadvantage against this copy. Absent is no. */
  alwaysElementAdvantage?: boolean;
  /**
   * What its leader adds, one field a stat: ATK, DEF and HP in percent of base,
   * CRI Rate in points. Each is its own answer: absent is no lead, and zero is a
   * stated zero. Counted in the composites, never in a stat or its range
   * (`monster-stats.ts` `combatBase`).
   */
  critLead?: number;
  atkLead?: number;
  defLead?: number;
  hpLead?: number;
  /**
   * The main stats wanted in slots 2, 4 and 6 — several may be, so each slot
   * holds a list. Slots 1, 3 and 5 carry a fixed main and cannot be stated.
   */
  runeSlots?: Partial<Record<RuneSlotKey, string[]>>;
  /**
   * The main stat wanted on every piece of gear — both artifacts and the relic.
   *
   * **One answer, not three.** A copy built for bulk wants HP or DEF on
   * whichever piece carries a main, and the three are drawn from the same three
   * values; asking per artifact category and again per relic only ever produced
   * three copies of one answer.
   */
  mainStat?: BandedChoices<ArtifactMainProperty>;
  artifacts?: ArtifactPreferences;
  relics?: RelicPreferences;
  /**
   * The stats this copy is being built toward.
   *
   * Deliberately `MonsterStatTargets` rather than a shape of its own: the eight
   * stats a rune role aims at are the eight a monster aims at, and two lists
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
   *
   * These are the *lower* ends of each range — "at least" — and `statCeilings`
   * holds the upper ends.
   */
  statTargets?: MonsterStatTargets;
  /**
   * The most each figure may reach — the upper end of a range whose lower end is
   * in `statTargets`. A turn-order position, a RES that must not overshoot what a
   * team needs: some figures are wanted *between* two values, not merely above
   * one. Kept beside the floors rather than folded into one range object, so each
   * end is its own answer — absent independently of the other, read back
   * independently — and the floors every copy already states keep their shape.
   */
  statCeilings?: MonsterStatTargets;
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

/** Every copy's profile in one area, by the game's persistent unit id. */
export type MonsterProfiles = Record<string, MonsterCopyPreferences>;

/** Profiles keyed by Scenario, content:<content id>, or the unassigned area. */
export type MonsterPreferences = Partial<Record<MonsterProfileScope, MonsterProfiles>>;

const noProfiles: MonsterProfiles = Object.freeze({}) as MonsterProfiles;

/** One area's profiles; an empty map where none is stated there. */
export function profilesIn(preferences: MonsterPreferences, scope: MonsterProfileScope): MonsterProfiles {
  return preferences[scope] ?? noProfiles;
}

/** One copy's profile in one area, or `undefined` where it states nothing there. */
export function profileIn(preferences: MonsterPreferences, scope: MonsterProfileScope, unitId: string): MonsterCopyPreferences | undefined {
  return preferences[scope]?.[unitId];
}

/**
 * The map with one copy's profile in one area replaced. A profile that ends
 * up saying nothing is removed rather than kept as a husk, and so is an area
 * left holding none, so a count of records is a count of decisions.
 */
export function withProfile(
  preferences: MonsterPreferences, scope: MonsterProfileScope, unitId: string, next: MonsterCopyPreferences | undefined,
): MonsterPreferences {
  const profiles = { ...preferences[scope] };
  const kept = next === undefined ? undefined : heldIn(scope, withGearStated(next));
  if (kept !== undefined && statesSomething(kept)) profiles[unitId] = { ...kept, unitId };
  else delete profiles[unitId];
  const read = { ...preferences };
  if (Object.keys(profiles).length > 0) read[scope] = profiles;
  else delete read[scope];
  return read;
}

/**
 * Another area's profile, taken as this area's own: a copy, not a link,
 * so a later change to either is that area's alone. The nickname comes along
 * with everything else, because it is part of what the copy is in that area.
 */
export function copyProfile(source: MonsterCopyPreferences, unitId: string, scope: MonsterProfileScope): MonsterCopyPreferences {
  return heldIn(scope, { ...structuredClone(source), unitId });
}

/**
 * A profile as its area holds it. Only Scenario states leads: every other area
 * is played in presets, whose leads are read off their leaders
 * (`team-leads.ts`), so a lead stated there would be an answer nothing reads.
 */
export function heldIn(scope: MonsterProfileScope, profile: MonsterCopyPreferences): MonsterCopyPreferences {
  if (statesLeads(scope) || !leadFields.some((field) => profile[field] !== undefined)) return profile;
  const held = { ...profile };
  for (const field of leadFields) delete held[field];
  return held;
}

/** Whether an area's profiles state leads by hand: Scenario's alone. */
export function statesLeads(scope: MonsterProfileScope): boolean {
  return scope === 'scenario';
}

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
 * of decisions. **An empty rune list is not nothing:** a user who cleared every
 * rune build they had chosen is saying they want none of them, which is a
 * different answer from never having opened the overlay, and it has to survive a
 * reload (`AGENTS.md` §6). Two empty gear bands are nothing (`statedAnswer`).
 */
export function statesSomething(preferences: MonsterCopyPreferences): boolean {
  if (preferences.label !== undefined && preferences.label.length > 0) return true;
  if (preferences.runeSets !== undefined) return true;
  if (preferences.allowBrokenSets !== undefined) return true;
  if (preferences.allowIntangibleRunes !== undefined) return true;
  if (preferences.alwaysCrits !== undefined) return true;
  if (preferences.alwaysElementAdvantage !== undefined) return true;
  if (leadFields.some((field) => preferences[field] !== undefined)) return true;
  if (runeSlotKeys.some((key) => preferences.runeSlots?.[key] !== undefined)) return true;
  if (statedAnswer(preferences.mainStat) !== undefined) return true;
  if (statedAnswer(preferences.artifacts?.sub?.attribute) !== undefined
    || statedAnswer(preferences.artifacts?.sub?.type) !== undefined) return true;
  if (statedAnswer(preferences.relics?.unique) !== undefined) return true;
  if (preferences.runeSuggestionStat !== undefined) return true;
  for (const targets of [preferences.statTargets, preferences.statCeilings]) {
    if (targets !== undefined && monsterStatTargetKeys.some((key) => targets[key] !== undefined)) return true;
  }
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

/* Per category, not against the whole vocabulary: a property the category never
   rolls is a wish no artifact can answer, and a stored one is malformed. */
function isArtifactSubIn(category: ArtifactCategory) {
  const allowed = new Set(artifactPropertiesFor(category).map((definition) => definition.id));
  return (value: unknown): value is number => typeof value === 'number' && allowed.has(value);
}

function isRelicUniqueId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && relicProperty(value) !== undefined;
}

/* Both bands present, each a chosen list, and no option in both: an option is
   preferred or acceptable, and a document naming it twice was not written by
   this editor. */
function isBanded<T>(value: unknown, allows: (entry: unknown) => entry is T): value is BandedChoices<T> {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => key === 'preferred' || key === 'acceptable')) return false;
  if (!isChosenList(value.preferred, allows) || !isChosenList(value.acceptable, allows)) return false;
  const preferred = new Set<T>(value.preferred);
  return value.acceptable.every((entry) => !preferred.has(entry));
}

function isArtifactMain(value: unknown): value is ArtifactMainProperty {
  return typeof value === 'string' && artifactMainPropertyOrder.includes(value as ArtifactMainProperty);
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

/*
 * Gear is read one question at a time (`AGENTS.md` §0): the shared main, each
 * category's substats and the uniques are four answers, and one the contract no
 * longer honours costs that answer and not the three beside it.
 */
function readArtifactPreferences(value: unknown): ArtifactPreferences | undefined {
  if (!isRecord(value)) return undefined;
  const read: ArtifactPreferences = {};
  if (isRecord(value.sub)) {
    const sub: Partial<Record<ArtifactCategory, BandedChoices<number>>> = {};
    for (const category of ['attribute', 'type'] as const) {
      const stated = value.sub[category];
      if (isBanded(stated, isArtifactSubIn(category)) && statedAnswer(stated)) sub[category] = stated;
    }
    if (Object.keys(sub).length > 0) read.sub = sub;
  }
  return Object.keys(read).length > 0 ? read : undefined;
}

/** The most a lead may state, in percent or CRI Rate points. */
export const leadMaximum = 100;

/** One lead as typed: a whole number from 0 to `leadMaximum`, or `undefined` for an empty field. */
export function readLeadField(raw: string): number | undefined {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(parsed)) return undefined;
  return Math.min(leadMaximum, Math.max(0, Math.round(parsed)));
}

/** The preference field each lead is kept in, by the stat it raises. */
export const leadFieldOf: Readonly<Record<LeadStat, 'critLead' | 'atkLead' | 'defLead' | 'hpLead'>> = {
  atk: 'atkLead', def: 'defLead', hp: 'hpLead', criRate: 'critLead',
};
const leadFields = leadStats.map((stat) => leadFieldOf[stat]);

/** A copy's stated leads, as the calculation reads them. */
export function statedLeads(preferences: MonsterCopyPreferences | undefined): Leads {
  const leads: Leads = {};
  for (const stat of leadStats) {
    const lead = preferences?.[leadFieldOf[stat]];
    if (lead !== undefined) leads[stat] = lead;
  }
  return leads;
}

function readRelicPreferences(value: unknown): RelicPreferences | undefined {
  if (!isRecord(value)) return undefined;
  const read: RelicPreferences = {};
  if (isBanded(value.unique, isRelicUniqueId) && statedAnswer(value.unique)) read.unique = value.unique;
  return Object.keys(read).length > 0 ? read : undefined;
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
  return compositeTargetKeys.has(key) ? monsterCompositeTargetMaximum : roleTargetMaximum;
}

/**
 * One end of a range as typed: a whole number within the figure's reach, or
 * `undefined` for a field left empty. Empty is *absent* — that end is not aimed
 * at — where `0` is a stated end of nothing (`AGENTS.md` §3). The profile and
 * Rune Optimization both read their fields through this, so the two cannot parse
 * the same keystrokes differently.
 */
export function readTargetField(key: keyof MonsterStatTargets, raw: string): number | undefined {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(parsed)) return undefined;
  return Math.min(targetCeiling(key), Math.max(0, Math.round(parsed)));
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

/*
 * Every set name and property id is one the editor could have offered, every
 * target is a whole number in range. Each field is its own decision and is
 * checked alone, so one the contract no longer honours costs that field and not
 * the rest of the copy. Gear has readers of its own, a question at a time.
 */
const isLead = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= leadMaximum;

const copyFieldChecks: Record<Exclude<keyof MonsterCopyPreferences, 'unitId' | 'artifacts' | 'relics'>,
  (value: unknown) => boolean> = {
  label: (value) => typeof value === 'string' && value.trim() === value && value.length <= monsterLabelMaximum,
  runeSets: isRuneBuildList,
  allowBrokenSets: (value) => typeof value === 'boolean',
  allowIntangibleRunes: (value) => typeof value === 'boolean',
  alwaysCrits: (value) => typeof value === 'boolean',
  alwaysElementAdvantage: (value) => typeof value === 'boolean',
  critLead: isLead,
  atkLead: isLead,
  defLead: isLead,
  hpLead: isLead,
  runeSlots: isRuneSlots,
  /* Two empty gear bands are no answer (`statedAnswer`), so a stored pair is
     read as never stated and that one question starts from its default. */
  mainStat: (value) => isBanded(value, isArtifactMain) && statedAnswer(value) !== undefined,
  statTargets: isStatTargets,
  statCeilings: isStatTargets,
  runeSuggestionStat: (value) => monsterStatTargetKeys.includes(value as keyof MonsterStatTargets),
};

/** Read area profiles, preserving each readable field independently. */
export function readMonsterPreferences(value: unknown): MonsterPreferences {
  if (!isRecord(value)) return {};
  const read: MonsterPreferences = {};
  /* Scenario's area was once stored under `default`. A stored copy written
     before the rename still holds every Scenario monster's profile under that
     key — its leads, rune slots, main stats, stat targets and ceilings, wanted
     builds, and artifact and relic choices — and reading only `scenario` would
     reset them all at once, which AGENTS.md §0 forbids. So the old key is read
     as Scenario's whenever no `scenario` key exists; a copy that has one is
     read from it alone. Every write uses `scenario`, so the branch only ever
     fires on a copy not yet re-saved. */
  const areas = { ...value };
  if (!('scenario' in value) && isRecord(value.default)) areas.scenario = value.default;
  for (const [scope, copies] of Object.entries(areas)) {
    if (!isMonsterProfileScope(scope) || !isRecord(copies)) continue;
    const profiles = readMonsterProfiles(copies, scope);
    if (Object.keys(profiles).length > 0) read[scope] = profiles;
  }
  return read;
}

function readMonsterProfiles(value: Record<string, unknown>, scope: MonsterProfileScope): MonsterProfiles {
  const read: MonsterProfiles = {};
  for (const [unitId, stored] of Object.entries(value)) {
    if (unitId.length === 0 || !isRecord(stored) || stored.unitId !== unitId) continue;
    const copy: Record<string, unknown> = { unitId };
    for (const [key, check] of Object.entries(copyFieldChecks)) {
      if (stored[key] !== undefined && check(stored[key])) copy[key] = stored[key];
    }
    const artifacts = readArtifactPreferences(stored.artifacts);
    if (artifacts !== undefined) copy.artifacts = artifacts;
    const relics = readRelicPreferences(stored.relics);
    if (relics !== undefined) copy.relics = relics;
    /* Each wanted build is its own choice (`AGENTS.md` §0): one the vocabulary no
       longer writes — `Violent/Broken`, from before broken slots became the
       copy's own switch — costs that build, not the builds beside it. A list
       left with none of its builds is a list never stated, rather than a
       statement that none will do. */
    if (copy.runeSets === undefined && Array.isArray(stored.runeSets)) {
      const kept = stored.runeSets.filter(isRuneBuildId);
      if (kept.length > 0 && isRuneBuildList(kept)) copy.runeSets = kept;
    }
    /* A lead stated in an area other than Scenario is a field the contract no
       longer holds there: it alone is dropped, and the rest of the copy kept. */
    const preferences = heldIn(scope, copy as MonsterCopyPreferences);
    if (statesSomething(preferences)) read[unitId] = preferences;
  }
  return read;
}
