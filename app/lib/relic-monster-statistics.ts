import statistics from '../data/engraving-statistics.json';
import { monsterIdentityId } from './monster-selection';
import { monsterSpeciesId } from './monster-species';
import { relicMainProperties, relicMainPropertyOrder } from './relic-properties';
import type { RelicMainProperty } from './relic-properties';

/**
 * What the wider player base actually engraves on one monster type.
 *
 * `ENGRAVING-STATISTICS.md` has captured the game's **Relic Engraving
 * Statistics** panel since the first session, and until now nothing read it:
 * §5.2 of `RELIC-CANONICAL.md` rejected it as the basis for the *synergy* table,
 * because that table asks an account-wide question and relics are new enough
 * that the global level of any share is contaminated by the drop table.
 *
 * **The per-monster question is a different question, and the data answers it.**
 * Drops are monster-independent, so a distribution that varies *between*
 * monsters cannot be describing the drop table. It varies a great deal: HP is
 * the most-engraved main on 546 monster types, ATK on 422 and DEF on 49, and
 * the leading main's share runs from 43 % to 100 %. That spread is a record of
 * what players chose.
 *
 * The unique half carries far less monster-specific information, and this module
 * does not pretend otherwise: Nimble Primal leads on 923 of the 1,017 captured
 * types. `RELIC-CANONICAL.md` §11.3 is where that measurement and its
 * consequence for the weights are written down.
 */
type EffectCount = { effectId: number; count: number; slotId?: number };
type MonsterStatistics = { relics?: { observedAt?: string; primaryEffect?: EffectCount[]; secondaryEffect?: EffectCount[] } };

const recordedStatistics = (statistics as { monsters: Record<string, MonsterStatistics> }).monsters;

/* A collaboration pair is one monster released under two names, and the game
   serves both ids one distribution — `MONSTER-SPECIES-DECISION.md` owns that
   rule and `artifact-preferences.ts` resolves the artifact panels by it. The
   later row wins rather than the two being summed: they are one observation
   seen twice, so adding them would claim twice the evidence that exists. */
function observedAt(entry: MonsterStatistics | undefined): string {
  return entry?.relics?.observedAt ?? '';
}

const monsterStatistics: Record<string, MonsterStatistics> = {};
for (const [masterId, recorded] of Object.entries(recordedStatistics)) {
  const speciesId = monsterSpeciesId(masterId);
  const existing = monsterStatistics[speciesId];
  if (!existing || observedAt(recorded) > observedAt(existing)) monsterStatistics[speciesId] = recorded;
}

export type RelicUsageStatistics = {
  /** Each main property's share of this monster's own engravings, `0`–`1`. */
  mainShares: Record<RelicMainProperty, number>;
  /** Each unique property's share, by the property id `RELIC-CANONICAL.md` §4 numbers. */
  uniqueShares: Map<number, number>;
  /** How many engravings the main-property distribution was drawn from. */
  mainObservations: number;
  /** How many the unique-property distribution was drawn from. */
  uniqueObservations: number;
};

/**
 * Whether a monster's fit is resting on that monster's own panel.
 *
 * **There is no sample-size gate, and there was one.** An earlier version
 * refused any panel under 100 observations on the grounds that a share sitting
 * on the 40 % tier boundary carries a 95 % interval of ±9.6 points there. The
 * arithmetic was right and the rule was wrong, for two reasons.
 *
 * First, tier reliability is a property of a *cell*, not of a panel. Camules
 * carries 88 observations and reads HP 52.5 %, ATK 38.6 %, DEF 8.9 %: the HP
 * tier sits 2.4 standard errors clear of the boundary and DEF is not in doubt
 * at all, so refusing the panel threw away two decided cells because a third
 * was close. Second, the game shows the player those percentages with no
 * caveat, so a page that answers "no statistics" for a monster whose panel is
 * open on the next screen is reporting on itself, not on the game.
 *
 * `ENGRAVING-STATISTICS.md` §5 already owns this question and answers it: an
 * empty panel is not a capture, and anything else is. That rule is binding, it
 * is what `artifact-preferences.ts` follows, and a second competing rule here
 * made the two pages disagree about the same dataset. The sample size is
 * carried on every reading instead, so a caller can show it — which is the
 * point §1 of that document makes about counts against percentages.
 */
