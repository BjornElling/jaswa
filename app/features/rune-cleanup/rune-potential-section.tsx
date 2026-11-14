import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { WorkspacePage } from '../../ui/workspace-page';
import { Disclosure, PageHeader } from '../../ui/page-chrome';
import { Dropdown } from '../../ui/dropdown';
import { CheckboxRow } from '../../ui/form-controls';
import { ChoiceEditor, ChoiceLegend } from '../../ui/forms/choice-editor';
import { PencilIcon } from '../../ui/pencil-icon';
import {
  createRuneRole, roleNameMaximum, roleStatTargetKeys, roleTargetColumns,
  roleTargetMaximum, roleTypes, runeMainStatsBySlot,
  withRefreshedMetrics,
} from '../../domain/profiles/rune-roles';
import type { RoleChoice, RoleStatTargets, RoleType, RuneMainStat, RuneRole } from '../../domain/profiles/rune-roles';
import type { GeneralSettings, ImportedGame, RunePotentialSettings } from '../../domain/model';
import type { MonsterPreferences } from '../../domain/profiles/monster-preferences';
import type { RuneHolds } from '../../domain/profiles/rune-holds';
import { roleRuneSetNameList } from '../../domain/runes/rune-sets';
import { formatDecimal } from '../../domain/shared/formatting';
import { calculationBackendLabel, type CalculationBackend } from '../../domain/shared/calculation-summary';
import { calculateRuneStatistics, cancelRuneStatistics, rememberedRuneStatistics } from '../../workspace/jobs/rune-statistics-client';
import { runeCalculationKey } from '../../domain/runes/rune-calculation-inputs';
import type { RuneCleanupStatistics } from '../../domain/runes/cleanup/rune-cleanup-statistics';
import { withRuneStatisticsProtection } from '../../domain/runes/cleanup/rune-cleanup-statistics';
import { referenceLines } from '../../domain/reference/rune-reference-stats';
import { RuneRecommendations } from './rune-recommendations';
import { ReappTargetList } from './reapp-target-list';
import type { RuneCleanupSession } from './rune-cleanup-session';
import { useDragReorder } from '../../ui/use-drag-reorder';
import type { ReorderEntryProps } from '../../ui/use-drag-reorder';
import { moveItem } from '../../domain/shared/list-order';
import type { OpenRuneOverlay } from '../../ui/gear/rune-link';

const potentialStepLabels = {
  powerUpPolicy: [
    'Full YOLO — anything with potential gets a roll',
    'Adventurous — a hint of promise is enough',
    'Balanced — rolls the runes worth rolling',
    'Picky — I like to play it safe',
    'Take no chances — only roll guaranteed keepers',
  ],
  runeQuality: [
    'I’m a newbie — 45 % Max value minimum, slot-balanced',
    'Been playing for a while — still some way to go',
    'I’ve got good runes, and I want more good runes',
    'G1 baby',
    'You’ve seen my replays',
  ],
  acceptedRunes: [
    'I love all my runes equally',
    'Forgiving — if there’s potential, they stay',
    'Quality is quality',
    'Keep the best, 86 the rest',
    'Only want the best of the best of the best',
  ],
  brokenRunes: [
    'I love all things broken',
    'A good rune is a good rune',
    'Occasionally',
    'A very selected few',
    'No',
  ],
  intangibleRunes: [
    'All runes are created equal (×1)',
    'But they’re sooo pretty…!! (×1½)',
    'I need more. More! (×2)',
    'Got to catch ’em all (×3½)',
    'My precious…!!! (×5)',
  ],
} as const;

/** The standards and roles that the Clean-up workspace reads. Kept as their
 * own workspace so changing what a rune is judged against is not hidden below
 * the answers it changes. */
type RuneStatisticsState =
  | { status: 'unavailable' | 'calculating' }
  | { status: 'ready'; statistics: RuneCleanupStatistics; backend: CalculationBackend }
  | { status: 'failed'; message: string };

