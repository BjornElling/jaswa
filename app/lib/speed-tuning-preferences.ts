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

/** The user's word on one preset: the turn order wanted, the what-ifs tried, and whether it is speed tuned at all. */
export type PresetSpeedTuning = { order: string[]; whatIfs: Record<string, number>; noSpeedTuning: boolean };

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
  /* Anything but an explicit yes is the default: tuned. */
  return { order, whatIfs, noSpeedTuning: value.noSpeedTuning === true };
}

/** Whether a whole document meets the current contract, as a `.sw` writer must produce it. */
export function isSpeedTuningPreferences(value: unknown): value is SpeedTuningPreferences {
  if (!isRecord(value) || Object.keys(value).join() !== 'presets' || !isRecord(value.presets)) return false;
  return Object.entries(value.presets).every(([presetId, entry]) => {
    if (!isIdentifier(presetId) || !isRecord(entry) || Object.keys(entry).sort().join() !== 'noSpeedTuning,order,whatIfs') return false;
    const read = readPresetSpeedTuning(entry);
    return read !== null && typeof entry.noSpeedTuning === 'boolean' && Array.isArray(entry.order) && read.order.length === entry.order.length
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
 * Whether a preset is a team to tune: every preset with monsters but Scenario,
 * which is no team. Speed Tuning lists exactly these, and every Speed tuning
 * button opens exactly these, so the two cannot disagree.
 */
export function isSpeedTeam(preset: { kind: string; members: readonly string[] }): boolean {
  return preset.kind !== 'scenario' && preset.members.length > 0;
}

/**
 * A preset as a team to tune: its own monsters and leader, in the turn order
 * the user asked for — with a monster the preset gained since placed last and
 * one it lost left out — and the what-ifs tried on them. Every preset is one:
 * a content without enemy data is still read for its own turn order, and one
 * not yet named counts only the leads that count everywhere.
 */
export function presetSpeedTeam(
  preset: { id: string; members: readonly string[]; leaderUnitId: string | null; content: { speed: SpeedContentId; teamSize: number } | null },
  tuning: PresetSpeedTuning | undefined,
  otherLeaders: SpeedTeam['otherLeaders'] = [],
): SpeedTeam {
  const content = preset.content?.speed ?? 'unnamed';
  /* A saved deck is never cut to fit: a team larger than its content's is
     shown whole, so no monster the preset holds goes missing from the page. */
  const size = Math.max(preset.content?.teamSize ?? 0, preset.members.length);
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
    otherLeaders,
    size,
    noSpeedTuning: tuning?.noSpeedTuning ?? false,
  };
}

/** What a team's draft states, back as the preset's tuning. */
export function speedTuningOf(team: SpeedTeam): PresetSpeedTuning {
  return {
    order: team.members.map((member) => member.unitId),
    whatIfs: Object.fromEntries(team.members.flatMap((member) =>
      member.whatIfDisplaySpeed === undefined ? [] : [[member.unitId, member.whatIfDisplaySpeed] as const])),
    noSpeedTuning: team.noSpeedTuning,
  };
}
