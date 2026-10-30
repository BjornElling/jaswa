import { TokenChoiceLine } from './token-choice-field';
import type { TokenChoiceOption } from './token-choice-field';
import type { BandedChoices } from '../lib/monster-preferences';
import { bandedChoices } from '../lib/monster-preferences';

export type ChoiceBand = keyof BandedChoices<unknown>;

const bandNames: Record<ChoiceBand, string> = { preferred: 'preferred', acceptable: 'accepted' };

/**
 * One band of a gear answer, on the token line every other answer in the
 * overlay uses: what is chosen as pills, and the rest of the line as the menu
 * that adds one.
 *
 * The menu offers only what neither band holds. An option is preferred or
 * accepted, never both, and offering it in the second band while it sits in the
 * first would ask the user to hold that rule in their head; moving one is taking
 * it off here and adding it there, which is two moves the user can see.
 *
 * The empty line reads `Default` while the whole answer is empty — two empty
 * bands are no answer, so the default answers (`statedAnswer`) — and `None`
 * once the other band names something, when an empty band is a real statement.
 */
export function BandedChoiceLine<T extends string | number>({ name, band, options, value, onChange }: {
  /** What the question is called, before the band — `Artifact main stat`. */
  name: string;
  band: ChoiceBand;
  options: readonly TokenChoiceOption<T>[];
  /** The stated answer, or `undefined` where the default still stands in. */
  value: BandedChoices<T> | undefined;
  onChange: (next: BandedChoices<T>) => void;
}) {
  const label = `${name}, ${bandNames[band]}`;
  const chosen = value?.[band] ?? [];
  const taken = new Set(bandedChoices(value));
  /* In the vocabulary's own order rather than the order chosen, so a pill does
     not jump when its neighbour is removed. */
  const picked = options.filter((option) => chosen.includes(option.value));
  const offered = options.filter((option) => !taken.has(option.value));
  const write = (next: T[]) => onChange({
    preferred: band === 'preferred' ? next : value?.preferred ?? [],
    acceptable: band === 'acceptable' ? next : value?.acceptable ?? [],
  });
  return <TokenChoiceLine name={label} description={label} className="overlay-band-field"
    empty={taken.size === 0 ? 'Default' : 'None'}
    pills={picked}
    onRemove={(option) => write(chosen.filter((entry) => entry !== option))}
    renderMenu={(close) => <ul className="token-choice-list">
      {offered.map((option) => <li key={String(option.value)}>
        <button type="button" role="menuitem" className="token-choice-option"
          onClick={() => { write([...chosen, option.value]); close(); }}>{option.label}</button>
      </li>)}
      {offered.length === 0 && <li className="token-choice-note">
        {options.length === 0 ? 'Nothing to choose from.' : 'Everything is chosen.'}
      </li>}
    </ul>} />;
}
