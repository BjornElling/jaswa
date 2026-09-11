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
 * on a tier boundary carries a 95 % interval of ±9.6 points there. The
 * arithmetic was right and the rule was wrong, for two reasons.
 *
 * First, reliability is a property of a *cell*, not of a panel. Camules
 * carries 88 observations and reads HP 52.5 %, ATK 38.6 %, DEF 8.9 %: the HP
 * reading sits 2.4 standard errors clear of the old boundary and DEF is not in
 * doubt at all, so refusing the panel threw away two decided cells because a
 * third was close. Second, the game shows the player those percentages with no
 * caveat, so a page that answers "no statistics" for a monster whose panel is
 * open on the next screen is reporting on itself, not on the game.
 *
 * `ENGRAVING-STATISTICS.md` §5 already owns this question and answers it: an
 * empty panel is not a capture, and anything else is. That rule is binding, it
 * is what `artifact-preferences.ts` follows, and a second competing rule here
 * made the two pages disagree about the same dataset.
 *
 * **Neither is the size ignored, and that is the newer half of the answer.**
 * Showing `n` to the reader solved the reader's problem and left the model's
 * untouched: 30 % of 30 engravings and 30 % of 60,000 produced exactly the same
 * credit. `relicShrunkShares` now weighs every panel against the population by
 * its own size, so this status says which *kind* of reading a row rests on
 * rather than whether the reading was allowed at all.
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

export type RelicPopulationShares = {
  main: Record<RelicMainProperty, number>;
  unique: Map<number, number>;
};

let cachedPopulation: RelicPopulationShares | null = null;

/**
 * What the average captured monster's two distributions look like.
 *
 * **This is a prior over shares, and it used to be a prior over credits.** The
 * difference matters: a credit is already a judgement, so averaging credits
 * baked the old tier cuts into the fallback and left the fallback unable to
 * serve any other purpose. Shares compose — they can be mixed with a monster's
 * own counts in proportion to how many of them there are, which is what
 * `relicShrunkShares` does and what makes the unmeasured monster the `n = 0`
 * case of the measured one rather than a second code path.
 *
 * Computed from the dataset on first use, so a capture session moves it and no
 * constant here can go stale. On the current capture the mains read HP 54.3 %,
 * ATK 35.7 %, DEF 10.0 %, and the uniques are led by Nimble Primal at 38.9 %
 * against a 6.25 % uniform share — a fact `RELIC-CANONICAL.md` §11.3 treats as
 * a finding about the population rather than as information about any one
 * monster.
 *
 * A fresh checkout with no captures at all falls back to a flat distribution,
 * which keeps every share positive and the credit curve defined rather than
 * dividing by a zero leader.
 */
export function relicPopulationShares(): RelicPopulationShares {
  if (cachedPopulation) return cachedPopulation;
  const panels = measuredRelicUsagePanels();
  const main: Record<RelicMainProperty, number> = { HP: 0, ATK: 0, DEF: 0 };
  const unique = new Map<number, number>();
  for (const panel of panels) {
    for (const property of relicMainPropertyOrder) main[property] += panel.mainShares[property];
    for (const [id, share] of panel.uniqueShares) unique.set(id, (unique.get(id) ?? 0) + share);
  }
  const uniqueIds = [...new Set([...unique.keys(), ...Array.from({ length: 16 }, (_, at) => at + 1)])];
  cachedPopulation = panels.length
    ? {
      main: {
        HP: main.HP / panels.length,
        ATK: main.ATK / panels.length,
        DEF: main.DEF / panels.length,
      },
      unique: new Map(uniqueIds.map((id) => [id, (unique.get(id) ?? 0) / panels.length])),
    }
    : {
      main: { HP: 1 / 3, ATK: 1 / 3, DEF: 1 / 3 },
      unique: new Map(uniqueIds.map((id) => [id, 1 / uniqueIds.length])),
    };
  return cachedPopulation;
}

/**
 * How many observations a panel must carry before it outweighs the population
 * it is drawn from.
 *
 * **It is the sample size the abandoned gate named**, and deliberately so. That
 * gate was right that a panel of about a hundred engravings is roughly as
 * informative as knowing nothing in particular about the monster, and wrong only
 * in what it did about it: refusing the panel discards the cells that panel
 * decides, while weighing it half against the population keeps them and moves
 * the undecided ones toward the average. A panel of 88 engravings reading HP
 * 52.5 % comes out at 53.2 %; a panel of 69,590 does not move at all.
 */
export const relicUsageShrinkage = 100;

/**
 * A monster's two distributions, each pulled toward the population by an amount
 * that depends only on how much the panel actually saw.
 *
 * ```
 * p̂(x | m) = (count(x, m) + λ·p₀(x)) / (n(m) + λ)
 * ```
 *
 * **The unmeasured monster is `n = 0` and needs no rule of its own.** That is
 * the whole reason the fallback is written here rather than beside the fit: a
 * separate branch for "no panel" is a second model, and two models disagree
 * eventually. `RELIC-CANONICAL.md` §11.3.1 records the disagreement the old one
 * produced — an unmeasured monster outscoring a measured one that favoured the
 * same relic.
 *
 * Counts are reconstructed from the stored shares and totals rather than read
 * again, because the two halves are counted over their own totals and must stay
 * that way (`ENGRAVING-STATISTICS.md` §1).
 */
export function relicShrunkShares(
  usage: RelicUsageStatistics | undefined,
  lambda = relicUsageShrinkage,
): RelicPopulationShares {
  const population = relicPopulationShares();
  if (!usage) return population;
  const mainTotal = usage.mainObservations + lambda;
  const uniqueTotal = usage.uniqueObservations + lambda;
  const main = {} as Record<RelicMainProperty, number>;
  for (const property of relicMainPropertyOrder) {
    main[property] = (usage.mainShares[property] * usage.mainObservations
      + lambda * population.main[property]) / mainTotal;
  }
  const unique = new Map<number, number>();
  for (const [id, prior] of population.unique) {
    unique.set(id, ((usage.uniqueShares.get(id) ?? 0) * usage.uniqueObservations
      + lambda * prior) / uniqueTotal);
  }
  /* A property the population has never recorded but this monster has still
     carries its own evidence, and nothing to shrink it toward but zero. */
  for (const [id, share] of usage.uniqueShares) {
    if (!unique.has(id)) unique.set(id, share * usage.uniqueObservations / uniqueTotal);
  }
  return { main, unique };
}

