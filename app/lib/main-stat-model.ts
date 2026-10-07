import type { ArtifactMainProperty } from './artifact-properties';
import { artifactMainPropertyOrder, artifactMainValue } from './artifact-properties';
import type { GameRecord } from './game-data';
import { monsterDefaults } from './monster-defaults';
import type { BandedChoices, MonsterCopyPreferences } from './monster-preferences';
import { statedBand } from './monster-preferences';
import { effectSlot, monsterBaseStats, monsterEffects } from './monster-stats';
import { relicMainPercent, relicMaximumLevel } from './relic-properties';
import { mainPropertyMaximum } from './rune-properties';

/**
 * **Which main stat a copy's gear should carry, worked out rather than polled.**
 *
 * `docs/MAIN-STAT-MODEL.md` is binding. In short: the stat the runes have to lift
 * furthest above base is the one hardest to reach, so a main that takes some of
 * that lift off the runes is the main worth most. This module is the only place
 * that judgement is made. The overlay's defaults, the artifact scorer (both of
 * its readers), the relic plan and the overlay's advice mark all read it here, so
 * no page can come to a second opinion about what a monster needs.
 *
 * The answer is in two steps, kept apart because the second differs by piece:
 *
 * 1. **The need** — what HP, ATK and DEF are lifted by, in percent of base, from
 *    the first source that can say: the copy's six runes, else its stat targets,
 *    else the game's rune statistics for its species.
 * 2. **The worth of each main on each piece** — the need times how much of that
 *    stat the piece's main supplies, in the same percent of base. A relic's main is
 *    a percentage, the same for all three, so its answer is the need's own order;
 *    an artifact's is a fixed amount, worth more on a stat with a small base.
 */

export type MainStat = ArtifactMainProperty;
export type MainStatBand = 'preferred' | 'acceptable' | 'unwanted';
export type GearKind = 'artifact' | 'relic';

/** Where a need was read from, in the order the sources are tried. */
export type MainStatBasis = 'runes' | 'targets' | 'statistics';

export type MainStatNeed = {
  basis: MainStatBasis;
  /** How far above base each stat is lifted, in percent of base. Never negative. */
  need: Record<MainStat, number>;
};

export type GearMainAdvice = {
  bands: Record<MainStat, MainStatBand>;
  /** Each main's share of the piece's summed worth, for ordering and for the reading. */
  worth: Record<MainStat, number>;
};

export type MainStatAdvice = MainStatNeed & Record<GearKind, GearMainAdvice>;

/**
 * The two cuts, each a share of the best main's worth. The best main is always at
 * 100 %, so every answer has at least one preferred main.
 *
 * - **80 % for preferred.** One six-star sub roll is 5–8 % of base, and a need
 *   measured off worn runes moves by a roll or two with every rune swapped; two
 *   needs within a fifth of each other are a tie inside that noise, and a tie is
 *   two preferred mains rather than a coin toss.
 * - **50 % for acceptable.** A main worth half the best one still takes real work
 *   off the runes; below half it is a concession the copy should not be offered
 *   unasked.
 */
export const mainStatCuts = { preferred: 0.8, acceptable: 0.5 } as const;

type RecordLike = Record<string, unknown>;

