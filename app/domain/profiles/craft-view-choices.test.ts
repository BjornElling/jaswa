import { describe, expect, it } from 'vitest';
import { readCraftViewChoices } from './craft-view-choices';

describe('craft view preference reading', () => {
  it('de-duplicates chosen filters while keeping their first-seen order', () => {
    const read = readCraftViewChoices({
      recommendations: {
        lineages: ['standard', 'ancient', 'standard'],
        grades: ['Legend', 'Rare', 'Legend'],
        already: ['yes', 'no', 'yes'],
      },
    });

    expect(read.recommendations.lineages).toEqual(['standard', 'ancient']);
    expect(read.recommendations.grades).toEqual(['Legend', 'Rare']);
    expect(read.recommendations.already).toEqual(['yes', 'no']);
  });
});
