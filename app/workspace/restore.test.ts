import { describe, expect, it } from 'vitest';
import { blankPreferences } from '../lib/file-imports';
import { restoreWorkspace } from './restore';

describe('workspace restoration', () => {
  it('restores preferences independently when the account cannot be read', async () => {
    const preferences = { ...blankPreferences(), importRoute: 'direct' as const, hardwareAcceleration: false };
    const result = await restoreWorkspace({
      loadGame: async () => { throw new Error('account unavailable'); },
      loadPreferences: async () => preferences,
    });
    expect(result.game).toBeNull();
    expect(result.preferences.importRoute).toBe('direct');
    expect(result.preferences.hardwareAcceleration).toBe(false);
    expect(result.failed).toEqual(['game']);
  });

  it('reports preference failure without inventing an account', async () => {
    const result = await restoreWorkspace({
      loadGame: async () => null,
      loadPreferences: async () => { throw new Error('preferences unavailable'); },
    });
    expect(result.game).toBeNull();
    expect(result.failed).toEqual(['preferences']);
  });
});
