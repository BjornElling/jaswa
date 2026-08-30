import { useMemo } from 'react';
import { RadioLine } from './form-controls';
import {
  availableTimeZones, formattingHour12, formattingLocale, formattingTimeZone,
} from '../lib/regional-settings';
import type { GeneralSettings as GeneralSettingsValue, HourCycleChoice, NumberFormatChoice, TimeZoneChoice } from '../lib/types';

/* A number wide enough to show both separators doing their work, and a date
   that cannot be read the wrong way round while the sample is the only place
   the choice is visible before it reaches the rest of the app. */
const sampleNumber = 1234567.89;
const sampleDate = new Date('2026-08-30T15:04:00Z');

function sampleText(settings: GeneralSettingsValue): string {
  const locale = formattingLocale(settings);
  const number = sampleNumber.toLocaleString(locale);
  const time = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: formattingTimeZone(settings),
    hour12: formattingHour12(settings),
  }).format(sampleDate);
  return `${number} · ${time}`;
}

/* The options say what they mean on sight: the two number formats are written
   as the number they produce, and the clocks as the time they produce. That
   leaves nothing for a note to add. */
const numberOptions: Array<{ value: NumberFormatChoice; label: string }> = [
  { value: 'system', label: 'Automatic' },
  { value: 'european', label: '1.234.567,89' },
  { value: 'american', label: '1,234,567.89' },
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

  return <section className="panel">
    <h3 className="block-title">General settings</h3>
    <div className="stack">
      <RadioLine<NumberFormatChoice>
        name="number-format" legend="Numbers" options={numberOptions}
        current={settings.numberFormat}
        onChange={(value) => onChange({ numberFormat: value })} />

      <RadioLine<HourCycleChoice>
        name="hour-cycle" legend="Clock" options={clockOptions}
        current={settings.hourCycle}
        onChange={(value) => onChange({ hourCycle: value })} />

      <RadioLine<TimeZoneChoice>
        name="time-zone" legend="Time zone" options={zoneOptions}
        current={settings.timeZone}
        onChange={(value) => onChange({ timeZone: value })}>
        {/* The select keeps its place on the line whichever option is chosen,
            rather than appearing on selection and moving the row. Disabled, it
            still shows the zone it would use. */}
        <label className="zone-select">
          <span className="visually-hidden">Time zone</span>
          <select value={settings.manualTimeZone} disabled={settings.timeZone !== 'manual'}
            onChange={(event) => onChange({ manualTimeZone: event.target.value })}>
            {timeZones.map(({ zone, label }) => <option key={zone} value={zone}>{label}</option>)}
          </select>
        </label>
      </RadioLine>

      <p className="format-sample">
        <span className="sample-label">Preview</span>
        <span className="sample-value">{sampleText(settings)}</span>
      </p>

      <div className="settings-divider" />

      <div className="setting-line">
        <span className="radio-line-legend">Save files to</span>
        {canChooseFolder
          ? <div className="radio-line-options">
            {/* The label does not change with the folder: "Choose" and "Change"
                are the same count of characters but not the same width, and in
                a wrapping row that moves the button beside it. The line below
                carries the state instead. */}
            <button className="button" onClick={onChooseFolder}>Choose folder…</button>
            <button className="button" onClick={onForgetFolder} disabled={!saveFolder}>
              Browser downloads
            </button>
            <span className="sample-value folder-name">{saveFolder ?? 'Browser downloads'}</span>
          </div>
          : <span className="sample-value folder-name">
            Browser downloads — this browser cannot choose a folder
          </span>}
      </div>
    </div>
  </section>;
}
