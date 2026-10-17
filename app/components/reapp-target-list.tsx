import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { Dropdown } from './dropdown';
import { CheckboxRow } from './form-controls';
import { PencilIcon } from './pencil-icon';
import { TokenChoiceLine } from './token-choice-field';
import type { TokenChoiceOption } from './token-choice-field';
import {
  reappMainOptions, reappSetOptions, reappSlotChoosesMain, reappSlots,
} from '../lib/rune-reapp-targets';
import type { ReappTarget, ReappTargets, RerollKind } from '../lib/rune-reapp-targets';
import { runeRarities, runeStatName } from '../lib/runes';
import type { RuneRarity } from '../lib/runes';

const statOption = (id: number): TokenChoiceOption<number> => ({ value: id, label: runeStatName(id) ?? String(id) });

/* In the game's own property order, as the editor's pills read, whatever order they were chosen in. */
const statLabels = (options: readonly number[], chosen: readonly number[]): string[] =>
  options.filter((id) => chosen.includes(id)).map((id) => statOption(id).label);

/** Re-app on the left and Refine on the right, on every card and in the editor alike. */
const kinds: readonly { kind: RerollKind; title: string }[] = [
  { kind: 'reapp', title: 'Re-app' },
  { kind: 'refine', title: 'Refine' },
];

type SlotPair = Record<RerollKind, ReappTarget>;

/**
 * The six slots, each a card holding its re-app target beside its refine target,
 * in the role cards' own frame.
 *
 * There is no add and no delete: a slot is always there to be described. A target
 * the user does not want is switched off in the editor, which folds that half of
 * the card to its heading, rather than being removed and later missed.
 */
