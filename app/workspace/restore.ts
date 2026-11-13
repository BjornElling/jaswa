import { isValidImportedGame } from '../lib/file-imports';
import { readPreferences } from '../ingest/preferences';
import { readLoadedPlacements } from '../lib/engrave-rune-build';
import { readRuneLocks } from '../lib/rune-locks';
import type { ImportedGame, Preferences } from '../lib/types';

export type WorkspaceReader = {
  loadGame(): Promise<unknown>;
  loadPreferences(): Promise<unknown>;
};

export type RestoredWorkspace = {
  game: ImportedGame | null;
  preferences: Preferences;
  failed: readonly ('game' | 'preferences')[];
};

/** A failed account read must not discard a separately readable preference copy. */
export async function restoreWorkspace(reader: WorkspaceReader): Promise<RestoredWorkspace> {
  const [gameResult, preferenceResult] = await Promise.allSettled([
    reader.loadGame(), reader.loadPreferences(),
  ]);
  const savedGame = gameResult.status === 'fulfilled' ? gameResult.value : null;
  const validGame = savedGame && isValidImportedGame(savedGame) ? savedGame : null;
  const game = validGame === null ? null : {
    ...validGame,
    loadedPlacements: readLoadedPlacements(validGame.loadedPlacements),
    runeLocks: readRuneLocks(validGame.runeLocks),
  };
  return {
    game,
    preferences: readPreferences(preferenceResult.status === 'fulfilled' ? preferenceResult.value : null, game),
    failed: [
      ...(gameResult.status === 'rejected' ? ['game' as const] : []),
      ...(preferenceResult.status === 'rejected' ? ['preferences' as const] : []),
    ],
  };
}
