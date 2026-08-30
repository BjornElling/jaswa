import { useMemo } from 'react';
import { RadioLine } from './form-controls';
import { availableTimeZones } from '../lib/regional-settings';
import type {
  DateOrderChoice, GeneralSettings as GeneralSettingsValue, HourCycleChoice,
  NumberFormatChoice, TimeZoneChoice,
} from '../lib/types';

/* The options say what they mean on sight: the number formats are written as
   the number they produce, and the date orders as the date they produce. That
   leaves nothing for a note to add. */
const numberOptions: Array<{ value: NumberFormatChoice; label: string }> = [
  { value: 'system', label: 'Automatic' },
  { value: 'european', label: '1.234.567,89' },
  { value: 'american', label: '1,234,567.89' },
];

/* Written out with a real month name rather than as a pattern: "30 Aug 2026"
   answers the question the pattern "d mmm yyyy" only describes. */
const dateOptions: Array<{ value: DateOrderChoice; label: string }> = [
  { value: 'system', label: 'Automatic' },
  { value: 'day-first', label: '30 Aug 2026' },
  { value: 'month-first', label: 'Aug 30, 2026' },
];

const clockOptions: Array<{ value: HourCycleChoice; label: string }> = [
  { value: 'system', label: 'Automatic' },
  { value: 'h23', label: '24-hour' },
  { value: 'h12', label: '12-hour' },
];

const zoneOptions: Array<{ value: TimeZoneChoice; label: string }> = [
  { value: 'system', label: 'Automatic' },
  { value: 'manual', label: 'Choose' },
];

/**
 * Where exported files are written. The folder is shown before the button that
 * changes it: the current state is what the user came to check, and the action
 * follows from it.
 */
function SaveLocation({ saveFolder, canChooseFolder, onChooseFolder, onForgetFolder }: {
  saveFolder: string | null;
  canChooseFolder: boolean;
  onChooseFolder: () => void;
  onForgetFolder: () => void;
}) {
  if (!canChooseFolder) {
    return <p className="lead">
      This browser cannot choose a folder, so files go to your browser’s
      downloads. Chrome and Edge support it; Firefox and Safari do not.
    </p>;
  }
  return <div className="stack tight">
    <p className="setting-line">
      <span className="radio-line-legend">Current</span>
      <span className="radio-line-options">
        <span className="sample-value folder-name">{saveFolder ?? 'Browser downloads'}</span>
        {/* Present in both states so the row does not resize on the day a
            folder is chosen; without one there is nothing to reset to. */}
        <button className="text-link" onClick={onForgetFolder} disabled={!saveFolder}>Reset</button>
      </span>
    </p>
    <p className="setting-line">
      <span className="radio-line-legend" />
      <span className="radio-line-options">
        <button className="button" onClick={onChooseFolder}>Choose folder…</button>
      </span>
    </p>
  </div>;
}

export function GeneralSettings({ settings, saveFolder, canChooseFolder, onChange, onChooseFolder, onForgetFolder }: {
  settings: GeneralSettingsValue;
  saveFolder: string | null;
  canChooseFolder: boolean;
  onChange: (update: Partial<GeneralSettingsValue>) => void;
  onChooseFolder: () => void;
  onForgetFolder: () => void;
}) {
  /* 418 zones built into one array on every keystroke elsewhere on the page is
     work nobody asked for. The chosen zone is passed in so a value this
     browser does not enumerate still has an option to sit on. */
  const timeZones = useMemo(() => availableTimeZones(new Date(), settings.manualTimeZone), [settings.manualTimeZone]);

  return <>
    <section className="panel">
      <h3 className="block-title">General settings</h3>
      <SaveLocation
        saveFolder={saveFolder}
        canChooseFolder={canChooseFolder}
        onChooseFolder={onChooseFolder}
        onForgetFolder={onForgetFolder}
      />
    </section>

    <section className="panel">
      <h3 className="block-title">Formats</h3>
      <div className="stack">
        <RadioLine<NumberFormatChoice>
          name="number-format" legend="Numbers" options={numberOptions}
          current={settings.numberFormat}
          onChange={(value) => onChange({ numberFormat: value })} />
        <RadioLine<DateOrderChoice>
          name="date-order" legend="Dates" options={dateOptions}
          current={settings.dateOrder}
          onChange={(value) => onChange({ dateOrder: value })} />
      </div>
    </section>

    <section className="panel">
      <h3 className="block-title">Time</h3>
      <div className="stack">
        <RadioLine<HourCycleChoice>
          name="hour-cycle" legend="Clock" options={clockOptions}
          current={settings.hourCycle}
          onChange={(value) => onChange({ hourCycle: value })} />
        <RadioLine<TimeZoneChoice>
          name="time-zone" legend="Time zone" options={zoneOptions}
          current={settings.timeZone}
          onChange={(value) => onChange({ timeZone: value })}>
          {/* The select keeps its place on the line whichever option is chosen,
              rather than appearing on selection and moving the row. Disabled,
              it still shows the zone it would use. */}
          <label className="zone-select">
            <span className="visually-hidden">Time zone</span>
            <select value={settings.manualTimeZone} disabled={settings.timeZone !== 'manual'}
              onChange={(event) => onChange({ manualTimeZone: event.target.value })}>
              {timeZones.map(({ zone, label }) => <option key={zone} value={zone}>{label}</option>)}
            </select>
          </label>
        </RadioLine>
      </div>
    </section>
  </>;
}
