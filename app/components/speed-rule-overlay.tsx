import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from './button';
import { CheckboxRow } from './form-controls';
import { Dropdown } from './dropdown';
import { Overlay, OverlayAction } from './overlay';
import type { MonsterChoice } from './speed-team-editor';
import { SpeedVerdictMark } from './speed-verdict-mark';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import type { MonsterCopyName } from '../lib/monster-names';
import { readSpeedRule, speedRuleForms, speedRuleKind, speedRuleKinds, speedRuleSentence } from '../lib/speed-rules';
import type { SpeedRuleForm, SpeedRuleFormReading, SpeedRuleReading } from '../lib/speed-rules';
import { displaySpeedIntervalText } from '../lib/speed-tuning-analysis';
import { isSpeedRuleFigure } from '../lib/speed-tuning-preferences';
import type { SpeedRule, SpeedRuleKind, SpeedRuleMust } from '../lib/speed-tuning-preferences';
import type { GeneralSettings } from '../lib/types';

/* Every field as typed. A figure is held as text, so an empty field is "not
   given yet" rather than a zero, and switching what the rule asks keeps what
   was typed for the other choices, so switching back finds it again. */
type Draft = {
  unitId: string;
  kind: SpeedRuleKind | '';
  otherUnitId: string;
  speed: string;
  minimum: string;
  maximum: string;
} & Record<SpeedRuleForm, boolean>;

function draftOf(rule: SpeedRule | null): Draft {
  const must = rule?.must;
  return {
    unitId: rule?.unitId ?? '',
    kind: must?.kind ?? '',
    otherUnitId: must?.kind === 'move-before' || must?.kind === 'move-after' ? must.unitId : '',
    speed: must?.kind === 'reach-at-least' || must?.kind === 'stay-at-most' ? String(must.speed) : '',
    minimum: must?.kind === 'stay-between' ? String(must.minimum) : '',
    maximum: must?.kind === 'stay-between' ? String(must.maximum) : '',
    /* A new rule is checked everywhere: unticking is the decision, and a rule
       ticked nowhere is the case the save asks about. */
    displaySpeed: rule?.displaySpeed ?? true,
    dungeonSpeed: rule?.dungeonSpeed ?? true,
    arenaSpeed: rule?.arenaSpeed ?? true,
  };
}

function figureOf(text: string): number | null {
  if (text === '') return null;
  const value = Number(text);
  return isSpeedRuleFigure(value) ? value : null;
}

/** The draft as a rule, or `null` while any part of it is missing or out of range. */
function ruleOf(id: string, draft: Draft): SpeedRule | null {
  if (draft.unitId === '' || draft.kind === '') return null;
  let must: SpeedRuleMust;
  switch (draft.kind) {
    case 'move-before':
    case 'move-after':
      if (draft.otherUnitId === '' || draft.otherUnitId === draft.unitId) return null;
      must = { kind: draft.kind, unitId: draft.otherUnitId };
      break;
    case 'reach-at-least':
    case 'stay-at-most': {
      const speed = figureOf(draft.speed);
      if (speed === null) return null;
      must = { kind: draft.kind, speed };
      break;
    }
    case 'stay-between': {
      const minimum = figureOf(draft.minimum);
      const maximum = figureOf(draft.maximum);
      if (minimum === null || maximum === null || minimum > maximum) return null;
      must = { kind: draft.kind, minimum, maximum };
      break;
    }
  }
  return { id, unitId: draft.unitId, must, displaySpeed: draft.displaySpeed, dungeonSpeed: draft.dungeonSpeed, arenaSpeed: draft.arenaSpeed };
}

/* What went wrong, in the words the team editor uses for a member: too slow
   or too fast, and the display speeds that would put it right. */
function formVerdictText(rule: SpeedRule, entry: SpeedRuleFormReading, general: GeneralSettings): string {
  if (entry.state === 'holds') return 'Holds';
  const fix = displaySpeedIntervalText(entry.interval, general);
  const withFix = (problem: string) => fix === null ? problem : `${problem} · ${fix}`;
  if (entry.state === 'tie') return withFix(entry.form === 'displaySpeed' ? 'Level' : 'Tied · position decides');
  const { must } = rule;
  const tooSlow = must.kind === 'move-before' || must.kind === 'reach-at-least'
    || (must.kind === 'stay-between' && entry.own < must.minimum);
  return withFix(tooSlow ? 'Too slow' : 'Too fast');
}

