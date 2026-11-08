import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { ImportRoute } from '../lib/types';

export function CheckboxRow({ label, checked, onChange, disabled = false, title }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; title?: string }) {
  return <label className="checkbox-row" data-disabled={disabled || undefined} title={title}>
    <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>;
}

/** Option cards share one native radio group, so the browser exposes their
    exclusivity even when the visual control is the whole card. */
export function OptionCard<Value extends string>({ option, name, namePlacement = 'header', qualifier, radioName, value, current, onChoose, children }: {
  option: string;
  name: string;
  /** Some setting choices need their descriptive title to belong to the body,
      leaving only the source itself inside the clickable option header. */
  namePlacement?: 'header' | 'body';
  /** An option's condition is read as part of its name when the name lives in
      the header; a body title is available when the copy belongs there. */
  qualifier?: string;
  radioName: string;
  value: Value;
  current: Value;
  onChoose: (value: Value) => void;
  children: ReactNode;
}) {
  const chosen = current === value;
  const nameInBody = namePlacement === 'body';
  return <div className={chosen ? 'import-route chosen' : 'import-route'}>
    <label className={nameInBody ? 'route-head route-head-body-title' : 'route-head'}>
      <input type="radio" name={radioName} value={value} checked={chosen}
        onChange={() => onChoose(value)} />
      <span className="route-head-text">
        <span className="route-option">{option}</span>
        {!nameInBody && <span className="route-name">
            {name}
            {/* The gap before the qualifier is a margin, not this space, so the
                distance can be set against the heading's size rather than the
                font's idea of a word space. */}
            {qualifier && <span className="route-qualifier">({qualifier})</span>}
          </span>}
      </span>
    </label>
    <div className={nameInBody ? 'route-body route-body-with-title' : 'route-body'} inert={!chosen}>
      {nameInBody && <h3 className="route-body-title">{name}</h3>}
      {children}
    </div>
  </div>;
}

export function ImportRouteCard({ option, name, qualifier, value, current, onChoose, children }: {
  option: string;
  name: string;
  qualifier?: string;
  value: ImportRoute;
  current: ImportRoute;
  onChoose: (value: ImportRoute) => void;
  children: ReactNode;
}) {
  return <OptionCard
    option={option}
    name={name}
    qualifier={qualifier}
    radioName="import-route"
    value={value}
    current={current}
    onChoose={onChoose}
  >{children}</OptionCard>;
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
