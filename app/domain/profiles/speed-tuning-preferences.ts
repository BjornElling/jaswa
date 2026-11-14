/**
 * What the user has stated on the Speed Tuning page, team by team: the order a
 * team's monsters should move in, the what-if display speeds tried on them, and
 * whether the team is speed tuned at all.
 *
 * A statement belongs to a team, not to a preset: to one content and one set of
 * monsters, by species (`unit_master_id`). The game renumbers presets as decks
 * are moved, deleted and rebuilt, and an order kept under Arena Attack 8 used to
 * fall back to nothing the moment the deck became Arena Attack 7. Kept by what
 * the team *is*, the order holds for every preset of that content with those
 * monsters — two at once, or one rebuilt long after the first was deleted — and
 * is never forgotten.
 *
 * Only the user's decisions are stored. Every figure the page shows — a combat
 * speed, a tick, an interval — is derived from the current import by
 * `speed-tick.ts` on every render, and so is the order of a team nobody has
 * put in order (`gameTurnOrder`): it follows the runes until the user states one.
 */
import { isPresetContentId } from '../placements/preset-contents';
import type { PresetContentId } from '../placements/preset-contents';
import type { SpeedContentId } from '../speed/speed-contents';
import { isRecord } from './preference-reading';

/** The content a team is kept for: its preset's, or `unnamed` while the preset has none. */
export type SpeedTuningContent = PresetContentId | 'unnamed';

/**
 * One monster's place in a team, its species, and the what-if display speed the
 * user tried on it, if any. The what-if is kept so the experiment is there next
 * time the team is opened, but it is read only inside the team's overlay: the
 * page and everything else judge the runes engraved, and never see it.
 */
export type SpeedTeamMember = {
  unitId: string;
  /** The species, or `null` for a member the import does not hold. */
  masterId: string | null;
  whatIfDisplaySpeed?: number;
};

/** A preset as Speed Tuning reads it. */
export type SpeedTeam = {
  /** The preset's id. */
  id: string;
  content: SpeedContentId;
  /** The content the team's statements are kept for (`SpeedTuningContent`). */
  tuningContent: SpeedTuningContent;
  /**
   * The monsters in the order they are shown — first mover first: the order the
   * user stated, or else the order they move in now. That is deliberately *not*
   * the order the leader is chosen in, which is why the leader is its own field
   * rather than "whoever stands first".
   */
  members: SpeedTeamMember[];
  /** Whether the user put the team in this order; otherwise it is the order the team moves in now. */
  orderStated: boolean;
  /** Whose leader skill the team runs, or `null` for no leader. Always a member. */
  leaderUnitId: string | null;
  /**
   * The leaders of the battle's other decks, whose leads reach this team too —
   * Rift Raid 1–3 (`team-leads.ts`) — by unit and species. Read, never chosen here.
   */
  otherLeaders: ReadonlyArray<{ unitId: string; masterId: string; presetName: string }>;
  /** How many places the team has: its preset content's, or its own count where that is unknown. */
  size: number;
  /**
   * The user's word that this team is not speed tuned — a team that simply
   * hits hard enough — so its order and enemies are no verdict on it.
   */
  noSpeedTuning: boolean;
};

/** A stored member: a species, and the what-if tried on it. */
export type TeamTuningMember = { masterId: string; whatIfDisplaySpeed?: number };

/**
 * The user's word on one team. `members` names the team — its species, a
 * species twice where the team holds two copies — and, where `orderStated`, is
 * the order wanted, first mover first.
 */
export type TeamSpeedTuning = {
  content: SpeedTuningContent;
  members: TeamTuningMember[];
  orderStated: boolean;
  noSpeedTuning: boolean;
};

export type SpeedTuningPreferences = { teams: TeamSpeedTuning[] };

export function blankSpeedTuningPreferences(): SpeedTuningPreferences {
  return { teams: [] };
}

/** The highest display speed the editor accepts as a what-if. Far above any rune build. */
export const whatIfDisplaySpeedMaximum = 999;

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isWhatIfDisplaySpeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= whatIfDisplaySpeedMaximum;
}

function isTuningContent(value: unknown): value is SpeedTuningContent {
  return value === 'unnamed' || isPresetContentId(value);
}

const keySeparator = '\0';

/* A team's identity: its content and its species, whatever order they stand in. */
function teamKey(content: SpeedTuningContent, masterIds: readonly string[]): string {
  return [content, ...[...masterIds].sort()].join(keySeparator);
}

function storedKey(entry: TeamSpeedTuning): string {
  return teamKey(entry.content, entry.members.map((member) => member.masterId));
}

/** A team's identity, or `null` where a member the import does not hold leaves its species unknown. */
function speedTeamKey(team: Pick<SpeedTeam, 'tuningContent' | 'members'>): string | null {
  const masterIds = team.members.map((member) => member.masterId);
  return masterIds.every((masterId): masterId is string => masterId !== null) ? teamKey(team.tuningContent, masterIds) : null;
}

