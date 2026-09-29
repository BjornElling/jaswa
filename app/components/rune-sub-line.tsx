import type { ReactNode } from 'react';
import { CircularArrowsMark } from './converted-artifact-mark';
import { runeLineFigure, runeLineStat, runeSubValue } from '../lib/runes';
import type { RuneSubProperty } from '../lib/runes';

/**
 * One rune property line — innate or sub — written the way the game writes it,
 * `ATK +33%`, and the only place in JASWA that writes one, so a rune reads the
 * same on every page.
 *
 * The game's own vocabulary, which the player already reads there: an Enchanted
 * Gem puts the gold circular arrows after the line — the same mark an artifact's
 * converted line carries, and nothing drawn around it — and a Grindstone paints
 * the figure gold, sign and percent sign included. The name never changes
 * colour. This is one of the narrow exceptions `globals.css` lists to gold
 * meaning "you can act on this".
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
      {property.gemmed && <CircularArrowsMark label={`${name} came from an Enchanted Gem`} className="rune-sub-gem" />}
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
