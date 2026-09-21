import { useMemo, useState } from 'react';
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import { Button, FilterButton } from './button';
import { CircularArrowsMark } from './converted-artifact-mark';
import { Dropdown } from './dropdown';
import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import { AncientName } from './ancient-mark';
import {
  allRuneSetNames,
} from '../lib/rune-sets';
import {
  runeStatName, runeSubValue,
} from '../lib/runes';
import { slotMainProperties } from '../lib/rune-properties';
import type {
  RuneSimulationConfig, RuneSimulationResult, SimulationStage,
  SimulationCheckpointPolicy,
  SimulationSubProperty as SimulatedSubProperty,
} from '../lib/rune-simulator';
import {
  defaultRuneSimulationConfig, simulateRunes, simulationSetEffect, simulationStages,
  simulationNoRuneType, simulationStatLabel,
} from '../lib/rune-simulator';
import type { ImportedGame, ItemGrade, RunePotentialSettings } from '../lib/types';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import { referenceLines, noReferenceLineMessage } from '../lib/rune-reference-stats';
import {
  craftAssumptionForSetting, craftRollDescriptions, craftRollLabels,
} from '../lib/rune-craft-items';

type FormState = {
  count: string;
  setName: string;
  slot: string;
  stars: string;
  lineage: RuneSimulationConfig['lineage'];
  mainStatId: string;
  gateZero: string;
  gateNine: string;
  gateTwelve: string;
};

const initialForm: FormState = {
  count: String(defaultRuneSimulationConfig.count),
  setName: '',
  slot: '',
  stars: String(defaultRuneSimulationConfig.stars),
  lineage: defaultRuneSimulationConfig.lineage,
  mainStatId: '',
  gateZero: 'keep-all',
  gateNine: 'keep-all',
  gateTwelve: 'keep-all',
};

const gateOptions = [
  { value: 'keep-all', label: 'Keep all' },
  { value: 'recommendation', label: 'Sell according to recommendation' },
] as const;

function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveCount(value: string): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 1 && parsed <= 1000 ? parsed : null;
}

function gate(policy: string): { policy: SimulationCheckpointPolicy } {
  return { policy: policy as SimulationCheckpointPolicy };
}

function toConfig(form: FormState, count: number, settings: RunePotentialSettings): RuneSimulationConfig {
  const slot = numberOrNull(form.slot);
  const stars = numberOrNull(form.stars);
  return {
    count,
    setName: form.setName || null,
    slot,
    stars: form.lineage === 'ancient' ? 6 : stars,
    lineage: form.lineage,
    mainStatId: numberOrNull(form.mainStatId),
    gates: {
      0: gate(form.gateZero),
      9: gate(form.gateNine),
      12: gate(form.gateTwelve),
    },
    craftSettings: {
      enchantedGems: settings.enchantedGems,
      grindstones: settings.grindstones,
      gemGrade: settings.gemGrade,
      grindstoneGrade: settings.grindstoneGrade,
    },
  };
}

function stageLabel(stage: SimulationStage): string {
  return `+${stage}`;
}

function setFormValue<K extends keyof FormState>(setForm: Dispatch<SetStateAction<FormState>>, key: K, value: FormState[K]) {
  setForm((current) => ({ ...current, [key]: value }));
}

