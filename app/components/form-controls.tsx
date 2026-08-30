import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { ImportRoute } from '../lib/types';

export function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-row">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>;
}

/** The two import routes share one native radio group, so the browser exposes
    their exclusivity even when the visual control is the whole card. */
export function ImportRouteCard({ option, name, qualifier, value, current, onChoose, children }: {
  option: string;
  name: string;
  /** The condition the route only works under, read as part of its name rather
      than as a note further down: whoever cannot use the route learns it while
      reading the heading, before the body argues for it. */
  qualifier?: string;
  value: ImportRoute;
  current: ImportRoute;
  onChoose: (value: ImportRoute) => void;
  children: ReactNode;
}) {
  const chosen = current === value;
  return <div className={chosen ? 'import-route chosen' : 'import-route'}>
    <label className="route-head">
      <input type="radio" name="import-route" value={value} checked={chosen}
        onChange={() => onChoose(value)} />
      <span className="route-head-text">
        <span className="route-option">{option}</span>
        <span className="route-name">
          {name}
          {/* The gap before the qualifier is a margin, not this space, so the
              distance can be set against the heading's size rather than the
              font's idea of a word space. */}
          {qualifier && <span className="route-qualifier">({qualifier})</span>}
        </span>
      </span>
    </label>
    <div className="route-body" inert={!chosen}>
      {children}
    </div>
  </div>;
}

/**
 * A radio group laid out along its label's own line, each option carrying only
 * its name. Where `RadioRow` gives every option a sentence, this is for the
 * settings whose options say what they mean on sight — "24-hour", or the
 * separators written out as the number they produce.
 */
export function RadioLine<Value extends string>({ name, legend, options, current, onChange, children, childrenAfter }: {
  name: string;
  legend: string;
  options: Array<{ value: Value; label: string }>;
  current: Value;
  onChange: (value: Value) => void;
  children?: ReactNode;
  /** The option `children` belong to, so a control that completes one option
      sits beside it rather than at the end of a line it does not answer.
      Without it the children close the row. */
  childrenAfter?: Value;
}) {
  return <fieldset className="radio-line">
    <legend className="radio-line-legend">{legend}</legend>
    <div className="radio-line-options">
      {options.map((option) => <Fragment key={option.value}>
        <label className="radio-chip">
          <input type="radio" name={name} value={option.value} checked={current === option.value}
            onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
        {childrenAfter === option.value && children}
      </Fragment>)}
      {childrenAfter === undefined && children}
    </div>
  </fieldset>;
}

export function RadioRow<Value extends string>({ name, label, note, value, current, onChange }: {
  name: string;
  label: string;
  note: string;
  value: Value;
  current: Value;
  onChange: (value: Value) => void;
}) {
  return <label className="radio-row">
    <input type="radio" name={name} value={value} checked={current === value}
      onChange={() => onChange(value)} />
    <span className="radio-text">
      <b>{label}</b>
      <span className="radio-note">{note}</span>
    </span>
  </label>;
}
