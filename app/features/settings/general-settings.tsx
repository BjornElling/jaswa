import { useMemo } from 'react';
import { Button } from '../../ui/button';
import { RadioLine } from '../../ui/form-controls';
import { Dropdown } from '../../ui/dropdown';
import { availableTimeZones, clockSample, dateSample, numberSample } from '../../domain/shared/regional-settings';
import type {
  DateOrderChoice, GeneralSettings as GeneralSettingsValue, HourCycleChoice,
  NumberFormatChoice, TimeZoneChoice,
} from '../../domain/model';

/* The explicit options are labelled with what they actually write, taken from
   the same formatter the app uses, so a label cannot drift from its result.
   They come first because they are the answer to the question; Automatic
   closes each line as the way out of choosing. */
const numberChoices: NumberFormatChoice[] = ['european', 'american', 'system'];
const dateChoices: DateOrderChoice[] = ['european', 'american', 'system'];
const clockChoices: HourCycleChoice[] = ['h23', 'h12', 'system'];

function sampled<Value extends string>(choices: Value[], sample: (choice: Value) => string) {
  return choices.map((value) => ({
    value,
    label: value === 'system' ? 'Automatic' : sample(value),
  }));
}

const zoneOptions: Array<{ value: TimeZoneChoice; label: string }> = [
  { value: 'manual', label: 'Choose' },
  { value: 'system', label: 'Automatic' },
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
        <Button size="compact" onClick={onChooseFolder}>Choose folder…</Button>
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

  /* Formats and Time first: they are the settings a user comes here to change.
     The file questions below them are the ones you set once and then leave. */
  return <>
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
          onChange={(value) => onChange({ timeZone: value })}
          childrenAfter="manual">
          {/* The select keeps its place on the line whichever option is chosen,
              rather than appearing on selection and moving the row. Disabled,
              it still shows the zone it would use. */}
          <label className="zone-select">
            <span className="visually-hidden">Time zone</span>
            <Dropdown value={settings.manualTimeZone} disabled={settings.timeZone !== 'manual'}
              onChange={(event) => onChange({ manualTimeZone: event.target.value })}>
              {timeZones.map(({ zone, label }) => <option key={zone} value={zone}>{label}</option>)}
            </Dropdown>
          </label>
        </RadioLine>
      </div>
    </section>

    <section className="panel">
      <h3 className="block-title">Export/import personalization</h3>
      <div className="stack">
        <p className="lead">
          The browser remembers your personalized settings for rune and
          artifact optimization, but in case you’d like an offline copy,
          this is where the magic happens.
        </p>
        <div className="button-row">
          <Button onClick={onExport}>Download .sw file</Button>
          <Button onClick={onImport}>Load .sw file</Button>
        </div>
      </div>
    </section>

    <section className="panel">
      <h3 className="block-title">File location</h3>
      <div className="stack">
        <p className="lead">Where to store your .sw stash and go looking for JSON files.</p>
        <SaveLocation
          saveFolder={saveFolder}
          canChooseFolder={canChooseFolder}
          onChooseFolder={onChooseFolder}
          onForgetFolder={onForgetFolder}
        />
      </div>
    </section>
  </>;
}
