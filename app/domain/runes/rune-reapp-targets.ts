/**
 * **Which runes are worth a reroll**, described by the user's rules for either
 * of the game's two stones (`RUNE-CANONICAL.md` §9).
 *
 * - **Reappraisal** rerolls all four sub properties and keeps the set, slot, main
 *   and innate. It needs +12, and an Intangible rune cannot be reappraised.
 * - **Refinement** keeps the sub property types and redistributes their values and
 *   power-up levels. It needs +12 and refuses Ancient, Intangible and Gem-converted
 *   runes. The user's rule names the sub-property types and how many must be held.
 *
 * The +12 the game asks for is deliberately not asked here. What a target needs is
 * a rune showing all four of its sub properties — a Legend from +0, any lesser
 * rarity from +12, where its last line is added (`remainingEvents`) — because both questions are about which four types
 * the rune has, and a rune still to show one cannot be answered. It is then kept
 * while it climbs to +12. The game's other rules are applied whatever the target
 * says, because a rune the game will not let through the stone is no target for it.
 *
 * A target is only ever asked of a rune the engine would sell
 * (`withRuneSellProtection`): a reroll is a way out of a sale, never advice for a
 * rune worth powering up or keeping. That is a fixed design decision.
 *
 * Rules are independent alternatives: all requirements within one rule must match,
 * and any rule is enough. Each rule names one stone; refinement is
 * always considered first, regardless of list order.
 */
import { filterIncludes, filterIsUnrestricted } from '../shared/filter-selection';
import { isRecord } from '../profiles/preference-reading';
import { isIntangibleRuneSet, roleRuneSetNameList } from './rune-sets';
import { runeRarities, runeRarityOrder, runeStatIds, runeStatName, slotAllowsSubStat, slotMainProperties } from './runes';
import type { Rune, RuneRarity } from './runes';

export type ReappTarget = {
  enabled: boolean;
  /** The sets a target accepts; empty accepts every set. */
  sets: readonly string[];
  minimumRarity: RuneRarity;
  /** Main property ids; empty accepts every main. */
  mains: readonly number[];
  /** Whether the rune must carry an innate, whichever one it is. */
  requiresInnate: boolean;
};

export type RerollKind = 'reapp' | 'refine';

export const reappSlots = [1, 2, 3, 4, 5, 6] as const;

/** A rune has shown every type it will carry once it holds four sub properties. */
export const showsAllLines = (rune: Rune): boolean => rune.subProperties.length >= 4;

/** Only slots 2, 4 and 6 choose their main, so only they can ask for one. */
export const reappSlotChoosesMain = (slot: number): boolean => slot === 2 || slot === 4 || slot === 6;

/** The mains the game rolls in this slot, in the game's own property order. */
export const reappMainOptions = (slot: number): readonly number[] =>
  reappSlotChoosesMain(slot) ? runeStatIds.filter((id) => slotMainProperties[slot]?.includes(id)) : [];

/** Intangible takes neither stone, so it is not offered. */
export const reappSetOptions: readonly string[] = roleRuneSetNameList;

const defaultMains: Readonly<Record<number, readonly number[]>> = {
  2: [8, 4],
  4: [10, 2],
  6: [2, 4],
};

/* Refinement keeps the types, so it is offered more sets than reappraisal: the
   sets a build is made around, and the two-piece sets worth finishing. */
const refineSets: readonly string[] = reappSetOptions.filter((name) =>
  ['Despair', 'Fight', 'Rage', 'Swift', 'Vampire', 'Violent', 'Will'].includes(name));

function defaultTarget(slot: number, kind: RerollKind): ReappTarget {
  return {
    /* The odd slots carry a fixed flat main and are seldom worth a stone. */
    enabled: reappSlotChoosesMain(slot),
    sets: kind === 'reapp' ? ['Violent'] : refineSets,
    minimumRarity: 'Legend',
    mains: defaultMains[slot] ?? [],
    /* Refinement only redistributes the four lines already there, so the innate
       is no part of what makes a rune worth it. */
    requiresInnate: kind === 'reapp',
  };
}

export function defaultReappTargets(kind: RerollKind = 'reapp'): ReappTarget[] {
  return reappSlots.map((slot) => defaultTarget(slot, kind));
}

/** Whether the game lets this rune through the stone, the +12 aside. */
export function rerollAllowed(rune: Rune, kind: RerollKind): boolean {
  if (isIntangibleRuneSet(rune.setName)) return false;
  /* An Ancient rune passes because Ancient Reappraisal Stones exist for it (RUNE-CANONICAL §9). */
  if (kind === 'reapp') return true;
  return !rune.ancient && !rune.subProperties.some((line) => line.gemmed);
}