function FigureField({ id, label, value, onChange }: { id?: string; label?: string; value: string; onChange: (value: string) => void }) {
  return <input id={id} className="speed-rule-figure" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3}
    autoComplete="off" aria-label={label} value={value}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))} />;
}

/**
 * One standing rule, edited as a draft: a monster, what it must do, what that
 * is measured against, and the speed forms it is checked in. Every form's
 * verdict is on the panel while the rule is written, ticked or not, so the
 * reader sees what the rule says today before saving it — and, where it does
 * not hold, which display speeds would make it.
 */
export function SpeedRuleOverlay({ id, initial, choices, names, monsters, totemShare, general, onSave, onRemove, onClose }: {
  id: string;
  /** The saved rule, or `null` for a new one. */
  initial: SpeedRule | null;
  /** Every owned monster. */
  choices: readonly MonsterChoice[];
  names: Record<string, MonsterCopyName>;
  monsters: ReadonlyMap<string, GameRecord>;
  totemShare: number;
  general: GeneralSettings;
  onSave: (rule: SpeedRule) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rule = ruleOf(id, draft);
  /* Read from the draft rather than from `rule`, which is a new object on every
     render: a verdict searches every display speed, and costs that only when
     something the rule is made of changes. */
  const reading = useMemo<SpeedRuleReading | null>(() => {
    const drafted = ruleOf(id, draft);
    return drafted && readSpeedRule(drafted, monsters, totemShare);
  }, [id, draft, monsters, totemShare]);
  const target = draft.kind === '' ? null : speedRuleKind(draft.kind).target;
  const checkedNowhere = speedRuleForms.every(({ id: form }) => !draft[form]);
  const rangeBackwards = target === 'range' && (figureOf(draft.minimum) ?? 0) > (figureOf(draft.maximum) ?? Infinity);

  function change(update: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...update }));
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || rule === null) return;
    if (checkedNowhere) setConfirming(true);
    else onSave(rule);
  }

  /* A saved monster the import no longer holds stays selectable as itself,
     so opening the rule shows what it says rather than a different monster. */
  function options(selected: string, except?: string) {
    const known = selected === '' || choices.some((choice) => choice.unitId === selected);
    return <>
      {!known && <option value={selected}>Not in this import</option>}
      {choices.filter((choice) => choice.unitId !== except || choice.unitId === selected)
        .map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
    </>;
  }

  const nameOf = (unitId: string) => monsters.has(unitId) ? names[unitId]?.name ?? unitId : 'Not in this import';
  const figureText = (value: number) => formatNumber(value, general);
  /* A new rule is named as one until it is saved; a saved one by what it says. */
  const title = initial === null ? 'New rule' : rule ? speedRuleSentence(rule, nameOf, figureText) : 'Rule';

  return <>
    <Overlay labelledBy="speed-rule-overlay-title" className="speed-rule-overlay" dismissible={!dirty}
      onClose={onClose} onSubmit={submit}
      actions={<OverlayAction kind="save" type="submit" label={initial === null ? 'Add this rule' : 'Save changes'} disabled={!dirty || rule === null} />}>
      <header className="speed-overlay-head">
        <div className="speed-overlay-identity">
          <h2 id="speed-rule-overlay-title" className="speed-overlay-title" title={title}>{title}</h2>
        </div>
        {initial !== null && <div className="speed-overlay-tools">
          <Button size="compact" tone="danger" onClick={onRemove}>Remove rule</Button>
        </div>}
      </header>

      <div className="overlay-body speed-rule-body">
        <div className="speed-rule-lines">
          <label className="filter-label" htmlFor="speed-rule-monster">Chosen monster</label>
          <Dropdown id="speed-rule-monster" value={draft.unitId} placeholder="Choose a monster"
            onChange={(event) => change({ unitId: event.target.value })}>
            {options(draft.unitId)}
          </Dropdown>

          <label className="filter-label" htmlFor="speed-rule-must">Must</label>
          <Dropdown id="speed-rule-must" value={draft.kind} placeholder="Choose what must hold"
            onChange={(event) => change({ kind: event.target.value as SpeedRuleKind | '' })}>
            {speedRuleKinds.map((entry) => <option key={entry.kind} value={entry.kind}>{entry.label}</option>)}
          </Dropdown>

          {/* The third line is the one that changes with Must. Its row is
              always there and always one control high, so choosing what the
              rule asks never moves the boxes below (AGENTS.md §2). */}
          {target === 'monster' ? <>
            <label className="filter-label" htmlFor="speed-rule-other">This monster</label>
            <Dropdown id="speed-rule-other" value={draft.otherUnitId} placeholder="Choose a monster"
              onChange={(event) => change({ otherUnitId: event.target.value })}>
              {options(draft.otherUnitId, draft.unitId)}
            </Dropdown>
          </> : target === 'figure' ? <>
            <label className="filter-label" htmlFor="speed-rule-speed">This speed</label>
            <span className="speed-rule-target">
              <FigureField id="speed-rule-speed" value={draft.speed} onChange={(speed) => change({ speed })} />
            </span>
          </> : target === 'range' ? <>
            <span className="filter-label" id="speed-rule-range">These speeds</span>
            <span className="speed-rule-target" role="group" aria-labelledby="speed-rule-range">
              <FigureField label="Lowest" value={draft.minimum} onChange={(minimum) => change({ minimum })} />
              <span className="speed-rule-and">and</span>
              <FigureField label="Highest" value={draft.maximum} onChange={(maximum) => change({ maximum })} />
              <span className="speed-rule-hint type-caption" data-state={rangeBackwards ? 'bad' : 'none'}>
                {rangeBackwards ? 'The lower figure goes first' : ''}
              </span>
            </span>
          </> : <>
            <span aria-hidden="true" />
            <span className="speed-rule-target" aria-hidden="true" />
          </>}
        </div>

        <fieldset className="speed-rule-where">
          <legend className="filter-label">Applies to</legend>
          {speedRuleForms.map(({ id: form, name }) => {
            const entry = reading?.kind === 'read' ? reading.forms.find((candidate) => candidate.form === form) : undefined;
            const figures = reading === null ? ''
              : reading.kind === 'missing' ? 'Not in this import'
                : entry && (entry.other === null ? figureText(entry.own) : `${figureText(entry.own)} against ${figureText(entry.other)}`);
            const verdict = reading === null ? ''
              : reading.kind === 'missing' ? 'Cannot be judged'
                : entry && rule ? formVerdictText(rule, entry, general) : '';
            const state = !draft[form] || reading === null ? 'none'
              : reading.kind === 'missing' || entry?.state !== 'holds' ? 'bad' : 'good';
            /* Until the rule says something a row is its checkbox alone. Once it
               does, every form shows its figures and verdict in columns that
               were there all along — dimmed when unticked, so ticking one shows
               what it would say rather than opening a gap. */
            return <div key={form} className="speed-rule-check" data-checked={draft[form] ? 'true' : 'false'}
              data-read={reading === null ? 'false' : 'true'}>
              <CheckboxRow label={name} checked={draft[form]} onChange={(checked) => change({ [form]: checked })} />
              <span className="speed-rule-figures" title={figures}>{figures}</span>
              <span className="speed-rule-verdict type-caption" data-state={state} title={verdict}>{verdict}</span>
              <SpeedVerdictMark state={state} small />
            </div>;
          })}
        </fieldset>
      </div>
    </Overlay>

    {confirming && rule && <Overlay labelledBy="speed-rule-confirm-title" describedBy="speed-rule-confirm-text"
      className="speed-confirm" onClose={() => setConfirming(false)}>
      <div className="overlay-body">
        <div>
          <p className="eyebrow">No speed form ticked</p>
          <h2 id="speed-rule-confirm-title">Save a rule that checks nothing?</h2>
        </div>
        <p id="speed-rule-confirm-text">
          This rule has no effect until at least one of display speed, dungeon speed or arena speed is ticked.
          It is kept as written, and shows neither a tick nor a cross until then.
        </p>
        <div className="dialog-actions">
          {/* The safe answer takes focus, as in every confirmation in JASWA. */}
          <Button autoFocus onClick={() => setConfirming(false)}>Back to the rule</Button>
          <Button tone="primary" onClick={() => onSave(rule)}>Save anyway</Button>
        </div>
      </div>
    </Overlay>}
  </>;
}