export function RuneSimulatorSection({ game, settings, presets }: {
  game: ImportedGame | null;
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<RuneSimulationResult | null>(null);
  const [stage, setStage] = useState<SimulationStage>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

  const selectedSlot = numberOrNull(form.slot);
  const mainOptions = useMemo(() => selectedSlot === null
    ? Object.values(slotMainProperties).flat().filter((value, at, values) => values.indexOf(value) === at)
    : slotMainProperties[selectedSlot] ?? [], [selectedSlot]);

  const requiresRecommendation = [form.gateZero, form.gateNine, form.gateTwelve]
    .some((policy) => policy === 'recommendation');
  const count = positiveCount(form.count);

  function reset() {
    setForm(initialForm);
    setMessage('');
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count === null) {
      setMessage('Choose between 1 and 1,000 runes.');
      return;
    }
    if (requiresRecommendation && base === null) {
      setMessage(noReferenceLineMessage);
      return;
    }
    if (requiresRecommendation && presets.length === 0) {
      setMessage('Add a Rune Clean-up preset before using recommendation sell rules.');
      return;
    }
    setBusy(true);
    setMessage('');
    /* Let the button paint its busy state before a large batch occupies the
       main thread. The actual experiment remains synchronous and deterministic
       for the supplied random source, which keeps one rule for every caller. */
    window.setTimeout(() => {
      try {
        const next = simulateRunes(toConfig(form, count, settings), { presets, settings, base });
        setResult(next);
        setStage(0);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'The simulator could not generate these runes.');
      } finally {
        setBusy(false);
      }
    }, 0);
  }

  return <WorkspacePage
    header={<PageHeader
      eyebrow="Technical"
      title="Rune Simulator"
      tagline="Roll the dice, stop at +0, +9 and +12, and see exactly what survives the climb." />}
  >
    <p className="lead rune-simulator-lead">
      Generate a controlled batch of legal runes. The same model handles their
      substats, power-ups, settings-driven craft actions and every sell decision between stages.
    </p>

    <form className="filter-panel rune-simulator-filters" onSubmit={generate}>
      <div className="filter-group rune-simulator-count">
        <label className="filter-label" htmlFor="rune-simulator-count">Quantity</label>
        <div className="filter-group-controls">
          <input id="rune-simulator-count" className="rune-simulator-count-input" type="number"
            min="1" max="1000" step="1" value={form.count}
            onChange={(event) => setFormValue(setForm, 'count', event.target.value)}
            aria-describedby="rune-simulator-count-note" />
        </div>
        <span id="rune-simulator-count-note" className="rune-simulator-note type-caption">1–1,000 copies</span>
      </div>

      <SimulatorSelect id="rune-simulator-set" label="Rune set" value={form.setName}
        className="rune-simulator-set"
        placeholder="None" onChange={(value) => setFormValue(setForm, 'setName', value)}>
        {allRuneSetNames.map((setName) => <option key={setName} value={setName}>{setName}</option>)}
      </SimulatorSelect>

      <SimulatorSelect id="rune-simulator-slot" label="Slot" value={form.slot}
        className="rune-simulator-slot"
        placeholder="Any slot" onChange={(value) => {
          setForm((current) => ({ ...current, slot: value, mainStatId: '' }));
        }}>
        {[1, 2, 3, 4, 5, 6].map((slot) => <option key={slot} value={slot}>Slot {slot}</option>)}
      </SimulatorSelect>

      <SimulatorSelect id="rune-simulator-stars" label="Stars" value={form.lineage === 'ancient' ? '6' : form.stars}
        className="rune-simulator-stars"
        placeholder="Any stars" disabled={form.lineage === 'ancient'} onChange={(value) => setFormValue(setForm, 'stars', value)}>
        {[1, 2, 3, 4, 5, 6].map((stars) => <option key={stars} value={stars}>{stars}★</option>)}
      </SimulatorSelect>

      <div className="filter-group rune-simulator-lineage" role="group" aria-label="Rune lineage">
        <span className="filter-label">Lineage</span>
        <div className="filter-group-controls">
          <FilterButton active={form.lineage === 'ordinary'} onClick={() => setFormValue(setForm, 'lineage', 'ordinary')}>Standard</FilterButton>
          <FilterButton active={form.lineage === 'ancient'} onClick={() => setFormValue(setForm, 'lineage', 'ancient')}>Ancient</FilterButton>
        </div>
      </div>

      <SimulatorSelect id="rune-simulator-main" label="Main stat" value={form.mainStatId}
        className="rune-simulator-main"
        placeholder="Any legal main" onChange={(value) => setFormValue(setForm, 'mainStatId', value)}>
        {mainOptions.map((statId) => <option key={statId} value={statId}>{runeStatName(statId)}</option>)}
      </SimulatorSelect>

      <GateSelect id="rune-simulator-gate-zero" label="After +0" value={form.gateZero}
        className="rune-simulator-gate-zero" onChange={(value) => setFormValue(setForm, 'gateZero', value)} />
      <GateSelect id="rune-simulator-gate-nine" label="After +9" value={form.gateNine}
        className="rune-simulator-gate-nine" onChange={(value) => setFormValue(setForm, 'gateNine', value)} />
      <GateSelect id="rune-simulator-gate-twelve" label="After +12" value={form.gateTwelve}
        className="rune-simulator-gate-twelve" onChange={(value) => setFormValue(setForm, 'gateTwelve', value)} />

      <CraftSettingsReadout settings={settings} />

      <div className="filter-panel-actions rune-simulator-actions">
        <Button type="submit" tone="primary" size="prominent" disabled={count === null || busy} busy={busy} busyLabel="Generating runes">
          Generate runes
        </Button>
        <button type="button" className="filter-reset" onClick={reset}>Reset filters</button>
      </div>
    </form>

    {message && <p className="calculation-status" data-failed role="alert">{message}</p>}

    {!result
      ? <section className="empty-state rune-simulator-empty">
        <h2>Nothing generated yet.</h2>
        <p className="next-step">Choose the rune conditions above, then press Generate runes to watch the batch move through +0, +9 and +12.</p>
      </section>
      : <RuneSimulationResults result={result} stage={stage} onStageChange={setStage} />}
  </WorkspacePage>;
}

