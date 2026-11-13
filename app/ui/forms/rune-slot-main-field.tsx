import { TokenChoiceLine } from './token-choice-field';
import type { RuneSlotMain } from '../../domain/runes/rune-slot-mains';

/**
 * The mains one slot will accept, on the token line the builds answer on: each
 * main is a pill with its own ✕, and the menu offers every other main the slot
 * can carry, bare. The population's shares are read under the field, never in
 * the menu: a percentage beside an option leans on the choice it is meant only
 * to inform. Removing the last pill leaves an empty list, which reads `Any`.
 *
 * One control for the monster profile and for Rune Optimization, because the two
 * ask the same question — the profile for every calculation, the optimizer for
 * one — and two fields answering it would soon answer it differently.
 */
export function RuneSlotMainField({ slot, options, chosen, onChange, className = 'overlay-slot-field', name }: {
  slot: number;
  options: readonly RuneSlotMain[];
  chosen: readonly RuneSlotMain[];
  onChange: (next: RuneSlotMain[]) => void;
  className?: string;
  /** The field's accessible name, where the page needs one of its own. */
  name?: string;
}) {
  const label = name ?? `Slot ${slot} main stat`;
  /* In the slot's own order rather than the order chosen, so a pill does not
     jump when its neighbour is removed. */
  const picked = options.filter((stat) => chosen.includes(stat));
  const offered = options.filter((stat) => !chosen.includes(stat));
  return <TokenChoiceLine name={label} description={label} className={className} empty="Any"
    pills={picked.map((stat) => ({ value: stat, label: stat }))}
    onRemove={(stat) => onChange(chosen.filter((entry) => entry !== stat))}
    renderMenu={(close) => <ul className="token-choice-list">
      {offered.map((stat) => <li key={stat}>
        <button type="button" role="menuitem" className="token-choice-option"
          onClick={() => { onChange([...chosen, stat]); close(); }}>{stat}</button>
      </li>)}
      {offered.length === 0 && <li className="token-choice-note">Everything is chosen.</li>}
    </ul>} />;
}
