/**
 * The relic vocabulary: the three main properties, and the sixteen unique
 * properties the game assigns a relic when it is crafted.
 *
 * `docs/RELIC-CANONICAL.md` is the authority for everything here. In short: a
 * relic carries one main property — HP, ATK or DEF as a percentage — and one
 * unique property drawn from a space of exactly sixteen, fixed at the moment
 * the relic is obtained and never added to by a power-up.
 */
import type { EquipmentPrimaryType } from './monster-grid';

export type RelicMainProperty = EquipmentPrimaryType;

/** The export's primary-effect codes, shared with artifacts (`ENGRAVING-STATISTICS.md` §1). */
export const relicMainProperties: Record<number, RelicMainProperty> = { 100: 'HP', 101: 'ATK', 102: 'DEF' };

export const relicMainPropertyOrder: readonly RelicMainProperty[] = ['HP', 'ATK', 'DEF'];

/**
 * Which stat a unique property reads to size its own effect. It is the half of
 * a relic the main property can multiply, so it is the half that decides
 * whether main and unique point the same way.
 *
 * SPD appears here and never among the main properties: a relic cannot grant
 * speed, only read it.
 */
export type RelicSourceStat = 'HP' | 'ATK' | 'DEF' | 'SPD';

/**
 * What a unique property grants. These are the game's own six functional
 * groups, and the family name is simply which of them a relic belongs to.
 */
export type RelicGrant = 'DMG dealt' | 'DMG taken' | 'ATK' | 'DEF' | 'MAX HP' | 'Recovery & Shield';

/** The family a relic belongs to, which is decided entirely by what it grants. */
const familyByGrant: Record<RelicGrant, string> = {
  'DMG dealt': 'Conquest',
  'DMG taken': 'Resolute',
  ATK: 'Valiant',
  DEF: 'Timeless',
  'MAX HP': 'Primal',
  'Recovery & Shield': 'Restore',
};

/** The prefix, which is decided entirely by the stat the property reads. */
const scalingBySource: Record<RelicSourceStat, string> = {
  HP: 'Hearty',
  ATK: 'Sharp',
  DEF: 'Solid',
  SPD: 'Nimble',
};

export type RelicPropertyDefinition = {
  id: number;
  /** What it grants; `DMG taken` is the one that goes down rather than up. */
  grants: RelicGrant;
  /** The stat it reads to size the grant. */
  per: RelicSourceStat;
  /** The game's own name, `<scaling> <family>` — e.g. `Nimble Primal`. */
  name: string;
};

/**
 * The sixteen unique properties, in the order the game's own **Manage Relic →
 * Select Unique Property** panel lists them, which is the order of the `type`
 * ids in the export.
 *
 * That ordering is not assumed; `RELIC-CANONICAL.md` §4 sets out the evidence.
 * The short version is four independent confirmations — this account's own `+6`
 * relic reads `DMG dealt +1 % per 1500 ATK` on screen and carries
 * `sec_effect [1, 1500, 1]` in the export, and three community-confirmed
 * mappings land on ids 6, 12 and 13 — plus the list's own shape: sixteen
 * entries in exactly the six functional groups Com2uS announced, and threshold
 * values that agree with each other once grouped by the stat this mapping says
 * each property reads.
 *
 * The names follow one rule each. **The family is what the property grants**
 * and **the prefix is the stat it reads**, so every one of the sixteen has a
 * name no other can share — which is also how the two mappings this table
 * corrects were spotted: they gave one name to two different properties.
 */
function property(id: number, grants: RelicGrant, per: RelicSourceStat): RelicPropertyDefinition {
  return { id, grants, per, name: `${scalingBySource[per]} ${familyByGrant[grants]}` };
}

export const relicProperties: readonly RelicPropertyDefinition[] = [
  property(1, 'DMG dealt', 'ATK'),
  property(2, 'DMG dealt', 'DEF'),
  property(3, 'DMG dealt', 'HP'),
  property(4, 'DMG taken', 'ATK'),
  property(5, 'DMG taken', 'DEF'),
  property(6, 'DMG taken', 'HP'),
  property(7, 'ATK', 'SPD'),
  property(8, 'ATK', 'DEF'),
  property(9, 'ATK', 'HP'),
  property(10, 'DEF', 'ATK'),
  property(11, 'DEF', 'SPD'),
  property(12, 'DEF', 'HP'),
  property(13, 'MAX HP', 'ATK'),
  property(14, 'MAX HP', 'SPD'),
  property(15, 'MAX HP', 'DEF'),
  property(16, 'Recovery & Shield', 'HP'),
];

const propertiesById = new Map(relicProperties.map((definition) => [definition.id, definition]));

export function relicProperty(id: unknown): RelicPropertyDefinition | undefined {
  return typeof id === 'number' ? propertiesById.get(id) : undefined;
}

/** What to call a unique property in a column. */
export function relicPropertyLabel(definition: RelicPropertyDefinition): string {
  return definition.name;
}