export const innateRequirements = ['yes', 'both', 'no'] as const;
export type InnateRequirement = typeof innateRequirements[number];

type RuleConditions = Omit<ReappTarget, 'enabled' | 'requiresInnate'> & {
  id: string;
  innate: InnateRequirement;
  /** Empty means every slot, without selecting the controls for the user. */
  slots: readonly number[];
};

export type RefineRule = RuleConditions & {
  kind: 'refine';
  /** A required pool of wanted types, never an inclusive filter. Innates do not count. */
  substats: readonly number[];
  minimumSubstats: 'all' | number;
};
export type RerollRule = RuleConditions & { kind: 'reapp' } | RefineRule;

export const rerollMainOptions = runeStatIds.filter((id) => reappSlots.some((slot) => slotMainProperties[slot].includes(id)));

export function newRerollRule(id: string, kind: RerollKind = 'reapp'): RerollRule {
  const common = { id, slots: [], sets: [], minimumRarity: 'Legend' as const, mains: [], innate: 'both' as const };
  return kind === 'refine' ? { ...common, kind, substats: [], minimumSubstats: 'all' } : { ...common, kind };
}

/** Keep impossible combinations visible instead of silently changing either choice. */
export function rerollRuleProblems(rule: RerollRule): string[] {
  const unrestrictedMains = filterIsUnrestricted(rule.mains, rerollMainOptions);
  const slots = rule.slots.length === 0 ? reappSlots : rule.slots;
  const blockedSlots = unrestrictedMains ? [] : slots.filter((slot) => !rule.mains.some((main) => slotMainProperties[slot]?.includes(main)));
  const blockedMains = unrestrictedMains ? [] : rule.mains.filter((main) => !slots.some((slot) => slotMainProperties[slot]?.includes(main)));
  const problems: string[] = [];
  if (blockedSlots.length) problems.push(`Slots ${blockedSlots.join(', ')} cannot carry the chosen main stats.`);
  if (blockedMains.length) problems.push('Some chosen main stats are unavailable in these slots.');
  if (rule.kind !== 'refine') return problems;
  if (rule.substats.length === 0) {
    problems.push('Choose at least one substat for refinement.');
    return problems;
  }
  const minimum = rule.minimumSubstats === 'all' ? rule.substats.length : rule.minimumSubstats;
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > rule.substats.length
    || (rule.minimumSubstats !== 'all' && minimum === rule.substats.length)) {
    problems.push('Choose All or a minimum below the number of chosen substats.');
    return problems;
  }
  if (minimum > 4) {
    problems.push('A rune has only four substats. Choose a minimum of four or fewer.');
    return problems;
  }
  const pairs = slots.flatMap((slot) => slotMainProperties[slot]
    .filter((main) => unrestrictedMains || rule.mains.includes(main))
    .map((main) => ({ slot, main })));
  const possible = (slot: number, main: number, substat: number) => main !== substat && slotAllowsSubStat(slot, substat);
  const blockedPairs = pairs.filter(({ slot, main }) => rule.substats.filter((stat) => possible(slot, main, stat)).length < minimum);
  if (blockedPairs.length) {
    const examples = blockedPairs.slice(0, 3).map(({ slot, main }) => `slot ${slot} / ${runeStatName(main)}`).join(', ');
    problems.push(`The substat minimum cannot be met for ${examples}${blockedPairs.length > 3 ? ' and other combinations' : ''}. Main stats cannot repeat as substats, and slot restrictions still apply.`);
  }
  return problems;
}

function rulesFromSlots(targets: readonly ReappTarget[], kind: RerollKind): RerollRule[] {
  return targets.flatMap(({ enabled, requiresInnate, ...target }, at) => enabled ? [{
    ...newRerollRule(`${kind}-${at + 1}`, kind), ...target,
    slots: [at + 1], innate: requiresInnate ? 'yes' as const : 'both' as const,
  }] : []);
}

export function defaultRerollRules(): RerollRule[] {
  return (['reapp', 'refine'] as const).flatMap((kind) => rulesFromSlots(defaultReappTargets(kind), kind));
}

/** Whether any rule of this kind describes the rune. */
export function isRerollTarget(rune: Rune, rules: readonly RerollRule[], kind: RerollKind): boolean {
  if (!rerollAllowed(rune, kind) || !showsAllLines(rune)) return false;
  return rules.some((rule) => rule.kind === kind
    && rerollRuleProblems(rule).length === 0
    && filterIncludes(rule.slots, rune.slot, reappSlots)
    && filterIncludes(rule.sets, rune.setName, reappSetOptions)
    && runeRarityOrder(rune.rarity) >= runeRarityOrder(rule.minimumRarity)
    && filterIncludes(rule.mains, rune.mainStatId, rerollMainOptions)
    && (rule.innate === 'both' || (rune.prefixStatId !== null) === (rule.innate === 'yes'))
    && (rule.kind !== 'refine' || rule.substats.filter((stat) => rune.subProperties.some((line) => line.statId === stat)).length
      >= (rule.minimumSubstats === 'all' ? rule.substats.length : rule.minimumSubstats)));
}

