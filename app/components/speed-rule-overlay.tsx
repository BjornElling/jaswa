import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from './button';
import { CheckboxRow } from './form-controls';
import { Dropdown } from './dropdown';
import { Overlay, OverlayAction } from './overlay';
import type { MonsterChoice } from './speed-team-editor';
import type { MonsterCopyName } from '../lib/monster-names';
import type { SpeedRule } from '../lib/speed-tuning-preferences';

/**
 * One standing rule, edited as a draft: two monsters, which of them moves
 * first, and where the rule reaches. It is saved as a whole or not at all, so
 * a rule half-chosen never reaches a team and judges it against nobody.
 */
export function SpeedRuleOverlay({ initial, isNew, choices, names, onSave, onRemove, onClose }: {
  initial: SpeedRule;
  isNew: boolean;
  /** Every owned monster. */
  choices: readonly MonsterChoice[];
  names: Record<string, MonsterCopyName>;
  onSave: (rule: SpeedRule) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const valid = draft.fasterUnitId !== '' && draft.slowerUnitId !== ''
    && draft.fasterUnitId !== draft.slowerUnitId && (draft.arena || draft.dungeons);

  function change(update: Partial<SpeedRule>) {
    setDraft((current) => ({ ...current, ...update }));
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty && valid) onSave(draft);
  }

  /* A saved monster the import no longer holds stays selectable as itself,
     so opening the rule shows what it says rather than a different monster. */
  function options(selected: string) {
    const known = selected === '' || choices.some((choice) => choice.unitId === selected);
    return <>
      {!known && <option value={selected}>Not in this import</option>}
      {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
    </>;
  }

  const fasterName = names[draft.fasterUnitId]?.name;
  const slowerName = names[draft.slowerUnitId]?.name;

  return <Overlay labelledBy="speed-rule-overlay-title" className="speed-rule-overlay" dismissible={!dirty}
    onClose={onClose} onSubmit={submit}
    actions={<OverlayAction kind="save" type="submit" label={isNew ? 'Add this rule' : 'Save changes'} disabled={!dirty || !valid} />}>
    <header className="speed-overlay-head">
      <div className="speed-overlay-identity">
        <p className="eyebrow">{isNew ? 'New rule' : 'Rule'}</p>
        <h2 id="speed-rule-overlay-title" className="speed-overlay-title">
          {fasterName && slowerName ? `${fasterName} before ${slowerName}` : 'Who moves first'}
        </h2>
      </div>
      {!isNew && <div className="speed-overlay-tools">
        <Button size="compact" tone="danger" onClick={onRemove}>Remove rule</Button>
      </div>}
    </header>

    <div className="overlay-body speed-rule-body">
      <div className="speed-rule-pick">
        <label className="filter-label" htmlFor="speed-rule-faster">Moves first</label>
        <Dropdown id="speed-rule-faster" value={draft.fasterUnitId} placeholder="Choose a monster"
          onChange={(event) => change({ fasterUnitId: event.target.value })}>
          {options(draft.fasterUnitId)}
        </Dropdown>
      </div>
      <div className="speed-rule-pick">
        <label className="filter-label" htmlFor="speed-rule-slower">Moves after</label>
        <Dropdown id="speed-rule-slower" value={draft.slowerUnitId} placeholder="Choose a monster"
          onChange={(event) => change({ slowerUnitId: event.target.value })}>
          {options(draft.slowerUnitId)}
        </Dropdown>
      </div>
      <fieldset className="speed-rule-where">
        <legend className="filter-label">Applies in</legend>
        <CheckboxRow label="Arena" checked={draft.arena} onChange={(arena) => change({ arena })} />
        <CheckboxRow label="Dungeons" checked={draft.dungeons} onChange={(dungeons) => change({ dungeons })} />
      </fieldset>
      <p className="speed-rule-note type-caption">
        The rule is checked in every team of the ticked kinds that holds both monsters.
      </p>
    </div>
  </Overlay>;
}