export function RuneSetupSection({ game, settings, roles, general, hardwareAcceleration, onUpdate, onWriteRoles }: {
  game: ImportedGame | null;
  settings: RunePotentialSettings;
  roles: RuneRole[];
  general: GeneralSettings;
  hardwareAcceleration: boolean;
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  onWriteRoles: (change: (current: RuneRole[]) => RuneRole[]) => void;
}) {
  const [editing, setEditing] = useState<{ draft: RuneRole; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<RuneRole | null>(null);
  const base = useMemo(() => {
    const lines = referenceLines(game?.data);
    return lines ? new Map([...lines].map(([type, line]) => [type, line.stats])) : null;
  }, [game]);

  const request = useMemo(() => base ? { roles, settings, base, preferWebGpu: hardwareAcceleration } : null,
    [roles, settings, base, hardwareAcceleration]);
  const key = request ? runeCalculationKey(request) : null;
  const [answer, setAnswer] = useState<{ key: string | null; state: RuneStatisticsState }>(
    () => ({ key, state: { status: request ? 'calculating' : 'unavailable' } }),
  );
  const known = request ? rememberedRuneStatistics(request) : undefined;
  const statistics: RuneStatisticsState = known
    ? { status: 'ready', statistics: withRuneStatisticsProtection(known.statistics, settings), backend: known.backend }
    : answer.key === key ? answer.state : { status: 'calculating' };

  useEffect(() => {
    if (!request || roles.length === 0) {
      cancelRuneStatistics();
      return;
    }
    if (rememberedRuneStatistics(request)) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setAnswer({ key, state: { status: 'calculating' } });
      void calculateRuneStatistics(request).then((outcome) => {
        if (disposed || outcome.status === 'superseded') return;
        setAnswer({ key, state: outcome.status === 'done'
          ? { status: 'ready', statistics: outcome.statistics, backend: outcome.backend }
          : { status: 'failed', message: outcome.message } });
      });
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      // Work belongs to its inputs: returning can rejoin it or read the finished answer.
    };
  }, [key, request, roles.length]);

  function saveRole(role: RuneRole, isNew: boolean) {
    const saved = withRefreshedMetrics(role);
    onWriteRoles((current) => {
      if (isNew) return [...current, saved];
      const index = current.findIndex((entry) => entry.id === saved.id);
      return index === -1 ? current : current.map((entry) => (entry.id === saved.id ? saved : entry));
    });
    setEditing(null);
  }

  function deleteRole(id: string) {
    onWriteRoles((current) => current.filter((entry) => entry.id !== id));
    setDeleting(null);
  }

  function moveRole(from: number, to: number) {
    onWriteRoles((current) => moveItem(current, from, to));
  }
  /* Dragged by the card, or a place at a time by its arrows. */
  const roleOrder = useDragReorder<HTMLDivElement>({ count: roles.length, onMove: moveRole });

  const readyStatistics = base && roles.length > 0 && statistics.status === 'ready' ? statistics : null;
  const statisticsReady = readyStatistics !== null;
  const statisticsCopy = !base
    ? 'Import an account with a level 40 monster to give the synthetic box a reference.'
    : roles.length === 0
      ? 'Add a role to give the synthetic box something to be judged against.'
      : statistics.status === 'failed'
        ? statistics.message
        : 'A fast fixed estimate from synthetic runes, judged by your current settings — not a drop-rate claim.';
  const statisticsStatus = !base || roles.length === 0
    ? 'Waiting for an account'
    : statistics.status === 'calculating'
    ? 'Calculating…'
    : statisticsReady
      ? `${readyStatistics.statistics.sampleSize.toLocaleString('en')} synthetic runes · ${calculationBackendLabel(readyStatistics.backend)}`
      : statistics.status === 'failed' ? 'Calculation failed' : 'Waiting for an account';

  return <WorkspacePage
    header={<PageHeader
      title="Rune Settings"
      tagline="Which runes deserve your mana. Set your tolerance for disappointment below." />}
  >
    <Disclosure title="Settings" sessionKey="rune-setup.settings">
      <div className="stack">
        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="power-up-policy" label="Power-up policy" value={settings.powerUpPolicy}
              description="How willing are you to roll runes with potential?"
              stepLabels={potentialStepLabels.powerUpPolicy}
              onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
            <PotentialSlider id="rune-quality" label="Rune quality floor" value={settings.runeQuality}
              description="How high must a rune's projected +15 potential be before it earns a roll? The floor is calibrated per slot so a box does not starve slots 2, 4 or 6."
              stepLabels={potentialStepLabels.runeQuality}
              onChange={(value) => void onUpdate({ runeQuality: value })} />
            <PotentialSlider id="accepted-runes" label="Accepted runes" value={settings.acceptedRunes}
              description="Non-preferred, but accepted. How B-tier are your standards?"
              stepLabels={potentialStepLabels.acceptedRunes}
              onChange={(value) => void onUpdate({ acceptedRunes: value })} />
            <PotentialSlider id="broken-runes" label="Broken runes" value={settings.brokenRunes}
              description="You didn’t ask for them. But do you want them?"
              stepLabels={potentialStepLabels.brokenRunes}
              onChange={(value) => void onUpdate({ brokenRunes: value })} />
          </div>

          <div className="settings-rule" role="presentation" />

          <aside className="settings-aside">
            <section className={statisticsReady ? 'statistics' : 'statistics pending'}>
              <h4>Statistics</h4>
              <p className="statistics-lead">{statisticsCopy}</p>
              <p className="statistics-meta type-caption" aria-live="polite">{statisticsStatus}</p>
              <dl>
                <div>
                  <dt>Percent to roll</dt>
                  <dd>{statisticsReady ? <>{formatDecimal(readyStatistics.statistics.percentToRoll, general)}<span className="unit">%</span></> : '—'}</dd>
                </div>
                <div>
                  <dt>Percent to keep</dt>
                  <dd>{statisticsReady ? <>{formatDecimal(readyStatistics.statistics.percentToKeep, general)}<span className="unit">%</span></> : '—'}</dd>
                </div>
              </dl>
            </section>

            <PotentialSlider id="intangible-runes" label="Intangible runes"
                className="slider-compact aside-detached" value={settings.intangibleRunes}
                description="How badly do you want them?"
                stepLabels={potentialStepLabels.intangibleRunes}
                onChange={(value) => void onUpdate({ intangibleRunes: value })} />
          </aside>
        </div>
      </div>
    </Disclosure>

    <Disclosure title="Roles" sessionKey="rune-setup.roles">
      <div className="stack">
        <div className="list-actions">
          <p className="list-count"><b>{roles.length}</b> roles</p>
          <Button tone="primary" onClick={() => setEditing({ draft: createRuneRole(), isNew: true })}>
            <span className="button-glyph" aria-hidden="true">+</span>
            Add role
          </Button>
        </div>

        {roles.length === 0
          ? <p className="notice">Every role is gone, including the ones JASWA started you with. Add one to say what a rune should be judged against.</p>
          : <div className="role-list" {...roleOrder.containerProps}>
            {roles.map((role, index) => <RoleCard
              key={role.id}
              role={role}
              dragProps={roleOrder.entryProps(index)}
              onEdit={() => setEditing({ draft: role, isNew: false })}
              onDelete={() => setDeleting(role)}
              onMoveEarlier={() => moveRole(index, index - 1)}
              onMoveLater={() => moveRole(index, index + 1)}
              canMoveEarlier={index > 0}
              canMoveLater={index < roles.length - 1}
            />)}
          </div>}
      </div>
    </Disclosure>

    <Disclosure title="Re-app/refine target" sessionKey="rune-setup.reapp-targets">
      <ReappTargetList rules={settings.rerollRules}
        onChange={(rerollRules) => void onUpdate({ rerollRules })} />
    </Disclosure>

    {editing && <RoleEditor
      key={editing.draft.id}
      draft={editing.draft}
      isNew={editing.isNew}
      onCancel={() => setEditing(null)}
      onSave={(role) => saveRole(role, editing.isNew)}
    />}

    {deleting && <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-role-title">
        <p className="eyebrow">Delete role</p>
        <h2 id="delete-role-title">Delete “{deleting.name}”?</h2>
        <p>This role is removed from this computer. Runes stop being judged against it, and nothing else changes.</p>
        <div className="dialog-actions">
          <Button onClick={() => setDeleting(null)}>Keep it</Button>
          <Button tone="danger" onClick={() => deleteRole(deleting.id)}>Delete role</Button>
        </div>
      </section>
    </div>}
  </WorkspacePage>;
}

