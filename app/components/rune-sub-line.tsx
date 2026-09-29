import type { ReactNode } from 'react';
import { CircularArrowsMark } from './converted-artifact-mark';
import { runeSubValue } from '../lib/runes';
import type { RuneSubProperty } from '../lib/runes';

/**
 * One rune sub property, written the way the game writes it — and the only
 * place in JASWA that writes one, so a rune reads the same on every page.
 *
 * The game's own vocabulary, which the player already reads there: a line a
 * Grindstone has touched is gold, and a line an Enchanted Gem put there carries
 * the circular-arrows mark after it. The mark takes the line's own colour, so a
 * gemmed line that was never ground is white mark and all, and one that was
 * both is gold throughout. This is one of the narrow exceptions `globals.css`
 * lists to gold meaning "you can act on this".
 *
 * The figure is the total the game shows, grindstone included. The grindstone's
 * share is not printed — the colour is the signal — but it is not lost either:
 * it is in the line's title for a pointer and in its text for a screen reader,
 * so the fact stays in the text and only the colour changes (`AGENTS.md` §5).
 */
export function RuneSubLine({ property, name, format, as: Element = 'span', className = 'rune-sub', children }: {
  property: RuneSubProperty;
  name: string;
  format: (value: number) => string;
  /** `li` where the caller lists the lines. */
  as?: 'span' | 'li';
  className?: string;
  /** Further marks after the gem mark, such as the simulator's roll count. */
  children?: ReactNode;
}) {
  const ground = property.grind > 0;
  const facts = [
    ground ? `includes Grindstone +${format(property.grind)}` : undefined,
    property.gemmed ? 'from an Enchanted Gem' : undefined,
  ].filter((fact): fact is string => fact !== undefined);
  return <Element className={className} data-ground={ground ? 'true' : undefined}
    title={facts.length > 0 ? `${name} ${format(runeSubValue(property))}, ${facts.join(', ')}` : undefined}>
    <span className="rune-sub-name">{name}</span>
    <span className="rune-sub-value">{format(runeSubValue(property))}</span>
    <span className="rune-sub-marks">
      {property.gemmed && <CircularArrowsMark label={`${name} came from an Enchanted Gem`} className="rune-sub-gem" />}
      {ground && <span className="visually-hidden">, includes Grindstone +{format(property.grind)}</span>}
      {children}
    </span>
  </Element>;
}
