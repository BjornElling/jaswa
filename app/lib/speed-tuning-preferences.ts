/**
 * What the user has stated on the Speed Tuning page: the teams they intend to
 * tune, the order each should move in, and the standing rules about single
 * monsters. Nothing here is shipped — the page starts empty and holds only what
 * the user typed.
 *
 * Only the user's decisions are stored. Every figure the page shows — arena
 * speed, dungeon speed, a tick, an interval — is derived from the current
 * import by `speed-tick.ts` on every render, so a stored team can never carry a
 * stale reading of a monster whose runes have since changed.
 */
import { speedContent, speedContents, speedContentTeamSize } from './speed-contents';
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
 * What a rule asks of its monster: a turn order against another monster, or a
 * figure to reach, stay under or stay inside. The figure is read in each
 * speed form the rule is checked in, so one rule can say "at least 160" of
 * display speed and of dungeon speed at once.
 */
export type SpeedRuleMust =
  | { kind: 'move-before'; unitId: string }
  | { kind: 'move-after'; unitId: string }
  | { kind: 'reach-at-least'; speed: number }
  | { kind: 'stay-at-most'; speed: number }
  | { kind: 'stay-between'; minimum: number; maximum: number };

export type SpeedRuleKind = SpeedRuleMust['kind'];

/**
 * A standing reminder about one monster, judged on its own and never inside a
 * team: the teams on the page are one question, a rule is another. Where it is
 * checked is the user's to tick, and a rule ticked nowhere is still a rule —
 * kept, and judged by nothing until a box is ticked.
 */
export type SpeedRule = {
  id: string;
  unitId: string;
  must: SpeedRuleMust;
  displaySpeed: boolean;
  dungeonSpeed: boolean;
  arenaSpeed: boolean;
};

/** The highest figure a rule accepts. Far above any display speed, dungeon speed or arena speed a build reaches. */
export const speedRuleFigureMaximum = 999;

export type SpeedTuningPreferences = { teams: SpeedTeam[]; rules: SpeedRule[] };

export function blankSpeedTuningPreferences(): SpeedTuningPreferences {
  return { teams: [], rules: [] };
}

export function newSpeedTuningId(kind: 'team' | 'rule'): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The name a team goes by: its content and its place among that content's
 * teams, in the order they were added. A team not yet saved is counted as the
 * last, which is where saving puts it, so an editor names it as the page will.
 */
export function speedTeamTitle(teams: readonly SpeedTeam[], team: SpeedTeam): string {
  const base = team.content === 'arena' ? 'Arena team' : `${speedContent(team.content).name} team`;
  const placed = teams.some((entry) => entry.id === team.id)
    ? teams.map((entry) => entry.id === team.id ? team : entry)
    : [...teams, team];
  return `${base} #${placed.filter((entry) => entry.content === team.content).findIndex((entry) => entry.id === team.id) + 1}`;
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

export function isSpeedRuleFigure(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= speedRuleFigureMaximum;
}

function isMust(value: unknown, unitId: string): value is SpeedRuleMust {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'move-before':
    case 'move-after':
      return hasExactKeys(value, ['kind', 'unitId']) && isIdentifier(value.unitId) && value.unitId !== unitId;
    case 'reach-at-least':
    case 'stay-at-most':
      return hasExactKeys(value, ['kind', 'speed']) && isSpeedRuleFigure(value.speed);
    case 'stay-between':
      return hasExactKeys(value, ['kind', 'minimum', 'maximum'])
        && isSpeedRuleFigure(value.minimum) && isSpeedRuleFigure(value.maximum) && value.minimum <= value.maximum;
    default:
      return false;
  }
}

function isRule(value: unknown): value is SpeedRule {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'unitId', 'must', 'displaySpeed', 'dungeonSpeed', 'arenaSpeed'])) return false;
  return isIdentifier(value.id) && isIdentifier(value.unitId) && isMust(value.must, value.unitId)
    && typeof value.displaySpeed === 'boolean' && typeof value.dungeonSpeed === 'boolean' && typeof value.arenaSpeed === 'boolean';
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
