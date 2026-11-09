import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, FilterButton } from './button';
import { Dropdown } from './dropdown';
import { CheckboxRow } from './form-controls';
import { newRerollRule, reappSetOptions, reappSlots, rerollMainOptions, rerollRuleProblems } from '../lib/rune-reapp-targets';
import type { RerollRule } from '../lib/rune-reapp-targets';
import { runeRarities, runeStatName } from '../lib/runes';
import type { RuneRarity } from '../lib/runes';

const kindLabels = { reapp: 'Re-app', refine: 'Refine', both: 'Re-app + Refine' };
const ruleName = (rule: RerollRule) => rule.name.trim() || 'Untitled rule';

export function ReappTargetList({ rules, onChange }: {
  rules: readonly RerollRule[];
  onChange: (rules: RerollRule[]) => void;
}) {
  const [editing, setEditing] = useState<{ draft: RerollRule; isNew: boolean } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  function close() { setEditing(null); opener.current?.focus(); }
  function edit(draft: RerollRule, isNew: boolean, button: HTMLButtonElement) {
    opener.current = button;
    setEditing({ draft, isNew });
  }
  return <div className="reroll-rules">
    <div className="reroll-toolbar">
      <p className="editor-note">Match every condition in one rule. Any enabled rule is enough. Refine takes priority over Re-app.</p>
      <Button ref={add} aria-haspopup="dialog" onClick={(event) => edit(newRerollRule(crypto.randomUUID()), true, event.currentTarget)}>Add rule</Button>
    </div>
    {rules.length === 0 && <p className="notice">No reroll rules. Add a rule to protect Re-app or Refine targets from sale.</p>}
    <div className="role-list">
      {rules.map((rule) => <article key={rule.id} className="reapp-card" data-enabled={rule.enabled}>
        <header className="role-head">
          <div className="role-title"><h4 className="reapp-name" title={ruleName(rule)}>{ruleName(rule)}</h4>
            <p className="role-type">{kindLabels[rule.kind]} · {rule.enabled ? 'Enabled' : 'Disabled'}</p>
          </div>
          <div className="role-actions">
            <Button size="compact" aria-label={`Edit ${ruleName(rule)}`} aria-haspopup="dialog"
              onClick={(event) => edit(rule, false, event.currentTarget)}>Edit</Button>
            <Button size="compact" aria-label={`Duplicate ${ruleName(rule)}`} aria-haspopup="dialog"
              onClick={(event) => edit({ ...rule, id: crypto.randomUUID(), name: `${ruleName(rule)} (copy)` }, true, event.currentTarget)}>Duplicate</Button>
            <Button size="compact" tone="danger" aria-label={`Delete ${ruleName(rule)}`}
              onClick={() => { onChange(rules.filter((entry) => entry.id !== rule.id)); add.current?.focus(); }}>Delete</Button>
          </div>
        </header>
        <div className="role-rows">
          <RuleRow label="Slots">{rule.slots.length ? rule.slots.join(', ') : 'Any slot'}</RuleRow>
          <RuleRow label="Rune type">{rule.sets.length ? rule.sets.join(', ') : 'Any set'}</RuleRow>
          <RuleRow label="Min rarity">{rule.minimumRarity}</RuleRow>
          <RuleRow label="Innate">{rule.requiresInnate ? 'Required' : 'Any'}</RuleRow>
          <RuleRow label="Main stat">{rule.mains.length ? rule.mains.map(runeStatName).join(', ') : 'Any main'}</RuleRow>
          <RuleRow label="Compatibility">{rerollRuleProblems(rule).length ? 'Edit this rule to resolve its slots and main stats.' : 'Valid slots and main stats'}</RuleRow>
        </div>
      </article>)}
    </div>
    {editing && <RuleEditor key={editing.draft.id} {...editing} onCancel={close} onSave={(rule) => {
      onChange(editing.isNew ? [...rules, rule] : rules.map((entry) => entry.id === rule.id ? rule : entry));
      close();
    }} />}
  </div>;
}

function RuleRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="role-row"><span className="role-row-label">{label}</span><div className="role-row-value">{children}</div></div>;
}