export function RunePotentialSection({
  game, profiles, runeHolds, lockedRunes, settings, roles, general, hardwareAcceleration, onOpenRune, onUpdate, session,
}: {
  session: RuneCleanupSession;
  game: ImportedGame | null;
  profiles: MonsterPreferences;
  runeHolds: RuneHolds;
  lockedRunes: ReadonlySet<string>;
  settings: RunePotentialSettings;
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  roles: RuneRole[];
  general: GeneralSettings;
  /** The user's own setting, on its way to the worker that counts the odds. */
  hardwareAcceleration: boolean;
  onOpenRune: OpenRuneOverlay;
}) {
  return <WorkspacePage
    header={<PageHeader
      title="Rune Clean-up"
      tagline="Time to take out the trash, so there is room for more trash." />}
  >
    {/* No bar: the verdicts are the page's only content, and a disclosure
        with nothing beside it to fold away only adds a click and a frame. */}
    <RuneRecommendations session={session} game={game} profiles={profiles} runeHolds={runeHolds} lockedRunes={lockedRunes} settings={settings} roles={roles} general={general}
      hardwareAcceleration={hardwareAcceleration} onOpenRune={onOpenRune} onUpdate={onUpdate} />
  </WorkspacePage>;
}

function PotentialSlider({ id, label, value, description, stepLabels, className, onChange }: {
  id: string; label: string; value: number;
  description: string;
  stepLabels: readonly string[];
  className?: string;
  onChange: (value: number) => void;
}) {
  const steps = stepLabels.length;
  return <div className={className ? `slider ${className}` : 'slider'}>
    <label className="slider-label" htmlFor={id}>{label}</label>
    <p className="slider-note">{description}</p>
    <input id={id} type="range" min={1} max={steps} step={1} value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-describedby={`${id}-choice`} />
    <p id={`${id}-choice`} className="slider-choice" aria-live="polite">
      {stepLabels[value - 1]}
    </p>
  </div>;
}

