import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, InlineButton } from './button';
import { Dropdown } from './dropdown';
import { FigureMarks } from './figure-marks';
import { ArrowIcon, RemoveIcon } from './list-icons';
import { MonsterLink } from './monster-link';
import { warmMonsterPortraits } from '../lib/monster-portrait-image';
import type { OpenMonsterOverlay } from './monster-link';
import type { OpenSpeedTeamOverlay } from './preset-speed-team-overlay';
import { isSpeedTeam } from '../lib/speed-tuning-preferences';
import { PageHeader } from './page-chrome';
import { PresetChooser } from './preset-chooser';
import { SpeedVerdictMark } from './speed-verdict-mark';
import { reorderKeyStep, useDragReorder } from './use-drag-reorder';
import { WorkspacePage } from './workspace-page';
import { alwaysSynchronizedReason } from '../lib/always-synchronized';
import type { GameRecord } from '../lib/game-data';
import { sharedInPoolMarks } from '../lib/figure-marks';
import { moveItem } from '../lib/list-order';
import { monsterPresentation } from '../lib/monster-catalog';
import { artifactSlotCount, engravedCounts, monsterNameCollator } from '../lib/monster-grid';
import { runeSlotCount } from '../lib/rune-set-pairs';
import { monsterCopyNames } from '../lib/monster-names';
import { profilesIn } from '../lib/monster-preferences';
import { presetPriorityOf } from '../lib/monster-priority';
import type { MonsterPriority } from '../lib/monster-priority';
import { presetContent, presetTabs, tabContents } from '../lib/preset-contents';
import type { PresetContentId } from '../lib/preset-contents';
import { gamePresetHasRoom } from '../lib/game-preset-edits';
import { accountItems, monsterInPreset, newOwnPresetId, presetMenu } from '../lib/presets';
import type { OwnPreset, Preset } from '../lib/presets';
import { resolvePresetChoice } from '../lib/preset-choice';
import type { PresetChoice } from '../lib/preset-choice';
import type { ImportedGame, Preferences } from '../lib/types';

type MonsterChoice = { unitId: string; masterId: string; name: string; record: GameRecord };

export type PresetWrites = {
  /** Default's list. */
  monsterPriority: (change: (current: MonsterPriority) => MonsterPriority) => void;
  /** A game preset's order. */
  presetOrder: (presetId: string, order: readonly string[]) => void;
  ownPresets: (change: (current: OwnPreset[]) => OwnPreset[]) => void;
  /** One of the game's presets, taken out of the import. */
  deleteGamePreset: (presetId: string) => Promise<void>;
  /** A game preset's leader, `null` for none. */
  leadGamePreset: (presetId: string, unitId: string | null) => Promise<void>;
  /** A monster into, or out of, one of the game's presets. */
  addToGamePreset: (presetId: string, unitId: string) => Promise<void>;
  removeFromGamePreset: (presetId: string, unitId: string) => Promise<void>;
};

/**
 * **Presets — the page.** Default and every preset, one at a time, with its
 * monsters in the order they have first claim on runes: the order Rune
 * Optimization reads when told to leave a monster's runes to the monsters above
 * it. Runes compete only inside a preset (`DECK-PRESETS.md` §1), so the list is
 * the preset's own.
 *
 * The game's presets come from the import. While live sync is off they are the
 * user's to change as well — who stands in them, who leads, whether they are
 * kept — until the next import states the game's own again. A preset built here
 * is the user's whole: a draft to build in the game once its runes are right.
 */
