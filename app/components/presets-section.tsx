import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from './button';
import { Dropdown } from './dropdown';
import { ArrowIcon, RemoveIcon } from './list-icons';
import { MonsterLink } from './monster-link';
import { warmMonsterPortraits } from '../lib/monster-portrait-image';
import type { OpenMonsterOverlay } from './monster-link';
import { PageHeader } from './page-chrome';
import { SpeedVerdictMark } from './speed-verdict-mark';
import { reorderKeyStep, useDragReorder } from './use-drag-reorder';
import { WorkspacePage } from './workspace-page';
import type { GameRecord } from '../lib/game-data';
import { moveItem } from '../lib/list-order';
import { monsterPresentation } from '../lib/monster-catalog';
import { artifactSlotCount, engravedCounts, monsterNameCollator } from '../lib/monster-grid';
import { runeSlotCount } from '../lib/rune-set-pairs';
import { monsterCopyNames } from '../lib/monster-names';
import { presetPriorityOf } from '../lib/monster-priority';
import type { MonsterPriority } from '../lib/monster-priority';
import { presetContent, presetContents } from '../lib/preset-contents';
import type { PresetContentId } from '../lib/preset-contents';
import { accountItems, monsterInPreset, newOwnPresetId, presetGroupsOf } from '../lib/presets';
import type { OwnPreset, Preset } from '../lib/presets';
import type { ImportedGame, Preferences } from '../lib/types';

type MonsterChoice = { unitId: string; masterId: string; name: string; record: GameRecord };

export type PresetWrites = {
  /** Default's list. */
  monsterPriority: (change: (current: MonsterPriority) => MonsterPriority) => void;
  /** A game preset's order. */
  presetOrder: (presetId: string, order: readonly string[]) => void;
  ownPresets: (change: (current: OwnPreset[]) => OwnPreset[]) => void;
};

/**
 * **Presets — the page.** Default and every preset, one at a time, with its
 * monsters in the order they have first claim on runes: the order Rune
 * Optimization reads when told to leave a monster's runes to the monsters above
 * it. Runes compete only inside a preset (`DECK-PRESETS.md` §1), so the list is
 * the preset's own.
 *
 * The game's presets come from the import and keep the game's monsters; only
 * their order is the user's. A preset built here is the user's whole: a draft to
 * build in the game once its runes are right.
 */
