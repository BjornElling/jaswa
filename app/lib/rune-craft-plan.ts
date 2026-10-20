/**
 * Where one gem or grindstone is best spent.
 *
 * The rules are the game's, from `docs/RUNE-CANONICAL.md` §5, §7, §8 and §10,
 * and nothing here relaxes one to make a row appear. What an item is *worth* on
 * a rune is a different question, and the answer to it is provisional — see
 * `provisionalRuneScore` below, which is the one seam the real scorer replaces.
 */
import { mainPropertyMaximum, maximumRoll, scalesWithBase, subPropertyTargetStat } from './rune-properties';
import type { RuneRole } from './rune-roles';
import { runeMainStatIds } from './rune-roles';
import { craftItemRoll } from './rune-craft-end-state';
import type { CraftItem, CraftRollAssumption } from './rune-craft-items';
import type { ItemGrade } from './types';
import { gemMinimumLevel, isPercentStat, runeLineValue, runeSubValue, slotAllowsSubStat } from './runes';
import type { Rune, RuneSubProperty } from './runes';

/**
 * Why an item cannot be spent on a rune, ordered by how close the rune came.
 *
 * The order is the point. An item that fits nothing is told about once, in one
 * line, and that line should name the last thing that stopped it rather than
 * the first — "no Violent rune has SPD left to grind" is a fact the user can
 * act on, where "no Violent rune" would be simply false.
 */
export const craftBlockOrder = ['set', 'level', 'slot', 'duplicate', 'target'] as const;
export type CraftBlock = typeof craftBlockOrder[number];

/** One legal way to spend an item on a rune: which sub property it lands on. */
export type CraftTarget = {
  /** Index into the rune's own `subProperties`. */
  index: number;
  property: RuneSubProperty;
};

export type CraftFit =
  | { fits: true; targets: CraftTarget[] }
  | { fits: false; block: CraftBlock };

/**
 * Whether the item's lineage lets it touch this rune at all (§8, *Which runes an
 * item may go on*).
 *
 * Ancient runes and ordinary runes each take their own items, and §8 is
 * explicit that an ordinary gem is not a permitted fallback on an Ancient rune.
 * Intangible needs no clause of its own: it is a set like any other here, so an
 * Intangible item matches it by set and an Immemorial one by belonging to none,
 * which is exactly the pair §8 allows it.
 */
export function lineageFits(item: CraftItem, rune: Pick<Rune, 'ancient' | 'setId'>): boolean {
  /* Immemorial is the only item that belongs to no set, and the only one whose
     match is the lineage alone. An Ancient item still names a set in its own
     id, so Ancient is a second condition on top of the set — not a replacement
     for it. Read as a replacement, an Ancient Violent gem offered itself to
     every Ancient rune in the account.

     An Immemorial item is refused on an Ancient rune. No published source states
     it, but the user confirmed it in play (October 2026): an Ancient rune takes
     Ancient items and nothing else, Immemorial included. */
  if (item.lineage === 'immemorial') return !rune.ancient;
  if (rune.ancient !== (item.lineage === 'ancient')) return false;
  return item.setId === rune.setId;
}

/**
 * Every legal way to spend one item on one rune, or the reason there is none.
 *
 * A gem replaces one existing sub property, so its target is any sub property
 * whose *other* three do not already carry the gem's stat — which means a rune
 * that already has the stat has exactly one legal target: that property itself,
 * re-rolled, keeping its grindstone. A rune already carrying a converted line
 * offers that line alone. A grindstone instead adds to a property of its own stat, and may
 * only be spent where its ceiling can beat the bonus already sitting there.
 */