/** Every option keeps its place while its appearance changes. */
function Choices<T extends string | number>({ label, options, chosen, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; chosen: readonly T[]; onChange: (chosen: T[]) => void;
}) {
  return <fieldset className="reroll-choices"><legend className="field-legend">{label}</legend>
    <div className="reroll-options">{options.map(({ value, label: text }) => <FilterButton key={value}
      active={chosen.includes(value)} onClick={() => onChange(chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value])}>{text}</FilterButton>)}</div>
  </fieldset>;
}

function RuleEditor({ draft, isNew, onCancel, onSave }: {
  draft: RerollRule; isNew: boolean; onCancel: () => void; onSave: (rule: RerollRule) => void;
}) {
  const [rule, setRule] = useState(draft);
  const form = useRef<HTMLFormElement>(null);
  const problems = rerollRuleProblems(rule);
  const update = (change: Partial<RerollRule>) => setRule((current) => ({ ...current, ...change }));
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      if (event.key !== 'Tab') return;
      const controls = [...(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])]
        .filter((node) => node.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [onCancel]);
  function submit(event: FormEvent) { event.preventDefault(); if (!problems.length) onSave(rule); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form ref={form} className="dialog editor reapp-editor" role="dialog" aria-modal="true" aria-labelledby="reroll-editor-title" onSubmit={submit}>
      <header className="editor-head"><p className="eyebrow">Re-app/refine target</p><h2 id="reroll-editor-title">{isNew ? 'Add rule' : 'Edit rule'}</h2></header>
      <div className="editor-body reapp-editor-body">
        <section className="reapp-editor-column" aria-label="Rule conditions">
          <label className="field"><span>Rule name</span><input aria-label="Rule name" value={rule.name} placeholder="Untitled rule" onChange={(event) => update({ name: event.target.value })} /></label>
          <div className="reapp-editor-pair">
            <label className="field"><span>Target</span><Dropdown aria-label="Target" value={rule.kind} onChange={(event) => update({ kind: event.target.value as RerollRule['kind'] })}>
              {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Dropdown></label>
            <CheckboxRow label="Enabled" checked={rule.enabled} onChange={(enabled) => update({ enabled })} />
          </div>
          <Choices label="Slots" options={reappSlots.map((slot) => ({ value: slot, label: String(slot) }))} chosen={rule.slots} onChange={(slots) => update({ slots })} />
          <Choices label="Main stat" options={rerollMainOptions.map((id) => ({ value: id, label: runeStatName(id) ?? String(id) }))} chosen={rule.mains} onChange={(mains) => update({ mains })} />
          <div className="reroll-validation editor-note" role="status" aria-live="polite" data-invalid={problems.length > 0}>
            {problems.length ? problems.join(' ') : 'Every selected slot can carry a chosen main stat. Within each group, any selected value matches; no selection means any value.'}
          </div>
        </section>
        <section className="reapp-editor-column" aria-label="Rune conditions">
          <Choices label="Rune type" options={reappSetOptions.map((name) => ({ value: name, label: name }))} chosen={rule.sets} onChange={(sets) => update({ sets })} />
          <div className="reapp-editor-pair">
            <label className="field reapp-grade"><span>Min rarity</span><Dropdown aria-label="Min rarity" value={rule.minimumRarity} onChange={(event) => update({ minimumRarity: event.target.value as RuneRarity })}>
              {runeRarities.map((rarity) => <option key={rarity}>{rarity}</option>)}
            </Dropdown></label>
            <label className="field reapp-innate"><span>Innate</span><Dropdown aria-label="Innate" value={rule.requiresInnate ? 'yes' : 'any'} onChange={(event) => update({ requiresInnate: event.target.value === 'yes' })}>
              <option value="any">Any</option><option value="yes">Required</option>
            </Dropdown></label>
          </div>
          <p className="editor-note">Only runes the calculation would sell become targets. All four sub properties must be visible; power up to +12 before using a stone in the game.</p>
          <p className="editor-note">Re-app changes sub-property types and values. Refine keeps the types and requires the four best types for at least one role build. Ancient or Gem-converted runes cannot be refined. Intangible runes take neither stone.</p>
          <p className="editor-note">Re-app + Refine tries Refine first, then Re-app. Separate rules let you set different conditions for each stone.</p>
        </section>
      </div>
      <div className="dialog-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" tone="primary" disabled={problems.length > 0}>Save rule</Button></div>
    </form>
  </div>;
}
