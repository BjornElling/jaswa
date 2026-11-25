import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../ui/button';
import { Overlay, OverlayAction } from '../../ui/overlay';
import { PencilIcon } from '../../ui/pencil-icon';
import { SpeedTeamEditor } from './speed-team-editor';
import { SpeedTurnOrderDialog } from './speed-turn-order-dialog';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import type { GameRecord } from '../../domain/account/game-record';
import type { MonsterCopyName } from '../../domain/monsters/monster-names';
import { formatNumber } from '../../domain/shared/formatting';
import { fastestEnemySpeed, isDungeonId } from '../../domain/speed/speed-contents';
import { usefulAccuracy } from '../../domain/combat/accuracy-ceiling';
import { gameTurnOrder, readSpeedTeam, withSpeedIntervals } from '../../domain/speed/speed-tuning-analysis';
import type { CombatSpeedInterval, SpeedIntervalSearch } from '../../domain/speed/speed-tuning-intervals';
import type { SpeedTeam } from '../../domain/profiles/speed-tuning-preferences';
import type { GeneralSettings } from '../../domain/model';
import { calculateSpeedIntervals } from '../../workspace/jobs/speed-interval-client';

/** Attack bars at uneven fill: what the tick-by-tick view draws. */
function TicksIcon() {
  return <svg className="speed-icon button-mark" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 13V8M6.5 13V3M10 13V6M13.5 13V10M2 13.5h12.5" />
  </svg>;
}

/**
 * One preset's team, edited as a draft. Nothing reaches the page until Save:
 * the page shows each preset only as a line, and a line that changed under
 * every keystroke behind the overlay would be the page moving while the reader
 * looks at something else.
 */