export function craftItemFit(item: CraftItem, rune: Rune): CraftFit {
  if (!lineageFits(item, rune)) return { fits: false, block: 'set' };

  if (item.kind === 'grindstone') {
    const targets = rune.subProperties
      .map((property, index) => ({ index, property }))
      .filter(({ property }) => property.statId === item.statId
        /* §8: a second grindstone is only allowed where it could beat the bonus
           already applied. `CraftItem` supplies the verified ordinary or Ancient
           ceiling for that exact item. */
        && (item.range === undefined || property.grind < item.range.maximum));
    return targets.length ? { fits: true, targets } : { fits: false, block: 'target' };
  }

  if (rune.level < gemMinimumLevel) return { fits: false, block: 'level' };
  if (!slotAllowsSubStat(rune.slot, item.statId)) return { fits: false, block: 'slot' };
  if (item.statId === rune.mainStatId || item.statId === rune.prefixStatId) {
    return { fits: false, block: 'duplicate' };
  }
  if (!rune.subProperties.length) return { fits: false, block: 'target' };

  /* §8: one converted line at a time, so a rune that already carries one offers
     only that line to a further Gem. */
  const converted = rune.subProperties.findIndex((property) => property.gemmed);
  const targets = rune.subProperties
    .map((property, index) => ({ index, property }))
    .filter(({ index }) => (converted === -1 || index === converted) && rune.subProperties
      .every((other, otherIndex) => otherIndex === index || other.statId !== item.statId));
  return targets.length ? { fits: true, targets } : { fits: false, block: 'duplicate' };
}

/**
 * ————— PROVISIONAL —————
 *
 * What a rune is worth. Rune scoring against a role is not built yet, so this
 * stands in for it: SWOP's published rune efficiency, which reads the main
 * property, the innate and every sub property with its grindstone bonus
 * included. It is therefore a real reading and it does move when a gem or a
 * grindstone lands — but it is *role-blind*, and the role a user chooses
 * currently narrows which runes are offered rather than changing this figure.
 *
 * Every view that reports a score goes through this one function, so the real
 * scorer replaces one body and no table has to be found and corrected. Anything
 * on screen that quotes it says it is provisional.
 *
 * SWOP's arithmetic, read off JASWA's own tables rather than a copy of them: the
 * main property as a share of the six-star one at `+15`, each line as a share of
 * five six-star maximum rolls — a line that took every upgrade — with a flat HP,
 * ATK or DEF line counted at half, and the sum over 2.8.
 */
export function provisionalRuneScore(rune: Rune): number | null {
  const main = mainPropertyMaximum(rune.stars, rune.mainStatId);
  const sixStarMain = mainPropertyMaximum(6, rune.mainStatId);
  if (!main || !sixStarMain) return null;
  const lines: (readonly [statId: number, value: number])[] = rune.subProperties
    .map((property) => [property.statId, runeSubValue(property)] as const);
  if (rune.prefixStatId !== null) lines.push([rune.prefixStatId, rune.prefixValue]);
  let ratio = main / sixStarMain;
  for (const [statId, value] of lines) {
    const fullLine = 5 * maximumRoll(statId, 6);
    if (!fullLine) return null;
    ratio += (countsAtHalf(statId) ? value * 0.5 : value) / fullLine;
  }
  return ratio / 2.8 * 100;
}

/** SWOP halves a flat line of a stat that scales with the monster's base: HP +, ATK +, DEF +. */
function countsAtHalf(statId: number): boolean {
  const stat = subPropertyTargetStat[statId];
  return stat !== undefined && scalesWithBase(stat) && !isPercentStat(statId);
}

/** The rune as it would stand once the item — and any follow-up grind — landed. */
function withCraftApplied(
  rune: Rune, item: CraftItem, target: CraftTarget, rolled: number, grindAfter: number | null,
): Rune {
  const subProperties = rune.subProperties.map((property, index) => {
    if (index !== target.index) return property;
    if (item.kind === 'grindstone') {
      /* §8: a later stone replaces the bonus rather than stacking on it, and
         only when it lands higher — which the target filter has already
         guaranteed is possible, not that it happened. */
      return { ...property, grind: Math.max(property.grind, rolled) };
    }
    /* §8: the replaced stat's power-up rolls do not follow the new one, and a
       grindstone bonus belongs to the stat it was spent on, so the converted
       property starts from the gem's value alone.

       A re-Gem keeps a Grind only when it keeps the same effect id. A converted
       line loses its old Grind; `grindAfter` is a separately chosen legal follow-up. */
    const carriedGrind = item.statId === target.property.statId ? target.property.grind : 0;
    return { statId: item.statId, value: rolled, gemmed: true,
      grind: grindAfter === null ? carriedGrind : Math.max(carriedGrind, grindAfter) };
  });
  return { ...rune, subProperties };
}

