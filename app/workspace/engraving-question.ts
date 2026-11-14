import type { Preferences } from '../domain/model';
import type { Preset } from '../domain/placements/presets';
import { profileIn } from '../domain/profiles/monster-preferences';

/** Draft requirements belong to the click; saved profile or team edits after it
 * require a fresh click instead of silently applying the preceding question. */
export function engravingQuestionKey(preferences: Preferences, presets: readonly Preset[], presetId: string, unitId: string): string {
  const preset = presets.find((entry) => entry.id === presetId);
  return JSON.stringify({
    profile: preset ? profileIn(preferences.monsterPreferences, preset.profileScope, unitId) : null,
    teams: presets.map((entry) => ({ id: entry.id, content: entry.content?.id, members: entry.members, leader: entry.leaderUnitId })),
  });
}
