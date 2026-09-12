import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { Dropdown } from './dropdown';
import { CheckboxRow } from './form-controls';
import { itemGrades } from '../lib/file-imports';
import {
  createRunePotentialPreset, presetNameMaximum, presetStatTargetKeys, presetTargetColumns,
  presetTargetMaximum, presetTypes, runeMainStats, withRefreshedMetrics,
} from '../lib/rune-potential-presets';
import type { PresetChoice, PresetStatTargets, PresetType, RuneMainStat, RunePotentialPreset } from '../lib/rune-potential-presets';
import type { ItemGrade, RunePotentialSettings, RunePotentialSortOrder } from '../lib/types';
import { presetRuneSetNameList } from '../lib/rune-sets';

const potentialStepLabels = {
  powerUpPolicy: [
    'Full YOLO — anything with potential gets a roll',
    'Adventurous — a hint of promise is enough',
    'Balanced — rolls the runes worth rolling',
    'Picky — I like to play it safe',
    'Take no chances — only roll guaranteed keepers',
  ],
  runeQuality: [
    'I’m a newbie — everything beats what I’ve got',
    'Been playing for a while, still some way to go',
    'I’ve got good runes, and I want more good runes',
    'G1 baby — they need some quality to stay',
    'I’ve got “you’ve seen my replays” high standards',
  ],
  enchantedGems: [
    'None — takes each rune as it stands today',
    'Average — an ordinary roll, nothing special',
    'Three quarters — a good roll, short of perfect',
    'Maximum — the best the grade allows',
  ],
  grindstones: [
    'None — takes each rune as it stands today',
    'Average — an ordinary roll, nothing special',
    'Three quarters — a good roll, short of perfect',
    'Maximum — the best the grade allows',
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

export function RunePotentialSection({ settings, presets, onUpdate, onWritePresets }: {
  settings: RunePotentialSettings;
  presets: RunePotentialPreset[];
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  onWritePresets: (change: (current: RunePotentialPreset[]) => RunePotentialPreset[]) => void;
}) {
  const sortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
  const [editing, setEditing] = useState<{ draft: RunePotentialPreset; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<RunePotentialPreset | null>(null);

  function savePreset(preset: RunePotentialPreset, isNew: boolean) {
    const saved = withRefreshedMetrics(preset);
    onWritePresets((current) => {
      if (isNew) return [...current, saved];
      const index = current.findIndex((entry) => entry.id === saved.id);
      return index === -1 ? current : current.map((entry) => (entry.id === saved.id ? saved : entry));
    });
    setEditing(null);
  }

  function deletePreset(id: string) {
    onWritePresets((current) => current.filter((entry) => entry.id !== id));
    setDeleting(null);
  }

  return <WorkspacePage
    header={<PageHeader
      title="Rune Clean-up"
      tagline="Which runes deserve your mana. Set your tolerance for disappointment below." />}
  >
    <Disclosure title="Settings" sessionKey="rune-potential.settings">
      <div className="stack">
        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="power-up-policy" label="Power-up policy" value={settings.powerUpPolicy}
              description="How willing are you to roll runes with potential?"
              stepLabels={potentialStepLabels.powerUpPolicy}
              onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
            <PotentialSlider id="rune-quality" label="Rune quality floor" value={settings.runeQuality}
              description="How high must a rune's potential be before it earns a roll?"
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
            <section className="statistics pending">
              <h4>Statistics</h4>
              <p className="statistics-lead">What your settings would give you, once the calculation is in place.</p>
              <dl>
                <div>
                  <dt>Percent to roll</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>Percent to keep</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </section>

            <PotentialSlider id="intangible-runes" label="Intangible runes"
                className="slider-compact aside-detached" value={settings.intangibleRunes}
                description="How badly do you want them?"
                stepLabels={potentialStepLabels.intangibleRunes}
                onChange={(value) => void onUpdate({ intangibleRunes: value })} />

            <div className="stack tight">
              <p className="field-legend">4-sets vs. 2-sets</p>
              <CheckboxRow label="Keep twice as many 4-set runes" checked={settings.keepMoreForLargerSets}
                onChange={(checked) => void onUpdate({ keepMoreForLargerSets: checked })} />
            </div>
          </aside>
        </div>

        <div className="bar-divide" />

        <div className="settings-layout">
          <div className="slider-grid">
            <PotentialSlider id="enchanted-gems" label="Enchanted gems" value={settings.enchantedGems}
              description="Credit every rune with this much of a gem, before you spend one."
              stepLabels={potentialStepLabels.enchantedGems}
              onChange={(value) => void onUpdate({ enchantedGems: value })} />
            <PotentialSlider id="grindstones" label="Grindstones" value={settings.grindstones}
              description="Credit every rune with this much of a grindstone, before you spend one."
              stepLabels={potentialStepLabels.grindstones}
              onChange={(value) => void onUpdate({ grindstones: value })} />
          </div>

          <div className="settings-rule" role="presentation" />

          <aside className="settings-aside">
            <div className="grade-fields">
              <label className="field"><span>Gem grade</span>
                <Dropdown value={settings.gemGrade}
                  onChange={(event) => void onUpdate({ gemGrade: event.target.value as ItemGrade })}>
                  {itemGrades.map((grade) => <option key={grade}>{grade}</option>)}
                </Dropdown>
              </label>
              <label className="field"><span>Grindstone grade</span>
                <Dropdown value={settings.grindstoneGrade}
                  onChange={(event) => void onUpdate({ grindstoneGrade: event.target.value as ItemGrade })}>
                  {itemGrades.map((grade) => <option key={grade}>{grade}</option>)}
                </Dropdown>
              </label>
            </div>
          </aside>
        </div>

        <div className="bar-divide" />

        <div className="filter-columns">
          <div className="stack tight">
            <p className="field-legend">Runes to include</p>
            <CheckboxRow label="Include runes at Lv. 12 and above" checked={settings.includeLevel12Runes}
              onChange={(checked) => void onUpdate({ includeLevel12Runes: checked })} />
            <CheckboxRow label="Include runes equipped on monsters" checked={settings.includeEquippedRunes}
              onChange={(checked) => void onUpdate({ includeEquippedRunes: checked })} />
          </div>
          <label className="field field-narrow field-lead"><span>Sort order</span>
            <Dropdown value={settings.sortOrder} onChange={(event) => void onUpdate({ sortOrder: event.target.value as RunePotentialSortOrder })}>
              {sortOrders.map((order) => <option key={order}>{order}</option>)}
            </Dropdown>
          </label>
        </div>
      </div>
    </Disclosure>

    <Disclosure title="Presets" sessionKey="rune-potential.presets">
      <div className="stack">
        <div className="list-actions">
          <p className="list-count"><b>{presets.length}</b> presets</p>
          <Button tone="primary" onClick={() => setEditing({ draft: createRunePotentialPreset(), isNew: true })}>
            <span className="button-glyph" aria-hidden="true">+</span>
            Add preset
          </Button>
        </div>

        {presets.length === 0
          ? <p className="notice">Every preset is gone, including the ones JASWA started you with. Add one to say what a rune should be judged against.</p>
          : <div className="preset-list">
            {presets.map((preset) => <PresetCard
              key={preset.id}
              preset={preset}
              onEdit={() => setEditing({ draft: preset, isNew: false })}
              onDelete={() => setDeleting(preset)}
            />)}
          </div>}
      </div>
    </Disclosure>

    {editing && <PresetEditor
      key={editing.draft.id}
      draft={editing.draft}
      isNew={editing.isNew}
      onCancel={() => setEditing(null)}
      onSave={(preset) => savePreset(preset, editing.isNew)}
    />}

    {deleting && <div className="modal-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-preset-title">
        <p className="eyebrow">Delete preset</p>
        <h2 id="delete-preset-title">Delete “{deleting.name}”?</h2>
        <p>This preset is removed from this computer. Runes stop being judged against it, and nothing else changes.</p>
        <div className="dialog-actions">
          <Button onClick={() => setDeleting(null)}>Keep it</Button>
          <Button tone="danger" onClick={() => deletePreset(deleting.id)}>Delete preset</Button>
        </div>
      </section>
    </div>}
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

function ChoiceLine({ choice }: { choice?: PresetChoice<string> }) {
  const preferred = choice?.preferred ?? [];
  const acceptable = (choice?.acceptable ?? []).filter((value) => !preferred.includes(value));
  if (!preferred.length && !acceptable.length) return <span className="choice-none">—</span>;
  return <span className="choice-line">
    {preferred.map((value) => <span className="choice preferred" key={value}>{value}</span>)}
    {acceptable.map((value) => <span className="choice acceptable" key={value}>{value}</span>)}
  </span>;
}

function PresetRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="preset-row">
    <span className="preset-row-label">{label}</span>
    <div className="preset-row-value">{children}</div>
  </div>;
}

function PresetCard({ preset, onEdit, onDelete }: {
  preset: RunePotentialPreset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const artifacts: Array<[string, boolean]> = [['ATK', preset.artifacts.atk], ['DEF', preset.artifacts.def], ['HP', preset.artifacts.hp]];

  return <article className="preset-card">
    <header className="preset-head">
      <div className="preset-title">
        <h4 className="preset-name">{preset.name}</h4>
        <p className="preset-type">{preset.type}</p>
      </div>
      <div className="preset-actions">
        <button className="icon-button" onClick={onEdit} title={`Edit ${preset.name}`} aria-label={`Edit ${preset.name}`}>
          <PencilIcon />
        </button>
        <button className="icon-button danger" onClick={onDelete} title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`}>
          <TrashIcon />
        </button>
      </div>
    </header>

    <div className="preset-rows">
      <PresetRow label="Runes"><ChoiceLine choice={preset.sets} /></PresetRow>
      <PresetRow label="Rune slots">
        <div className="slot-group">
          {([['Slot 2', preset.slots.slot2], ['Slot 4', preset.slots.slot4], ['Slot 6', preset.slots.slot6]] as const)
            .map(([label, choice]) => <div className="slot" key={label}>
              <span className="slot-label">{label}</span>
              <ChoiceLine choice={choice} />
            </div>)}
        </div>
      </PresetRow>
      <PresetRow label="Artifacts">
        <span className="flag-line">
          {artifacts.map(([label, wanted]) => <span className={wanted ? 'flag yes' : 'flag no'} key={label}>
            {label}<b>{wanted ? 'Yes' : 'No'}</b>
          </span>)}
        </span>
      </PresetRow>
      <PresetRow label="Desired stats">
        <dl className="target-line">
          {presetTargetColumns.map((column) => {
            const value = preset.targets[column.key];
            return <div className={value === undefined ? 'target empty' : 'target'} key={column.key}>
              <dt>{column.label}</dt>
              <dd>{value === undefined ? '—' : <>{value.toLocaleString('en')}{column.unit && <span className="unit">{column.unit}</span>}</>}</dd>
            </div>;
          })}
        </dl>
      </PresetRow>
    </div>
  </article>;
}

function PencilIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11.2 2.3a1.4 1.4 0 0 1 2 2L5.6 11.9l-2.8.8.8-2.8Z" />
    <path d="M10 3.5 12.5 6" />
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

function PresetEditor({ draft, isNew, onCancel, onSave }: {
  draft: RunePotentialPreset;
  isNew: boolean;
  onCancel: () => void;
  onSave: (preset: RunePotentialPreset) => void;
}) {
  const [preset, setPreset] = useState<RunePotentialPreset>(draft);
  const [openedAs] = useState(() => draft.name.trim());
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameField.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const named = preset.name.trim().length > 0;
  function update(change: Partial<RunePotentialPreset>) { setPreset((current) => ({ ...current, ...change })); }
  function updateSlot(slot: keyof RunePotentialPreset['slots'], choice: PresetChoice<RuneMainStat>) {
    setPreset((current) => ({ ...current, slots: { ...current.slots, [slot]: choice } }));
  }
  function updateTarget(key: keyof PresetStatTargets, value: number | undefined) {
    setPreset((current) => {
      const targets = { ...current.targets };
      if (value === undefined) delete targets[key]; else targets[key] = value;
      return { ...current, targets };
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!named) return;
    onSave({ ...preset, name: preset.name.trim() });
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="dialog editor" role="dialog" aria-modal="true" aria-labelledby="preset-editor-title" onSubmit={submit}>
      <header className="editor-head">
        <p className="eyebrow">{isNew ? 'Add preset' : 'Edit preset'}</p>
        <h2 id="preset-editor-title">{isNew ? 'A new preset' : openedAs || 'This preset'}</h2>
      </header>

      <div className="editor-body">
        <div className="editor-pair">
          <label className="field"><span>Name</span>
            <input ref={nameField} value={preset.name} placeholder="e.g. Fast DD" maxLength={presetNameMaximum}
              onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label className="field"><span>Type</span>
            <Dropdown value={preset.type} onChange={(event) => update({ type: event.target.value as PresetType })}>
              {presetTypes.map((type) => <option key={type}>{type}</option>)}
            </Dropdown>
          </label>
        </div>

        <EditorBlock title="Rune sets" legend note="Preferred is what the role is built around. Acceptable still works when the box does not oblige.">
          <ChoiceEditor choice={preset.sets} options={presetRuneSetNameList} columns
            onChange={(sets) => update({ sets })} />
        </EditorBlock>

        <EditorBlock title="Rune slots" legend note="Slots 1, 3 and 5 carry a fixed main stat, so only these three are stated.">
          <div className="editor-slots">
            {([['slot2', 'Slot 2'], ['slot4', 'Slot 4'], ['slot6', 'Slot 6']] as const).map(([key, label]) => <div className="editor-slot" key={key}>
              <p className="editor-slot-label">{label}</p>
              <ChoiceEditor choice={preset.slots[key]} options={runeMainStats}
                onChange={(choice) => updateSlot(key, choice)} />
            </div>)}
          </div>
        </EditorBlock>

        <EditorBlock title="Artifacts" note="Which artifact primary stats suit this role.">
          <div className="editor-flags">
            {([['atk', 'ATK'], ['def', 'DEF'], ['hp', 'HP']] as const).map(([key, label]) => <CheckboxRow
              key={key}
              label={label}
              checked={preset.artifacts[key]}
              onChange={(checked) => update({ artifacts: { ...preset.artifacts, [key]: checked } })} />)}
          </div>
        </EditorBlock>

        <EditorBlock title="Desired stats" note="Leave a stat empty for one this role does not aim at. DMG, E.HP and E.HP D follow from these and are not entered.">
          <div className="editor-targets">
            {presetStatTargetKeys.map((key) => {
              const column = presetTargetColumns.find((entry) => entry.key === key);
              const value = preset.targets[key];
              return <label className="field field-compact" key={key}>
                <span>{column?.label ?? key}{column?.unit}</span>
                <input type="number" min={0} max={presetTargetMaximum} step={1} inputMode="numeric"
                  value={value === undefined ? '' : value}
                  placeholder="—"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const parsed = Number(raw);
                    updateTarget(key, raw === '' || !Number.isFinite(parsed)
                      ? undefined
                      : Math.min(presetTargetMaximum, Math.max(0, Math.round(parsed))));
                  }} />
              </label>;
            })}
          </div>
        </EditorBlock>
      </div>

      <div className="dialog-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!named}>
          {isNew ? 'Add preset' : 'Save changes'}
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

function ChoiceLegend() {
  return <p className="choice-legend">
    <span className="choice-legend-item"><span className="choice-key preferred" aria-hidden="true" />Preferred</span>
    <span className="choice-legend-item"><span className="choice-key acceptable" aria-hidden="true" />Acceptable</span>
    <span className="choice-legend-hint">click to cycle</span>
  </p>;
}

function ChoiceEditor<T extends string>({ choice, options, columns = false, onChange }: {
  choice: PresetChoice<T>;
  options: readonly T[];
  columns?: boolean;
  onChange: (choice: PresetChoice<T>) => void;
}) {
  function state(option: T): 'preferred' | 'acceptable' | 'none' {
    if (choice.preferred.includes(option)) return 'preferred';
    if (choice.acceptable.includes(option)) return 'acceptable';
    return 'none';
  }
  function cycle(option: T) {
    const without = {
      preferred: choice.preferred.filter((entry) => entry !== option),
      acceptable: choice.acceptable.filter((entry) => entry !== option),
    };
    if (state(option) === 'none') return onChange({ ...without, preferred: [...without.preferred, option] });
    if (state(option) === 'preferred') return onChange({ ...without, acceptable: [...without.acceptable, option] });
    onChange(without);
  }

  const described = { none: 'not wanted', preferred: 'preferred', acceptable: 'acceptable' } as const;
  const nextStep = { none: 'prefer it', preferred: 'accept it', acceptable: 'clear it' } as const;

  return <div className={columns ? 'choice-editor columns' : 'choice-editor'}>
    {options.map((option) => {
      const current = state(option);
      return <button
        type="button"
        key={option}
        className={`choice-chip ${current}`}
        onClick={() => cycle(option)}
        aria-pressed={current !== 'none'}
        aria-label={`${option}: ${described[current]}`}
        title={`${option}: ${described[current]} — click to ${nextStep[current]}`}
      >
        <span className="choice-chip-mark" aria-hidden="true" />
        {option}
      </button>;
    })}
  </div>;
}
