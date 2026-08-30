import { useMemo } from 'react';
import { RadioRow } from './form-controls';
import {
  availableTimeZones, formattingHour12, formattingLocale, formattingTimeZone,
  systemTimeZone, systemUsesTwelveHourClock,
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

export function GeneralSettings({ settings, saveFolder, canChooseFolder, onChange, onChooseFolder, onForgetFolder }: {
  settings: GeneralSettingsValue;
  saveFolder: string | null;
  canChooseFolder: boolean;
  onChange: (update: Partial<GeneralSettingsValue>) => void;
  onChooseFolder: () => void;
  onForgetFolder: () => void;
}) {
  /* 418 zones built into one array on every keystroke elsewhere on the page is
     work nobody asked for. */
  const timeZones = useMemo(() => availableTimeZones(), []);
  /* Read once per render rather than stored: a laptop that crosses a border
     between sessions should describe itself correctly without the user
     re-opening this page to refresh a cached string. */
  const computerZone = systemTimeZone();
  const computerClock = systemUsesTwelveHourClock() ? '12-hour' : '24-hour';

  return <section className="panel">
    <h3 className="block-title">General settings</h3>
    <div className="stack">
      <p className="lead">
        How JASWA writes numbers, dates and times, and where it puts the files
        you download. Each one can simply follow this computer.
      </p>

      <div className="general-grid">
        <fieldset className="route-modes">
          <legend className="field-legend">Numbers</legend>
          <RadioRow<NumberFormatChoice>
            name="number-format" value="system" current={settings.numberFormat}
            onChange={(value) => onChange({ numberFormat: value })}
            label="Use this computer's setting"
            note="Follows the format your operating system is set to." />
          <RadioRow<NumberFormatChoice>
            name="number-format" value="european" current={settings.numberFormat}
            onChange={(value) => onChange({ numberFormat: value })}
            label="European"
            note="1.234.567,89 — point for thousands, comma for decimals." />
          <RadioRow<NumberFormatChoice>
            name="number-format" value="american" current={settings.numberFormat}
            onChange={(value) => onChange({ numberFormat: value })}
            label="American"
            note="1,234,567.89 — comma for thousands, point for decimals." />
        </fieldset>

        <fieldset className="route-modes">
          <legend className="field-legend">Clock</legend>
          <RadioRow<HourCycleChoice>
            name="hour-cycle" value="system" current={settings.hourCycle}
            onChange={(value) => onChange({ hourCycle: value })}
            label="Use this computer's setting"
            note={`Your computer is set to a ${computerClock} clock.`} />
          <RadioRow<HourCycleChoice>
            name="hour-cycle" value="h23" current={settings.hourCycle}
            onChange={(value) => onChange({ hourCycle: value })}
            label="24-hour"
            note="15:04, and midnight is 00:00." />
          <RadioRow<HourCycleChoice>
            name="hour-cycle" value="h12" current={settings.hourCycle}
            onChange={(value) => onChange({ hourCycle: value })}
            label="12-hour"
            note="3:04 PM, and midnight is 12:00 AM." />
        </fieldset>

        <fieldset className="route-modes">
          <legend className="field-legend">Time zone</legend>
          <RadioRow<TimeZoneChoice>
            name="time-zone" value="system" current={settings.timeZone}
            onChange={(value) => onChange({ timeZone: value })}
            label="Use this computer's time zone"
            note={`Your computer reports ${computerZone}.`} />
          <RadioRow<TimeZoneChoice>
            name="time-zone" value="manual" current={settings.timeZone}
            onChange={(value) => onChange({ timeZone: value })}
            label="Choose a time zone"
            note="Useful when you play on an account that keeps another day." />
          {/* The select keeps its place in both states rather than appearing on
              selection, which would move everything below it. Disabled, it
              still shows the zone it would use. */}
          <label className="field zone-field">
            <span className="visually-hidden">Time zone</span>
            <select value={settings.manualTimeZone} disabled={settings.timeZone !== 'manual'}
              onChange={(event) => onChange({ manualTimeZone: event.target.value })}>
              {timeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </label>
        </fieldset>
      </div>

      {/* One line showing every choice above at once, so the effect is visible
          where it is chosen rather than only on some other page. */}
      <p className="format-sample">
        <span className="sample-label">Preview</span>
        <span className="sample-value">{sampleText(settings)}</span>
      </p>

      <div className="settings-divider" />

      <fieldset className="route-modes">
        <legend className="field-legend">Default save location</legend>
        {canChooseFolder
          ? <div className="stack tight">
            <p className="lead">
              JSON and .sw files are written straight into this folder. Without
              one, they go wherever your browser puts downloads.
            </p>
            {/* The label does not change with the folder: "Choose" and "Change"
                are the same count of characters but not the same width, and in
                a wrapping row that moves the button beside it. The line below
                carries the state instead. */}
            <div className="button-row save-folder-actions">
              <button className="button" onClick={onChooseFolder}>Choose folder…</button>
              <button className="button" onClick={onForgetFolder} disabled={!saveFolder}>
                Use browser downloads
              </button>
            </div>
            {/* Reserved in both states so choosing a folder does not push the
                panel below it down the page. */}
            <p className="save-folder-line">
              <span className="sample-label">Folder</span>
              <span className="sample-value">{saveFolder ?? 'Your browser’s download folder'}</span>
            </p>
          </div>
          : <p className="lead">
            This browser does not let a page choose a folder, so downloads go
            where your browser sends them. Chrome and Edge support it; Firefox
            and Safari do not.
          </p>}
      </fieldset>
    </div>
  </section>;
}