export function PresetsSection({ game, monsters, preferences, presets, selectedId, canCreate, onSelect, onWrite, onOpenMonster, onOptimize, onTuneSpeed }: {
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
  /** Opens this preset's team over the page. */
  onTuneSpeed: OpenSpeedTeamOverlay;
}) {
  const [creating, setCreating] = useState(false);
  /* The tab and area chosen while no preset is: a chosen preset names its own. */
  const [picked, setPicked] = useState<{ tab: string; area: string } | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  /* The whole menu, empty contents included: a preset is added to the content
     chosen, so a content without one yet must be choosable here. */
  const menu = useMemo(() => presetMenu(presets), [presets]);
  /* An area always shows its first preset until another is chosen, so the page
     is empty only in an area that holds none. */
  const choice = useMemo(() => resolvePresetChoice(menu, { tab: picked?.tab ?? '', area: picked?.area ?? '', presetId: selectedId }),
    [menu, picked, selectedId]);
  const { tab, area, preset } = choice;
  const onDefault = tab === menu[0];
  const own = preset?.kind === 'own' ? preferences.presets.find((entry) => entry.id === preset.id) ?? null : null;
  const priority = useMemo(() => (preset ? presetPriorityOf(preset, preferences.monsterPriority, preferences.presetPriority) : []),
    [preset, preferences.monsterPriority, preferences.presetPriority]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  /* Teams in one area share names as well as build wishes. */
  const contextId = preset?.profileScope ?? 'default';
  const names = useMemo(() => monsterCopyNames(monsters, profilesIn(preferences.monsterPreferences, contextId)),
    [monsters, preferences.monsterPreferences, contextId]);
  const owned = useMemo(() => new Map<string, MonsterChoice>(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => {
      const unitId = String(monster.unit_id);
      return [unitId, { unitId, masterId: String(monster.unit_master_id ?? ''), name: names[unitId]?.name ?? unitId, record: monster }];
    })), [monsters, names]);
  /* The game's presets live in the import, which live sync would put back at once. */
  const gameEditable = preset?.kind === 'game' && canCreate;
  /* Said on every control live sync turns off, and only on those: a control off
     for another reason — Default has no content, a preset is full — says nothing. */
  const syncedGame = preset?.kind === 'game' && !canCreate ? alwaysSynchronizedReason : undefined;
  /* A preset of a content takes no more than the content's team, and a game
     preset no more than its deck has positions for. */
  const full = own !== null ? own.content !== null && own.members.length >= presetContent(own.content).teamSize
    : gameEditable && game !== null && preset !== null && !gamePresetHasRoom(game, preset);
  const canAdd = preset !== null && (preset.kind === 'default' || own !== null || gameEditable) && !full;
  /* A monster another team of a pool sharing its monsters holds is not offered:
     the game would not let it stand in two of them. */
  const choices = useMemo(() => {
    const placed = new Set([...priority, ...preset?.poolTakenUnitIds ?? []]);
    return [...owned.values()].filter((choice) => !placed.has(choice.unitId))
      .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId));
  }, [owned, priority, preset]);
  const reorder = useDragReorder<HTMLOListElement>({ count: priority.length, onMove: move });
  const editable = preset !== null && (preset.kind !== 'game' || gameEditable);
  const deletable = own !== null || gameEditable;
  const tunable = preset !== null && isSpeedTeam(preset);

  /* A preset added here joins the chosen content as the game's own do, and is
     offered the name the game would give the next one: the content and the
     number after the highest it holds. */
  const areaContent = area.content;
  const warnings = preset ? presetWarnings(preset) : '';
  const suggestedName = areaContent === null ? ''
    : `${areaContent.name} ${Math.max(area.presets.length, ...area.presets.map((entry) => entry.number ?? 0)) + 1}`;

  function choose(next: PresetChoice) {
    setPicked({ tab: next.tab, area: next.area });
    onSelect(next.presetId);
  }

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
    if (preset.kind === 'game') {
      void onWrite.addToGamePreset(preset.id, unitId);
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
    if (preset.kind === 'game') {
      if (gameEditable) void onWrite.removeFromGamePreset(preset.id, unitId);
      return;
    }
    writeOwn((current) => {
      const gear = current.gear === null ? null : Object.fromEntries(Object.entries(current.gear).filter(([id]) => id !== unitId));
      return { ...current, members: current.members.filter((entry) => entry !== unitId),
        leaderUnitId: current.leaderUnitId === unitId ? null : current.leaderUnitId, gear };
    });
  }

  function lead(unitId: string) {
    if (own) {
      writeOwn((current) => ({ ...current, leaderUnitId: current.leaderUnitId === unitId ? null : unitId }));
      return;
    }
    if (!preset || !gameEditable) return;
    /* A defense is led by whoever stands first, so it always has a leader:
       its crown only ever passes on. */
    const defense = preset.deck?.source.kind !== 'deck';
    if (preset.leaderUnitId === unitId) {
      if (!defense) void onWrite.leadGamePreset(preset.id, null);
    } else void onWrite.leadGamePreset(preset.id, unitId);
  }

  function create(name: string, content: PresetContentId | null) {
    const id = newOwnPresetId();
    onWrite.ownPresets((current) => [...current, { id, name, content, members: [], leaderUnitId: null, gear: null }]);
    onSelect(id);
  }

  /* Back to the content it was in, on the first preset it has left. The content
     stays in the menu however few that is; only the presets not yet named leave
     it once they are gone. */
  function deletePreset() {
    if (!preset || !deletable) return;
    if (own) onWrite.ownPresets((current) => current.filter((entry) => entry.id !== own.id));
    else void onWrite.deleteGamePreset(preset.id);
    setPicked({ tab: tab.label, area: area.label });
    onSelect(area.presets.find((entry) => entry !== preset)?.id ?? '');
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

  return <WorkspacePage header={<PresetsHeader />}>
    <div className="monster-priority">
      <div className="panel monster-priority-add-panel">
        <PresetChooser idPrefix="preset" menu={menu} choice={choice} monsters={monsters}
          monsterPreferences={preferences.monsterPreferences} onChoose={choose} />
        <div className="filter-group monster-priority-add monster-priority-add-monster">
          <label className="filter-label" htmlFor="monster-priority-add">Add mon</label>
          {/* Back to its placeholder after every pick: the field adds to the list
              rather than holding a choice of its own. */}
          <Dropdown id="monster-priority-add" className="monster-priority-select" value="" placeholder="Choose a monster"
            disabled={!canAdd || choices.length === 0} title={syncedGame}
            onFocus={warmChoices} onPointerDown={warmChoices}
            onChange={(event) => { if (event.target.value) add(event.target.value); }}>
            {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
          </Dropdown>
        </div>
        <p className="monster-priority-about" title={warnings || undefined}>{warnings}</p>
        <div className="monster-priority-actions">
          {/* A preset is added to the content chosen, whether or not one of its
              presets is: Default has no content to add to. */}
          <Button ref={createButton} tone="important" disabled={!canCreate || onDefault}
            onClick={() => setCreating(true)}
            title={canCreate ? undefined : alwaysSynchronizedReason}>Add preset</Button>
          <Button tone="danger" disabled={!deletable} title={syncedGame} onClick={deletePreset}>Delete preset</Button>
          {/* One per preset, since it opens the whole team; always here and
              disabled where there is no team, so the panel keeps one shape. */}
          <Button className="monster-priority-speed" disabled={!tunable} aria-haspopup="dialog"
            aria-label={preset ? `Speed tuning for ${preset.name}` : 'Speed tuning'}
            onClick={(event) => { if (preset) onTuneSpeed(preset.id, event.currentTarget); }}>Speed tuning</Button>
        </div>
      </div>

      <section className="panel monster-priority-list-panel" aria-labelledby="monster-priority-list-title" aria-disabled={preset === null || undefined}>
        <h3 id="monster-priority-list-title" className="type-heading">Priority</h3>
        <p className="monster-priority-note">
          {canCreate ? '' : 'With Always synchronized on, the game decides the monsters and the leader. '}
          The order decides who takes runes from whom in Rune Optimization: higher takes from lower.
        </p>
        {preset === null
          ? <p className="monster-priority-empty">No presets here yet.</p>
          : priority.length === 0
            ? <p className="monster-priority-empty">{preset.kind === 'game' && !gameEditable ? 'This preset holds no monsters.' : 'Nobody here yet. Add a monster above, and the first one in takes #1.'}</p>
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
                  {own || gameEditable
                    ? <button type="button" className="speed-icon-button preset-leader" aria-pressed={leader}
                      aria-label={`${name} leads this preset`} onClick={() => lead(unitId)}><CrownIcon /></button>
                    : <span className="preset-leader" data-on={leader || undefined} role="img" title={syncedGame}
                      aria-label={leader ? 'Leader' : undefined} aria-hidden={leader ? undefined : true}><CrownIcon /></span>}
                  <span className="monster-priority-name">
                    {choice && display
                      ? <MonsterLink target={{ kind: 'copy', unitId, masterId: choice.masterId }} name={name}
                        portrait={{ imageFilename: display.imageFilename, initial: display.shortName }} presetId={preset.id} onOpen={onOpenMonster} />
                      : <span className="monster-name muted">{name}</span>}
                  </span>
                  {/* The row's own small control rather than a page button: a way out
                      of the list, which should not outshout the name it sits beside. */}
                  <span className="monster-priority-ways">
                    <InlineButton disabled={!choice}
                      aria-label={`Optimize runes for ${name}`} onClick={() => onOptimize(preset.id, unitId)}>Optimize</InlineButton>
                  </span>
                  {choice ? <Gear monster={monsterInPreset(choice.record, preset, items)} preset={preset} unitId={unitId} /> : <><span /><span /><span /></>}
                  <span className="monster-priority-controls">
                    <button type="button" className="speed-icon-button" aria-label={`Move ${name} up`}
                      disabled={at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
                    <button type="button" className="speed-icon-button" aria-label={`Move ${name} down`}
                      disabled={at === priority.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
                    <button type="button" className="speed-icon-button danger" aria-label={`Remove ${name} from this preset`}
                      disabled={!editable} title={syncedGame} onClick={() => remove(unitId)}><RemoveIcon /></button>
                  </span>
                </li>;
              })}
              </ol>
            </div>}
      </section>
    </div>
    {creating && <AddPresetDialog content={areaContent?.id ?? null} name={suggestedName} onCancel={() => { setCreating(false); createButton.current?.focus(); }}
      onCreate={(name, content) => { setCreating(false); create(name, content); }} />}
  </WorkspacePage>;
}

