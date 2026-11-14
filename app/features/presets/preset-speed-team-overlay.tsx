import { useMemo } from 'react';
import { SpeedTeamOverlay } from '../speed-tuning/public';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import type { GameRecord } from '../../domain/account/game-record';
import { monsterCopyNames } from '../../domain/monsters/monster-names';
import { profilesIn } from '../../domain/profiles/monster-preferences';
import { accountItems } from '../../domain/placements/presets';
import type { Preset } from '../../domain/placements/presets';
import type { SkyTribeTotem } from '../../domain/account/account-buildings';
import { monstersByUnitId, presetTeam } from '../../domain/speed/speed-team';
import { isSpeedTeam, speedTuningOf } from '../../domain/profiles/speed-tuning-preferences';
import type { SpeedTuningPreferences } from '../../domain/profiles/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../../domain/model';

const noSkyTribeTotem: SkyTribeTotem = { state: 'unknown' };

/**
 * Opens a preset's team over the current page. Every page takes this one door,
 * Speed Tuning's own lines included; none navigates to open it. The opener is
 * the control focus returns to when the team closes.
 */
export type OpenSpeedTeamOverlay = (presetId: string, opener: HTMLElement | null) => void;

/**
 * One preset's team overlay, opened over whatever page asked for it. A button
 * that opens an overlay opens it where the user is: Presets and Rune
 * Optimization used to send the user to Speed Tuning first, which lost the
 * page they were working on for the sake of a dialog that needs none of it.
 */
export function PresetSpeedTeamOverlay({ presetId, game, monsters, preferences, presets, canChangePresets, onWrite, onLead, onClose, onOpenMonster, onEditPreset }: {
  presetId: string;
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  presets: readonly Preset[];
  /** Whether the game's presets are the user's to change: false while live sync would put them back. */
  canChangePresets: boolean;
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
  /** A preset's leader, `null` for none. */
  onLead: (presetId: string, unitId: string | null) => void;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
  /** Goes to Presets with the preset chosen. */
  onEditPreset: (presetId: string) => void;
}) {
  const preset = presets.find((entry) => entry.id === presetId);
  const tuning = preferences.speedTuning.presets;
  const monsterById = useMemo(() => monstersByUnitId(monsters), [monsters]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  const totem = game?.snapshot.skyTribeTotem ?? noSkyTribeTotem;
  const totemShare = totem.state === 'built' ? totem.percent : 0;
  const line = useMemo(() => (preset && isSpeedTeam(preset) ? presetTeam(preset, presets, tuning, monsterById, items) : null),
    [preset, presets, tuning, monsterById, items]);
  /* All teams of this area read the same copy names. */
  const names = useMemo(() => monsterCopyNames(monsters, profilesIn(preferences.monsterPreferences, preset?.profileScope ?? 'scenario')),
    [monsters, preferences.monsterPreferences, preset]);

  if (!game || !preset || !line) return null;
  const { team } = line;

  return <SpeedTeamOverlay key={preset.id} initial={team} title={preset.name}
    monsters={line.monsters} totemShare={totemShare} names={names} general={preferences.general}
    leading={leadingIn(preset, canChangePresets)}
    onSave={(saved) => {
      onWrite((current) => ({ ...current, presets: { ...current.presets, [saved.id]: speedTuningOf(saved) } }));
      if (saved.leaderUnitId !== team.leaderUnitId) onLead(saved.id, saved.leaderUnitId);
      onClose();
    }}
    onClose={onClose} onOpenMonster={onOpenMonster} onEditPreset={() => onEditPreset(preset.id)} />;
}

/* A preset built here is always the user's; the game's only while live sync
   is off, and a defense is always led by someone, so its lead only passes on. */
function leadingIn(preset: Preset, canChangePresets: boolean): 'free' | 'kept' | 'synced' | undefined {
  if (preset.kind === 'own') return 'free';
  if (preset.kind !== 'game') return undefined;
  if (!canChangePresets) return 'synced';
  return preset.deck !== null && preset.deck.source.kind !== 'deck' ? 'kept' : 'free';
}