/** Whether a team's statements can be kept: every member's species is known. */
export function canKeepSpeedTuning(team: Pick<SpeedTeam, 'tuningContent' | 'members'>): boolean {
  return speedTeamKey(team) !== null;
}

/* Whether an entry states anything at all; one that does not is not stored. */
function statesAnything(entry: TeamSpeedTuning): boolean {
  return entry.orderStated || entry.noSpeedTuning || entry.members.some((member) => member.whatIfDisplaySpeed !== undefined);
}

/* The species are the team's identity, so one the contract refuses refuses the
   whole entry: dropping it alone would keep the statement for another team. A
   what-if is its own choice and is dropped alone (`preference-reading.ts`). */
function readTeamSpeedTuning(value: unknown): TeamSpeedTuning | null {
  if (!isRecord(value) || !isTuningContent(value.content) || !Array.isArray(value.members) || value.members.length === 0) return null;
  const members: TeamTuningMember[] = [];
  for (const member of value.members) {
    if (!isRecord(member) || !isIdentifier(member.masterId)) return null;
    members.push(isWhatIfDisplaySpeed(member.whatIfDisplaySpeed)
      ? { masterId: member.masterId, whatIfDisplaySpeed: member.whatIfDisplaySpeed } : { masterId: member.masterId });
  }
  /* Anything but an explicit yes is the default: the order the team moves in, and tuned. */
  return { content: value.content, members, orderStated: value.orderStated === true, noSpeedTuning: value.noSpeedTuning === true };
}

/** Whether a whole document meets the current contract, as a `.sw` writer must produce it. */
export function isSpeedTuningPreferences(value: unknown): value is SpeedTuningPreferences {
  if (!isRecord(value) || Object.keys(value).join() !== 'teams' || !Array.isArray(value.teams)) return false;
  const keys = new Set<string>();
  return value.teams.every((entry) => {
    if (!isRecord(entry) || Object.keys(entry).sort().join() !== 'content,members,noSpeedTuning,orderStated') return false;
    if (typeof entry.orderStated !== 'boolean' || typeof entry.noSpeedTuning !== 'boolean' || !Array.isArray(entry.members)) return false;
    if (!entry.members.every((member) => isRecord(member) && Object.keys(member).every((key) => key === 'masterId' || key === 'whatIfDisplaySpeed')
      && (!('whatIfDisplaySpeed' in member) || isWhatIfDisplaySpeed(member.whatIfDisplaySpeed)))) return false;
    const read = readTeamSpeedTuning(entry);
    if (read === null || !statesAnything(read) || keys.has(storedKey(read))) return false;
    keys.add(storedKey(read));
    return true;
  });
}

/**
 * A preset as the former contract kept its tuning — by preset id, monsters by
 * `unit_id` — resolved against the import the preferences are read with, so
 * the orders stated then carry over to the teams they were stated for.
 */
export type FormerPresetTeam = { content: SpeedTuningContent; members: ReadonlyArray<{ unitId: string; masterId: string | null }> };

/* The former per-preset entries, carried once into teams. A preset the import
   no longer holds, or one with a member it does not, names no team, and its
   entry is left behind. A team already stated in the current form keeps that. */
function formerTeams(value: unknown, presetTeam: (presetId: string) => FormerPresetTeam | undefined): TeamSpeedTuning[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([presetId, entry]) => {
    const team = presetTeam(presetId);
    if (!team || !isRecord(entry) || team.members.some((member) => member.masterId === null)) return [];
    const stated = (Array.isArray(entry.order) ? entry.order : []).filter((unitId): unitId is string =>
      typeof unitId === 'string' && team.members.some((member) => member.unitId === unitId));
    const unique = [...new Set(stated)];
    const order = [...unique, ...team.members.map((member) => member.unitId).filter((unitId) => !unique.includes(unitId))];
    const whatIfs = isRecord(entry.whatIfs) ? entry.whatIfs : {};
    const members = order.map((unitId) => {
      const masterId = team.members.find((member) => member.unitId === unitId)?.masterId as string;
      const whatIf = whatIfs[unitId];
      return isWhatIfDisplaySpeed(whatIf) ? { masterId, whatIfDisplaySpeed: whatIf } : { masterId };
    });
    const read: TeamSpeedTuning = { content: team.content, members, orderStated: unique.length > 0, noSpeedTuning: entry.noSpeedTuning === true };
    return statesAnything(read) ? [read] : [];
  });
}

/**
 * The stored page, team by team. A second entry for a team already read is
 * dropped: one team has one order. `presetTeam` resolves the former per-preset
 * section against the import, where one is stored.
 */
