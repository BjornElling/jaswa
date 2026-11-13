import type { ArtifactCategory } from '../../domain/artifacts/artifact-properties';

/**
 * An artifact's slot drawn as a mark, where a line would otherwise show a
 * monster's face: the element artifact as the game's round orb in its ring, the
 * type artifact as its pointed crest. Stroked in the text's own colour, so it
 * sits in a lead's line at a lead portrait's size and tone.
 */
export function ArtifactGlyph({ category }: { category: ArtifactCategory }) {
  return <svg className="artifact-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-category={category}>
    {category === 'attribute'
      ? <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /></>
      : <><path d="M8 1.8 13.2 4v4.2c0 2.8-2.2 5-5.2 6-3-1-5.2-3.2-5.2-6V4Z" /><path d="M8 5v5.5M5.6 7.6h4.8" /></>}
  </svg>;
}