/* What the chosen preset names and the account no longer has, or holds against
   the rest of its pool, said here, where the user meets the preset, rather
   than hidden in a total. Nothing otherwise:
   the content and the faces in the field above already say what it is. */
function presetWarnings(preset: Preset): string {
  const parts: string[] = [];
  if (preset.contentAssumed) parts.push('Content assumed, not yet confirmed in the game');
  const sold = preset.missingRuneIds.length + preset.missingArtifactIds.length;
  if (sold > 0) parts.push(`${parts.length > 0 ? 'names' : 'Names'} ${sold} sold item${sold === 1 ? '' : 's'}`);
  if (preset.missingUnitIds.length > 0) parts.push(`${parts.length > 0 ? 'names' : 'Names'} ${preset.missingUnitIds.length} monster${preset.missingUnitIds.length === 1 ? '' : 's'} not in this import`);
  /* The teams of a pool share one set of gear (`DECK-PRESETS.md` §4); what the
     game let two of them hold at once is said here, beside the other faults. */
  const { runeIds, artifactIds, unitIds } = preset.poolConflicts;
  const shared = ([[runeIds.length, 'rune'], [artifactIds.length, 'artifact'], [unitIds.length, 'monster']] as const)
    .filter(([count]) => count > 0).map(([count, what]) => `${count} ${what}${count === 1 ? '' : 's'}`);
  if (shared.length > 0) {
    const listed = shared.length === 1 ? shared[0] : `${shared.slice(0, -1).join(', ')} and ${shared.at(-1)}`;
    parts.push(`${parts.length > 0 ? 'shares' : 'Shares'} ${listed} with another team`);
  }
  return parts.join(' · ');
}

