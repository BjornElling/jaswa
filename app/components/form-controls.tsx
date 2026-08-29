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
export function ImportRouteCard({ option, name, value, current, onChoose, children }: {
  option: string;
  name: string;
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
        <span className="route-name">{name}</span>
      </span>
    </label>
    <div className="route-body" inert={!chosen}>
      {children}
    </div>
  </div>;
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
