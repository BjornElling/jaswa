import { useMemo, useState } from 'react';
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import { Button, FilterButton } from './button';
import { CircularArrowsMark } from './converted-artifact-mark';
import { CalculationStatus } from './calculation-status';
import { Dropdown } from './dropdown';
import { PageHeader } from './page-chrome';
import { QualityRule, qualityRuleHost } from './quality-rule';
import { TableColumnGroup } from './data-table-page';
import { WorkspacePage } from './workspace-page';
import { allRuneSetNames } from '../lib/rune-sets';
import { runeSubValue } from '../lib/runes';
import type {
  RuneSimulationConfig, RuneSimulationResult, SimulationEntry, SimulationStage,
  SimulationCheckpointPolicy,
  SimulationSubProperty as SimulatedSubProperty,
} from '../lib/rune-simulator';
import {
  defaultRuneSimulationConfig, simulationStages,
  simulationNoRuneType, simulationStatLabel,
} from '../lib/rune-simulator';
import { runeVerdictLabels } from '../lib/rune-cleanup-advice';
import { calculateRuneSimulation } from '../lib/compute/rune-simulator-client';
import type { GeneralSettings, ImportedGame, ItemGrade, RunePotentialSettings } from '../lib/types';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import { referenceLines, noReferenceLineMessage } from '../lib/rune-reference-stats';
import {
  craftAssumptionForSetting, craftRollDescriptions, craftRollLabels,
} from '../lib/rune-craft-items';
import { columnClasses, runeSimulatorTableColumns } from '../lib/table-layouts';

type FormState = {
  count: string;
  setName: string;
  slot: string;
  stars: string;
  gateZero: string;
  gateNine: string;
  gateTwelve: string;
};

const initialForm: FormState = {
  count: String(defaultRuneSimulationConfig.count),
  setName: '',
  slot: '',
  stars: String(defaultRuneSimulationConfig.stars),
  gateZero: defaultRuneSimulationConfig.gates[0].policy,
  gateNine: defaultRuneSimulationConfig.gates[9].policy,
  gateTwelve: defaultRuneSimulationConfig.gates[12].policy,
};

const gateOptions = [
  { value: 'keep-all', label: 'Keep all' },
  { value: 'recommendation', label: 'Sell according to recommendation' },
] as const;

const slots = [1, 2, 3, 4, 5, 6] as const;

/** The presets a run was judged against, frozen with it so an edit afterwards cannot relabel it. */
type PresetLabel = { id: string; name: string };
type SimulationRun = { result: RuneSimulationResult; presets: readonly PresetLabel[] };

const cell = columnClasses(runeSimulatorTableColumns);

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

function toConfig(form: FormState, count: number): RuneSimulationConfig {
  return {
    count,
    setName: form.setName || null,
    slot: numberOrNull(form.slot),
    stars: numberOrNull(form.stars),
    gates: {
      0: gate(form.gateZero),
      9: gate(form.gateNine),
      12: gate(form.gateTwelve),
    },
  };
}

function stageLabel(stage: SimulationStage): string {
  return `+${stage}`;
}

function setFormValue<K extends keyof FormState>(setForm: Dispatch<SetStateAction<FormState>>, key: K, value: FormState[K]) {
  setForm((current) => ({ ...current, [key]: value }));
}