/* Three cells: what the copy has engraved in this preset against what it can
   take, and a tick only when every slot is filled. The relic is Default's in
   every preset, as the game reads it. */
function Gear({ monster, preset, unitId }: { monster: GameRecord; preset: Preset; unitId: string }) {
  const engraved = engravedCounts(monster);
  const among = (ids: readonly string[] | undefined, listed: readonly string[]) => (ids ?? []).filter((id) => listed.includes(id)).length;
  const runeIds = preset.runesOf.get(unitId);
  const artifactIds = preset.artifactsOf.get(unitId);
  return <>
    <Engraved count={engraved.runes} sold={among(runeIds, preset.missingRuneIds)} shared={among(runeIds, preset.poolConflicts.runeIds)}
      of={runeSlotCount} what="runes" />
    <Engraved count={engraved.artifacts} sold={among(artifactIds, preset.missingArtifactIds)} shared={among(artifactIds, preset.poolConflicts.artifactIds)}
      of={artifactSlotCount} what="artifacts" />
    <span className="monster-priority-gear" role="img" title={engraved.relic ? 'Relic engraved' : 'No relic'}
      aria-label={engraved.relic ? 'Relic engraved' : 'No relic'}>
      <SpeedVerdictMark state={engraved.relic ? 'good' : 'bad'} small />
    </span>
  </>;
}

