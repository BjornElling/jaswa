import { ConvertedArtifactMark } from './converted-artifact-mark';
import { RuneEmblem } from './rune-emblem';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import type { Artifact } from '../lib/artifacts';
import { artifactCategoryLabel, artifactEngraveClassLabel, displaySubProperty } from '../lib/artifact-grid';
import type { ArtifactCategory } from '../lib/artifact-properties';
import type { Relic } from '../lib/relics';
import { relicEffectText } from '../lib/relic-grid';
import type { Rune } from '../lib/runes';
import { runeLineFigure, runeLineStat } from '../lib/runes';

/**
 * What one copy has engraved now, written compactly for the monster overlay's right
 * column: a third of the panel, read against the answers on the left.
 *
 * Every card here is a fixed shape — six rune cards of one height, two artifact
 * cards of one height, one relic row per relic — and an empty slot draws the
 * same box as a filled one, so a bare copy and a fully engraved one lay out the
 * column alike (`AGENTS.md` §2).
 */

const runeSlots = [1, 2, 3, 4, 5, 6] as const;
/** A rune holds four sub properties at most (`RUNE-CANONICAL.md` §6). */
const subPropertySlots = 4;

/**
 * One engraved rune, the way the game lists it: the emblem says slot and set before
 * either word is read, the set and its level, the main property and the innate
 * sit beside it, and after a step the sub properties one under another.
 */
function EngravedRune({ slot, rune, format }: {
  slot: number;
  rune: Rune | undefined;
  format: (value: number) => string;
}) {
  if (!rune) {
    return <li className="engraved-rune" data-slot={slot} data-empty="true" aria-label={`Slot ${slot}: empty`}>
      <span className="engraved-rune-blank" aria-hidden="true">{slot}</span>
      <span className="engraved-rune-set">Slot {slot}</span>
      <span className="engraved-rune-main">Empty</span>
    </li>;
  }
  const main = `${runeLineStat(rune.mainStatId) ?? `Stat ${rune.mainStatId}`} ${runeLineFigure(rune.mainStatId, rune.mainValue, format)}`;
  return <li className="engraved-rune" data-slot={slot} aria-label={`Slot ${slot}: ${rune.setName}`}>
    <RuneEmblem setName={rune.setName} slot={rune.slot} />
    {/* The level rides on the set's line: a third of a third of the panel holds
        `CRI Dmg +80%` or `+15` beside it, not both. */}
    <span className="engraved-rune-set">
      <span className="engraved-rune-name" title={rune.setName}>{rune.setName}</span>
      <span className="engraved-rune-level">+{rune.level}</span>
    </span>
    <span className="engraved-rune-main" title={main}>{main}</span>
    <span className="engraved-rune-innate">
      {rune.prefixStatId === null
        ? <span className="rune-sub-name">No innate</span>
        : <RuneInnateLine statId={rune.prefixStatId} value={rune.prefixValue} format={format} />}
    </span>
    <ul className="engraved-rune-subs" aria-label="Sub properties">
      {Array.from({ length: subPropertySlots }, (_, at) => {
        const line = rune.subProperties[at];
        return line
          ? <RuneSubLine key={at} as="li" format={format} property={line} />
          : <li key={at} className="rune-sub" aria-hidden="true" />;
      })}
    </ul>
  </li>;
}

export function EngravedRunes({ runes, format }: { runes: readonly Rune[]; format: (value: number) => string }) {
  return <ul className="engraved-runes" aria-label="Engraved runes">
    {runeSlots.map((slot) => <EngravedRune key={slot} slot={slot} format={format}
      rune={runes.find((rune) => rune.slot === slot)} />)}
  </ul>;
}

/** One artifact, as its category names it: the class it fits, the main named and never quantified, and the four lines. */
function EngravedArtifact({ category, artifact, format }: {
  category: ArtifactCategory;
  artifact: Artifact | undefined;
  format: (value: number) => string;
}) {
  const label = artifactCategoryLabel(category);
  return <section className="engraved-artifact" aria-label={`${label} artifact`}>
    <p className="engraved-artifact-head">
      <span className="engraved-artifact-category">{label}</span>
      <span className="engraved-artifact-class">
        {artifact === undefined ? '' : `${artifactEngraveClassLabel(artifact)} · ${artifact.grade}`}
      </span>
    </p>
    <p className="engraved-artifact-main">{artifact === undefined ? 'None engraved' : artifact.mainProperty}</p>
    <ul className="engraved-artifact-subs">
      {Array.from({ length: subPropertySlots }, (_, at) => {
        const line = artifact?.subProperties[at];
        if (!line) return <li key={at} aria-hidden="true" />;
        const text = displaySubProperty(line, format);
        return <li key={at} title={text}>
          <span className="engraved-artifact-line">{text}</span>
          {artifact?.convertedPropertyIndex === at && <ConvertedArtifactMark position={at} />}
        </li>;
      })}
    </ul>
  </section>;
}

export function EngravedArtifacts({ artifacts, format }: {
  artifacts: Partial<Record<ArtifactCategory, Artifact>>;
  format: (value: number) => string;
}) {
  return <div className="engraved-artifacts">
    {(['attribute', 'type'] as const).map((category) => <EngravedArtifact key={category} category={category}
      artifact={artifacts[category]} format={format} />)}
  </div>;
}

export function EngravedRelics({ relics, format }: { relics: readonly Relic[]; format: (value: number) => string }) {
  if (relics.length === 0) return <p className="overlay-empty">None engraved</p>;
  return <ul className="engraved-relics">
    {relics.map((relic) => {
      const effect = relicEffectText(relic, format);
      return <li key={relic.id} className="engraved-relic">
        <span className="engraved-relic-main">{relic.mainProperty} +{format(relic.mainPercent)} %</span>
        <span className="engraved-relic-unique" title={`${relic.unique.definition.name}: ${effect}`}>
          {relic.unique.definition.name} · {effect}
        </span>
        <span className="engraved-rune-level">+{relic.level}</span>
      </li>;
    })}
  </ul>;
}
