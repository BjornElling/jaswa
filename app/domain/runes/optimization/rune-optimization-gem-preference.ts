import {
  candidateMaxValue, newRuneAdviceScope, prepareRuneCandidate, roleBuilds,
} from '../cleanup/rune-cleanup-model';
import { noCraftCredit } from '../craft/rune-craft-end-state';
import type { CraftCredit } from '../craft/rune-craft-end-state';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RuneRole } from '../../profiles/rune-roles';
import type { Rune } from '../runes';

export type GemPreservationRole = { role: RuneRole; base: ReferenceStats };

/** Keep a tied Gem plan useful beyond this monster, using Clean-up's own role ruler. */
export function gemRemovalPrices(roles: readonly GemPreservationRole[], ruler: CraftCredit) {
  const scope = newRuneAdviceScope(ruler);
  const families = roles.map(({ role, base }) => ({ role, base, builds: roleBuilds(role) }));
  return (rune: Rune): readonly number[] | undefined => {
    let best = 0;
    let prices: readonly number[] | undefined;
    for (const { role, base, builds } of families) for (const build of builds) {
      const candidate = prepareRuneCandidate(rune, role, build, base, noCraftCredit, scope);
      if (!candidate || candidate.rank === 'broken') continue;
      const value = candidateMaxValue(candidate);
      if (value <= best) continue;
      best = value;
      prices = rune.subProperties.map((line) => candidate.valuation.value(line.statId, line.value + line.grind));
    }
    return prices;
  };
}