/** One rune, judged for one item: what it is worth now and afterwards. */
export type CraftCandidate = {
  rune: Rune;
  /** The sub property the item lands on — the best of the legal ones. */
  target: CraftTarget;
  /** What the target reads today, for the row to show what is being given up. */
  replaced: RuneSubProperty;
  /**
   * What that same property would read afterwards, or `null` where no roll can
   * be assumed. Carried on the candidate rather than rebuilt in the table, so
   * the figure a row prints is the one the score was calculated from.
   */
  result: RuneSubProperty | null;
  /** What the item is assumed to roll, or `null` where no range is verified. */
  rolled: number | null;
  /** The follow-up grindstone's roll, when one was asked for and is possible. */
  grindAfter: number | null;
  scoreNow: number | null;
  scoreAfter: number | null;
  /** `scoreAfter − scoreNow`, or `null` where either end could not be read. */
  gain: number | null;
};

/**
 * What a candidate is ranked on: the score once the item lands, or — where no
 * roll could be assumed and there is nothing to project — what the rune is
 * worth today.
 *
 * The fallback is what makes an Ancient item's list an answer rather than the
 * import's own order. Stated once here so the pre-sort and the sortable column
 * that follows it cannot disagree about what "highest" meant.
 */
export function craftLandingScore(candidate: CraftCandidate): number | null {
  return candidate.scoreAfter ?? candidate.scoreNow;
}

export type CraftPlanOptions = {
  /**
   * Grind the gemmed property afterwards, at this grade's range. `null` leaves
   * the gem standing on its own, which is what a grindstone item always does.
   */
  grindAfter: { grade: ItemGrade } | null;
  roll: CraftRollAssumption;
};

/**
 * The best way to spend one item on one rune.
 *
 * A rune usually offers several legal targets, and the user is not choosing
 * between them — the game lets them pick, and they would pick the best one. So
 * the candidate reports the target that leaves the rune highest, and names it,
 * rather than averaging over targets the user would never take.
 */
