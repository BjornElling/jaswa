import { useMemo } from 'react';
import { RadioLine } from './form-controls';
import { availableTimeZones, clockSample, dateSample, numberSample } from '../lib/regional-settings';
import type {
  DateOrderChoice, GeneralSettings as GeneralSettingsValue, HourCycleChoice,
  NumberFormatChoice, TimeZoneChoice,
} from '../lib/types';

/* Every option is labelled with what it actually writes, taken from the same
   formatter the app uses, so a label cannot drift from its result. "Automatic"
   is named as well as shown: what it produces is already on the line, and the
   word is what tells the user why it might change. */
const numberChoices: NumberFormatChoice[] = ['system', 'european', 'american'];
const dateChoices: DateOrderChoice[] = ['system', 'european', 'american'];
const clockChoices: HourCycleChoice[] = ['system', 'h23', 'h12'];

function sampled<Value extends string>(choices: Value[], sample: (choice: Value) => string) {
  return choices.map((value) => ({
    value,
    label: value === 'system' ? `Automatic — ${sample(value)}` : sample(value),
  }));
}

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
        {/* The name column is reserved rather than content-sized: a folder can
            be called anything, and "(default)" is present in one state only, so
            a box that fitted its contents would put Reset in a different place
            for every folder the user picks. */}
        <span className="sample-value folder-name">
          {saveFolder ?? 'Browser downloads'}
          {/* Marks the state the app falls back to when no folder is set. */}
          {!saveFolder && <span className="value-note"> (default)</span>}
        </span>
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

export function GeneralSettings({ settings, saveFolder, canChooseFolder, onChange, onChooseFolder, onForgetFolder, onExport, onImport }: {
  settings: GeneralSettingsValue;
  saveFolder: string | null;
  canChooseFolder: boolean;
  onChange: (update: Partial<GeneralSettingsValue>) => void;
  onChooseFolder: () => void;
  onForgetFolder: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  /* 418 zones built into one array on every keystroke elsewhere on the page is
     work nobody asked for. The chosen zone is passed in so a value this
     browser does not enumerate still has an option to sit on. */
  const timeZones = useMemo(() => availableTimeZones(new Date(), settings.manualTimeZone), [settings.manualTimeZone]);
  const numberOptions = useMemo(() => sampled(numberChoices, numberSample), []);
  const dateOptions = useMemo(() => sampled(dateChoices, (choice) => dateSample(choice)), []);
  /* The clock samples are taken in the chosen date convention and zone, so
     they follow the settings above them rather than showing a separator the
     app will not use. */
  const clockOptions = useMemo(
    () => sampled(clockChoices, (choice) => clockSample(choice, settings)),
    [settings],
  );

  return <>
    <section className="panel">
      <h3 className="block-title">Preferences</h3>
      <div className="stack">
        <div className="stack tight">
          <h4 className="field-legend">File location</h4>
          <SaveLocation
            saveFolder={saveFolder}
            canChooseFolder={canChooseFolder}
            onChooseFolder={onChooseFolder}
            onForgetFolder={onForgetFolder}
          />
        </div>

        <div className="stack tight">
          <h4 className="field-legend">Export everything</h4>
          <p className="lead">
            The browser remembers your personalized settings for rune and
            artifact optimization, but in case you’d like an offline copy,
            this is where the magic happens.
          </p>
          <div className="button-row">
            <button className="button" onClick={onExport}>Download .sw file</button>
            <button className="button" onClick={onImport}>Load .sw file</button>
          </div>
        </div>
      </div>
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
