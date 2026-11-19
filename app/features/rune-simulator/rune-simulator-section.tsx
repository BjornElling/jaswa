import { useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { FilterButton } from '../../ui/button';
import { CalculationActions, CalculationNote } from '../../ui/calculation-actions';
import { CalculationStatus } from '../../ui/calculation-status';
import { useCancellableRun } from '../../ui/use-cancellable-run';
import { isCalculationCancelled } from '../../workspace/jobs/cancellable-worker';
import { Dropdown } from '../../ui/dropdown';
import { PageHeader } from '../../ui/page-chrome';
import { QualityRule } from '../../ui/quality-rule';
import { qualityRuleHost } from '../../ui/quality-rule-host';
import { TableColumnGroup } from '../../ui/data-table-page';
import { useRowOpener } from '../../ui/use-row-opener';
import { WorkspacePage } from '../../ui/workspace-page';
import { allRuneSetNames } from '../../domain/runes/rune-sets';
import { lastSubPropertyLevel } from '../../domain/runes/rune-properties';
import type {
  RuneSimulationConfig, RuneSimulationResult, SimulationEntry, SimulationStage,
  SimulationCheckpointPolicy,
  SimulationSubProperty as SimulatedSubProperty,
} from '../../domain/runes/simulator/rune-simulator';
import {
  defaultRuneSimulationConfig, simulationRuneToCleanupRune, simulationStages,
  simulationNoRuneType, simulationStatLabel,
} from '../../domain/runes/simulator/rune-simulator';
import { simulationKeeperCounts } from '../../domain/runes/simulator/rune-simulator-keeper-counts';
import { runeChanceText, runeVerdictLabels } from '../../domain/runes/cleanup/rune-cleanup-advice';
import { calculateRuneSimulation } from '../../workspace/jobs/rune-simulator-client';
import type { GeneralSettings, ImportedGame, ItemGrade, RunePotentialSettings } from '../../domain/model';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import { referenceLines, noReferenceLineMessage } from '../../domain/reference/rune-reference-stats';
import { craftRollDescriptions, craftRollLabels } from '../../domain/runes/craft/rune-craft-items';
import type { CraftRollAssumption } from '../../domain/runes/craft/rune-craft-items';
import { canonicalCraftCredit } from '../../domain/runes/craft/rune-craft-end-state';
import { columnClasses, runeSimulatorTableColumns } from '../../ui/table-layouts';
import { RuneLink } from '../../ui/gear/rune-link';
import type { OpenRuneOverlay } from '../../ui/gear/rune-link';
import { RuneInnateLine, RuneSubLine } from '../../ui/gear/rune-sub-line';

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

/** The roles a run was judged against, frozen with it so an edit afterwards cannot relabel it. */
type RoleLabel = { id: string; name: string };
type SimulationRun = { result: RuneSimulationResult; roles: readonly RoleLabel[] };

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

export function RuneSimulatorSection({ game, settings, roles, general, hardwareAcceleration, onOpenRune }: {
  game: ImportedGame | null;
  settings: RunePotentialSettings;
  roles: RuneRole[];
  general: GeneralSettings;
  hardwareAcceleration: boolean;
  onOpenRune: OpenRuneOverlay;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [stage, setStage] = useState<SimulationStage>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  /* No run starts itself, so there is no question to remember a cancel against. */
  const cancellable = useCancellableRun('');

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

  function clear() {
    setRun(null);
    setMessage('');
  }

  function generate() {
    if (count === null) {
      setMessage('Choose between 1 and 1,000 runes.');
      return;
    }
    if (requiresRecommendation && base === null) {
      setMessage(noReferenceLineMessage);
      return;
    }
    if (requiresRecommendation && roles.length === 0) {
      setMessage('Add a Rune Clean-up role before using recommendation sell rules.');
      return;
    }
    const before = message;
    const signal = cancellable.start();
    setBusy(true);
    setMessage('');
    const judgedBy = roles.map(({ id, name }) => ({ id, name }));
    /* The experiment is deterministic for the supplied random source, which keeps one
       rule for every caller. The page sends the account-wide work to a worker, so
       generation and all three checkpoints can finish without freezing the controls. */
    void (async () => {
      try {
        const result = await calculateRuneSimulation(toConfig(form, count), {
          roles, settings, base, preferWebGpu: hardwareAcceleration,
        }, signal);
        setRun({ result, roles: judgedBy });
        setStage(0);
      } catch (error) {
        /* Cancelled: the batch from before Generate stands, and so does its message. */
        if (isCalculationCancelled(error)) setMessage(before);
        else setMessage(error instanceof Error ? error.message : 'The simulator could not generate these runes.');
      } finally {
        setBusy(false);
      }
    })();
  }

  return <WorkspacePage
    header={<PageHeader
      title="Rune Simulator"
      tagline="Roll the dice, stop at +0, +9, +12 and +15, and see exactly what survives the climb." />}
  >
    <p className="lead">
      Generate a controlled batch of legal runes. The same model handles their
      substats, power-ups, settings-driven craft actions and every sell decision between stages.
    </p>

    <form className="filter-panel rune-simulator-filters" onSubmit={(event) => { event.preventDefault(); generate(); }}>
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

      {/* How many and go, on one line: the quantity is the last thing chosen before
          generating, so the action column sits beside it. */}
      <div className="rune-simulator-run">
        <div className="filter-group rune-simulator-count">
          <label className="filter-label" htmlFor="rune-simulator-count">Quantity</label>
          <div className="filter-group-controls">
            {/* A text field rather than type="number": a quantity is typed, not nudged, and the
                spinner arrows, arrow keys and scroll wheel only offered ways to change it by accident. */}
            <input id="rune-simulator-count" className="rune-simulator-count-input" type="text"
              inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" value={form.count}
              onChange={(event) => setFormValue(setForm, 'count', event.target.value.replace(/\D/g, ''))}
              aria-describedby="rune-simulator-count-note" />
          </div>
          <span id="rune-simulator-count-note" className="rune-simulator-note type-caption">1–1,000 copies</span>
        </div>
        <CalculationActions className="rune-simulator-actions" busy={busy} canCalculate={count !== null}
          calculateTitle="Choose between 1 and 1,000 runes." onCalculate={generate} onCancel={cancellable.cancel}
          canClear={run !== null || message !== ''} onClear={clear}
          status={busy ? <CalculationNote tone="busy">Calculating…</CalculationNote>
            : message ? <CalculationNote tone="failed">{message}</CalculationNote>
              : run ? <CalculationStatus twoLines durationMs={run.result.durationMs} backend={run.result.backend} general={general}
                detail="Simulation and recommendation checks" />
                : <CalculationNote>{''}</CalculationNote>}
          resets={<button type="button" className="filter-reset" onClick={reset}>Reset filters</button>} />
      </div>

      <GateSelect id="rune-simulator-gate-zero" label="After +0" value={form.gateZero}
        className="rune-simulator-gate-zero" onChange={(value) => setFormValue(setForm, 'gateZero', value)} />
      <GateSelect id="rune-simulator-gate-nine" label="After +9" value={form.gateNine}
        className="rune-simulator-gate-nine" onChange={(value) => setFormValue(setForm, 'gateNine', value)} />
      <GateSelect id="rune-simulator-gate-twelve" label="After +12" value={form.gateTwelve}
        className="rune-simulator-gate-twelve" onChange={(value) => setFormValue(setForm, 'gateTwelve', value)} />

      <KeeperStatistics run={run} />

      <CraftSettingsReadout />
    </form>

    {!run
      ? <section className="empty-state rune-simulator-empty">
        <h2>Nothing generated yet.</h2>
        <p className="next-step">Choose the rune conditions above, then press Calculate to watch the batch move through +0, +9, +12 and +15.</p>
      </section>
      : <RuneSimulationResults result={run.result} stage={stage} onStageChange={setStage} onOpenRune={onOpenRune} />}
  </WorkspacePage>;
}

/**
 * How many runes Rune Clean-up keeps at +15, each counted once under the role it
 * answers best, or under No matching role when speed protection kept it.
 * That is the engine's own choice of role, so a rune two roles
 * would both keep lands in exactly one cell and the columns add up to the total.
 */
function KeeperStatistics({ run }: { run: SimulationRun | null }) {
  const counts = useMemo(() => run ? simulationKeeperCounts(run.result, run.roles) : null, [run]);
  /* No headline total: the table's own footer already sums every column, and the
     line under the results heading counts the kept runes too. */
  return <section className="rune-simulator-stats" aria-label="Runes kept at +15">
    {counts
      ? <table className="rune-simulator-stats-table">
        <thead><tr>
          <th scope="col">Role</th>
          {slots.map((slot) => <th key={slot} scope="col">Slot {slot}</th>)}
        </tr></thead>
        <tbody>
          {counts.rows.map(([id, row]) => <tr key={id === null ? 'unmatched' : `role:${id}`}>
            <th scope="row" title={row.name}>{row.name}</th>
            {row.slots.map((value, at) => <td key={at} className={value === 0 ? 'muted' : undefined}>{value}</td>)}
          </tr>)}
        </tbody>
        <tfoot><tr>
          <th scope="row">All roles</th>
          {counts.totals.map((value, at) => <td key={at}>{value}</td>)}
        </tr></tfoot>
      </table>
      : <p className="rune-simulator-stats-note type-caption">
        {run === null
          ? 'Calculate to count the keepers, role by role and slot by slot.'
          : 'Counting keepers needs an imported account with a level 40 monster and at least one Rune Clean-up role.'}
      </p>}
  </section>;
}

function craftSettingValue(assumption: CraftRollAssumption | null, grade: ItemGrade): string {
  return `${assumption === null ? 'Off' : craftRollLabels[assumption]} · ${grade}`;
}

function craftSettingNote(assumption: CraftRollAssumption | null): string {
  return assumption === null
    ? 'No item is applied.'
    : `Rolls at ${craftRollDescriptions[assumption]}; rounded away from zero.`;
}

/* The one credit every rune judgement makes; there is nothing to set, only to show. */
function CraftSettingsReadout() {
  const credit = canonicalCraftCredit;
  return <div className="rune-simulator-craft-readout" aria-label="Rune Clean-up craft credit">
    <div className="rune-simulator-readout">
      <span className="filter-label">Enchanted Gem</span>
      <output className="rune-simulator-readout-value type-body-emphasis">{craftSettingValue(credit.gem, credit.gemGrade)}</output>
      <span className="type-caption">The same in every rune judgement</span>
      <span className="type-caption">{craftSettingNote(credit.gem)}</span>
    </div>
    <div className="rune-simulator-readout">
      <span className="filter-label">Grindstone</span>
      <output className="rune-simulator-readout-value type-body-emphasis">{craftSettingValue(credit.grind, credit.grindGrade)}</output>
      <span className="type-caption">The same in every rune judgement</span>
      <span className="type-caption">{craftSettingNote(credit.grind)}</span>
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

function RuneSimulationResults({ result, stage, onStageChange, onOpenRune }: {
  result: RuneSimulationResult;
  stage: SimulationStage;
  onStageChange: (stage: SimulationStage) => void;
  onOpenRune: OpenRuneOverlay;
}) {
  const current = result.stages[stage];
  const { summary } = result;
  const unjudged = current.entries.some((entry) => entry.verdict === null);
  return <section className="rune-simulator-results" aria-labelledby="rune-simulator-results-title">
    <header className="rune-simulator-results-head">
      <div>
        <p className="filter-label">Simulation results</p>
        <h2 id="rune-simulator-results-title" className="type-title">{summary.generated.toLocaleString('en')} runes</h2>
        <p className="rune-simulator-results-note type-caption">
          Generated {summary.generated.toLocaleString('en')} · reached +9 {summary.reachedNine.toLocaleString('en')} · reached +12 {summary.reachedTwelve.toLocaleString('en')} · kept at +15 {summary.kept === null ? '—' : summary.kept.toLocaleString('en')}
        </p>
      </div>
      <div className="rune-simulator-stage-tabs" role="group" aria-label="Choose simulation checkpoint">
        {simulationStages.map((option) => <FilterButton key={option} active={option === stage}
          onClick={() => onStageChange(option)}>{stageLabel(option)}</FilterButton>)}
      </div>
    </header>

    {unjudged && <p className="rune-simulator-stage-summary type-caption">
      Best role, Potential, Chance and Action need an imported account with a level 40 monster and at least one Rune Clean-up role.
    </p>}

    <div className="table-wrap card rune-simulator-table-wrap">
      <table className="grid-table rune-simulator-table">
        <TableColumnGroup columns={runeSimulatorTableColumns} />
        <thead><tr>
          <th scope="col" className={cell('set')}>Set</th>
          <th scope="col" className={cell('slot')}>Slot</th>
          <th scope="col" className={cell('stars')}>Stars</th>
          <th scope="col" className={cell('quality')}>Rarity</th>
          <th scope="col" className={cell('level')}>Lv.</th>
          <th scope="col" className={cell('main')}>Main</th>
          <th scope="col" className={cell('innate')}>Innate</th>
          <th scope="col" className={cell('subs')}>Substats</th>
          <th scope="col" className={cell('role')}>Best role</th>
          <th scope="col" className={cell('maxValue')}>
            <span className="table-heading-two-line" aria-label="Potential: the best end state it can reach against a perfect ordinary rune for that slot">Potential</span>
          </th>
          <th scope="col" className={cell('chance')}>
            <span aria-label="Chance to reach the final +15 quality floor; random substat rolls end at +12">Chance</span>
          </th>
          <th scope="col" className={cell('action')}>Action</th>
        </tr></thead>
        <tbody>
          {current.entries.length
            ? current.entries.map((entry) => <SimulationRow key={entry.rune.id} entry={entry} onOpenRune={onOpenRune} />)
            : <tr><td className="table-empty-state" colSpan={runeSimulatorTableColumns.length}>
              No rune reached this checkpoint. Loosen an earlier sell rule to see more.
            </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

function SimulationRow({ entry, onOpenRune }: { entry: SimulationEntry; onOpenRune: OpenRuneOverlay }) {
  const { rune, verdict } = entry;
  const judged = verdict !== null && verdict.roleName !== null;
  const rowOpener = useRowOpener();
  return <tr {...rowOpener}>
    <td className={cell('set', qualityRuleHost, 'rune-simulator-set')}>
      <RuneLink
        target={{ kind: 'generated', rune: simulationRuneToCleanupRune(rune) }}
        label={`${rune.setName ?? simulationNoRuneType} rune, slot ${rune.slot}`}
        onOpen={onOpenRune}
      >
        <span className="rune-link-cell"><QualityRule tier={rune.rarity} />{rune.setName ?? simulationNoRuneType}</span>
      </RuneLink>
    </td>
    <td className={cell('slot')}>{rune.slot}</td>
    <td className={cell('stars')}>{rune.stars}</td>
    <td className={cell('quality')}>{rune.rarity}</td>
    <td className={cell('level')}>+{rune.level}</td>
    <td className={cell('main')}>{simulationStatLabel(rune.mainStatId)}</td>
    <td className={cell('innate', rune.prefixStatId === null && 'muted')}>
      {rune.prefixStatId === null
        ? '—'
        : <RuneInnateLine className="rune-simulator-property" statId={rune.prefixStatId} value={rune.prefixValue} />}
    </td>
    <td className={cell('subs', 'rune-simulator-subs')}>
      {rune.subProperties.length === 0
        ? <span className="muted">—</span>
        : <ul>{rune.subProperties.map((property) => <SimulationSubProperty key={property.statId} property={property} />)}</ul>}
    </td>
    <td className={cell('role', !judged && 'muted', 'rune-simulator-role')} title={verdict?.roleName ?? undefined}>
      {verdict?.roleName ?? '—'}
    </td>
    {/* The same two figures, printed the same way, as Rune Clean-up's own table:
        a simulated rune is judged by that engine and should read like it. */}
    <td className={cell('maxValue')}>
      {judged ? `${Math.round(verdict.maxValue * 100)} %` : <span className="muted">—</span>}
    </td>
    <td className={cell('chance')}>
      {judged && rune.level < lastSubPropertyLevel ? runeChanceText(verdict.chance) : <span className="muted">—</span>}
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
  return <RuneSubLine as="li" className="rune-simulator-property" property={property}>
    {property.rolls > 0 && <span className="rune-simulator-rolls type-caption" aria-label={`${property.rolls} power-up rolls in ${name}`}>
      <PowerUpArrow /><span aria-hidden="true">{property.rolls}</span>
    </span>}
  </RuneSubLine>;
}