function Engraved({ count, sold, shared, of, what }: { count: number; sold: number; shared: number; of: number; what: 'runes' | 'artifacts' }) {
  const reading = `${count} of ${of} ${what} engraved${sold > 0 ? `, and ${sold} sold` : ''}`;
  /* Gear another team holds too is the fault to fix first, so its mark stands
     where the verdict would, rather than a tick saying all is well beside it. */
  const sharedMarks = sharedInPoolMarks(shared, what);
  return <span className="monster-priority-gear">
    <span className="monster-priority-count" role="img" title={reading} aria-label={reading}>{count}/{of}</span>
    {sharedMarks.length > 0 ? <FigureMarks marks={sharedMarks} /> : <SpeedVerdictMark state={count >= of ? 'good' : 'bad'} small />}
  </span>;
}

function CrownIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5h11M3 10.5l-1-6 3.5 3L8 3l2.5 4.5 3.5-3-1 6z" /></svg>;
}

const presetNameLimit = 60;

function AddPresetDialog({ content: chosenContent, name: suggestedName, onCancel, onCreate }: {
  /** The content chosen on the page, which the new preset starts in. */
  content: PresetContentId | null;
  /** The name the game would give the content's next preset, `''` where it has none. */
  name: string;
  onCancel: () => void;
  onCreate: (name: string, content: PresetContentId | null) => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [content, setContent] = useState<PresetContentId | ''>(chosenContent ?? '');
  const nameField = useRef<HTMLInputElement>(null);
  const cancel = useRef(onCancel);
  const trimmed = name.trim();

  useEffect(() => { cancel.current = onCancel; }, [onCancel]);
  /* Once, on opening. `onCancel` is a new function on every render of the
     page, and an effect keyed on it moved focus back to the name each time the
     helper poll re-rendered the page — every two seconds — which shut the
     content menu under the user's pointer. */
  useEffect(() => {
    nameField.current?.focus();
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancel.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div className="modal-backdrop" role="presentation">
    <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-preset-title"
      onSubmit={(event) => { event.preventDefault(); if (trimmed) onCreate(trimmed, content === '' ? null : content); }}>
      <p className="eyebrow">Presets</p>
      <h2 id="add-preset-title">Add preset</h2>
      <label className="field"><span>Name</span>
        <input ref={nameField} type="text" value={name} maxLength={presetNameLimit} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field"><span>Content</span>
        <Dropdown value={content} placeholder="Any content" onChange={(event) => setContent(event.target.value as PresetContentId | '')}>
          {presetTabs.map((group) => <optgroup key={group} label={group}>
            {tabContents(group).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </optgroup>)}
        </Dropdown>
      </label>
      <div className="dialog-actions">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!trimmed}>Add preset</Button>
      </div>
    </form>
  </div>;
}

function PresetsHeader() {
  return <PageHeader title="Presets"
    tagline="Same runes, different teams. Like a band that only owns one guitar." />;
}
