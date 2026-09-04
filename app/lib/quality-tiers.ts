/**
 * The game's five quality tiers.
 *
 * They are one vocabulary shared across the game: an artifact's grade and a
 * rune's quality use the same five names in the same order. The list lives here
 * rather than inside either system so a filter row, a sort order and a stored
 * preference cannot list them differently. `ArtifactGrade` in
 * `artifact-properties.ts` aliases these values; runes read the same list when
 * they gain a quality of their own.
 *
 * There is deliberately **no colour here.** The game paints each tier in a hue
 * — white, green, blue, purple, orange — and JASWA tried reproducing them.
 * Five competing colours across a dense table read as decoration rather than
 * information, so a grade is shown as text, in its own column
 * (`docs/ARTIFACT-CANONICAL.md` §18).
 */

/** The five tiers, weakest first, which is the game's own order. */
export const qualityTiers = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'] as const;

export type QualityTier = typeof qualityTiers[number];

/**
 * Whether a value is one of the five tiers. Used where a tier arrives from
 * outside the type system — stored preferences, a parsed file.
 */
export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (qualityTiers as readonly string[]).includes(value);
}
