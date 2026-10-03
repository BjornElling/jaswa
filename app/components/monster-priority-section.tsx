import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { Dropdown } from './dropdown';
import { ArrowIcon, RemoveIcon } from './list-icons';
import { MonsterLink } from './monster-link';
import { warmMonsterPortraits } from './monster-portrait';
import type { OpenMonsterOverlay } from './monster-link';
import { PageHeader } from './page-chrome';
import { SpeedVerdictMark } from './speed-verdict-mark';
import { reorderKeyStep, useDragReorder } from './use-drag-reorder';
import { WorkspacePage } from './workspace-page';
import type { GameRecord } from '../lib/game-data';
import { moveItem } from '../lib/list-order';
import { monsterPresentation } from '../lib/monster-catalog';
import { artifactSlotCount, equippedCounts, monsterNameCollator } from '../lib/monster-grid';
import { runeSlotCount } from '../lib/rune-set-pairs';
import { monsterCopyNames } from '../lib/monster-names';
import type { MonsterPriority } from '../lib/monster-priority';
import type { ImportedGame, Preferences } from '../lib/types';

type MonsterChoice = { unitId: string; masterId: string; name: string; record: GameRecord };

/**
 * **The monster priority list — the page.** One order of copies, first place
 * first, that Rune Optimization reads when told to leave a monster's runes to
 * the monsters above it (`monster-priority.ts`).
 *
 * The list is the user's alone: it starts empty, nothing is ranked for them, and
 * a copy leaves it only when they remove it.
 */