export function RuneSimulatorSection({ game, settings, presets, general, hardwareAcceleration }: {
  game: ImportedGame | null;
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [stage, setStage] = useState<SimulationStage>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);

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
    const judgedBy = presets.map(({ id, name }) => ({ id, name }));
    /* The experiment is deterministic for the supplied random source, which keeps one
       rule for every caller. The page sends the account-wide work to a worker, so
       generation and all three checkpoints can finish without freezing the controls. */
    void (async () => {
      try {
        const result = await calculateRuneSimulation(toConfig(form, count), {
          presets, settings, base, preferWebGpu: hardwareAcceleration,
        });
        setRun({ result, presets: judgedBy });
        setStage(0);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'The simulator could not generate these runes.');
      } finally {
        setBusy(false);
      }
    })();
  }

  return <WorkspacePage
    header={<PageHeader
      title="Rune Simulator"
      tagline="Roll the dice, stop at +0, +9 and +12, and see exactly what survives the climb." />}
  >
    <p className="lead rune-simulator-lead">
      Generate a controlled batch of legal runes. The same model handles their
      substats, power-ups, settings-driven craft actions and every sell decision between stages.
    </p>

    <form className="filter-panel rune-simulator-filters" onSubmit={generate}>
      <SimulatorSelect id="rune-simulator-set" label="Rune set" value={form.setName}
        className="rune-simulator-set"
        placeholder="None" onChange={(value) => setFormValue(setForm, 'setName', value)}>
        {allRuneSetNames.map((setName) => <option key={setName} value={setName}>{setName}</option>)}
      </SimulatorSelect>

      <SimulatorSelect id="rune-simulator-slot" label="Slot" value={form.slot}
        className="rune-simulator-slot"
        placeholder="Any slot" onChange={(value) => setFormValue(setForm, 'slot', value)}>
        {slots.map((slot) => <option key={slot} value={slot}>Slot {slot}</option>)}
      </SimulatorSelect>

      <SimulatorSelect id="rune-simulator-stars" label="Stars" value={form.stars}
        className="rune-simulator-stars"
        placeholder="Any stars" onChange={(value) => setFormValue(setForm, 'stars', value)}>
        {[1, 2, 3, 4, 5, 6].map((stars) => <option key={stars} value={stars}>{stars}★</option>)}
      </SimulatorSelect>

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

      <GateSelect id="rune-simulator-gate-zero" label="After +0" value={form.gateZero}
        className="rune-simulator-gate-zero" onChange={(value) => setFormValue(setForm, 'gateZero', value)} />
      <GateSelect id="rune-simulator-gate-nine" label="After +9" value={form.gateNine}
        className="rune-simulator-gate-nine" onChange={(value) => setFormValue(setForm, 'gateNine', value)} />
      <GateSelect id="rune-simulator-gate-twelve" label="After +12" value={form.gateTwelve}
        className="rune-simulator-gate-twelve" onChange={(value) => setFormValue(setForm, 'gateTwelve', value)} />

      <KeeperStatistics run={run} />

      <CraftSettingsReadout settings={settings} />

      <div className="filter-panel-actions rune-simulator-actions">
        <Button type="submit" tone="primary" size="prominent" disabled={count === null || busy} busy={busy} busyLabel="Generating runes">
          Generate runes
        </Button>
        <button type="button" className="filter-reset" onClick={reset}>Reset filters</button>
      </div>
    </form>

    {message && <p className="calculation-status" data-failed role="alert">{message}</p>}

    {!run
      ? <section className="empty-state rune-simulator-empty">
        <h2>Nothing generated yet.</h2>
        <p className="next-step">Choose the rune conditions above, then press Generate runes to watch the batch move through +0, +9 and +12.</p>
      </section>
      : <RuneSimulationResults result={run.result} stage={stage} onStageChange={setStage} general={general} />}
  </WorkspacePage>;
}

/**
 * How many runes Rune Clean-up keeps at +12, each counted once under the preset it
 * answers best. That is the engine's own choice of preset, so a rune two presets
 * would both keep lands in exactly one cell and the columns add up to the total.
 */
