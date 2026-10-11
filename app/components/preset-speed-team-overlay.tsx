import { useMemo } from 'react';
import { SpeedTeamOverlay } from './speed-team-overlay';
import type { OpenMonsterOverlay } from './monster-link';
import type { GameRecord } from '../lib/game-data';
import { monsterCopyNames } from '../lib/monster-names';
import { profilesIn } from '../lib/monster-preferences';
import { accountItems } from '../lib/presets';
import type { Preset } from '../lib/presets';
import { readSkyTribeTotem } from '../lib/sky-tribe-totem';
import { monstersByUnitId, presetTeam } from '../lib/speed-team';
import { isSpeedTeam, speedTuningOf } from '../lib/speed-tuning-preferences';
import type { SpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../lib/types';

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
export function PresetSpeedTeamOverlay({ presetId, game, monsters, preferences, presets, canChangePresets, onWrite, onLead, onClose, onOpenMonster }: {
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
}) {
  const preset = presets.find((entry) => entry.id === presetId);
  const tuning = preferences.speedTuning.presets;
  const monsterById = useMemo(() => monstersByUnitId(monsters), [monsters]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  const totem = useMemo(() => readSkyTribeTotem(game?.data), [game]);
  const totemShare = totem.state === 'built' ? totem.percent : 0;
  const line = useMemo(() => (preset && isSpeedTeam(preset) ? presetTeam(preset, tuning, monsterById, items) : null),
    [preset, tuning, monsterById, items]);
  /* The team names its copies as its own preset's profiles do. */
  const names = useMemo(() => monsterCopyNames(monsters, profilesIn(preferences.monsterPreferences, presetId)),
    [monsters, preferences.monsterPreferences, presetId]);

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
    onClose={onClose} onOpenMonster={onOpenMonster} />;
}

/* A preset built here is always the user's; the game's only while live sync
   is off, and a defense is always led by someone, so its lead only passes on. */
function leadingIn(preset: Preset, canChangePresets: boolean): 'free' | 'kept' | undefined {
  if (preset.kind === 'own') return 'free';
  if (preset.kind !== 'game' || !canChangePresets) return undefined;
  return preset.deck !== null && preset.deck.source.kind !== 'deck' ? 'kept' : 'free';
}