export function SpeedTeamOverlay({ initial, slots, title, monsters, totemShare, names, general, leading, onSave, onClose, onOpenMonster, onEditPreset }: {
  initial: SpeedTeam;
  /** The preset's members in its own slots: the field position that settles a tie. */
  slots: readonly string[];
  /** The preset's name. */
  title: string;
  /** The preset's monsters, each with the preset's own runes. */
  monsters: ReadonlyMap<string, GameRecord>;
  totemShare: number;
  names: Record<string, MonsterCopyName>;
  general: GeneralSettings;
  /** How the leader may be changed here: `'synced'` where live sync keeps the game's, absent where it may not for another reason. */
  leading?: 'free' | 'kept' | 'synced';
  onSave: (team: SpeedTeam) => void;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
  /** Goes to Presets with this preset chosen, leaving the overlay. */
  onEditPreset: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [showTurnOrder, setShowTurnOrder] = useState(false);
  const turnOrderOpener = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLElement>(null);

  /* Opened centred, as every overlay is, and held where it stands from the
     first edit on: a change that shortens the team — the enemy section going
     with *No speed tuning* — pulls up the bottom edge instead of re-centring
     the whole panel under the click. Read at the edit rather than on opening,
     because the panel is still settling its height as it mounts. A resize
     moves the centre itself, so it lets go and the panel centres again. */
  function holdTop() {
    const panel = head.current?.closest<HTMLElement>('.speed-team-overlay');
    const backdrop = panel?.parentElement;
    if (!panel || !backdrop || panel.hasAttribute('data-pinned')) return;
    /* In layout pixels, as the margin is: the interface scale zooms the page,
       so a bounding rectangle is divided by that zoom, read off the full-height
       backdrop. `offsetTop` would round away the fraction and nudge the panel. */
    const outer = backdrop.getBoundingClientRect();
    const zoom = outer.height / backdrop.offsetHeight || 1;
    const pinnedTop = (panel.getBoundingClientRect().top - outer.top) / zoom - parseFloat(getComputedStyle(backdrop).paddingTop);
    panel.style.setProperty('--pinned-top', `${Math.max(0, pinnedTop)}px`);
    panel.setAttribute('data-pinned', '');
  }
  useEffect(() => {
    const release = () => head.current?.closest('.speed-team-overlay')?.removeAttribute('data-pinned');
    window.addEventListener('resize', release);
    return () => window.removeEventListener('resize', release);
  }, []);

  /* What-ifs are saved with the preset's tuning, so an experiment is there the
     next time it is opened, and typing one is an edit like any other. But only
     this overlay reads them: the page judges the runes engraved and never passes them. */
  const whatIfs = useMemo(() => new Map(draft.members.flatMap((member) =>
    member.whatIfCombatSpeed === undefined ? [] : [[member.unitId, member.whatIfCombatSpeed] as const])), [draft]);
  const liveReading = useMemo(() => readSpeedTeam({ team: draft, monsters, totemPercent: totemShare, whatIfs }),
    [draft, whatIfs, monsters, totemShare]);
  const search = liveReading.intervalSearch;
  const [finished, setFinished] = useState<{ search: SpeedIntervalSearch; ranges: readonly (CombatSpeedInterval | null)[] | null } | null>(null);
  useEffect(() => {
    if (search.allies.length === 0) return;
    const controller = new AbortController();
    // A partially typed value can be much slower than the final one. Cancel
    // its search on the next edit so the latest value does not wait behind it.
    void calculateSpeedIntervals(search, controller.signal).then(
      (ranges) => { if (!controller.signal.aborted) setFinished({ search, ranges }); },
      () => { if (!controller.signal.aborted) setFinished({ search, ranges: null }); },
    );
    return () => controller.abort();
  }, [search]);
  const current = finished?.search === search ? finished : null;
  const reading = useMemo(() => current?.ranges ? withSpeedIntervals(liveReading, current.ranges) : liveReading, [liveReading, current]);
  const intervalState = current === null ? 'pending' : current.ranges === null ? 'failed' : 'ready';
  const dungeon = isDungeonId(draft.content) ? draft.content : null;

  /* A team with no order of the user's stands in the order it moves in, and a
     change that moves it — a new leader, Reset turn order — moves it here too.
     A what-if never does: it is an experiment against the order, not a cause of it. */
  function settled(team: SpeedTeam): SpeedTeam {
    if (team.orderStated) return team;
    const order = gameTurnOrder(team, slots, monsters, totemShare);
    return { ...team, members: [...team.members].sort((left, right) => order.indexOf(left.unitId) - order.indexOf(right.unitId)) };
  }

  function change(update: (team: SpeedTeam) => SpeedTeam) {
    holdTop();
    setDraft((team) => settled(update(team)));
    setDirty(true);
  }

  function setWhatIf(unitId: string, value: number | undefined) {
    change((team) => ({
      ...team,
      members: team.members.map((member) => member.unitId !== unitId ? member
        : value === undefined ? { unitId: member.unitId, masterId: member.masterId } : { ...member, whatIfCombatSpeed: value }),
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dirty) onSave(draft);
  }

  /* An overlay holding unsaved edits keeps them through a stray Escape, a
     backdrop click or the back button; the close button still closes. */
  return <>
    <Overlay labelledBy="speed-team-overlay-title" className="speed-team-overlay" dismissible={!dirty}
      onClose={onClose} onSubmit={submit}
      actions={<OverlayAction kind="save" type="submit" label="Save changes" disabled={!dirty} />}>
      <header ref={head} className="speed-overlay-head">
        <div className="speed-overlay-identity">
          <h2 id="speed-team-overlay-title" className="speed-overlay-title" title={title}>{title}</h2>
        </div>
      </header>

      <div className="overlay-body">
        {/* The way to the preset itself sits at the far edge of the area's facts,
            in the quiet box, as it is a way out rather than this panel's work. It
            waits while a draft is unsaved, since leaving would drop it. */}
        <div className="speed-dungeon-choice">
          {dungeon !== null ? <dl className="speed-dungeon-facts" data-shown="true">
            <dt className="type-caption">Fastest enemy</dt>
            <dd>{formatNumber(fastestEnemySpeed(dungeon), general)} combat speed</dd>
            <dt className="type-caption">Acc needed</dt>
            <dd>{usefulAccuracy(dungeon)}%</dd>
          </dl> : <span aria-hidden="true" />}
          <Button size="compact" className="speed-edit-preset" disabled={dirty} onClick={onEditPreset}>
            <PencilIcon /><span>Edit preset</span>
          </Button>
        </div>
        <SpeedTeamEditor reading={reading} title={title} names={names} general={general} intervalState={intervalState}
          turnOrderAction={<Button ref={turnOrderOpener} tone="important" size="prominent" className="speed-ticks-button"
            disabled={reading.members.length === 0} onClick={() => setShowTurnOrder(true)}>
            <TicksIcon />Ticks
          </Button>}
          leading={leading}
          onChange={change}
          onWhatIf={setWhatIf}
          onOpenMonster={onOpenMonster} />
      </div>
    </Overlay>

    {/* Beside the overlay rather than inside its form, so the dialog stacked
        over it is a second panel and not a part of the draft. */}
    {showTurnOrder && <SpeedTurnOrderDialog reading={reading} title={title} names={names} general={general}
      onClose={() => {
        setShowTurnOrder(false);
        turnOrderOpener.current?.focus();
      }} />}
  </>;
}