function ChoiceLine({ choice }: { choice?: RoleChoice<string> }) {
  const preferred = choice?.preferred ?? [];
  const acceptable = (choice?.acceptable ?? []).filter((value) => !preferred.includes(value));
  if (!preferred.length && !acceptable.length) return <span className="choice-none">—</span>;
  return <span className="choice-line">
    {preferred.map((value) => <span className="choice preferred" key={value}>{value}</span>)}
    {acceptable.map((value) => <span className="choice acceptable" key={value}>{value}</span>)}
  </span>;
}

function RoleRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="role-row">
    <span className="role-row-label">{label}</span>
    <div className="role-row-value">{children}</div>
  </div>;
}

function RoleCard({ role, dragProps, onEdit, onDelete, onMoveEarlier, onMoveLater, canMoveEarlier, canMoveLater }: {
  role: RuneRole;
  dragProps: ReorderEntryProps;
  onEdit: () => void;
  onDelete: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}) {
  const artifacts: Array<[string, boolean]> = [['ATK', role.artifacts.atk], ['DEF', role.artifacts.def], ['HP', role.artifacts.hp]];

  return <article className="role-card" {...dragProps}>
    <header className="role-head">
      <div className="role-title">
        <h4 className="role-name">{role.name}</h4>
        <div className="role-subhead">
          <p className="role-type">{role.type}</p>
        </div>
      </div>
      <div className="role-actions">
        <button className="icon-button" type="button" onClick={onMoveEarlier} disabled={!canMoveEarlier}
          title={`Move ${role.name} earlier`} aria-label={`Move ${role.name} earlier`}>
          <RoleMoveIcon direction="up" />
        </button>
        <button className="icon-button" type="button" onClick={onMoveLater} disabled={!canMoveLater}
          title={`Move ${role.name} later`} aria-label={`Move ${role.name} later`}>
          <RoleMoveIcon direction="down" />
        </button>
        <button className="icon-button" onClick={onEdit} title={`Edit ${role.name}`} aria-label={`Edit ${role.name}`}>
          <PencilIcon />
        </button>
        <button className="icon-button danger" onClick={onDelete} title={`Delete ${role.name}`} aria-label={`Delete ${role.name}`}>
          <TrashIcon />
        </button>
      </div>
    </header>

    <div className="role-rows">
      <RoleRow label="Runes"><ChoiceLine choice={role.sets} /></RoleRow>
      <RoleRow label="Rune slots">
        <div className="slot-group">
          {([['Slot 2', role.slots.slot2], ['Slot 4', role.slots.slot4], ['Slot 6', role.slots.slot6]] as const)
            .map(([label, choice]) => <div className="slot" key={label}>
              <span className="slot-label">{label}</span>
              <ChoiceLine choice={choice} />
            </div>)}
        </div>
      </RoleRow>
      <RoleRow label="Artifacts">
        <span className="flag-line">
          {artifacts.map(([label, wanted]) => <span className={wanted ? 'flag yes' : 'flag no'} key={label}>
            {label}<b>{wanted ? 'Yes' : 'No'}</b>
          </span>)}
        </span>
      </RoleRow>
      <RoleRow label="Desired stats">
        <dl className="target-line">
          {roleTargetColumns.map((column) => {
            const value = role.targets[column.key];
            return <div className={value === undefined ? 'target empty' : 'target'} key={column.key}>
              <dt>{column.label}</dt>
              <dd>{value === undefined ? '—' : <>{value.toLocaleString('en')}{column.unit && <span className="unit">{column.unit}</span>}</>}</dd>
            </div>;
          })}
        </dl>
      </RoleRow>
    </div>
  </article>;
}

