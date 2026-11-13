/**
 * The game's five quality tiers.
 *
 * They are one vocabulary shared across the game: an artifact's grade, a rune's
 * rarity and a craft item's grade use the same five names in the same order. The
 * list lives here rather than inside any one system so a filter row, a sort order
 * and a stored preference cannot list them differently. `ArtifactGrade` in
 * `artifact-properties.ts`, `runeRarities` in `runes.ts` and `itemGrades` in
 * `rune-craft-items.ts` all alias these values.
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