function craftSettingValue(step: number, grade: ItemGrade): string {
  const assumption = craftAssumptionForSetting(step);
  return `${assumption === null ? 'Off' : craftRollLabels[assumption]} · ${grade}`;
}

function craftSettingNote(step: number): string {
  const assumption = craftAssumptionForSetting(step);
  return assumption === null
    ? 'No item is applied.'
    : `Rolls at ${craftRollDescriptions[assumption]}; rounded away from zero.`;
}

function CraftSettingsReadout({ settings }: { settings: RunePotentialSettings }) {
  return <div className="rune-simulator-craft-readout" aria-label="Rune Clean-up craft settings">
    <div className="rune-simulator-readout">
      <span className="filter-label">Enchanted Gem</span>
      <output className="rune-simulator-readout-value type-body-emphasis">{craftSettingValue(settings.enchantedGems, settings.gemGrade)}</output>
      <span className="type-caption">Locked to Rune Clean-up Settings</span>
      <span className="type-caption">{craftSettingNote(settings.enchantedGems)}</span>
    </div>
    <div className="rune-simulator-readout">
      <span className="filter-label">Grindstone</span>
      <output className="rune-simulator-readout-value type-body-emphasis">{craftSettingValue(settings.grindstones, settings.grindstoneGrade)}</output>
      <span className="type-caption">Locked to Rune Clean-up Settings</span>
      <span className="type-caption">{craftSettingNote(settings.grindstones)}</span>
    </div>
    <p className="rune-simulator-craft-note type-caption">
      The resulting whole-number craft value appears beside each enchanted or ground substat below.
    </p>
  </div>;
}

function SimulatorSelect({ id, label, className, value, placeholder, disabled, children, onChange }: {
  id: string;
  label: string;
  className?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return <div className={['filter-group', 'rune-simulator-select-group', className].filter(Boolean).join(' ')}>
    <label className="filter-label" htmlFor={id}>{label}</label>
    <div className="filter-group-controls">
      <Dropdown id={id} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(event) => onChange(event.target.value)}>{children}</Dropdown>
    </div>
  </div>;
}

