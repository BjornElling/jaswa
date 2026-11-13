import type { ArtifactMainProperty } from '../artifacts/artifact-properties';
import { artifactMainPropertyOrder, artifactMainValue } from '../artifacts/artifact-properties';
import type { GameRecord } from '../account/game-record';
import { monsterDefaults } from '../profiles/monster-defaults';
import type { RuneStatNeed } from '../profiles/monster-defaults';
import type { BandedChoices, MonsterCopyPreferences } from '../profiles/monster-preferences';
import { statedAnswer, statedBand } from '../profiles/monster-preferences';
import { effectSlot, monsterBaseStats, monsterEffects } from './monster-stats';
import { relicMainPercent, relicMaximumLevel } from '../relics/relic-properties';
import { mainPropertyMaximum } from '../runes/rune-properties';
import { runeMaximumLevel } from '../runes/runes';

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
 * 1. **The need** — what HP, ATK and DEF are lifted by, in percent of base: off
 *    the copy's six runes, else the game's rune statistics for its species. Stat
 *    targets are deliberately not a source: a floor says what a build must reach,
 *    not what it is for, and the figure it is really built around is usually
 *    the one with no floor at all.
 * 2. **The worth of each main on each piece** — the need times how much of that
 *    stat the piece's main supplies, in the same percent of base. A relic's main is
 *    a percentage, the same for all three, so its answer is the need's own order;
 *    an artifact's is a fixed amount, worth more on a stat with a small base.
 */

export type MainStat = ArtifactMainProperty;
export type MainStatBand = 'preferred' | 'acceptable' | 'unwanted';
export type GearKind = 'artifact' | 'relic';

/** Where a need was read from, in the order the sources are tried. */
export type MainStatBasis = 'runes' | 'statistics';

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
 *   measured off engraved runes moves by a roll or two with every rune swapped; two
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

type BaseStats = Record<MainStat, number>;

function baseStatsOf(monster: GameRecord): BaseStats | undefined {
  const base = monsterBaseStats(monster);
  const stats = { HP: base[0], ATK: base[1], DEF: base[2] };
  return Object.values(stats).every((value) => Number.isFinite(value) && value > 0) ? stats : undefined;
}

const hasNeed = (need: Record<MainStat, number>) => artifactMainPropertyOrder.some((stat) => need[stat] > 0);

/** Six runes, one in each slot: a finished build, which is what a need is read off. */
export function hasFullRuneBuild(monster: GameRecord): boolean {
  const runes = records(monster.runes);
  const slots = new Set(runes.map((rune) => Number(rune.slot_no)));
  return runes.length === 6 && [1, 2, 3, 4, 5, 6].every((slot) => slots.has(slot));
}

/* The main's remaining power-up is deterministic. Count it in the priority,
   without changing the copy's actual stat sheet or guessing future sub rolls. */
function mainAtMaximum(rune: RecordLike): RecordLike {
  const slot = rune.slot_no;
  const level = rune.upgrade_curr;
  const stars = rune.class === 16 ? 6 : rune.class;
  const main = rune.pri_eff;
  if (slot !== 2 && slot !== 4 && slot !== 6) return rune;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level >= runeMaximumLevel
    || typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 6
    || !Array.isArray(main) || typeof main[0] !== 'number' || typeof main[1] !== 'number') return rune;
  const maximum = mainPropertyMaximum(stars, main[0]);
  return maximum > main[1] ? { ...rune, pri_eff: [main[0], maximum] } : rune;
}

/**
 * How much more a slot-2/4/6 main counts towards the need than any other line.
 *
 * A main is the one line of a rune its owner picks, out of seven or eight, and
 * keeps by engraving the rune; a sub line, an innate, a grind's target and a
 * set's bonus come with whatever rolled. Counted alike, a damage dealer whose
 * subs happened to roll HP read as half a tank: Shaina's ATK % slot-6 main and
 * three ATK % subs came to 131 % against 111 % from five HP % subs, and the relic
 * plan handed her an HP relic. At 2 the same build reads ATK 194 % against HP
 * 111 %. 2 rather than more because a main already carries 63 % at +15, about
 * ten sub rolls' worth, so doubling it makes the choice decisive over a stack of
 * incidental rolls without letting one main erase a build whose subs were
 * collected on purpose. **Modelled:** JASWA's judgement, not a game rule.
 */
export const chosenMainWeight = 2;

function weighted({ mains, rest }: RuneStatNeed): Record<MainStat, number> | undefined {
  const need = { HP: 0, ATK: 0, DEF: 0 };
  for (const stat of artifactMainPropertyOrder) need[stat] = Math.max(0, chosenMainWeight * mains[stat] + rest[stat]);
  return hasNeed(need) ? need : undefined;
}

function liftOf(runes: RecordLike[], base: BaseStats): Record<MainStat, number> {
  const effects = monsterEffects({ runes });
  return {
    HP: effects[effectSlot.hpPercent] + effects[effectSlot.teamHpPercent] + effects[effectSlot.hpFlat] / base.HP * 100,
    ATK: effects[effectSlot.atkPercent] + effects[effectSlot.teamAtkPercent] + effects[effectSlot.atkFlat] / base.ATK * 100,
    DEF: effects[effectSlot.defPercent] + effects[effectSlot.teamDefPercent] + effects[effectSlot.defFlat] / base.DEF * 100,
  };
}