export function craftCandidate(
  item: CraftItem, rune: Rune, options: CraftPlanOptions,
): CraftCandidate | null {
  const fit = craftItemFit(item, rune);
  if (!fit.fits) return null;
  const scoreNow = provisionalRuneScore(rune);
  const rolled = craftItemRoll(item.kind, item.lineage, item.statId, item.grade, options.roll);

  /* No verified range means no projection, but the rune is still a place the
     item can legally go — so it is reported with the figures it has. */
  if (rolled === null) {
    const target = fit.targets[0];
    return {
      rune, target, replaced: target.property, result: null, rolled: null, grindAfter: null,
      scoreNow, scoreAfter: null, gain: null,
    };
  }

  /* A follow-up stone is only a question for a Gem, and `craftItemRoll` is what knows
     it cannot land on CRI Rate, CRI Dmg, Resistance or Accuracy — so the legality is
     not restated here. */
  const grindAfter = item.kind === 'gem' && options.grindAfter !== null
    ? craftItemRoll('grindstone', item.lineage, item.statId, options.grindAfter.grade, options.roll)
    : null;

  let best: CraftCandidate | null = null;
  for (const target of fit.targets) {
    const projected = withCraftApplied(rune, item, target, rolled, grindAfter);
    const scoreAfter = provisionalRuneScore(projected);
    const candidate: CraftCandidate = {
      rune,
      target,
      replaced: target.property,
      result: projected.subProperties[target.index] ?? null,
      rolled,
      grindAfter,
      scoreNow,
      scoreAfter,
      gain: scoreAfter === null || scoreNow === null ? null : scoreAfter - scoreNow,
    };
    if (best === null || (scoreAfter ?? -Infinity) > (best.scoreAfter ?? -Infinity)) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------ role scope */

const slotChoiceKeys = { 2: 'slot2', 4: 'slot4', 6: 'slot6' } as const;

/**
 * Whether a role would have this rune at all.
 *
 * Only the two things a role actually states about a rune are read: the sets
 * the role is built on, and the main stats it accepts in the three slots that
 * carry a choice. Preferred and acceptable count alike here — narrowing a list
 * of candidates is not the place to re-litigate which of the two a role prefers,
 * and a role that names neither narrows nothing.
 */
export function roleWantsRune(role: RuneRole, rune: Rune): boolean {
  const sets = [...role.sets.preferred, ...role.sets.acceptable];
  /* Intangible is deliberately absent from the role vocabulary — it completes
     a set rather than being one — so a role can never name it and it is
     judged by the set it is standing in for rather than excluded outright. */
  if (sets.length && rune.setName !== 'Intangible' && !sets.includes(rune.setName)) return false;

  const key = slotChoiceKeys[rune.slot as 2 | 4 | 6];
  if (!key) return true;
  const choice = role.slots[key];
  const mains = [...choice.preferred, ...choice.acceptable];
  if (!mains.length) return true;
  return mains.some((stat) => runeMainStatIds[stat] === rune.mainStatId);
}

/* -------------------------------------------------------------- inventory */

/** How much of the account one item can reach, and why it reaches no further. */
export type CraftReach = {
  /** Runes the item can legally be spent on. */
  fits: number;
  /**
   * How many of those are engraved nowhere — on no monster in Scenario and in
   * no preset (`DECK-PRESETS.md` §1), since crafting one changes it in each.
   *
   * The split is the difference between an item that can be spent this evening
   * and one that costs a monster its build first, which is the fact a box list
   * of eight hundred stacks is otherwise silent about.
   */
  spare: number;
  /** The nearest miss across every rune, where nothing fits at all. */
  block: CraftBlock | null;
};

/**
 * How far each item reaches across the account's runes.
 *
 * Always every rune, whatever the table above is filtered to. A filter narrows
 * what a page shows and never what it computes (`AGENTS.md` §6), and this
 * figure is the one that says whether a stack is worth keeping — it cannot mean
 * two different things depending on which chip is pressed.
 *
 * Runes are indexed by set first, because every item but the Immemorial one
 * names a set and can never reach past it, and scanning the whole box for each
 * of several hundred stacks is work with a known answer.
 */
export function craftReach(items: readonly CraftItem[], runes: readonly Rune[], engraved: { has(runeId: string): boolean }): Map<string, CraftReach> {
  const bySet = new Map<number, Rune[]>();
  const ordinary: Rune[] = [];
  for (const rune of runes) {
    const set = bySet.get(rune.setId);
    if (set) set.push(rune); else bySet.set(rune.setId, [rune]);
    if (!rune.ancient) ordinary.push(rune);
  }

  const reach = new Map<string, CraftReach>();
  for (const item of items) {
    const scope = item.setId === null ? ordinary : bySet.get(item.setId) ?? [];
    let fits = 0;
    let spare = 0;
    let nearest = -1;
    for (const rune of scope) {
      const fit = craftItemFit(item, rune);
      if (!fit.fits) {
        nearest = Math.max(nearest, craftBlockOrder.indexOf(fit.block));
        continue;
      }
      fits += 1;
      if (!engraved.has(rune.id)) spare += 1;
    }
    reach.set(item.id, {
      fits,
      spare,
      block: fits > 0 ? null : craftBlockOrder[nearest] ?? 'set',
    });
  }
  return reach;
}

/** What the item's own reach is measured over, said in the fewest words. */
export function craftScopeWord(item: CraftItem): string {
  if (item.lineage === 'ancient') return `Ancient ${item.setName ?? ''}`.trim();
  return item.setName ?? '';
}

/** One line saying why an item has nowhere to go. */
export function craftBlockReason(item: CraftItem, block: CraftBlock): string {
  const scope = craftScopeWord(item);
  const runes = scope ? `${scope} rune` : 'rune';
  switch (block) {
    case 'set': return `You own no ${runes}`;
    case 'level': return `No ${runes} has reached +${gemMinimumLevel}`;
    case 'slot': return `No ${runes} sits in a slot that can carry ${item.statName}`;
    case 'duplicate': return `Every ${runes} already carries ${item.statName}`;
    case 'target': return item.kind === 'gem'
      ? `No ${runes} has a sub property to replace`
      : `No ${runes} has ${item.statName} this stone could improve`;
  }
}

/** What a sub property reads, grindstone bonus included, as the game shows it. */
export function subPropertyText(property: RuneSubProperty, format: (value: number) => string): string {
  return runeLineValue(property.statId, runeSubValue(property), format);
}