/** One damaged field costs only that field; an empty list remains deliberately empty. */
export function readRerollRules(value: unknown): RerollRule[] {
  if (!Array.isArray(value)) return defaultRerollRules();
  const ids = new Set<string>();
  return value.flatMap((entry) => {
    // Removing the switch must not activate a rule the user had switched off.
    if (!isRecord(entry) || entry.enabled === false) return [];
    function uniqueId(preferred: unknown): string {
      const id = typeof preferred === 'string' && preferred.trim() && !ids.has(preferred) ? preferred : crypto.randomUUID();
      ids.add(id);
      return id;
    }
    const id = uniqueId(entry.id);
    const blank = newRerollRule(id);
    // Both stones used to share one rule. Preserve each question as its own rule.
    const kinds: readonly RerollKind[] = entry.kind === 'both' ? ['reapp', 'refine']
      : [entry.kind === 'reapp' || entry.kind === 'refine' ? entry.kind : blank.kind];
    const innate: InnateRequirement = 'innate' in entry
      ? innateRequirements.includes(entry.innate as InnateRequirement) ? entry.innate as InnateRequirement : blank.innate
      : typeof entry.requiresInnate === 'boolean' ? entry.requiresInnate ? 'yes' : 'both' : blank.innate;
    return kinds.map((kind, at): RerollRule => ({
      id: at === 0 ? id : uniqueId(`${id}:refine`),
      innate,
      slots: isListOf(entry.slots, reappSlots) ? entry.slots : blank.slots,
      sets: isListOf(entry.sets, reappSetOptions) ? entry.sets : blank.sets,
      minimumRarity: runeRarities.includes(entry.minimumRarity as RuneRarity) ? entry.minimumRarity as RuneRarity : blank.minimumRarity,
      mains: isListOf(entry.mains, rerollMainOptions) ? entry.mains : blank.mains,
      ...(kind === 'refine' ? {
        kind,
        substats: isListOf(entry.substats, runeStatIds) ? entry.substats : [],
        minimumSubstats: entry.minimumSubstats === 'all' || (typeof entry.minimumSubstats === 'number'
          && Number.isInteger(entry.minimumSubstats) && entry.minimumSubstats >= 1 && entry.minimumSubstats < runeStatIds.length)
          ? entry.minimumSubstats : 'all',
      } : { kind }),
    }));
  });
}

/** The developer's saved slot choices survive this redesign; only rules are written. */
export function readStoredRerollRules(settings: unknown): RerollRule[] {
  if (!isRecord(settings)) return defaultRerollRules();
  if ('rerollRules' in settings) return readRerollRules(settings.rerollRules);
  if (!('reappTargets' in settings) && !('refineTargets' in settings)) return defaultRerollRules();
  return (['reapp', 'refine'] as const).flatMap((kind) => rulesFromSlots(
    readReappTargets(settings[kind === 'reapp' ? 'reappTargets' : 'refineTargets'], kind), kind,
  ));
}

function isListOf<T>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((entry) => allowed.includes(entry as T))
    && new Set(value).size === value.length;
}

/* Field by field, so one value the contract no longer accepts costs only that
   value (`preference-reading.ts`). */
function readTarget(value: unknown, slot: number, kind: RerollKind): ReappTarget {
  const blank = defaultTarget(slot, kind);
  if (!isRecord(value)) return blank;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : blank.enabled,
    sets: isListOf(value.sets, reappSetOptions) ? value.sets : blank.sets,
    minimumRarity: runeRarities.includes(value.minimumRarity as RuneRarity) ? value.minimumRarity as RuneRarity : blank.minimumRarity,
    mains: isListOf(value.mains, reappMainOptions(slot)) ? value.mains : blank.mains,
    requiresInnate: typeof value.requiresInnate === 'boolean' ? value.requiresInnate : blank.requiresInnate,
  };
}

/** The stored six of one kind, slot by slot. Missing or invalid entries default independently. */
export function readReappTargets(value: unknown, kind: RerollKind = 'reapp'): ReappTarget[] {
  const stored = Array.isArray(value) ? value : [];
  return reappSlots.map((slot, at) => readTarget(stored[at], slot, kind));
}
