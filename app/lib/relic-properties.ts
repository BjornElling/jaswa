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

export type RelicPropertyDefinition = {
  id: number;
  /**
   * The family the game prints above the effect, where it has been read off
   * the panel. `null` while nobody has looked, and the interface then names the
   * property by its number rather than inventing a word for it.
   */
  name: string | null;
  /**
   * What the property grants, which stat it reads, and whether the grant is a
   * reduction — `null` while unread. A reduction is still a gain to its owner;
   * the flag only decides the sign the line is written with.
   */
  effect: { grants: string; per: RelicSourceStat; reduces?: true } | null;
};

/**
 * The sixteen unique properties.
 *
 * Five carry a reading; eleven are still only a number. That asymmetry is
 * deliberate and is not a gap in what JASWA can *do* — every judgement on this
 * page is computed from the property's identity and needs no wording at all
 * (`RELIC-CANONICAL.md` §5). It is a gap in what JASWA can *say*, and the
 * program says so rather than guessing, which `ARTIFACT-CANONICAL.md` §14
 * forbids for exactly this kind of field.
 *
 * The five readings are reported by the sw-forge project, which records only
 * mappings a player confirmed against the in-game panel. They are marked in
 * `RELIC-CANONICAL.md` §4 as reported rather than verified here, because this
 * account has never shown four of the five on screen.
 *
 * Two families share the name Valiant and are separated by the stat they read,
 * the same device `MONSTER-NAME-ELEMENT-DECISION.md` settles for monsters the
 * game ships under one name.
 */
export const relicProperties: readonly RelicPropertyDefinition[] = [
  { id: 1, name: null, effect: null },
  { id: 2, name: null, effect: null },
  { id: 3, name: null, effect: null },
  { id: 4, name: null, effect: null },
  { id: 5, name: null, effect: null },
  { id: 6, name: 'Resolute', effect: { grants: 'DMG taken', per: 'HP', reduces: true } },
  { id: 7, name: null, effect: null },
  { id: 8, name: null, effect: null },
  { id: 9, name: null, effect: null },
  { id: 10, name: null, effect: null },
  { id: 11, name: null, effect: null },
  { id: 12, name: 'Timeless', effect: { grants: 'DEF', per: 'HP' } },
  { id: 13, name: 'Primal', effect: { grants: 'MAX HP', per: 'ATK' } },
  { id: 14, name: 'Valiant', effect: { grants: 'ATK', per: 'DEF' } },
  { id: 15, name: null, effect: null },
  { id: 16, name: 'Valiant', effect: { grants: 'ATK', per: 'SPD' } },
];

const propertiesById = new Map(relicProperties.map((property) => [property.id, property]));

export function relicProperty(id: unknown): RelicPropertyDefinition | undefined {
  return typeof id === 'number' ? propertiesById.get(id) : undefined;
}

/**
 * What to call a unique property in a column. A family the game has named reads
 * as that name, disambiguated by the stat it reads where two families share
 * one; an unnamed family reads as its number, which is the only true thing
 * JASWA can say about it.
 */
export function relicPropertyLabel(definition: RelicPropertyDefinition): string {
  if (!definition.name) return `Property ${definition.id}`;
  const shared = relicProperties.some((other) => other.id !== definition.id && other.name === definition.name);
  return shared && definition.effect ? `${definition.name} (${definition.effect.per})` : definition.name;
}

/** The three main properties, and the level a relic reaches at most. */
export const relicMaximumLevel = 15;
/** Every relic is crafted with three durability, and a failed power-up spends one. */
export const relicMaximumDurability = 3;
/**
 * A relic's main property is `3 %` at `+0` and gains a point per level, which
 * the account's own records confirm at `+0`, `+6` and `+9`. The unique property
 * scales on its own table, so this is the one figure that indexes a relic's
 * whole strength against its level.
 */
export function relicMainPercent(level: number): number {
  return 3 + level;
}