function GateSelect({ id, label, value, className, onChange }: {
  id: string; label: string; value: string; className?: string; onChange: (value: string) => void;
}) {
  return <div className={['filter-group', 'rune-simulator-gate', className].filter(Boolean).join(' ')}>
    <label className="filter-label" htmlFor={id}>{label}</label>
    <div className="filter-group-controls">
      <Dropdown id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {gateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Dropdown>
    </div>
  </div>;
}

function PowerUpArrow() {
  return <svg className="rune-simulator-roll-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13V3" />
    <path d="m4.5 6.5 3.5-3.5 3.5 3.5" />
  </svg>;
}

function RuneSimulationResults({ result, stage, onStageChange }: {
  result: RuneSimulationResult;
  stage: SimulationStage;
  onStageChange: (stage: SimulationStage) => void;
}) {
  const current = result.stages[stage];
  return <section className="rune-simulator-results" aria-labelledby="rune-simulator-results-title">
    <header className="rune-simulator-results-head">
      <div>
        <p className="filter-label">Simulation results</p>
        <h2 id="rune-simulator-results-title" className="type-title">{result.summary.generated.toLocaleString('en')} runes, three checkpoints</h2>
        <p className="rune-simulator-results-note type-caption">
          Generated {result.summary.generated.toLocaleString('en')} · reached +9 {result.summary.reachedNine.toLocaleString('en')} · reached +12 {result.summary.reachedTwelve.toLocaleString('en')} · kept {result.summary.kept.toLocaleString('en')}
        </p>
      </div>
      <div className="rune-simulator-stage-tabs" role="group" aria-label="Choose simulation checkpoint">
        {simulationStages.map((option) => <FilterButton key={option} active={option === stage}
          onClick={() => onStageChange(option)}>{stageLabel(option)}</FilterButton>)}
      </div>
    </header>

    <p className="rune-simulator-stage-summary type-caption" aria-live="polite">
      {stageLabel(stage)}: {current.reached.toLocaleString('en')} entered this checkpoint, {current.survived.toLocaleString('en')} survived it, {current.sold.toLocaleString('en')} sold.
    </p>

    <div className="table-wrap card rune-simulator-table-wrap">
      <table className="grid-table rune-simulator-table">
        <thead><tr>
          <th scope="col">Set</th>
          <th scope="col">Rune</th>
          <th scope="col">Main</th>
          <th scope="col">Innate</th>
          <th scope="col">Substats</th>
          <th scope="col">Action</th>
        </tr></thead>
        <tbody>
          {current.entries.map((entry) => <SimulationRow key={entry.rune.id} entry={entry} />)}
        </tbody>
      </table>
    </div>
  </section>;
}

function SimulationRow({ entry }: { entry: RuneSimulationResult['stages'][SimulationStage]['entries'][number] }) {
  const { rune } = entry;
  return <tr>
    <td className="rune-simulator-set-cell">
      <span className="rune-simulator-set-name">{rune.setName === null
        ? simulationNoRuneType
        : <AncientName name={rune.setName} ancient={rune.ancient} />}</span>
      <span className="rune-simulator-set-effect type-caption">{rune.setName === null ? '—' : simulationSetEffect(rune.setName) ?? '—'}</span>
    </td>
    <td>
      <span className="rune-simulator-rune-name">Slot {rune.slot}</span>
      <span className="rune-simulator-rune-detail type-caption">{rune.stars}★ · {rune.defaultGrade} · +{rune.level}</span>
    </td>
    <td>{simulationStatLabel(rune.mainStatId)}</td>
    <td className={rune.prefixStatId === null ? 'muted' : ''}>
      {rune.prefixStatId === null ? '—' : `${simulationStatLabel(rune.prefixStatId)} ${rune.prefixValue}`}
    </td>
    <td className="rune-simulator-subs">
      {rune.subProperties.length === 0
        ? <span className="muted">—</span>
        : <ul>{rune.subProperties.map((property) => <SimulationSubProperty key={`${property.statId}-${property.value}-${property.rolls}`} property={property} />)}</ul>}
    </td>
    <td><span className={`rune-verdict rune-simulator-decision-${entry.decision}`} data-verdict={entry.decision}>
      {entry.decision === 'power-up' ? 'Power up' : entry.decision === 'keep' ? 'Keep' : 'Sell'}
    </span></td>
  </tr>;
}

function SimulationSubProperty({ property }: { property: SimulatedSubProperty }) {
  return <li>
    <span className="rune-simulator-sub-name">{simulationStatLabel(property.statId)}</span>
    <span className="rune-simulator-sub-value">{runeSubValue(property)}</span>
    {property.gemmed && <CircularArrowsMark label={`${simulationStatLabel(property.statId)} is enchanted`} className="rune-simulator-enchanted-mark" />}
    {property.rolls > 0 && <span className="rune-simulator-rolls type-caption" aria-label={`${property.rolls} power-up rolls in ${simulationStatLabel(property.statId)}`}>
      <PowerUpArrow /><span aria-hidden="true">{property.rolls}</span>
    </span>}
    {property.grind > 0 && <span className="rune-simulator-grind">+ {property.grind}</span>}
  </li>;
}
