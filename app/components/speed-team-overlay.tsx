import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from './button';
import { Dropdown } from './dropdown';
import { Overlay, OverlayAction } from './overlay';
import { SpeedTeamEditor } from './speed-team-editor';
import type { MonsterChoice } from './speed-team-editor';
import { SpeedTurnOrderDialog } from './speed-turn-order-dialog';
import type { OpenMonsterOverlay } from './monster-link';
import type { GameRecord } from '../lib/game-data';
import type { MonsterCopyName } from '../lib/monster-names';
import { formatNumber } from '../lib/formatting';
import { dungeonIds, fastestEnemySpeed, speedContent, usefulAccuracy } from '../lib/speed-contents';
import type { DungeonId } from '../lib/speed-contents';
import { readSpeedTeam, withMonsterAdded } from '../lib/speed-tuning-analysis';
import { speedTeamTitle } from '../lib/speed-tuning-preferences';
import type { SpeedTeam } from '../lib/speed-tuning-preferences';
import type { GeneralSettings } from '../lib/types';

/** Attack bars at uneven fill: what the tick-by-tick view draws. */
function TicksIcon() {
  return <svg className="speed-icon button-mark" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 13V8M6.5 13V3M10 13V6M13.5 13V10M2 13.5h12.5" />
  </svg>;
}

/**
 * One team, arena or dungeon, edited as a draft. Nothing reaches the page until Save:
 * the page shows each team only as a line, and a line that changed under every
 * keystroke behind the overlay would be the page moving while the reader looks
 * at something else.
 */
