import type { ReactNode } from 'react';
import { runeLineFigure, runeLineStat, runeSubValue } from '../lib/runes';
import type { RuneSubProperty } from '../lib/runes';

/**
 * The Enchanted Gem mark: the shared circular arrows, inside a ring. The ring is
 * the gem and is gold always; the arrows take the line's colour, so they turn
 * gold with the figure only once a Grindstone has touched the line too.
 */
function RuneGemMark({ label }: { label: string }) {
  return <svg className="artifact-sub-mark rune-sub-gem" viewBox="0 0 16 16" role="img" aria-label={label}>
    <circle className="rune-sub-gem-ring" cx="8" cy="8" r="7.25" />
    <g transform="translate(8 8) scale(.6) translate(-8 -8)">
      <path vectorEffect="non-scaling-stroke" d="M13 5.5A5.25 5.25 0 0 0 3.6 4L2.5 5.25" />
      <path vectorEffect="non-scaling-stroke" d="M2.5 2.75v2.5H5" />
      <path vectorEffect="non-scaling-stroke" d="M3 10.5A5.25 5.25 0 0 0 12.4 12l1.1-1.25" />
      <path vectorEffect="non-scaling-stroke" d="M13.5 13.25v-2.5H11" />
    </g>
  </svg>;
}

/**
 * One rune property line — innate or sub — written the way the game writes it,
 * `ATK +33%`, and the only place in JASWA that writes one, so a rune reads the
 * same on every page.
 *
 * The game's own vocabulary, which the player already reads there: an Enchanted
 * Gem puts a gold ring with arrows after the line, and a Grindstone paints the
 * figure gold — sign and percent sign included — and the arrows with it. The
 * name never changes colour. This is one of the narrow exceptions `globals.css`
 * lists to gold meaning "you can act on this".
 *
 * The figure is the total the game shows, grindstone included. The grindstone's
 * share is not printed — the colour is the signal — but it is not lost either:
 * it is in the line's title for a pointer and in its text for a screen reader,
 * so the fact stays in the text and only the colour changes (`AGENTS.md` §5).
 */
export function RuneSubLine({ property, format = String, as: Element = 'span', className = 'rune-sub', children }: {
  property: RuneSubProperty;
  format?: (value: number) => string;
  /** `li` where the caller lists the lines. */
  as?: 'span' | 'li';
  className?: string;
  /** Further marks after the gem mark, such as the simulator's roll count. */
  children?: ReactNode;
}) {
  const name = runeLineStat(property.statId) ?? `Stat ${property.statId}`;
  const figure = runeLineFigure(property.statId, runeSubValue(property), format);
  const ground = property.grind > 0;
  const grindFigure = runeLineFigure(property.statId, property.grind, format);
  const facts = [
    ground ? `includes Grindstone ${grindFigure}` : undefined,
    property.gemmed ? 'from an Enchanted Gem' : undefined,
  ].filter((fact): fact is string => fact !== undefined);
  return <Element className={className} data-ground={ground ? 'true' : undefined}
    title={facts.length > 0 ? `${name} ${figure}, ${facts.join(', ')}` : undefined}>
    <span className="rune-sub-name">{name}</span>
    <span className="rune-sub-value">{figure}</span>
    <span className="rune-sub-marks">
      {property.gemmed && <RuneGemMark label={`${name} came from an Enchanted Gem`} />}
      {ground && <span className="visually-hidden">, includes Grindstone {grindFigure}</span>}
      {children}
    </span>
  </Element>;
}

/** The innate property, written by the same hand as the sub properties. No
    craft item ever touches it (`RUNE-CANONICAL.md` §4), so it has no marks. */
export function RuneInnateLine({ statId, value, format, className }: {
  statId: number;
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  return <RuneSubLine className={className} format={format} property={{ statId, value, gemmed: false, grind: 0 }} />;
}
