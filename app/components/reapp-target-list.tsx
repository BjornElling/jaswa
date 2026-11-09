import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, FilterButton } from './button';
import { Dropdown } from './dropdown';
import { TokenChoiceField } from './token-choice-field';
import { innateRequirements, newRerollRule, reappSetOptions, reappSlots, rerollMainOptions, rerollRuleProblems } from '../lib/rune-reapp-targets';
import type { RerollRule, RerollKind } from '../lib/rune-reapp-targets';
import { runeRarities, runeStatName } from '../lib/runes';
import type { RuneRarity } from '../lib/runes';

const kindLabels = { reapp: 'Re-app', refine: 'Refine' };
const innateLabels = { yes: 'Yes', both: 'Both', no: 'No' };
const ruleSlots = (rule: RerollRule) => reappSlots.filter((slot) => rule.slots.length === 0 || rule.slots.includes(slot));
const ruleSlotsTitle = (rule: RerollRule) => {
  const slots = ruleSlots(rule);
  return `${slots.length === 1 ? 'Slot' : 'Slots'} ${slots.join(', ')}`;
};
const ruleMainsTitle = (rule: RerollRule) => rule.mains.map(runeStatName).join(', ');
const ruleTitle = (rule: RerollRule) => [ruleSlotsTitle(rule), ruleMainsTitle(rule)].filter(Boolean).join(' — ');
function compareRuleSlots(left: RerollRule, right: RerollRule) {
  const a = ruleSlots(left);
  const b = ruleSlots(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  // Equal prefixes put the shorter answer first; equal answers keep the user's order.
  return a.length - b.length;
}

export function ReappTargetList({ rules, onChange }: {
  rules: readonly RerollRule[];
  onChange: (rules: RerollRule[]) => void;
}) {
  const [editing, setEditing] = useState<{ draft: RerollRule; isNew: boolean } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const add = useRef<Record<RerollKind, HTMLButtonElement | null>>({ reapp: null, refine: null });
  function close() { setEditing(null); opener.current?.focus(); }
  function edit(draft: RerollRule, isNew: boolean, button: HTMLButtonElement) {
    opener.current = button;
    setEditing({ draft, isNew });
  }
  return <div className="reroll-rules">
    {(['reapp', 'refine'] as const).map((kind) => {
      const kindRules = rules.filter((rule) => rule.kind === kind).sort(compareRuleSlots);
      const label = kindLabels[kind];
      return <section className="reroll-rule-column" aria-label={label} key={kind}>
        <header className="reroll-toolbar">
          <h3 className="editor-block-title">{label}</h3>
          <Button ref={(button) => { add.current[kind] = button; }} aria-haspopup="dialog"
            onClick={(event) => edit(newRerollRule(crypto.randomUUID(), kind), true, event.currentTarget)}>Add {label} rule</Button>
        </header>
        {kindRules.length === 0 && <p className="notice">Add a {label} rule to start.</p>}
        <div className="role-list">
          {kindRules.map((rule) => <article key={rule.id} className="reapp-card">
            <header className="role-head">
              <div className="role-title"><h4 className="reapp-name" title={ruleTitle(rule)}>
                {ruleSlotsTitle(rule)}{rule.mains.length > 0 && <><span className="reapp-title-separator"> — </span>{ruleMainsTitle(rule)}</>}
              </h4></div>
              <div className="role-actions">
                <Button size="compact" aria-label={`Edit ${ruleTitle(rule)}`} aria-haspopup="dialog"
                  onClick={(event) => edit(rule, false, event.currentTarget)}>Edit</Button>
                <Button size="compact" tone="danger" aria-label={`Delete ${ruleTitle(rule)}`}
                  onClick={() => { onChange(rules.filter((entry) => entry.id !== rule.id)); add.current[kind]?.focus(); }}>Delete</Button>
              </div>
            </header>
            <div className="role-rows">
              <RuleRow label="Rune type">{rule.sets.length ? rule.sets.join(', ') : 'Any set'}</RuleRow>
              <RuleRow label="Min rarity">{rule.minimumRarity}</RuleRow>
              <RuleRow label="Innate required">{innateLabels[rule.innate]}</RuleRow>
            </div>
          </article>)}
        </div>
      </section>;
    })}
    {editing && <RuleEditor key={editing.draft.id} {...editing} onCancel={close} onSave={(rule) => {
      onChange(editing.isNew ? [...rules, rule] : rules.map((entry) => entry.id === rule.id ? rule : entry));
      close();
    }} />}
  </div>;
}

function RuleRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="role-row"><span className="role-row-label">{label}</span><div className="role-row-value" title={String(children)}>{children}</div></div>;
}

/** Every option keeps its place while its appearance changes. */
function Choices<T extends string | number>({ label, options, chosen, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; chosen: readonly T[]; onChange: (chosen: T[]) => void;
}) {
  return <fieldset className="reroll-choices"><legend className="filter-label">{label}</legend>
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
  useEffect(() => { form.current?.querySelector<HTMLButtonElement>('.reroll-slots-field button')?.focus(); }, []);
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
      <header className="editor-head"><p className="eyebrow">{kindLabels[rule.kind]}</p><h2 id="reroll-editor-title">{isNew ? 'Add' : 'Edit'} {kindLabels[rule.kind]} rule</h2></header>
      <div className="editor-body reapp-editor-body">
        <div className="reroll-slots-field"><Choices label="Slots" options={reappSlots.map((slot) => ({ value: slot, label: String(slot) }))} chosen={rule.slots} onChange={(slots) => update({ slots })} /></div>
        <TokenChoiceField label="Main stat" description="Main stat" empty="Any main" className="reroll-main-field"
          options={rerollMainOptions.map((id) => ({ value: id, label: runeStatName(id) ?? String(id) }))}
          chosen={rule.mains} onChange={(mains) => update({ mains })} />
        <TokenChoiceField label="Rune type" description="Rune type" empty="Any set" className="reroll-set-field"
          options={reappSetOptions.map((name) => ({ value: name, label: name }))}
          chosen={rule.sets} onChange={(sets) => update({ sets })} />
        <label className="field reroll-rarity-field"><span className="filter-label">Min rarity</span><Dropdown aria-label="Min rarity" value={rule.minimumRarity} onChange={(event) => update({ minimumRarity: event.target.value as RuneRarity })}>
          {runeRarities.map((rarity) => <option key={rarity}>{rarity}</option>)}
        </Dropdown></label>
        <fieldset className="reroll-choices reroll-innate-field"><legend className="filter-label">Innate required</legend>
          <div className="reroll-options">{innateRequirements.map((innate) => <FilterButton key={innate}
            active={rule.innate === innate} onClick={() => update({ innate })}>{innateLabels[innate]}</FilterButton>)}</div>
        </fieldset>
        <div className="reroll-validation editor-note" role="status" aria-live="polite" data-invalid={problems.length > 0}>
          {problems.join(' ')}
        </div>
      </div>
      <div className="dialog-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" tone="primary" disabled={problems.length > 0}>Save rule</Button></div>
    </form>
  </div>;
}
