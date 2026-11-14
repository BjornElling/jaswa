import { describe, expect, it } from 'vitest';
import { newRerollRule, readRerollRules } from './rune-reapp-targets';

describe('reroll rule reading', () => {
  it('drops an unreadable kind without losing a neighbouring rule', () => {
    const kept = newRerollRule('kept');

    expect(readRerollRules([
      { ...newRerollRule('bad'), kind: 'not-a-kind' },
      kept,
    ])).toEqual([kept]);
  });
});