export function MonsterPrioritySection({ game, monsters, preferences, onWrite, onOpenMonster, onOptimize }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  onWrite: (change: (current: MonsterPriority) => MonsterPriority) => void;
  onOpenMonster: OpenMonsterOverlay;
  /** Opens Rune Optimization on this copy. */
  onOptimize: (unitId: string) => void;
}) {
  const priority = preferences.monsterPriority;
  const names = useMemo(() => monsterCopyNames(monsters, preferences.monsterPreferences), [monsters, preferences.monsterPreferences]);
  const owned = useMemo(() => new Map<string, MonsterChoice>(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => {
      const unitId = String(monster.unit_id);
      return [unitId, { unitId, masterId: String(monster.unit_master_id ?? ''), name: names[unitId]?.name ?? unitId, record: monster }];
    })), [monsters, names]);
  /* A copy already ranked is left out, so the menu cannot place one copy twice. */
  const choices = useMemo(() => {
    const ranked = new Set(priority);
    return [...owned.values()].filter((choice) => !ranked.has(choice.unitId))
      .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId));
  }, [owned, priority]);
  const reorder = useDragReorder<HTMLOListElement>({ count: priority.length, onMove: move });

  function move(from: number, to: number) {
    if (to < 0 || to >= priority.length || from === to) return;
    onWrite((current) => moveItem(current, from, to));
  }

  function add(unitId: string) {
    if (!owned.has(unitId)) return;
    onWrite((current) => (current.includes(unitId) ? current : [...current, unitId]));
  }

  function warmChoices() {
    warmMonsterPortraits(choices.map((choice) => monsterPresentation(choice.masterId)?.imageFilename));
  }

  function remove(unitId: string) {
    onWrite((current) => current.filter((entry) => entry !== unitId));
  }

  if (!game) {
    return <WorkspacePage header={<PriorityHeader />}>
      <section className="empty-state">
        <h2>Ranks your monsters, so the ones that matter most keep their runes.</h2>
        <p className="next-step">Import your game data first. The list is made from the monsters you own.</p>
      </section>
    </WorkspacePage>;
  }

  return <WorkspacePage header={<PriorityHeader />}>
    <div className="monster-priority">
      <div className="panel monster-priority-add-panel">
        <div className="filter-group monster-priority-add">
          <label className="filter-label" htmlFor="monster-priority-add">Add mon</label>
          {/* Back to its placeholder after every pick: the field adds to the list
              rather than holding a choice of its own. */}
          <Dropdown id="monster-priority-add" className="monster-priority-select" value="" placeholder="Choose a monster"
            disabled={choices.length === 0}
            onFocus={warmChoices} onPointerDown={warmChoices}
            onChange={(event) => { if (event.target.value) add(event.target.value); }}>
            {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
          </Dropdown>
        </div>
        <p className="monster-priority-about">
          <span>Decides which monsters Rune Optimization may take runes from.</span>
        </p>
      </div>

      <section className="panel monster-priority-list-panel" aria-labelledby="monster-priority-list-title">
        <h3 id="monster-priority-list-title" className="type-heading">Priority</h3>
        {priority.length === 0
          ? <p className="monster-priority-empty">Nobody ranked yet. Add a monster above, and the first one in takes #1.</p>
          /* Each entry is dragged by any part of it; the arrows beside it, and
             Alt with an arrow key, are the same move without a pointer. */
          : <div className="monster-priority-table">
            {/* The column names are for the eye; every cell says its own in full to a screen reader. */}
            <div className="monster-priority-head" aria-hidden="true">
              <span /><span /><span />
              <span>Runes</span><span>Artifacts</span><span>Relic</span>
              <span />
            </div>
            <ol className="monster-priority-list" {...reorder.containerProps}>
            {priority.map((unitId, at) => {
              const choice = owned.get(unitId);
              const name = choice?.name ?? 'Not in this import';
              const display = choice ? monsterPresentation(choice.masterId) : undefined;
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
                <span className="monster-priority-name">
                  {choice && display
                    ? <MonsterLink target={{ kind: 'copy', unitId, masterId: choice.masterId }} name={name}
                      portrait={{ imageFilename: display.imageFilename, initial: display.shortName }} onOpen={onOpenMonster} />
                    : <span className="monster-name muted">{name}</span>}
                </span>
                {/* The row's own small control rather than a page button: it is a way out
                    of the list, and should not outshout the names it sits beside. */}
                <button type="button" className="speed-icon-button monster-priority-optimize" disabled={!choice}
                  aria-label={`Optimize runes for ${name}`} onClick={() => onOptimize(unitId)}>Optimize</button>
                {choice ? <Equipment monster={choice.record} /> : <><span /><span /><span /></>}
                <span className="monster-priority-controls">
                  <button type="button" className="speed-icon-button" aria-label={`Move ${name} up`}
                    disabled={at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
                  <button type="button" className="speed-icon-button" aria-label={`Move ${name} down`}
                    disabled={at === priority.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
                  <button type="button" className="speed-icon-button danger" aria-label={`Remove ${name} from the priority list`}
                    onClick={() => remove(unitId)}><RemoveIcon /></button>
                </span>
              </li>;
            })}
            </ol>
          </div>}
      </section>
    </div>
  </WorkspacePage>;
}

/* Three cells: what the copy wears against what it can wear, and a tick only
   when every slot is filled. */
function Equipment({ monster }: { monster: GameRecord }) {
  const worn = equippedCounts(monster);
  return <>
    <Worn count={worn.runes} of={runeSlotCount} what="runes" />
    <Worn count={worn.artifacts} of={artifactSlotCount} what="artifacts" />
    <span className="monster-priority-gear" role="img" title={worn.relic ? 'Relic engraved' : 'No relic'}
      aria-label={worn.relic ? 'Relic engraved' : 'No relic'}>
      <SpeedVerdictMark state={worn.relic ? 'good' : 'bad'} small />
    </span>
  </>;
}

function Worn({ count, of, what }: { count: number; of: number; what: string }) {
  const reading = `${count} of ${of} ${what} equipped`;
  return <span className="monster-priority-gear" role="img" title={reading} aria-label={reading}>
    <span className="monster-priority-count">{count}/{of}</span>
    <SpeedVerdictMark state={count >= of ? 'good' : 'bad'} small />
  </span>;
}

function PriorityHeader() {
  return <PageHeader title="Rune Priority"
    tagline="Somebody has to be the favourite. The rune economy is not a democracy." />;
}