export function PresetsSection({ game, monsters, preferences, presets, selectedId, canCreate, onSelect, onWrite, onOpenMonster, onOptimize }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  presets: readonly Preset[];
  /** `''` until the user has chosen. */
  selectedId: string;
  /** Building a preset here is for a workspace the game does not overwrite. */
  canCreate: boolean;
  onSelect: (presetId: string) => void;
  onWrite: PresetWrites;
  onOpenMonster: OpenMonsterOverlay;
  /** Opens Rune Optimization on this copy in this preset. */
  onOptimize: (presetId: string, unitId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const preset = presets.find((entry) => entry.id === selectedId) ?? null;
  const own = preset?.kind === 'own' ? preferences.presets.find((entry) => entry.id === preset.id) ?? null : null;
  const priority = useMemo(() => (preset ? presetPriorityOf(preset, preferences.monsterPriority, preferences.presetPriority) : []),
    [preset, preferences.monsterPriority, preferences.presetPriority]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  const names = useMemo(() => monsterCopyNames(monsters, preferences.monsterPreferences), [monsters, preferences.monsterPreferences]);
  const owned = useMemo(() => new Map<string, MonsterChoice>(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => {
      const unitId = String(monster.unit_id);
      return [unitId, { unitId, masterId: String(monster.unit_master_id ?? ''), name: names[unitId]?.name ?? unitId, record: monster }];
    })), [monsters, names]);
  /* A game preset's monsters are the game's, so it takes none from here; a
     preset of a content takes no more than the content's team. */
  const full = own !== null && own.content !== null && own.members.length >= presetContent(own.content).teamSize;
  const canAdd = preset !== null && (preset.kind === 'default' || own !== null) && !full;
  const choices = useMemo(() => {
    const placed = new Set(priority);
    return [...owned.values()].filter((choice) => !placed.has(choice.unitId))
      .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId));
  }, [owned, priority]);
  const reorder = useDragReorder<HTMLOListElement>({ count: priority.length, onMove: move });
  const editable = preset !== null && preset.kind !== 'game';

  function writeOwn(change: (current: OwnPreset) => OwnPreset) {
    if (!own) return;
    onWrite.ownPresets((current) => current.map((entry) => entry.id === own.id ? change(entry) : entry));
  }

  function move(from: number, to: number) {
    if (!preset || to < 0 || to >= priority.length || from === to) return;
    if (preset.kind === 'default') onWrite.monsterPriority((current) => moveItem(current, from, to));
    else if (preset.kind === 'own') writeOwn((current) => ({ ...current, members: moveItem(current.members, from, to) }));
    else onWrite.presetOrder(preset.id, moveItem(priority, from, to));
  }

  function add(unitId: string) {
    if (!preset || !owned.has(unitId) || !canAdd) return;
    if (preset.kind === 'default') {
      onWrite.monsterPriority((current) => (current.includes(unitId) ? current : [...current, unitId]));
      return;
    }
    /* A preset that holds its monsters' gear gives a newcomer its Default gear,
       less whatever this preset already engraves elsewhere: one rune, one
       monster, inside a preset. */
    writeOwn((current) => {
      if (current.members.includes(unitId)) return current;
      const gear = current.gear === null ? null : (() => {
        const taken = new Set(Object.values(current.gear).flatMap((entry) => [...entry.runeIds, ...entry.artifactIds]));
        const fallback = presets.find((entry) => entry.kind === 'default');
        const runeIds = (fallback?.runesOf.get(unitId) ?? []).filter((id) => !taken.has(id));
        const artifactIds = (fallback?.artifactsOf.get(unitId) ?? []).filter((id) => !taken.has(id));
        return { ...current.gear, [unitId]: { runeIds: [...runeIds], artifactIds: [...artifactIds] } };
      })();
      return { ...current, members: [...current.members, unitId], gear };
    });
  }

  function remove(unitId: string) {
    if (!preset) return;
    if (preset.kind === 'default') {
      onWrite.monsterPriority((current) => current.filter((entry) => entry !== unitId));
      return;
    }
    writeOwn((current) => {
      const gear = current.gear === null ? null : Object.fromEntries(Object.entries(current.gear).filter(([id]) => id !== unitId));
      return { ...current, members: current.members.filter((entry) => entry !== unitId),
        leaderUnitId: current.leaderUnitId === unitId ? null : current.leaderUnitId, gear };
    });
  }

  function lead(unitId: string) {
    writeOwn((current) => ({ ...current, leaderUnitId: current.leaderUnitId === unitId ? null : unitId }));
  }

  function create(name: string, content: PresetContentId | null) {
    const id = newOwnPresetId();
    onWrite.ownPresets((current) => [...current, { id, name, content, members: [], leaderUnitId: null, gear: null }]);
    onSelect(id);
  }

  function deleteOwn() {
    if (!own) return;
    onWrite.ownPresets((current) => current.filter((entry) => entry.id !== own.id));
    onSelect('');
  }

  function warmChoices() {
    warmMonsterPortraits(choices.map((choice) => monsterPresentation(choice.masterId)?.imageFilename));
  }

  if (!game) {
    return <WorkspacePage header={<PresetsHeader />}>
      <section className="empty-state">
        <h2>Your presets, and who gets first pick of the runes in each.</h2>
        <p className="next-step">Import your game data first. The presets come from your account.</p>
      </section>
    </WorkspacePage>;
  }

  const groups = presetGroupsOf(presets);
  return <WorkspacePage header={<PresetsHeader />}>
    <div className="monster-priority">
      <div className="panel monster-priority-add-panel">
        <div className="monster-priority-fields">
          <div className="filter-group monster-priority-add">
            <label className="filter-label" htmlFor="preset-choice">Preset</label>
            <Dropdown id="preset-choice" className="monster-priority-select" value={preset ? preset.id : ''} placeholder="Choose preset"
              onChange={(event) => onSelect(event.target.value)}>
              {groups.map((group) => <optgroup key={group.label} label={group.label}>
                {group.presets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </optgroup>)}
            </Dropdown>
          </div>
          <div className="filter-group monster-priority-add">
            <label className="filter-label" htmlFor="monster-priority-add">Add mon</label>
            {/* Back to its placeholder after every pick: the field adds to the list
                rather than holding a choice of its own. */}
            <Dropdown id="monster-priority-add" className="monster-priority-select" value="" placeholder="Choose a monster"
              disabled={!canAdd || choices.length === 0}
              onFocus={warmChoices} onPointerDown={warmChoices}
              onChange={(event) => { if (event.target.value) add(event.target.value); }}>
              {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
            </Dropdown>
          </div>
        </div>
        <p className="monster-priority-about">{preset ? presetFacts(preset) : 'Choose a preset to see who gets first pick of its runes.'}</p>
        <div className="monster-priority-actions">
          <Button ref={createButton} tone="important" disabled={!canCreate} onClick={() => setCreating(true)}
            title={canCreate ? undefined : 'Automatic synchronization is on: presets come from the game.'}>Create preset</Button>
          <Button tone="danger" disabled={own === null} onClick={deleteOwn}>Delete preset</Button>
        </div>
      </div>

      <section className="panel monster-priority-list-panel" aria-labelledby="monster-priority-list-title" aria-disabled={preset === null || undefined}>
        <h3 id="monster-priority-list-title" className="type-heading">Priority</h3>
        {preset === null
          ? <p className="monster-priority-empty">No preset chosen yet.</p>
          : priority.length === 0
            ? <p className="monster-priority-empty">{preset.kind === 'game' ? 'This preset holds no monsters.' : 'Nobody here yet. Add a monster above, and the first one in takes #1.'}</p>
            /* Each entry is dragged by any part of it; the arrows beside it, and
               Alt with an arrow key, are the same move without a pointer. */
            : <div className="monster-priority-table">
              {/* The column names are for the eye; every cell says its own in full to a screen reader. */}
              <div className="monster-priority-head" aria-hidden="true">
                <span /><span /><span /><span />
                <span>Runes</span><span>Artifacts</span><span>Relic</span>
                <span />
              </div>
              <ol className="monster-priority-list" {...reorder.containerProps}>
              {priority.map((unitId, at) => {
                const choice = owned.get(unitId);
                const name = choice?.name ?? 'Not in this import';
                const display = choice ? monsterPresentation(choice.masterId) : undefined;
                const leader = preset.leaderUnitId === unitId;
                /* Numbered by where the entry is drawn, so a drag's preview reads #1 to #n down the list. */
                const number = reorder.place(at) + 1;
                const step = (event: KeyboardEvent<HTMLLIElement>) => {
                  const by = reorderKeyStep(event);
                  if (by === 0) return;
                  event.preventDefault();
                  move(at, at + by);
                };
                return <li key={unitId} className="monster-priority-entry" {...reorder.entryProps(at)} onKeyDown={step}>
                  <span className="monster-priority-place">#{number}</span>
                  {/* The crown is always in its place and only dimmed when off, so
                      choosing a leader moves nothing (AGENTS.md §2). */}
                  {own
                    ? <button type="button" className="speed-icon-button preset-leader" aria-pressed={leader}
                      aria-label={`${name} leads this preset`} onClick={() => lead(unitId)}><CrownIcon /></button>
                    : <span className="preset-leader" data-on={leader || undefined} role="img"
                      aria-label={leader ? 'Leader' : undefined} aria-hidden={leader ? undefined : true}><CrownIcon /></span>}
                  <span className="monster-priority-name">
                    {choice && display
                      ? <MonsterLink target={{ kind: 'copy', unitId, masterId: choice.masterId }} name={name}
                        portrait={{ imageFilename: display.imageFilename, initial: display.shortName }} onOpen={onOpenMonster} />
                      : <span className="monster-name muted">{name}</span>}
                  </span>
                  {/* The row's own small control rather than a page button: it is a way out
                      of the list, and should not outshout the names it sits beside. */}
                  <button type="button" className="speed-icon-button monster-priority-optimize" disabled={!choice}
                    aria-label={`Optimize runes for ${name}`} onClick={() => onOptimize(preset.id, unitId)}>Optimize</button>
                  {choice ? <Gear monster={monsterInPreset(choice.record, preset, items)} preset={preset} unitId={unitId} /> : <><span /><span /><span /></>}
                  <span className="monster-priority-controls">
                    <button type="button" className="speed-icon-button" aria-label={`Move ${name} up`}
                      disabled={at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
                    <button type="button" className="speed-icon-button" aria-label={`Move ${name} down`}
                      disabled={at === priority.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
                    <button type="button" className="speed-icon-button danger" aria-label={`Remove ${name} from this preset`}
                      disabled={!editable} onClick={() => remove(unitId)}><RemoveIcon /></button>
                  </span>
                </li>;
              })}
              </ol>
            </div>}
      </section>
    </div>
    {creating && <CreatePresetDialog onCancel={() => { setCreating(false); createButton.current?.focus(); }}
      onCreate={(name, content) => { setCreating(false); create(name, content); }} />}
  </WorkspacePage>;
}

/* One line of what the chosen preset is: where it is played, and whether it
   holds its own gear. A sold item it still names is said here, where the
   user meets the preset, rather than hidden in a total. */
function presetFacts(preset: Preset): string {
  if (preset.kind === 'default') return 'Every monster on its own gear, outside any preset.';
  const parts = [preset.content?.name ?? 'Content not yet named',
    preset.savesGear ? 'saves runes and artifacts' : 'saves monsters only, each on its Default gear'];
  const sold = preset.missingRuneIds.length + preset.missingArtifactIds.length;
  if (sold > 0) parts.push(`names ${sold} sold item${sold === 1 ? '' : 's'}`);
  if (preset.missingUnitIds.length > 0) parts.push(`names ${preset.missingUnitIds.length} monster${preset.missingUnitIds.length === 1 ? '' : 's'} not in this import`);
  return parts.join(' · ');
}

/* Three cells: what the copy has engraved in this preset against what it can
   take, and a tick only when every slot is filled. The relic is Default's in
   every preset, as the game reads it. */
function Gear({ monster, preset, unitId }: { monster: GameRecord; preset: Preset; unitId: string }) {
  const engraved = engravedCounts(monster);
  const sold = (ids: readonly string[] | undefined, missing: readonly string[]) => (ids ?? []).filter((id) => missing.includes(id)).length;
  return <>
    <Engraved count={engraved.runes} sold={sold(preset.runesOf.get(unitId), preset.missingRuneIds)} of={runeSlotCount} what="runes" />
    <Engraved count={engraved.artifacts} sold={sold(preset.artifactsOf.get(unitId), preset.missingArtifactIds)} of={artifactSlotCount} what="artifacts" />
    <span className="monster-priority-gear" role="img" title={engraved.relic ? 'Relic engraved' : 'No relic'}
      aria-label={engraved.relic ? 'Relic engraved' : 'No relic'}>
      <SpeedVerdictMark state={engraved.relic ? 'good' : 'bad'} small />
    </span>
  </>;
}

function Engraved({ count, sold, of, what }: { count: number; sold: number; of: number; what: string }) {
  const reading = `${count} of ${of} ${what} engraved${sold > 0 ? `, and ${sold} sold` : ''}`;
  return <span className="monster-priority-gear" role="img" title={reading} aria-label={reading}>
    <span className="monster-priority-count">{count}/{of}</span>
    <SpeedVerdictMark state={count >= of ? 'good' : 'bad'} small />
  </span>;
}

function CrownIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5h11M3 10.5l-1-6 3.5 3L8 3l2.5 4.5 3.5-3-1 6z" /></svg>;
}

const presetNameLimit = 60;

function CreatePresetDialog({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (name: string, content: PresetContentId | null) => void;
}) {
  const [name, setName] = useState('');
  const [content, setContent] = useState<PresetContentId | ''>('');
  const nameField = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  useEffect(() => {
    nameField.current?.focus();
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return <div className="modal-backdrop" role="presentation">
    <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-preset-title"
      onSubmit={(event) => { event.preventDefault(); if (trimmed) onCreate(trimmed, content === '' ? null : content); }}>
      <p className="eyebrow">Presets</p>
      <h2 id="create-preset-title">Create preset</h2>
      <label className="field"><span>Name</span>
        <input ref={nameField} type="text" value={name} maxLength={presetNameLimit} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field"><span>Content</span>
        <Dropdown value={content} placeholder="Any content" onChange={(event) => setContent(event.target.value as PresetContentId | '')}>
          {presetContents.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </Dropdown>
      </label>
      <div className="dialog-actions">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!trimmed}>Create preset</Button>
      </div>
    </form>
  </div>;
}

function PresetsHeader() {
  return <PageHeader title="Presets"
    tagline="Somebody has to be the favourite. The rune economy is not a democracy." />;
}