function records(value: unknown): RecordLike[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is RecordLike => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

/* Slots 1, 3 and 5 carry a fixed flat main whatever the build is for, so it
   says nothing about what the runes were chosen to lift. */
const fixedMainSlots: ReadonlySet<number> = new Set([1, 3, 5]);

/* The fixed mains at +15 on a six-star rune, by the stat they lift. A target is
   a whole-monster figure, and these three are already in it whatever runes reach
   it. */
const fixedMainValues: Record<MainStat, number> = {
  HP: mainPropertyMaximum(6, 1), ATK: mainPropertyMaximum(6, 3), DEF: mainPropertyMaximum(6, 5),
};

const leadFields: Record<MainStat, 'hpLead' | 'atkLead' | 'defLead'> = { HP: 'hpLead', ATK: 'atkLead', DEF: 'defLead' };
const targetFields: Record<MainStat, 'hp' | 'atk' | 'def'> = { HP: 'hp', ATK: 'atk', DEF: 'def' };

type BaseStats = Record<MainStat, number>;

function baseStatsOf(monster: GameRecord): BaseStats | undefined {
  const base = monsterBaseStats(monster);
  const stats = { HP: base[0], ATK: base[1], DEF: base[2] };
  return Object.values(stats).every((value) => Number.isFinite(value) && value > 0) ? stats : undefined;
}

const hasNeed = (need: Record<MainStat, number>) => artifactMainPropertyOrder.some((stat) => need[stat] > 0);

/** Six runes, one in each slot: a finished build, which is what a need is read off. */
export function wearsFullRuneBuild(monster: GameRecord): boolean {
  const runes = records(monster.runes);
  const slots = new Set(runes.map((rune) => Number(rune.slot_no)));
  return runes.length === 6 && [1, 2, 3, 4, 5, 6].every((slot) => slots.has(slot));
}

/* Everything the six runes add, sets and grinds included, except the three fixed
   mains. A flat line is a real part of the build and is counted against this
   copy's own base. */
function runeNeed(monster: GameRecord, base: BaseStats): Record<MainStat, number> | undefined {
  if (!wearsFullRuneBuild(monster)) return undefined;
  const runes = records(monster.runes).map((rune) =>
    (fixedMainSlots.has(Number(rune.slot_no)) ? { ...rune, pri_eff: undefined } : rune));
  const effects = monsterEffects({ runes });
  const need = {
    HP: effects[effectSlot.hpPercent] + effects[effectSlot.hpFlat] / base.HP * 100,
    ATK: effects[effectSlot.atkPercent] + effects[effectSlot.atkFlat] / base.ATK * 100,
    DEF: effects[effectSlot.defPercent] + effects[effectSlot.defFlat] / base.DEF * 100,
  };
  for (const stat of artifactMainPropertyOrder) need[stat] = Math.max(0, need[stat]);
  return hasNeed(need) ? need : undefined;
}

/*
 * A stated floor for HP, ATK or DEF, less what the base, the fixed mains and the
 * copy's own lead already supply. A stat left without a floor is one this copy
 * does not aim at (`AGENTS.md` §3), so it needs nothing. Composite targets are not
 * read: an E.HP can be reached through HP or DEF, and splitting it between them
 * would be a guess.
 */
function targetNeed(base: BaseStats, stated: MonsterCopyPreferences | undefined): Record<MainStat, number> | undefined {
  const targets = stated?.statTargets;
  if (!targets || artifactMainPropertyOrder.every((stat) => targets[targetFields[stat]] === undefined)) return undefined;
  const need = { HP: 0, ATK: 0, DEF: 0 };
  for (const stat of artifactMainPropertyOrder) {
    const target = targets[targetFields[stat]];
    if (target === undefined) continue;
    const lift = (target - fixedMainValues[stat]) / base[stat] * 100 - 100 - (stated?.[leadFields[stat]] ?? 0);
    need[stat] = Math.max(0, lift);
  }
  return hasNeed(need) ? need : undefined;
}

function statisticsNeed(masterId: unknown): Record<MainStat, number> | undefined {
  return monsterDefaults(masterId)?.runes?.mainStatNeed;
}

/**
 * What one owned copy's runes have to lift, from the first source that can say.
 * `undefined` where none can: no finished build, no floor on HP, ATK or DEF, and a
 * species the statistics never captured.
 */
export function copyMainStatNeed(
  monster: GameRecord, stated: MonsterCopyPreferences | undefined,
): MainStatNeed | undefined {
  const base = baseStatsOf(monster);
  if (base !== undefined) {
    const runes = runeNeed(monster, base);
    if (runes !== undefined) return { basis: 'runes', need: runes };
    const targets = targetNeed(base, stated);
    if (targets !== undefined) return { basis: 'targets', need: targets };
  }
  const statistics = statisticsNeed(monster.unit_master_id);
  return statistics === undefined ? undefined : { basis: 'statistics', need: statistics };
}

/* What a piece's main supplies, in percent of base. Without a base an
   artifact's fixed amount cannot be put on that scale, and the three are taken
   as equal — the one assumption a species-level answer has to make. */
function relief(kind: GearKind, base: BaseStats | undefined): Record<MainStat, number> {
  if (kind === 'relic' || base === undefined) {
    const percent = relicMainPercent(relicMaximumLevel);
    return { HP: percent, ATK: percent, DEF: percent };
  }
  return {
    HP: artifactMainValue.HP / base.HP * 100,
    ATK: artifactMainValue.ATK / base.ATK * 100,
    DEF: artifactMainValue.DEF / base.DEF * 100,
  };
}

function gearAdvice(need: Record<MainStat, number>, supplied: Record<MainStat, number>): GearMainAdvice {
  const raw = { HP: 0, ATK: 0, DEF: 0 };
  for (const stat of artifactMainPropertyOrder) raw[stat] = need[stat] * supplied[stat];
  const best = Math.max(raw.HP, raw.ATK, raw.DEF);
  const total = raw.HP + raw.ATK + raw.DEF;
  const bands = {} as Record<MainStat, MainStatBand>;
  const worth = {} as Record<MainStat, number>;
  for (const stat of artifactMainPropertyOrder) {
    const ratio = raw[stat] / best;
    bands[stat] = ratio >= mainStatCuts.preferred ? 'preferred' : ratio >= mainStatCuts.acceptable ? 'acceptable' : 'unwanted';
    worth[stat] = raw[stat] / total;
  }
  return { bands, worth };
}

function adviceFrom(need: MainStatNeed, base: BaseStats | undefined): MainStatAdvice {
  return {
    ...need,
    artifact: gearAdvice(need.need, relief('artifact', base)),
    relic: gearAdvice(need.need, relief('relic', base)),
  };
}

/** The model's answer for one owned copy, or `undefined` where nothing can say. */
export function copyMainStatAdvice(
  monster: GameRecord, stated: MonsterCopyPreferences | undefined,
): MainStatAdvice | undefined {
  const need = copyMainStatNeed(monster, stated);
  return need === undefined ? undefined : adviceFrom(need, baseStatsOf(monster));
}

/**
 * The model's answer for a species, from the statistics alone — the answer every
 * copy that says nothing of its own falls back on in the artifact rankings.
 */
export function speciesMainStatAdvice(masterId: unknown): MainStatAdvice | undefined {
  const need = statisticsNeed(masterId);
  return need === undefined ? undefined : adviceFrom({ basis: 'statistics', need }, undefined);
}

/**
 * The artifact mains one copy is scored on: its owner's statement where there is
 * one, the model's answer for this copy otherwise. The one reading the packed
 * scorer and the per-artifact reader both take, so they cannot place a main
 * differently.
 */
export function copyArtifactMainBands(
  monster: GameRecord, stated: MonsterCopyPreferences | undefined,
): Record<MainStat, MainStatBand> | undefined {
  const mains = stated?.mainStat;
  if (mains !== undefined) {
    return { HP: statedBand(mains, 'HP'), ATK: statedBand(mains, 'ATK'), DEF: statedBand(mains, 'DEF') };
  }
  return copyMainStatAdvice(monster, stated)?.artifact.bands;
}

const bandRank: Record<MainStatBand, number> = { preferred: 2, acceptable: 1, unwanted: 0 };

/**
 * Whether a stated main answer contradicts the model's answer for one piece.
 *
 * A contradiction, not a difference: a main stated preferred that the model
 * calls unwanted (or the reverse), or two mains put in opposite order. Moving one
 * main a single band — accepting what the model prefers — is a judgement call the
 * owner is entitled to, and an answer may well have to straddle an artifact and
 * a relic that disagree by one band. `Any` contradicts nothing: it declines to
 * narrow rather than narrowing the wrong way.
 */
export function contradictsAdvice(stated: BandedChoices<MainStat>, advice: GearMainAdvice): boolean {
  if (stated.preferred.length === 0 && stated.acceptable.length === 0) return false;
  const said = (stat: MainStat) => bandRank[statedBand(stated, stat)];
  const model = (stat: MainStat) => bandRank[advice.bands[stat]];
  return artifactMainPropertyOrder.some((stat) => Math.abs(said(stat) - model(stat)) >= 2)
    || artifactMainPropertyOrder.some((left) => artifactMainPropertyOrder.some((right) =>
      said(left) > said(right) && model(left) < model(right)));
}
