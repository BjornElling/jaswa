import {
  candidateMaxValue, neutralComparisonCredit, newRuneAdviceScope, prepareRuneCandidate, roleBuilds,
} from './rune-cleanup-model';
import type { CraftCredit } from './rune-cleanup-model';
import type { ReferenceStats } from './rune-reference-stats';
import type { RuneRole } from './rune-roles';
import type { Rune } from './runes';

export type GemPreservationRole = { role: RuneRole; base: ReferenceStats };

/** Keep a tied Gem plan useful beyond this monster, using Clean-up's own role ruler. */
export function gemRemovalPrices(roles: readonly GemPreservationRole[]) {
  const scope = newRuneAdviceScope();
  const families = roles.map(({ role, base }) => ({ role, base, builds: roleBuilds(role) }));
  const credit: CraftCredit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
  return (rune: Rune): readonly number[] | undefined => {
    let best = 0;
    let prices: readonly number[] | undefined;
    for (const { role, base, builds } of families) for (const build of builds) {
      const candidate = prepareRuneCandidate(rune, role, build, base, credit, neutralComparisonCredit, scope);
      if (!candidate || candidate.rank === 'broken') continue;
      const value = candidateMaxValue(candidate);
      if (value <= best) continue;
      best = value;
      prices = rune.subProperties.map((line) => candidate.valuation.value(line.statId, line.value + line.grind));
    }
    return prices;
  };
}