/** A reduction is still a gain to its owner; this only decides the sign. */
export function relicPropertyReduces(definition: RelicPropertyDefinition): boolean {
  return definition.grants === 'DMG taken';
}

/** How the game writes the source stat in the effect line. */
export function relicSourceLabel(source: RelicSourceStat): string {
  return source === 'HP' ? 'MAX HP' : source;
}

/** The three main properties, and the level a relic reaches at most. */
export const relicMaximumLevel = 15;

/**
 * The game's published power-up success rates, indexed by the level being left:
 * `relicPowerUpRates[0]` is `+0 → +1`.
 *
 * The first three levels are free, and from `+3` the rate halves twice over on
 * the way up, ending at one attempt in ten. That shape is the whole economics
 * of a relic: **stones are worth most on a low relic and least on a high one**,
 * and `+15` is a lottery rather than a target — a fresh relic with all three
 * durability reaches it about once in eleven thousand times
 * (`RELIC-CANONICAL.md` §7.4).
 *
 * These are the game's own figures, not an estimate. An earlier version of this
 * file had no table and stood a single rate measured from the account's own
 * relics in its place; that estimate read 76 %, which is defensible for the
 * levels it was drawn from and catastrophic above them.
 */
export const relicPowerUpRates: readonly number[] = [
  1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1,
];
/** Every relic is crafted with three durability, and a failed power-up spends one. */
export const relicMaximumDurability = 3;
/**
 * A relic's main property is `3 %` at `+0` and gains a point per level, which
 * the account's own records confirm at `+0`, `+6` and `+9`.
 */
export function relicMainPercent(level: number): number {
  return 3 + level;
}

/**
 * How much of the source stat one step of the unique property costs, at each of
 * the six power-up tiers.
 *
 * **The threshold is what a power-up actually moves on the unique half.** The
 * percentage never changes — it is fixed by what the property grants, 1 % for
 * the two damage families and 2 % for the rest — so a relic grows stronger only
 * by needing less of the source stat to buy the same step.
 *
 * All six of this account's relics carry exactly the threshold this table gives
 * for their level and source stat, which is both a confirmation of the table
 * and the sixth independent confirmation of the id mapping in §4.1: read the
 * source stat wrongly and none of them would land.
 *
 * MAX HP is exactly eighteen times ATK/DEF at every tier — all six of them,
 * confirmed against the game. The `+15` figure was the one that had to be read
 * twice: it was illegible in the first capture and was carried for a while as
 * the only inferred number in this file, on the strength of the ratio holding
 * at the other five. The reading came back `9000`, which is what the ratio
 * said.
 */
const thresholdTiers: Record<'atkDef' | 'hp' | 'spd', readonly number[]> = {
  atkDef: [2500, 2000, 1500, 1000, 750, 500],
  hp: [45000, 36000, 27000, 18000, 13500, 9000],
  spd: [300, 250, 200, 150, 125, 100],
};

/** Levels per tier: the table steps at `+0`, `+3`, `+6`, `+9`, `+12` and `+15`. */
const relicThresholdTierSize = 3;

function thresholdTier(level: number): number {
  const tier = Math.floor(level / relicThresholdTierSize);
  return Math.min(Math.max(tier, 0), thresholdTiers.atkDef.length - 1);
}

export function relicThreshold(level: number, source: RelicSourceStat): number {
  const tiers = source === 'HP' ? thresholdTiers.hp : source === 'SPD' ? thresholdTiers.spd : thresholdTiers.atkDef;
  return tiers[thresholdTier(level)];
}

/**
 * What a relic at this level is worth as a share of the same relic finished.
 *
 * Its two halves do **not** grow together, which is the whole reason this is a
 * function and not `(3 + level) / 18`. Over the fifteen levels the main
 * property multiplies by 6, a unique property reading ATK, DEF or MAX HP by 5,
 * and one reading SPD by only 3. A model that indexed the relic on its main
 * property alone would overstate what every power-up buys, and overstate it
 * most on the Nimble properties.
 *
 * **The halves are weighted equally, and that is a stated choice.** Which one
 * matters more depends on the monster wearing the relic — a unique property is
 * worth what the monster's own SPD or ATK makes it worth — and JASWA does not
 * model relic value per monster. Two equal halves is the same premise the whole
 * page rests on: a relic is its main property and its unique property, and
 * neither is the relic on its own. `verify:relic-maths` checks that the verdicts
 * do not turn on the choice, by re-deciding the table at every weighting from
 * all-main to all-unique.
 */
export function relicStrengthIndex(level: number, source: RelicSourceStat, mainShare = 0.5): number {
  const main = relicMainPercent(level) / relicMainPercent(relicMaximumLevel);
  const unique = relicThreshold(relicMaximumLevel, source) / relicThreshold(level, source);
  return mainShare * main + (1 - mainShare) * unique;
}