export function ReappTargetList({ reapp, refine, onChange }: {
  reapp: ReappTargets;
  refine: ReappTargets;
  onChange: (kind: RerollKind, targets: ReappTarget[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  const lists: Record<RerollKind, ReappTargets> = { reapp, refine };
  const pairOf = (slot: number): SlotPair | null => {
    const pair = { reapp: reapp[slot - 1], refine: refine[slot - 1] };
    return pair.reapp && pair.refine ? pair : null;
  };

  function close() {
    const slot = editing;
    setEditing(null);
    if (slot !== null) editButtons.current.get(slot)?.focus();
  }

  function save(slot: number, pair: SlotPair) {
    for (const { kind } of kinds) {
      if (pair[kind] !== lists[kind][slot - 1]) {
        onChange(kind, lists[kind].map((entry, at) => (at === slot - 1 ? pair[kind] : entry)));
      }
    }
    close();
  }

  const editingPair = editing === null ? null : pairOf(editing);
  return <>
    <div className="role-list">
      {reappSlots.map((slot) => {
        const pair = pairOf(slot);
        if (!pair) return null;
        return <ReappTargetCard key={slot} slot={slot} pair={pair}
          editRef={(button) => { if (button) editButtons.current.set(slot, button); else editButtons.current.delete(slot); }}
          onEdit={() => setEditing(slot)} />;
      })}
    </div>
    {editing !== null && editingPair && <ReappTargetEditor
      key={editing}
      slot={editing}
      draft={editingPair}
      onCancel={close}
      onSave={(pair) => save(editing, pair)} />}
  </>;
}

function ValueLine({ values, empty }: { values: readonly string[]; empty: string }) {
  if (values.length === 0) return <span className="choice-none">{empty}</span>;
  return <span className="choice-line">
    {values.map((value) => <span className="choice preferred" key={value}>{value}</span>)}
  </span>;
}

function ReappRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="role-row">
    <span className="role-row-label">{label}</span>
    <div className="role-row-value">{children}</div>
  </div>;
}

function TargetColumn({ slot, title, target }: { slot: number; title: string; target: ReappTarget }) {
  return <section className="reapp-column" data-enabled={target.enabled ? 'true' : 'false'}
    aria-label={`Slot ${slot} ${title} target`}>
    <header className="reapp-column-head">
      <h5 className="reapp-column-title">{title}</h5>
      <p className="role-type">{target.enabled ? 'Enabled' : 'Disabled'}</p>
    </header>
    {target.enabled && <div className="role-rows">
      <ReappRow label="Rune type">
        <ValueLine values={reappSetOptions.filter((name) => target.sets.includes(name))} empty="Any set" />
      </ReappRow>
      <ReappRow label="Min grade"><ValueLine values={[target.minimumRarity]} empty="—" /></ReappRow>
      <ReappRow label="Must have innate">
        <ValueLine values={[target.requiresInnate ? 'Yes' : 'No']} empty="—" />
      </ReappRow>
      {reappSlotChoosesMain(slot) && <ReappRow label="Must have main stat">
        <ValueLine values={statLabels(reappMainOptions(slot), target.mains)} empty="Any main" />
      </ReappRow>}
    </div>}
  </section>;
}

function ReappTargetCard({ slot, pair, editRef, onEdit }: {
  slot: number;
  pair: SlotPair;
  editRef: (button: HTMLButtonElement | null) => void;
  onEdit: () => void;
}) {
  const name = `Slot ${slot}`;
  const off = !pair.reapp.enabled && !pair.refine.enabled;
  return <article className="reapp-card" data-enabled={off ? 'false' : 'true'}>
    <header className="role-head">
      <div className="role-title">
        <h4 className="reapp-name">{name}</h4>
      </div>
      <div className="role-actions">
        <button className="icon-button" type="button" ref={editRef} onClick={onEdit}
          aria-haspopup="dialog" title={`Edit the ${name} targets`} aria-label={`Edit the ${name} targets`}>
          <PencilIcon />
        </button>
      </div>
    </header>
    <div className="reapp-columns">
      {kinds.map(({ kind, title }) => <TargetColumn key={kind} slot={slot} title={title} target={pair[kind]} />)}
    </div>
  </article>;
}

/** A list chosen in pills, in the editor's own field frame. */
function ChoiceField<T extends string | number>({ label, description, empty, options, chosen, onChange }: {
  label: string; description: string; empty: string;
  options: readonly TokenChoiceOption<T>[];
  chosen: readonly T[];
  onChange: (next: T[]) => void;
}) {
  const offered = options.filter((option) => !chosen.includes(option.value));
  return <div className="field">
    <span>{label}</span>
    <TokenChoiceLine name={description} description={description} empty={empty}
      pills={options.filter((option) => chosen.includes(option.value))}
      onRemove={(value) => onChange(chosen.filter((entry) => entry !== value))}
      renderMenu={(close) => <ul className="token-choice-list">
        {offered.map((option) => <li key={String(option.value)}>
          <button type="button" role="menuitem" className="token-choice-option"
            onClick={() => { onChange([...chosen, option.value]); close(); }}>{option.label}</button>
        </li>)}
        {offered.length === 0 && <li className="token-choice-note">Everything is chosen.</li>}
      </ul>} />
  </div>;
}

/** One side of the editor. Switched off, its questions fold away; their answers are kept. */
function TargetFields({ slot, title, target, onChange }: {
  slot: number; title: string; target: ReappTarget;
  onChange: (change: Partial<ReappTarget>) => void;
}) {
  return <section className="reapp-editor-column" aria-label={`${title} target`}>
    <header className="reapp-editor-column-head">
      <h3 className="editor-block-title">{title}</h3>
      <CheckboxRow label={`${title} enabled`} checked={target.enabled}
        onChange={(enabled) => onChange({ enabled })} />
    </header>
    {target.enabled && <>
      <ChoiceField label="Rune type" description={`${title} rune type`} empty="Any set"
        options={reappSetOptions.map((name) => ({ value: name, label: name }))}
        chosen={target.sets} onChange={(sets) => onChange({ sets })} />

      {/* Each sized to its few short answers with some room to spare, rather
          than stretched across the column for words of six letters. */}
      <div className="reapp-editor-pair">
        <label className="field reapp-grade"><span>Min grade</span>
          <Dropdown value={target.minimumRarity} aria-label={`${title} min grade`}
            onChange={(event) => onChange({ minimumRarity: event.target.value as RuneRarity })}>
            {runeRarities.map((rarity) => <option key={rarity}>{rarity}</option>)}
          </Dropdown>
        </label>
        <label className="field reapp-innate"><span>Must have innate</span>
          <Dropdown value={target.requiresInnate ? 'yes' : 'no'} aria-label={`${title} must have innate`}
            onChange={(event) => onChange({ requiresInnate: event.target.value === 'yes' })}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Dropdown>
        </label>
      </div>

      {reappSlotChoosesMain(slot) && <ChoiceField label="Must have main stat"
        description={`${title} must have main stat`} empty="Any main"
        options={reappMainOptions(slot).map(statOption)}
        chosen={target.mains} onChange={(mains) => onChange({ mains })} />}
    </>}
  </section>;
}

function ReappTargetEditor({ slot, draft, onCancel, onSave }: {
  slot: number;
  draft: SlotPair;
  onCancel: () => void;
  onSave: (pair: SlotPair) => void;
}) {
  const [pair, setPair] = useState<SlotPair>(draft);
  const form = useRef<HTMLFormElement>(null);

  /* The first switch takes the focus: every other question hangs on it. */
  useEffect(() => { form.current?.querySelector<HTMLElement>('input[type="checkbox"]')?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function update(kind: RerollKind, change: Partial<ReappTarget>) {
    setPair((current) => ({ ...current, [kind]: { ...current[kind], ...change } }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(pair);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form ref={form} className="dialog editor reapp-editor" role="dialog" aria-modal="true" aria-labelledby="reapp-editor-title" onSubmit={submit}>
      <header className="editor-head">
        <p className="eyebrow">Edit re-app/refine target</p>
        <h2 id="reapp-editor-title">Slot {slot}</h2>
      </header>

      <div className="editor-body reapp-editor-body">
        {kinds.map(({ kind, title }) => <TargetFields key={kind} slot={slot} title={title}
          target={pair[kind]} onChange={(change) => update(kind, change)} />)}
      </div>

      <div className="dialog-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary">Save changes</Button>
      </div>
    </form>
  </div>;
}
