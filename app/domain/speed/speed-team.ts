import type { GameRecord } from '../account/game-record';
import { monsterInPreset } from '../placements/presets';
import type { accountItems, Preset } from '../placements/presets';
import { presetSpeedTeam } from '../profiles/speed-tuning-preferences';
import { battleLeaders } from '../combat/team-leads';
import type { SpeedTeam, SpeedTuningPreferences } from '../profiles/speed-tuning-preferences';

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
export function presetTeam(preset: Preset, presets: readonly Preset[], tuning: SpeedTuningPreferences['presets'],
  monsterById: ReadonlyMap<string, GameRecord>, items: ReturnType<typeof accountItems>): { team: SpeedTeam; monsters: ReadonlyMap<string, GameRecord> } {
  /* A leader the import no longer holds has no lead to read, as in the profile. */
  const otherLeaders = battleLeaders(preset, presets).filter((leader) => leader.presetId !== preset.id).flatMap((leader) => {
    const monster = monsterById.get(leader.unitId);
    return monster ? [{ unitId: leader.unitId, masterId: String(monster.unit_master_id ?? ''), presetName: leader.presetName }] : [];
  });
  const team = presetSpeedTeam(preset, tuning[preset.id], otherLeaders);
  const monsters = new Map(preset.members.flatMap((unitId) => {
    const monster = monsterById.get(unitId);
    return monster ? [[unitId, monsterInPreset(monster, preset, items)] as const] : [];
  }));
  return { team, monsters };
}
