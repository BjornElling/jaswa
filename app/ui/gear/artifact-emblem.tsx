import { localArtifactImageFilenames } from '../../data/local-artifact-images';
import type { ArtifactCategory, ArtifactGrade } from '../../domain/artifacts/artifact-properties';
import { ArtifactGlyph } from './artifact-glyph';

/**
 * An artifact drawn the way the game draws it: a ground in its grade's colour,
 * the slot's frame, and the element's or type's symbol on top. The picture says
 * slot, class and grade before a word is read, the way a portrait says monster.
 *
 * The artwork is fetched locally and never committed
 * (`fetch-artifact-images.mjs`), so only a layer that is actually on disk is
 * rendered; without the frame the drawn mark stands in. An Intangible artifact
 * names no single element or type, and the game's artwork has no symbol for
 * it, so it shows its ground and frame alone.
 */
export function ArtifactEmblem({ category, grade, element, archetype }: {
  category: ArtifactCategory;
  grade: ArtifactGrade;
  element: string | null;
  archetype: string | null;
}) {
  const tier = grade.toLowerCase();
  const ground = `bg_${tier}.png`;
  const frame = `${category === 'attribute' ? 'element' : 'archetype'}_${tier}.png`;
  const symbolName = category === 'attribute' ? element : archetype;
  const symbol = symbolName === null ? undefined : `${symbolName.toLowerCase()}.png`;
  if (!localArtifactImageFilenames.has(frame)) return <ArtifactGlyph category={category} />;
  return <span className="artifact-emblem" data-category={category} data-grade={tier} aria-hidden="true">
    {localArtifactImageFilenames.has(ground) && <img className="artifact-emblem-ground" src={`/artifact-images/${ground}`} alt="" />}
    <img className="artifact-emblem-frame" src={`/artifact-images/${frame}`} alt="" />
    {symbol !== undefined && localArtifactImageFilenames.has(symbol)
      && <img className="artifact-emblem-symbol" src={`/artifact-images/${symbol}`} alt="" />}
  </span>;
}