function RoleMoveIcon({ direction }: { direction: 'up' | 'down' }) {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={direction === 'up' ? 'M10 17V3M4 9l6-6 6 6' : 'M10 3v14M4 11l6 6 6-6'} />
  </svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.8 4.4h10.4" />
    <path d="M6.2 4.4V2.9h3.6v1.5" />
    <path d="M4.2 4.4l.6 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.1" />
    <path d="M6.7 7v4M9.3 7v4" />
  </svg>;
}

function RoleEditor({ draft, isNew, onCancel, onSave }: {
  draft: RuneRole;
  isNew: boolean;
  onCancel: () => void;
  onSave: (role: RuneRole) => void;
}) {
  const [role, setRole] = useState<RuneRole>(draft);
  const [openedAs] = useState(() => draft.name.trim());
  const nameField = useRef<HTMLInputElement>(null);

  /* Opening the editor puts the caret in the name, and nothing after that moves
     it again. This used to share an effect with the key listener below, whose
     `onCancel` is a fresh closure on every render of the page — and the helper
     poll re-renders the page every two seconds, so the effect re-ran and yanked
     the caret out of whatever field was being typed in. Focus belongs to the
     mount, not to a listener's dependencies. */
  useEffect(() => { nameField.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const named = role.name.trim().length > 0;
  function update(change: Partial<RuneRole>) { setRole((current) => ({ ...current, ...change })); }
  function updateSlot(slot: keyof RuneRole['slots'], choice: RoleChoice<RuneMainStat>) {
    setRole((current) => ({ ...current, slots: { ...current.slots, [slot]: choice } }));
  }
  function updateTarget(key: keyof RoleStatTargets, value: number | undefined) {
    setRole((current) => {
      const targets = { ...current.targets };
      if (value === undefined) delete targets[key]; else targets[key] = value;
      return { ...current, targets };
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!named) return;
    onSave({ ...role, name: role.name.trim() });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="dialog editor" role="dialog" aria-modal="true" aria-labelledby="role-editor-title" onSubmit={submit}>
      <header className="editor-head">
        <p className="eyebrow">{isNew ? 'Add role' : 'Edit role'}</p>
        <h2 id="role-editor-title">{isNew ? 'A new role' : openedAs || 'This role'}</h2>
      </header>

      <div className="editor-body">
        <div className="editor-pair">
          <label className="field"><span>Name</span>
            <input ref={nameField} value={role.name} placeholder="e.g. Fast DD" maxLength={roleNameMaximum}
              onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label className="field"><span>Type</span>
            <Dropdown value={role.type} onChange={(event) => update({ type: event.target.value as RoleType })}>
              {roleTypes.map((type) => <option key={type}>{type}</option>)}
            </Dropdown>
          </label>
        </div>

        <EditorBlock title="Rune sets" legend note="Preferred is what the role is built around. Acceptable still works when the box does not oblige.">
          <ChoiceEditor choice={role.sets} options={roleRuneSetNameList} columns
            onChange={(sets) => update({ sets })} />
        </EditorBlock>

        <EditorBlock title="Rune slots" legend note="Slots 1, 3 and 5 carry a fixed main stat, so only these three are stated. Each of the three offers the mains it can actually roll.">
          <div className="editor-slots">
            {([['slot2', 'Slot 2'], ['slot4', 'Slot 4'], ['slot6', 'Slot 6']] as const).map(([key, label]) => <div className="editor-slot" key={key}>
              <p className="editor-slot-label">{label}</p>
              <ChoiceEditor choice={role.slots[key]} options={runeMainStatsBySlot[key]}
                onChange={(choice) => updateSlot(key, choice)} />
            </div>)}
          </div>
        </EditorBlock>

        <EditorBlock title="Artifacts" note="Which artifact primary stats suit this role.">
          <div className="editor-flags">
            {([['atk', 'ATK'], ['def', 'DEF'], ['hp', 'HP']] as const).map(([key, label]) => <CheckboxRow
              key={key}
              label={label}
              checked={role.artifacts[key]}
              onChange={(checked) => update({ artifacts: { ...role.artifacts, [key]: checked } })} />)}
          </div>
        </EditorBlock>

        <EditorBlock title="Desired stats" note="Leave a stat empty to leave it unstated; 0 is a stated target of nothing. DMG, E.HP and E.HP D follow from these and are not entered.">
          <div className="editor-targets">
            {roleStatTargetKeys.map((key) => {
              const column = roleTargetColumns.find((entry) => entry.key === key);
              const value = role.targets[key];
              return <label className="field field-compact" key={key}>
                <span>{column?.label ?? key}{column?.unit}</span>
                <input type="number" min={0} max={roleTargetMaximum} step={1} inputMode="numeric"
                  value={value === undefined ? '' : value}
                  placeholder="—"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === '') {
                      updateTarget(key, undefined);
                      return;
                    }
                    const parsed = Number(raw);
                    updateTarget(key, !Number.isFinite(parsed)
                      ? undefined
                      : Math.min(roleTargetMaximum, Math.max(0, Math.round(parsed))));
                  }} />
              </label>;
            })}
          </div>
        </EditorBlock>
      </div>

      <div className="dialog-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!named}>
          {isNew ? 'Add role' : 'Save changes'}
        </Button>
      </div>
    </form>
  </div>;
}

function EditorBlock({ title, note, legend = false, children }: {
  title: string; note?: string; legend?: boolean; children: ReactNode;
}) {
  return <section className="editor-block">
    <header className="editor-block-head">
      <h3 className="editor-block-title">{title}</h3>
      {legend && <ChoiceLegend />}
    </header>
    {note && <p className="editor-note">{note}</p>}
    {children}
  </section>;
}
