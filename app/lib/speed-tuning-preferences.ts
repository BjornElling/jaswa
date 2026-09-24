/**
 * What the user has stated on the Speed Tuning page: the teams they intend to
 * tune, the order each should move in, and the standing rules between two
 * monsters. Nothing here is shipped — the page starts empty and holds only what
 * the user typed.
 *
 * Only the user's decisions are stored. Every figure the page shows — arena
 * speed, dungeon speed, a tick, an interval — is derived from the current
 * import by `speed-tick.ts` on every render, so a stored team can never carry a
 * stale reading of a monster whose runes have since changed.
 */
import { speedContents, speedContentTeamSize } from './speed-contents';
import type { SpeedContentId } from './speed-contents';

/** The widest speed margin the page offers, in combat speed (arena or dungeon speed). */
export const speedMarginMaximum = 3;

/**
 * One monster's place in a team.
 *
 * `whatIfDisplaySpeed` is an experiment the user typed for *this team only*:
 * the display speed the monster would have after a rune change. Absent means
 * "read the monster's own display speed from the import", which is a different
 * answer from any number, so it is left out rather than stored as `0`.
 */
export type SpeedTeamMember = { unitId: string; whatIfDisplaySpeed?: number };

export type SpeedTeam = {
  id: string;
  content: SpeedContentId;
  /**
   * The monsters in the order the user wants them to move — first mover first.
   * That is deliberately *not* the order the leader is chosen in, which is why
   * the leader is its own field rather than "whoever stands first".
   */
  members: SpeedTeamMember[];
  /** Whose leader skill the team runs, or `null` for no leader. Always a member. */
  leaderUnitId: string | null;
  /** Whether a speed margin is asked of every neighbouring pair. */
  marginEnabled: boolean;
  /**
   * The margin in combat speed (arena or dungeon speed), held while the switch
   * is off so turning it on again finds the value chosen before.
   */
  margin: number;
};

/**
 * A standing rule between two monsters: `fasterUnitId` must move before
 * `slowerUnitId` in every team of the ticked kinds that holds them both.
 */
export type SpeedRule = {
  id: string;
  fasterUnitId: string;
  slowerUnitId: string;
  arena: boolean;
  dungeons: boolean;
};

export type SpeedTuningPreferences = { teams: SpeedTeam[]; rules: SpeedRule[] };

export function blankSpeedTuningPreferences(): SpeedTuningPreferences {
  return { teams: [], rules: [] };
}

export function newSpeedTuningId(kind: 'team' | 'rule'): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The highest display speed the page accepts as an experiment. Far above any rune build. */
export const whatIfDisplaySpeedMaximum = 999;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isMember(value: unknown): value is SpeedTeamMember {
  if (!isRecord(value) || !hasExactKeys(value, ['unitId'], ['whatIfDisplaySpeed'])) return false;
  if (!isIdentifier(value.unitId)) return false;
  return value.whatIfDisplaySpeed === undefined
    || (typeof value.whatIfDisplaySpeed === 'number' && Number.isSafeInteger(value.whatIfDisplaySpeed)
      && value.whatIfDisplaySpeed >= 1 && value.whatIfDisplaySpeed <= whatIfDisplaySpeedMaximum);
}

function isTeam(value: unknown): value is SpeedTeam {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'content', 'members', 'leaderUnitId', 'marginEnabled', 'margin'])) return false;
  if (!isIdentifier(value.id)) return false;
  if (!speedContents.some((content) => content.id === value.content)) return false;
  const members = value.members;
  if (!Array.isArray(members) || !members.every(isMember)) return false;
  if (members.length > speedContentTeamSize(value.content as SpeedContentId)) return false;
  const unitIds = members.map((member) => member.unitId);
  if (new Set(unitIds).size !== unitIds.length) return false;
  if (value.leaderUnitId !== null && !(isIdentifier(value.leaderUnitId) && unitIds.includes(value.leaderUnitId))) return false;
  return typeof value.marginEnabled === 'boolean'
    && typeof value.margin === 'number' && Number.isSafeInteger(value.margin)
    && value.margin >= 1 && value.margin <= speedMarginMaximum;
}

function isRule(value: unknown): value is SpeedRule {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'fasterUnitId', 'slowerUnitId', 'arena', 'dungeons'])) return false;
  return isIdentifier(value.id)
    && isIdentifier(value.fasterUnitId) && isIdentifier(value.slowerUnitId)
    && value.fasterUnitId !== value.slowerUnitId
    && typeof value.arena === 'boolean' && typeof value.dungeons === 'boolean';
}

/** Whether a whole document meets the current contract, as a `.sw` writer must produce it. */
export function isSpeedTuningPreferences(value: unknown): value is SpeedTuningPreferences {
  if (!isRecord(value) || !hasExactKeys(value, ['teams', 'rules'])) return false;
  if (!Array.isArray(value.teams) || !value.teams.every(isTeam)) return false;
  if (!Array.isArray(value.rules) || !value.rules.every(isRule)) return false;
  const ids = [...value.teams.map((team) => team.id), ...value.rules.map((rule) => rule.id)];
  return new Set(ids).size === ids.length;
}

/**
 * The stored page, team by team and rule by rule (`preference-reading.ts`). A
 * team's fields bind one another — the leader must be a member, the members
 * must fit the content — so a team is the smallest unit that can be judged,
 * and one that fails is dropped without costing the others. A repeated id
 * keeps its first holder.
 */
export function readSpeedTuningPreferences(value: unknown): SpeedTuningPreferences {
  const stored = isRecord(value) ? value : {};
  const seen = new Set<string>();
  const unseen = (entry: { id: string }) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  };
  return {
    teams: (Array.isArray(stored.teams) ? stored.teams : []).filter(isTeam).filter(unseen),
    rules: (Array.isArray(stored.rules) ? stored.rules : []).filter(isRule).filter(unseen),
  };
}