function KeeperStatistics({ run }: { run: SimulationRun | null }) {
  const counts = useMemo(() => {
    if (!run || run.result.summary.kept === null) return null;
    const rows = new Map<string, { name: string; slots: number[] }>(
      run.presets.map((preset) => [preset.id, { name: preset.name, slots: slots.map(() => 0) }]));
    for (const entry of run.result.stages[12].entries) {
      const verdict = entry.verdict;
      if (verdict?.verdict !== 'keep' || verdict.presetId === null) continue;
      /* A keeper is always judged against a preset from the frozen list; one that
         is not would be a defect in the engine, and it still gets its own row rather
         than vanishing from a total the footer claims is complete. */
      const row = rows.get(verdict.presetId) ?? { name: verdict.presetName ?? verdict.presetId, slots: slots.map(() => 0) };
      row.slots[entry.rune.slot - 1] += 1;
      rows.set(verdict.presetId, row);
    }
    const totals = slots.map((_, at) => [...rows.values()].reduce((sum, row) => sum + row.slots[at], 0));
    return { rows: [...rows.entries()], totals };
  }, [run]);
  const kept = run?.result.summary.kept ?? null;

  return <section className="rune-simulator-stats" aria-labelledby="rune-simulator-stats-title">
    <header className="rune-simulator-stats-head">
      <h3 id="rune-simulator-stats-title" className="filter-label">Kept at +12</h3>
      <output className="rune-simulator-stats-total" aria-label="Runes kept at +12">
        {kept === null ? '—' : kept.toLocaleString('en')}
      </output>
    </header>
    {counts
      ? <table className="rune-simulator-stats-table">
        <thead><tr>
          <th scope="col">Preset</th>
          {slots.map((slot) => <th key={slot} scope="col">Slot {slot}</th>)}
        </tr></thead>
        <tbody>
          {counts.rows.map(([id, row]) => <tr key={id}>
            <th scope="row" title={row.name}>{row.name}</th>
            {row.slots.map((value, at) => <td key={at} className={value === 0 ? 'muted' : undefined}>{value}</td>)}
          </tr>)}
        </tbody>
        <tfoot><tr>
          <th scope="row">All presets</th>
          {counts.totals.map((value, at) => <td key={at}>{value}</td>)}
        </tr></tfoot>
      </table>
      : <p className="rune-simulator-stats-note type-caption">
        {run === null
          ? 'Generate runes to count the keepers, preset by preset and slot by slot.'
          : 'Counting keepers needs an imported account with a level 40 monster and at least one Rune Clean-up preset.'}
      </p>}
  </section>;
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

function RuneSimulationResults({ result, stage, onStageChange, general }: {
  result: RuneSimulationResult;
  stage: SimulationStage;
  onStageChange: (stage: SimulationStage) => void;
  general: GeneralSettings;
}) {
  const current = result.stages[stage];
  const { summary } = result;
  const unjudged = current.entries.some((entry) => entry.verdict === null);
  return <section className="rune-simulator-results" aria-labelledby="rune-simulator-results-title">
    <header className="rune-simulator-results-head">
      <div>
        <p className="filter-label">Simulation results</p>
        <h2 id="rune-simulator-results-title" className="type-title">{summary.generated.toLocaleString('en')} runes, three checkpoints</h2>
        <p className="rune-simulator-results-note type-caption">
          Generated {summary.generated.toLocaleString('en')} · reached +9 {summary.reachedNine.toLocaleString('en')} · reached +12 {summary.reachedTwelve.toLocaleString('en')} · kept {summary.kept === null ? '—' : summary.kept.toLocaleString('en')}
        </p>
      </div>
      <div className="rune-simulator-stage-tabs" role="group" aria-label="Choose simulation checkpoint">
        {simulationStages.map((option) => <FilterButton key={option} active={option === stage}
          onClick={() => onStageChange(option)}>{stageLabel(option)}</FilterButton>)}
      </div>
    </header>
    <CalculationStatus durationMs={result.durationMs} backend={result.backend} general={general}
      detail="Simulation and recommendation checks" />

    <p className="rune-simulator-stage-summary type-caption" aria-live="polite">
      {stageLabel(stage)}: {current.reached.toLocaleString('en')} entered this checkpoint, {current.survived.toLocaleString('en')} survived it, {current.sold.toLocaleString('en')} sold.
      {unjudged && ' Best preset, Max value, Chance and Action need an imported account with a level 40 monster and at least one Rune Clean-up preset.'}
    </p>

    <div className="table-wrap card rune-simulator-table-wrap">
      <table className="grid-table rune-simulator-table">
        <TableColumnGroup columns={runeSimulatorTableColumns} />
        <thead><tr>
          <th scope="col" className={cell('set')}>Set</th>
          <th scope="col" className={cell('slot')}>Slot</th>
          <th scope="col" className={cell('stars')}>Stars</th>
          <th scope="col" className={cell('quality')}>Quality</th>
          <th scope="col" className={cell('level')}>Lv.</th>
          <th scope="col" className={cell('main')}>Main</th>
          <th scope="col" className={cell('innate')}>Innate</th>
          <th scope="col" className={cell('subs')}>Substats</th>
          <th scope="col" className={cell('preset')}>Best preset</th>
          <th scope="col" className={cell('maxValue')}>
            <span className="table-heading-two-line" aria-label="Max value: the best end state it can reach against a perfect ordinary rune for that slot">Max<br />value</span>
          </th>
          <th scope="col" className={cell('chance')}>
            <span aria-label="Chance to reach the quality floor by +12, or a dash for a rune already at +12">Chance</span>
          </th>
          <th scope="col" className={cell('action')}>Action</th>
        </tr></thead>
        <tbody>
          {current.entries.length
            ? current.entries.map((entry) => <SimulationRow key={entry.rune.id} entry={entry} />)
            : <tr><td className="table-empty-state" colSpan={runeSimulatorTableColumns.length}>
              No rune reached this checkpoint. Loosen an earlier sell rule to see more.
            </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

function SimulationRow({ entry }: { entry: SimulationEntry }) {
  const { rune, verdict } = entry;
  const judged = verdict !== null && verdict.presetName !== null;
  return <tr>
    <td className={cell('set', qualityRuleHost, 'rune-simulator-set')}>
      <QualityRule tier={rune.defaultGrade} />
      {rune.setName ?? simulationNoRuneType}
    </td>
    <td className={cell('slot')}>{rune.slot}</td>
    <td className={cell('stars')}>{rune.stars}</td>
    <td className={cell('quality')}>{rune.defaultGrade}</td>
    <td className={cell('level')}>+{rune.level}</td>
    <td className={cell('main')}>{simulationStatLabel(rune.mainStatId)}</td>
    <td className={cell('innate', rune.prefixStatId === null && 'muted')}>
      {rune.prefixStatId === null
        ? '—'
        : <span className="rune-simulator-property">
          <span className="rune-sub-name">{simulationStatLabel(rune.prefixStatId)}</span>
          <span className="rune-sub-value">{rune.prefixValue}</span>
        </span>}
    </td>
    <td className={cell('subs', 'rune-simulator-subs')}>
      {rune.subProperties.length === 0
        ? <span className="muted">—</span>
        : <ul>{rune.subProperties.map((property) => <SimulationSubProperty key={property.statId} property={property} />)}</ul>}
    </td>
    <td className={cell('preset', !judged && 'muted', 'rune-simulator-preset')} title={verdict?.presetName ?? undefined}>
      {verdict?.presetName ?? '—'}
    </td>
    {/* The same two figures, printed the same way, as Rune Clean-up's own table:
        a simulated rune is judged by that engine and should read like it. */}
    <td className={cell('maxValue')}>
      {judged ? `${Math.round(verdict.maxValue * 100)} %` : <span className="muted">—</span>}
    </td>
    <td className={cell('chance')}>
      {judged && rune.level < 12 ? `${Math.round(verdict.chance * 100)} %` : <span className="muted">—</span>}
    </td>
    <td className={cell('action', verdict === null && 'muted')}>
      {verdict === null
        ? '—'
        : <>
          <span className="rune-verdict" data-verdict={verdict.verdict}>{runeVerdictLabels[verdict.verdict]}</span>
          <span className="rune-advice-reason">{verdict.reason}</span>
        </>}
    </td>
  </tr>;
}

function SimulationSubProperty({ property }: { property: SimulatedSubProperty }) {
  const name = simulationStatLabel(property.statId);
  return <li className="rune-simulator-property">
    <span className="rune-sub-name">{name}</span>
    <span className="rune-sub-value">{runeSubValue(property)}</span>
    <span className="rune-simulator-marks">
      {property.gemmed && <CircularArrowsMark label={`${name} is enchanted`} className="rune-simulator-enchanted-mark" />}
      {property.rolls > 0 && <span className="rune-simulator-rolls type-caption" aria-label={`${property.rolls} power-up rolls in ${name}`}>
        <PowerUpArrow /><span aria-hidden="true">{property.rolls}</span>
      </span>}
      {property.grind > 0 && <span className="rune-simulator-grind">+ {property.grind}</span>}
    </span>
  </li>;
}
