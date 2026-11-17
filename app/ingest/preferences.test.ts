import { describe, expect, it } from 'vitest';
import { isPreferencesDocument, readPreferences } from './preferences';

describe('preferences document detection', () => {
  it('does not identify a timestamp-only JSON document as preferences', () => {
    expect(isPreferencesDocument({ updatedAt: '2026-11-14T10:00:00.000Z' })).toBe(false);
    expect(isPreferencesDocument({ hardwareAcceleration: false })).toBe(true);
  });

  it('keeps each Rune Clean-up choice when one stored setting is invalid', () => {
    const preferences = readPreferences({
      runePotential: {
        runeQuality: 5,
        powerUpPolicy: 1,
        acceptedRunes: 2,
        brokenRunes: 6,
        potentialValueMinimum: 0,
        neverSellEngravedPlacements: false,
      },
    }, null);

    expect(preferences.runePotential).toMatchObject({
      runeQuality: 5,
      powerUpPolicy: 1,
      acceptedRunes: 2,
      potentialValueMinimum: 0,
      neverSellEngravedPlacements: false,
    });
    expect(preferences.runePotential.brokenRunes).toBe(3);
  });
});
