import { ExpandableList } from './expandable-list';
import { conversionDescription, engravedStoneFor } from '../lib/artifact-recommendations';
import { artifactRestriction } from '../lib/compute/artifact-score-input';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactConversion } from '../lib/compute/artifact-score-protocol';
import type { ArtifactSettings } from '../lib/types';

/**
 * Every conversion worth taking, best first (`ARTIFACT-CANONICAL.md` §17.5),
 * with the stone each would spend (§17.6).
 *
 * The list arrives already ordered and already restricted to one preference
 * band by the scorer, so this only names the entries for the shared expandable
 * list.
 */
export function ConversionList({ conversions, artifact, stones, mode, emptyClassName }: {
  conversions: readonly ArtifactConversion[];
  artifact: Artifact | undefined;
  stones: readonly EngravedConversionStone[];
  mode: ArtifactSettings['conversionStoneMode'];
  /** A caller may give its own reading of a no-op conversion without styling
   * conversion options on the other artifact views. */
  emptyClassName?: string;
}) {
  /* An Intangible has no conversions for a different reason than an artifact
     that simply has none worth taking: the game forbids converting it at all
     (§10.1), so "No conversion" read as a judgement JASWA had made about this
     piece rather than a rule it could never escape. Naming the reason answers
     the question the empty cell otherwise raises, and it is set in the same
     gold as the other empty readings — it reports a settled state, not a
     missing one. */
  if (artifact?.intangible) return <span className="artifact-conversion-intangible">Intangible</span>;
  if (!conversions.length) return <span className={emptyClassName ?? 'muted'}>No conversion</span>;
  return <ExpandableList className="artifact-conversion-list" listClassName="artifact-conversion-options" items={conversions}
    itemKey={(conversion) => `${conversion.sourceIndex}-${conversion.propertyId}`}>
    {(conversion) => {
      /* Only the owned-stone mode spends a stone, so only it names one. */
      const stone = mode === 'owned' && artifact
        ? engravedStoneFor(stones, artifact.category, artifactRestriction(artifact), conversion.propertyId)
        : undefined;
      const description = conversionDescription(conversion, stone, artifact?.convertedPropertyIndex,
        artifact?.subProperties[conversion.sourceIndex]?.definition.id);
      /* The source line leads, because it is what the user acts on: which
          of the four substats this recommendation would spend. The action is
          the dim connective tissue between it and the property it would
          become. The gain each conversion is not shown: the list already
          arrives ordered by it (§17.5), so the order carries that comparison
          and the line stays a plain instruction. */
      return <span className="artifact-conversion-option-name">
        <span className="artifact-conversion-option-source">{description.source}:</span>{' '}
        <span className="artifact-conversion-option-action">{description.action}</span>{' '}
        {description.target}
        {description.stone && <span className="artifact-conversion-option-stone"> ({description.stone})</span>}
      </span>;
    }}
  </ExpandableList>;
}