export type RelicUsageStatus = 'measured' | 'missing';

function totalCount(rows: readonly EffectCount[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/**
 * The relic panel for one monster type, or `undefined` where the dataset holds
 * nothing usable for it.
 *
 * Both halves must be present. The panel's two distributions are counted over
 * their own totals — the capture records counts and never percentages
 * (`ENGRAVING-STATISTICS.md` §1) — and on 290 of the captured types the two
 * totals differ slightly, so neither may be normalised against the other's sum.
 * A half-empty panel is refused outright: judging a relic on its main while
 * inventing the unique half would be `AGENTS.md` §0.1's third failure, a row
 * that is counted, scored and wrong.
 */
export function relicUsageStatistics(masterId: unknown): RelicUsageStatistics | undefined {
  const key = typeof masterId === 'number' || typeof masterId === 'string'
    ? monsterIdentityId(masterId)
    : null;
  const relics = key === null ? undefined : monsterStatistics[key]?.relics;
  if (!relics) return undefined;

  const primary = relics.primaryEffect ?? [];
  const secondary = relics.secondaryEffect ?? [];
  const mainObservations = totalCount(primary);
  const uniqueObservations = totalCount(secondary);
  if (!mainObservations || !uniqueObservations) return undefined;

  const mainShares: Record<RelicMainProperty, number> = { HP: 0, ATK: 0, DEF: 0 };
  for (const row of primary) {
    const property = relicMainProperties[row.effectId];
    if (property) mainShares[property] = row.count / mainObservations;
  }

  const uniqueShares = new Map<number, number>();
  for (const row of secondary) uniqueShares.set(row.effectId, row.count / uniqueObservations);

  return { mainShares, uniqueShares, mainObservations, uniqueObservations };
}

export function relicUsageStatus(usage: RelicUsageStatistics | undefined): RelicUsageStatus {
  return usage ? 'measured' : 'missing';
}

/**
 * How much evidence a reading rests on — the smaller of the panel's two totals,
 * because the fit uses both halves and the weaker one is what it actually rests
 * on. Shown rather than gated on: a percentage without its sample size is the
 * thing `ENGRAVING-STATISTICS.md` §1 refuses to store, and the same reasoning
 * applies to showing one.
 */
export function relicUsageObservations(usage: RelicUsageStatistics): number {
  return Math.min(usage.mainObservations, usage.uniqueObservations);
}

/** Every monster species whose relic panel is captured, for the verifier. */
export const recordedRelicUsageMonsterIds = Object.keys(monsterStatistics)
  .filter((id) => monsterStatistics[id].relics !== undefined);

/**
 * Every captured panel, which is the population a prior is drawn from
 * (`RELIC-CANONICAL.md` §11.3.1). Each counts once rather than by its size: the
 * prior answers "what does a property earn on an average monster", and weighting
 * by observations would answer "on an average engraving" — which is the same
 * popularity signal §5.2 already distrusts, with the heavily played monsters
 * speaking for the rest.
 */
export function measuredRelicUsagePanels(): RelicUsageStatistics[] {
  const panels: RelicUsageStatistics[] = [];
  for (const masterId of recordedRelicUsageMonsterIds) {
    const usage = relicUsageStatistics(masterId);
    if (usage) panels.push(usage);
  }
  return panels;
}

/**
 * The leading main property on this monster, for the reason line. It is the one
 * figure a reader can check against the game's own panel in one glance, which
 * is what makes the fit column arguable rather than something to take on trust.
 */
export function leadingRelicMain(usage: RelicUsageStatistics): RelicMainProperty {
  return relicMainPropertyOrder.reduce((best, property) =>
    usage.mainShares[property] > usage.mainShares[best] ? property : best);
}
