import type { GameRecord } from './game-data';
import { monsterInPreset } from './presets';
import type { accountItems, Preset } from './presets';
import { presetSpeedTeam } from './speed-tuning-preferences';
import type { SpeedTeam, SpeedTuningPreferences } from './speed-tuning-preferences';

/** Every copy in the import, by unit id. */
export function monstersByUnitId(monsters: readonly GameRecord[]): Map<string, GameRecord> {
  return new Map(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => [String(monster.unit_id), monster]));
}

/**
 * A preset as a team to tune: the order asked for, and its monsters each read
 * with the runes this preset engraves. Speed Tuning's lines and the overlay
 * read the same team, so a line and the overlay it opens cannot disagree.
 */
export function presetTeam(preset: Preset, tuning: SpeedTuningPreferences['presets'], monsterById: ReadonlyMap<string, GameRecord>,
  items: ReturnType<typeof accountItems>): { team: SpeedTeam; monsters: ReadonlyMap<string, GameRecord> } {
  const team = presetSpeedTeam(preset, tuning[preset.id]);
  const monsters = new Map(preset.members.flatMap((unitId) => {
    const monster = monsterById.get(unitId);
    return monster ? [[unitId, monsterInPreset(monster, preset, items)] as const] : [];
  }));
  return { team, monsters };
}
