import { readStoredGame } from '../ingest/game-export';
import { readPreferences } from '../ingest/preferences';
import type { ImportedGame, Preferences } from '../domain/model';

export type WorkspaceReader = {
  loadGame(): Promise<unknown>;
  loadPreferences(): Promise<unknown>;
};

export type RestoredWorkspace = {
  game: ImportedGame | null;
  preferences: Preferences;
  /** Which saved records could not be read from storage at all. */
  failed: readonly ('game' | 'preferences')[];
  /** A stored import was read but no longer passes the import contract, so it is not shown (`AGENTS.md` §0.1: never silently). */
  gameRejected: boolean;
};

/** A failed account read must not discard a separately readable preference copy. */
export async function restoreWorkspace(reader: WorkspaceReader): Promise<RestoredWorkspace> {
  const [gameResult, preferenceResult] = await Promise.allSettled([
    reader.loadGame(), reader.loadPreferences(),
  ]);
  const stored = gameResult.status === 'fulfilled' ? gameResult.value : null;
  const game = stored === null || stored === undefined ? null : readStoredGame(stored);
  return {
    game,
    gameRejected: stored !== null && stored !== undefined && game === null,
    preferences: readPreferences(preferenceResult.status === 'fulfilled' ? preferenceResult.value : null, game),
    failed: [
      ...(gameResult.status === 'rejected' ? ['game' as const] : []),
      ...(preferenceResult.status === 'rejected' ? ['preferences' as const] : []),
    ],
  };
}
