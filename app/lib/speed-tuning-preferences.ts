/**
 * What the user has stated on the Speed Tuning page, preset by preset: the
 * order each preset's monsters should move in, and the what-if display speeds
 * tried on them. The teams themselves are the presets (`DECK-PRESETS.md` §5):
 * their monsters and leader are the preset's, so nothing here repeats them.
 *
 * Only the user's decisions are stored. Every figure the page shows — arena
 * speed, dungeon speed, a tick, an interval — is derived from the current
 * import by `speed-tick.ts` on every render, so a stored order can never carry
 * a stale reading of a monster whose runes have since changed.
 */
import { speedContentTeamSize } from './speed-contents';
import type { SpeedContentId } from './speed-contents';
import { isRecord } from './preference-reading';

/**
 * One monster's place in a team, and the what-if display speed the user tried
 * on it, if any. The what-if is kept so the experiment is there next time the
 * team is opened, but it is read only inside the team's overlay: the page and
 * everything else judge the runes engraved, and never see it.
 */
export type SpeedTeamMember = { unitId: string; whatIfDisplaySpeed?: number };

/** A preset as Speed Tuning reads it. */
export type SpeedTeam = {
  /** The preset's id. */
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
};

/** The user's word on one preset: the turn order wanted, and the what-ifs tried. */
export type PresetSpeedTuning = { order: string[]; whatIfs: Record<string, number> };

export type SpeedTuningPreferences = { presets: Record<string, PresetSpeedTuning> };

export function blankSpeedTuningPreferences(): SpeedTuningPreferences {
  return { presets: {} };
}

/** The highest display speed the editor accepts as a what-if. Far above any rune build. */
export const whatIfDisplaySpeedMaximum = 999;

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isWhatIfDisplaySpeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= whatIfDisplaySpeedMaximum;
}

/* An order entry and a what-if are each their own choice: one the contract
   refuses is dropped alone, and the rest of the preset's tuning is read as it
   stands (`preference-reading.ts`). */
function readPresetSpeedTuning(value: unknown): PresetSpeedTuning | null {
  if (!isRecord(value)) return null;
  const order: string[] = [];
  for (const unitId of Array.isArray(value.order) ? value.order : []) {
    if (isIdentifier(unitId) && !order.includes(unitId)) order.push(unitId);
  }
  const whatIfs: Record<string, number> = {};
  if (isRecord(value.whatIfs)) {
    for (const [unitId, speed] of Object.entries(value.whatIfs)) {
      if (isIdentifier(unitId) && isWhatIfDisplaySpeed(speed)) whatIfs[unitId] = speed;
    }
  }
  return { order, whatIfs };
}

/** Whether a whole document meets the current contract, as a `.sw` writer must produce it. */
export function isSpeedTuningPreferences(value: unknown): value is SpeedTuningPreferences {
  if (!isRecord(value) || Object.keys(value).join() !== 'presets' || !isRecord(value.presets)) return false;
  return Object.entries(value.presets).every(([presetId, entry]) => {
    if (!isIdentifier(presetId) || !isRecord(entry) || Object.keys(entry).sort().join() !== 'order,whatIfs') return false;
    const read = readPresetSpeedTuning(entry);
    return read !== null && Array.isArray(entry.order) && read.order.length === entry.order.length
      && isRecord(entry.whatIfs) && Object.keys(read.whatIfs).length === Object.keys(entry.whatIfs).length;
  });
}

/** The stored page, preset by preset. */
export function readSpeedTuningPreferences(value: unknown): SpeedTuningPreferences {
  const stored = isRecord(value) && isRecord(value.presets) ? value.presets : {};
  const presets: Record<string, PresetSpeedTuning> = {};
  for (const [presetId, entry] of Object.entries(stored)) {
    const read = isIdentifier(presetId) ? readPresetSpeedTuning(entry) : null;
    if (read) presets[presetId] = read;
  }
  return { presets };
}

/**
 * A preset as a team to tune: its own monsters and leader, in the turn order
 * the user asked for — with a monster the preset gained since placed last and
 * one it lost left out — and the what-ifs tried on them. `null` where the
 * preset holds more monsters than its content fields.
 */
export function presetSpeedTeam(
  preset: { id: string; members: readonly string[]; leaderUnitId: string | null },
  content: SpeedContentId, tuning: PresetSpeedTuning | undefined,
): SpeedTeam | null {
  if (preset.members.length > speedContentTeamSize(content)) return null;
  const asked = (tuning?.order ?? []).filter((unitId) => preset.members.includes(unitId));
  const order = [...asked, ...preset.members.filter((unitId) => !asked.includes(unitId))];
  return {
    id: preset.id,
    content,
    members: order.map((unitId) => {
      const whatIf = tuning?.whatIfs[unitId];
      return whatIf === undefined ? { unitId } : { unitId, whatIfDisplaySpeed: whatIf };
    }),
    leaderUnitId: preset.leaderUnitId,
  };
}

/** What a team's draft states, back as the preset's tuning. */
export function speedTuningOf(team: SpeedTeam): PresetSpeedTuning {
  return {
    order: team.members.map((member) => member.unitId),
    whatIfs: Object.fromEntries(team.members.flatMap((member) =>
      member.whatIfDisplaySpeed === undefined ? [] : [[member.unitId, member.whatIfDisplaySpeed] as const])),
  };
}
