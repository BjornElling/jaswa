import { localRuneImageFilenames } from '../data/local-rune-images';

/**
 * A rune drawn the way the game draws it: the slot's frame, with the set's
 * glyph laid over it. The frame's silhouette *is* the slot — the six shapes
 * interlock into the game's rune circle — so the picture says slot and set
 * before either word is read, the way a portrait says monster.
 *
 * The artwork is fetched locally and never committed (`fetch-rune-images.mjs`),
 * so only a layer that is actually on disk is rendered; with neither, the tile
 * falls back to the set's initial, as a portrait does.
 */
export function RuneEmblem({ setName, slot }: { setName: string; slot: number }) {
  const frame = `rune${slot}.png`;
  const glyph = `${setName.toLowerCase()}.png`;
  const hasFrame = localRuneImageFilenames.has(frame);
  const hasGlyph = localRuneImageFilenames.has(glyph);
  if (!hasFrame && !hasGlyph) {
    return <span className="rune-emblem placeholder" aria-hidden="true">{setName.slice(0, 1).toUpperCase()}</span>;
  }
  return <span className="rune-emblem" data-slot={slot} aria-hidden="true">
    {hasFrame && <img className="rune-emblem-frame" src={`/rune-images/${frame}`} alt="" />}
    {hasGlyph && <img className="rune-emblem-glyph" src={`/rune-images/${glyph}`} alt="" />}
  </span>;
}
