import { describe, expect, it } from 'vitest';
import { isPreferencesDocument } from './preferences';

describe('preferences document detection', () => {
  it('does not identify a timestamp-only JSON document as preferences', () => {
    expect(isPreferencesDocument({ updatedAt: '2026-11-14T10:00:00.000Z' })).toBe(false);
    expect(isPreferencesDocument({ hardwareAcceleration: false })).toBe(true);
  });
});