/* Everything the six runes add, sets and grinds included, except the three fixed
   mains. A flat line is a real part of the build and is counted against this
   copy's own base. The slot-2/4/6 mains are read as the difference between the
   build with them and without them, so sets and every other line are counted
   once, by the one effect engine. */
function runeNeed(monster: GameRecord, base: BaseStats): Record<MainStat, number> | undefined {
  if (!hasFullRuneBuild(monster)) return undefined;
  const engraved = records(monster.runes);
  const withMains = liftOf(engraved.map((rune) =>
    (fixedMainSlots.has(Number(rune.slot_no)) ? { ...rune, pri_eff: undefined } : mainAtMaximum(rune))), base);
  const rest = liftOf(engraved.map((rune) => ({ ...rune, pri_eff: undefined })), base);
  const mains = { HP: 0, ATK: 0, DEF: 0 };
  for (const stat of artifactMainPropertyOrder) mains[stat] = withMains[stat] - rest[stat];
  return weighted({ mains, rest });
}

function statisticsNeed(masterId: unknown): Record<MainStat, number> | undefined {
  const parts = monsterDefaults(masterId)?.runes?.mainStatNeed;
  return parts === undefined ? undefined : weighted(parts);
}

/**
 * What one owned copy's runes have to lift, from the first source that can say.
 * `undefined` where none can: no finished build, and a species the statistics
 * never captured.
 */
export function copyMainStatNeed(monster: GameRecord): MainStatNeed | undefined {
  const base = baseStatsOf(monster);
  if (base !== undefined) {
    const runes = runeNeed(monster, base);
    if (runes !== undefined) return { basis: 'runes', need: runes };
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
export function copyMainStatAdvice(monster: GameRecord): MainStatAdvice | undefined {
  const need = copyMainStatNeed(monster);
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
 * What a copy's stated main answer amounts to.
 *
 * - `stated` — at least one main is preferred, and the two bands are the answer.
 * - `no-preferred` — mains are accepted but none preferred. That is not an
 *   answer the model can stand aside for: an accepted main is one taken when
 *   nothing preferred is to hand, and here nothing ever is. It is kept as typed
 *   (`AGENTS.md` §0) and ignored until a preferred main joins it, and the overlay
 *   says so in red.
 * - `silent` — nothing stated, or both bands emptied (`statedAnswer`). The
 *   model answers.
 */
export type MainStatStatement = 'stated' | 'no-preferred' | 'silent';

export function mainStatStatement(stated: MonsterCopyPreferences | undefined): MainStatStatement {
  const mains = statedAnswer(stated?.mainStat);
  if (mains === undefined) return 'silent';
  return mains.preferred.length > 0 ? 'stated' : 'no-preferred';
}

/** The stated main answer where it is one the model stands aside for, else `undefined`. */
export function honouredMainStat(stated: MonsterCopyPreferences | undefined): BandedChoices<MainStat> | undefined {
  return mainStatStatement(stated) === 'stated' ? stated?.mainStat : undefined;
}

/**
 * The artifact mains one copy is scored on: its owner's statement where it
 * names a preferred main, the model's answer for this copy otherwise. The one
 * reading the packed scorer and the per-artifact reader both take, so they
 * cannot place a main differently.
 */
export function copyArtifactMainBands(
  monster: GameRecord, stated: MonsterCopyPreferences | undefined,
): Record<MainStat, MainStatBand> | undefined {
  const mains = honouredMainStat(stated);
  if (mains !== undefined) {
    return { HP: statedBand(mains, 'HP'), ATK: statedBand(mains, 'ATK'), DEF: statedBand(mains, 'DEF') };
  }
  return copyMainStatAdvice(monster)?.artifact.bands;
}

const bandRank: Record<MainStatBand, number> = { preferred: 2, acceptable: 1, unwanted: 0 };

/**
 * Whether a stated main answer contradicts the model's answer for one piece.
 *
 * A contradiction, not a difference: a main stated preferred that the model
 * calls unwanted (or the reverse), or two mains put in opposite order. Moving one
 * main a single band — accepting what the model prefers — is a judgement call the
 * owner is entitled to, and an answer may well have to straddle an artifact and
 * a relic that disagree by one band. Only an honoured answer is judged
 * (`honouredMainStat`); one with no preferred main is not an answer yet.
 */
export function contradictsAdvice(stated: BandedChoices<MainStat>, advice: GearMainAdvice): boolean {
  const said = (stat: MainStat) => bandRank[statedBand(stated, stat)];
  const model = (stat: MainStat) => bandRank[advice.bands[stat]];
  return artifactMainPropertyOrder.some((stat) => Math.abs(said(stat) - model(stat)) >= 2)
    || artifactMainPropertyOrder.some((left) => artifactMainPropertyOrder.some((right) =>
      said(left) > said(right) && model(left) < model(right)));
}
