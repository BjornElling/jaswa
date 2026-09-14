import type { PresetChoice } from '../lib/rune-potential-presets';

/**
 * The three-state chip row, shared by every place a user says what they want.
 *
 * It lives here rather than beside one of its callers because two of them now
 * exist — a rune preset's role card and a monster's own preferences — and a
 * second, almost identical chip editor is exactly how one control becomes two
 * that drift apart.
 *
 * A chip cycles none → preferred → acceptable → none. Its box is identical in
 * all three states, so cycling one cannot re-wrap the row around it
 * (`AGENTS.md` §2): the state is carried by colour and by a fixed-size mark,
 * never by a word appearing or a weight changing.
 */

const described = { none: 'not wanted', preferred: 'preferred', acceptable: 'acceptable' } as const;
const nextStep = { none: 'prefer it', preferred: 'accept it', acceptable: 'clear it' } as const;

export type ChoiceState = keyof typeof described;

export function ChoiceLegend() {
  return <p className="choice-legend">
    <span className="choice-legend-item"><span className="choice-key preferred" aria-hidden="true" />Preferred</span>
    <span className="choice-legend-item"><span className="choice-key acceptable" aria-hidden="true" />Acceptable</span>
    <span className="choice-legend-hint">click to cycle</span>
  </p>;
}

/**
 * One chip, told what it is rather than working it out.
 *
 * Taking the state and the label as given is what lets the monster overlay use
 * the same chip for a map keyed by a numeric property id, where the preset
 * editor uses it for a list of strings. `note` is appended to the accessible
 * name, so a chip standing in from the community statistics can say so to a
 * screen reader rather than relying on its dashed border alone.
 */
export function ChoiceChip({ state, label, note, onCycle }: {
  state: ChoiceState;
  label: string;
  note?: string;
  onCycle: () => void;
}) {
  const reading = note === undefined ? described[state] : `${described[state]}, ${note}`;
  return <button
    type="button"
    className={`choice-chip ${state}`}
    onClick={onCycle}
    aria-pressed={state !== 'none'}
    aria-label={`${label}: ${reading}`}
    title={`${label}: ${reading} — click to ${nextStep[state]}`}
  >
    <span className="choice-chip-mark" aria-hidden="true" />
    {label}
  </button>;
}

export function ChoiceEditor<T extends string>({ choice, options, columns = false, onChange }: {
  choice: PresetChoice<T>;
  options: readonly T[];
  columns?: boolean;
  onChange: (choice: PresetChoice<T>) => void;
}) {
  function state(option: T): ChoiceState {
    if (choice.preferred.includes(option)) return 'preferred';
    if (choice.acceptable.includes(option)) return 'acceptable';
    return 'none';
  }
  function cycle(option: T) {
    const without = {
      preferred: choice.preferred.filter((entry) => entry !== option),
      acceptable: choice.acceptable.filter((entry) => entry !== option),
    };
    if (state(option) === 'none') return onChange({ ...without, preferred: [...without.preferred, option] });
    if (state(option) === 'preferred') return onChange({ ...without, acceptable: [...without.acceptable, option] });
    onChange(without);
  }

  return <div className={columns ? 'choice-editor columns' : 'choice-editor'}>
    {options.map((option) => <ChoiceChip
      key={option}
      state={state(option)}
      label={option}
      onCycle={() => cycle(option)}
    />)}
  </div>;
}