export function SpeedTeamOverlay({
  initial, isNew, teams, monsters, totemShare, names, choices, general, onSave, onRemove, onClose, onOpenMonster,
}: {
  initial: SpeedTeam;
  isNew: boolean;
  /** Every saved team, so the draft is numbered among them. */
  teams: readonly SpeedTeam[];
  monsters: ReadonlyMap<string, GameRecord>;
  totemShare: number;
  names: Record<string, MonsterCopyName>;
  /** Every owned monster; those already in the draft are left out here. */
  choices: readonly MonsterChoice[];
  general: GeneralSettings;
  onSave: (team: SpeedTeam) => void;
  onRemove: () => void;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [showTurnOrder, setShowTurnOrder] = useState(false);
  const turnOrderOpener = useRef<HTMLButtonElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const removeOpener = useRef<HTMLButtonElement>(null);

  /* What-ifs are saved with the team, so an experiment is there the next time
     it is opened, and typing one is an edit like any other. But only this
     overlay reads them: the page judges the runes worn and never passes them. */
  const whatIfs = useMemo(() => new Map(draft.members.flatMap((member) =>
    member.whatIfDisplaySpeed === undefined ? [] : [[member.unitId, member.whatIfDisplaySpeed] as const])), [draft]);
  const reading = useMemo(() => readSpeedTeam({ team: draft, monsters, totemPercent: totemShare, whatIfs, ranges: true }),
    [draft, whatIfs, monsters, totemShare]);

  function setWhatIf(unitId: string, value: number | undefined) {
    change((team) => ({
      ...team,
      members: team.members.map((member) => member.unitId !== unitId ? member
        : value === undefined ? { unitId: member.unitId } : { ...member, whatIfDisplaySpeed: value }),
    }));
  }
  const dungeon = draft.content === 'arena' ? null : draft.content;
  const arena = dungeon === null;
  /* A new dungeon team opens with no dungeon chosen. The draft still carries
     one, because the table needs a content to read the monsters in, but none
     is shown, the enemy's turns stay blank and the team cannot be saved until
     the user picks. A saved team always has its dungeon. */
  const [dungeonChosen, setDungeonChosen] = useState(!isNew || arena);
  const heading = isNew ? `New ${arena ? 'arena' : 'dungeon'} team` : speedTeamTitle(teams, draft);
  const title = dungeonChosen ? speedTeamTitle(teams, draft) : heading;
  const saveHint = !dungeonChosen ? 'Choose a dungeon to save this team'
    : draft.members.length === 0 ? 'Add a monster to save this team' : undefined;
  const inTeam = new Set(draft.members.map((member) => member.unitId));

  function change(update: (team: SpeedTeam) => SpeedTeam) {
    setDraft(update);
    setDirty(true);
  }

  /* Every dungeon fields five today, but the size is the content's to state:
     a smaller one keeps the first movers and, if it was dropped, no leader. */
  function changeDungeon(id: DungeonId) {
    setDungeonChosen(true);
    change((team) => {
      const members = team.members.slice(0, speedContent(id).teamSize);
      const leaderUnitId = members.some((member) => member.unitId === team.leaderUnitId) ? team.leaderUnitId : null;
      return { ...team, content: id, members, leaderUnitId };
    });
  }

  function keepTeam() {
    setConfirmingRemove(false);
    removeOpener.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saveHint !== undefined) return;
    onSave(draft);
  }

  /* An overlay holding unsaved edits keeps them through a stray Escape, a
     backdrop click or the back button; the close button still closes. */
  return <>
    <Overlay labelledBy="speed-team-overlay-title" className="speed-team-overlay" dismissible={!dirty}
      onClose={onClose} onSubmit={submit}
      actions={<OverlayAction kind="save" type="submit" label={isNew ? 'Add this team' : 'Save changes'}
        hint={saveHint} disabled={!dirty || saveHint !== undefined} />}>
      {/* A new team is named as one until it is saved: its number among the
          saved teams is not settled before then, and the dungeon it is for is
          chosen right below. */}
      <header className="speed-overlay-head">
        <div className="speed-overlay-identity">
          <h2 id="speed-team-overlay-title" className="speed-overlay-title" title={heading}>{heading}</h2>
        </div>
        {!isNew && <div className="speed-overlay-tools">
          <Button ref={removeOpener} size="compact" tone="danger" onClick={() => setConfirmingRemove(true)}>Remove team</Button>
        </div>}
      </header>

      <div className="overlay-body">
        {/* An arena team stays an arena team: its size and its enemy are not a
            dungeon's, so there is nothing to move it between. */}
        {dungeon !== null && <div className="speed-dungeon-choice">
          <div className="speed-dungeon-pick">
            <label className="filter-label" htmlFor={`${draft.id}-dungeon`}>Select dungeon</label>
            <Dropdown id={`${draft.id}-dungeon`} className="speed-dungeon-select" placeholder={dungeonChosen ? undefined : ''}
              value={dungeonChosen ? draft.content : ''}
              onChange={(event) => { if (event.target.value) changeDungeon(event.target.value as DungeonId); }}>
              {dungeonIds.map((id) => <option key={id} value={id}>{speedContent(id).name}</option>)}
            </Dropdown>
          </div>
          {/* Kept in the layout before a dungeon is chosen, so choosing one
              fills it in rather than widening the row. */}
          <dl className="speed-dungeon-facts" data-shown={dungeonChosen ? 'true' : 'false'}>
            <dt className="type-caption">Fastest enemy</dt>
            <dd>{formatNumber(fastestEnemySpeed(dungeon), general)} dungeon speed</dd>
            <dt className="type-caption">Acc needed</dt>
            <dd>{usefulAccuracy(dungeon)}%</dd>
          </dl>
        </div>}
        <SpeedTeamEditor reading={reading} title={title} names={names} general={general}
          enemiesKnown={dungeonChosen}
          turnOrderAction={<Button ref={turnOrderOpener} tone="important" size="prominent" className="speed-ticks-button"
            disabled={!dungeonChosen || reading.members.length === 0} onClick={() => setShowTurnOrder(true)}>
            <TicksIcon />Ticks
          </Button>}
          choices={choices.filter((choice) => !inTeam.has(choice.unitId))}
          onChange={change}
          onWhatIf={setWhatIf}
          onAddMonster={(unitId) => { if (monsters.has(unitId)) change((team) => withMonsterAdded(team, unitId)); }}
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

    {/* A team is a dozen choices — members, leader, what-ifs — and removing it
        takes them all with no way back, so it is asked once. */}
    {confirmingRemove && <Overlay labelledBy="speed-team-remove-title" describedBy="speed-team-remove-text"
      className="speed-confirm" onClose={keepTeam}>
      <div className="overlay-body">
        <div>
          <p className="eyebrow">Remove team</p>
          <h2 id="speed-team-remove-title">Remove {speedTeamTitle(teams, initial)}?</h2>
        </div>
        <p id="speed-team-remove-text">
          Its monsters, leader and what-ifs go with it, and there is no undo.
        </p>
        <div className="dialog-actions">
          {/* The safe answer takes focus, as in every confirmation in JASWA. */}
          <Button autoFocus onClick={keepTeam}>Keep the team</Button>
          <Button tone="danger" onClick={onRemove}>Remove team</Button>
        </div>
      </div>
    </Overlay>}
  </>;
}
