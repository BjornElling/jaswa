'use client';

import { useState } from 'react';
import { conversionLabel, engravedStoneFor } from '../lib/artifact-recommendations';
import { artifactRestriction } from '../lib/compute/artifact-score-input';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactConversion } from '../lib/compute/artifact-score-protocol';
import type { ArtifactSettings } from '../lib/types';

/* Enough to see the shape of the choice without a single row filling the
   screen. The rest are one click away rather than gone: §17.5 asks for every
   conversion worth taking, and a disclosure the user opens is movement they
   asked for rather than layout shifting under them. */
const visibleConversions = 3;

/**
 * Every conversion worth taking, best first (`ARTIFACT-CANONICAL.md` §17.5),
 * with the stone each would spend (§17.6).
 *
 * The list arrives already ordered and already restricted to one preference
 * band by the scorer, so this only names the entries and decides how many of
 * them to show at once.
 */
export function ConversionList({ conversions, artifact, stones, mode }: {
  conversions: readonly ArtifactConversion[];
  artifact: Artifact | undefined;
  stones: readonly EngravedConversionStone[];
  mode: ArtifactSettings['conversionStoneMode'];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!conversions.length) return <span className="muted">No conversion</span>;
  const shown = expanded ? conversions : conversions.slice(0, visibleConversions);
  const hidden = conversions.length - shown.length;

  return <div className="artifact-conversion-list">
    <ul className="artifact-conversion-options">{shown.map((conversion) => {
      /* Only the owned-stone mode spends a stone, so only it names one. */
      const stone = mode === 'owned' && artifact
        ? engravedStoneFor(stones, artifact.category, artifactRestriction(artifact), conversion.propertyId)
        : undefined;
      return <li key={`${conversion.sourceIndex}-${conversion.propertyId}`}>
        <span className="artifact-conversion-option-gain">+{conversion.gain}</span>
        <span className="artifact-conversion-option-name">
          {conversionLabel(conversion, stone, artifact?.convertedPropertyIndex)}
        </span>
      </li>;
    })}</ul>
    {(hidden > 0 || expanded) && <button type="button" className="artifact-conversion-more"
      onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
      {expanded ? 'Show fewer' : `+ ${hidden} more`}
    </button>}
  </div>;
}