export function readSpeedTuningPreferences(value: unknown,
  presetTeam: (presetId: string) => FormerPresetTeam | undefined = () => undefined): SpeedTuningPreferences {
  const stored = isRecord(value) && Array.isArray(value.teams) ? value.teams : [];
  const teams: TeamSpeedTuning[] = [];
  const keys = new Set<string>();
  const former = isRecord(value) ? formerTeams(value.presets, presetTeam) : [];
  for (const read of [...stored.map(readTeamSpeedTuning), ...former]) {
    if (read === null || !statesAnything(read) || keys.has(storedKey(read))) continue;
    keys.add(storedKey(read));
    teams.push(read);
  }
  return { teams };
}

/** What the user stated for a team, if anything. */
export function teamSpeedTuning(preferences: SpeedTuningPreferences, team: Pick<SpeedTeam, 'tuningContent' | 'members'>): TeamSpeedTuning | undefined {
  const key = speedTeamKey(team);
  return key === null ? undefined : preferences.teams.find((entry) => storedKey(entry) === key);
}

/**
 * Whether a preset is a team to tune: every preset with monsters but Scenario,
 * which is no team. Speed Tuning lists exactly these, and every Speed tuning
 * button opens exactly these, so the two cannot disagree.
 */
export function isSpeedTeam(preset: { kind: string; members: readonly string[] }): boolean {
  return preset.kind !== 'scenario' && preset.members.length > 0;
}

/**
 * A preset as a team to tune: its own monsters and leader, in the order the user
 * stated for this team, or else in `fallbackOrder` — the order it moves in now,
 * where the caller has read it — or else its slots' order. The what-ifs tried on
 * it come with it. Every preset is one: a content without enemy data is still
 * read for its own turn order, and one not yet named counts only the leads
 * that count everywhere.
 */
export function presetSpeedTeam(
  preset: { id: string; members: readonly string[]; leaderUnitId: string | null; content: { id: PresetContentId; speed: SpeedContentId; teamSize: number } | null },
  masterOf: (unitId: string) => string | null,
  tuning: TeamSpeedTuning | undefined,
  otherLeaders: SpeedTeam['otherLeaders'] = [],
  fallbackOrder: readonly string[] = preset.members,
): SpeedTeam {
  const content = preset.content?.speed ?? 'unnamed';
  /* A saved deck is never cut to fit: a team larger than its content's is
     shown whole, so no monster the preset holds goes missing from the page. */
  const size = Math.max(preset.content?.teamSize ?? 0, preset.members.length);
  /* Each stored species takes the first copy of it not yet taken, in slot order,
     so a team holding one species twice still reads both of its places. */
  const free = [...preset.members];
  const stated = (tuning?.members ?? []).flatMap((entry) => {
    const at = free.findIndex((unitId) => masterOf(unitId) === entry.masterId);
    return at === -1 ? [] : [{ unitId: free.splice(at, 1)[0], whatIfDisplaySpeed: entry.whatIfDisplaySpeed }];
  });
  const whatIfs = new Map(stated.flatMap((entry) => entry.whatIfDisplaySpeed === undefined ? [] : [[entry.unitId, entry.whatIfDisplaySpeed] as const]));
  const orderStated = tuning?.orderStated === true;
  const first = orderStated ? stated.map((entry) => entry.unitId) : fallbackOrder.filter((unitId) => preset.members.includes(unitId));
  const order = [...first, ...preset.members.filter((unitId) => !first.includes(unitId))];
  return {
    id: preset.id,
    content,
    tuningContent: preset.content?.id ?? 'unnamed',
    members: order.map((unitId) => {
      const whatIf = whatIfs.get(unitId);
      const masterId = masterOf(unitId);
      return whatIf === undefined ? { unitId, masterId } : { unitId, masterId, whatIfDisplaySpeed: whatIf };
    }),
    orderStated,
    leaderUnitId: preset.leaderUnitId,
    otherLeaders,
    size,
    noSpeedTuning: tuning?.noSpeedTuning ?? false,
  };
}

/**
 * The page with a team's statements in place of whatever was stated for that
 * team before — kept where it stood among the others. A team that states
 * nothing any more leaves no entry, and one whose species are not all known
 * cannot be kept and changes nothing.
 */
export function withTeamSpeedTuning(preferences: SpeedTuningPreferences, team: SpeedTeam): SpeedTuningPreferences {
  const key = speedTeamKey(team);
  if (key === null) return preferences;
  const entry: TeamSpeedTuning = {
    content: team.tuningContent,
    members: team.members.map((member) => member.whatIfDisplaySpeed === undefined
      ? { masterId: member.masterId as string } : { masterId: member.masterId as string, whatIfDisplaySpeed: member.whatIfDisplaySpeed }),
    orderStated: team.orderStated,
    noSpeedTuning: team.noSpeedTuning,
  };
  const at = preferences.teams.findIndex((stored) => storedKey(stored) === key);
  const others = preferences.teams.filter((_, index) => index !== at);
  if (!statesAnything(entry)) return { teams: others };
  return { teams: at === -1 ? [...others, entry] : [...others.slice(0, at), entry, ...others.slice(at)] };
}
