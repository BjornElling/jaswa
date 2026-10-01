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
import { dungeonIds, speedContent } from '../lib/speed-contents';
import type { DungeonId } from '../lib/speed-contents';
import { hasWhatIf, readSpeedTeam, withMonsterAdded, withoutWhatIfs } from '../lib/speed-tuning-analysis';
import { speedTeamTitle } from '../lib/speed-tuning-preferences';
import type { SpeedRule, SpeedTeam } from '../lib/speed-tuning-preferences';
import type { GeneralSettings } from '../lib/types';

/**
 * One team, arena or dungeon, edited as a draft. Nothing reaches the page until Save:
 * the page shows each team only as a line, and a line that changed under every
 * keystroke behind the overlay would be the page moving while the reader looks
 * at something else.
 */
export function SpeedTeamOverlay({
  initial, isNew, teams, monsters, totemShare, rules, names, choices, general, onSave, onRemove, onClose, onOpenMonster,
}: {
  initial: SpeedTeam;
  isNew: boolean;
  /** Every saved team, so the draft is numbered among them. */
  teams: readonly SpeedTeam[];
  monsters: ReadonlyMap<string, GameRecord>;
  totemShare: number;
  rules: readonly SpeedRule[];
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

  const reading = useMemo(() => readSpeedTeam({ team: draft, monsters, totemPercent: totemShare, rules }), [draft, monsters, totemShare, rules]);
  const worn = useMemo(() => hasWhatIf(draft)
    ? readSpeedTeam({ team: withoutWhatIfs(draft), monsters, totemPercent: totemShare, rules })
    : reading, [draft, reading, monsters, totemShare, rules]);
  const title = speedTeamTitle(teams, draft);
  const arena = draft.content === 'arena';
  const inTeam = new Set(draft.members.map((member) => member.unitId));

  function change(update: (team: SpeedTeam) => SpeedTeam) {
    setDraft(update);
    setDirty(true);
  }

  /* Every dungeon fields five today, but the size is the content's to state:
     a smaller one keeps the first movers and, if it was dropped, no leader. */
  function changeDungeon(id: DungeonId) {
    change((team) => {
      const members = team.members.slice(0, speedContent(id).teamSize);
      const leaderUnitId = members.some((member) => member.unitId === team.leaderUnitId) ? team.leaderUnitId : null;
      return { ...team, content: id, members, leaderUnitId };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || draft.members.length === 0) return;
    onSave(draft);
  }

  /* An overlay holding unsaved edits keeps them through a stray Escape, a
     backdrop click or the back button; the close button still closes. */
  return <>
    <Overlay labelledBy="speed-team-overlay-title" className="speed-team-overlay" dismissible={!dirty}
      onClose={onClose} onSubmit={submit}
      actions={<OverlayAction kind="save" type="submit" label={isNew ? 'Add this team' : 'Save changes'}
        disabled={!dirty || draft.members.length === 0} />}>
      <header className="speed-overlay-head">
        <div className="speed-overlay-identity">
          <p className="eyebrow">{isNew ? `New ${arena ? 'arena' : 'dungeon'} team` : arena ? 'Arena team' : 'Dungeon team'}</p>
          <h2 id="speed-team-overlay-title" className="speed-overlay-title">{title}</h2>
        </div>
        <div className="speed-overlay-tools">
          {/* An arena team stays an arena team: its size and its enemy are
              not a dungeon's, so there is nothing to move it between. */}
          {!arena && <Dropdown aria-label="Dungeon" value={draft.content} className="speed-overlay-dungeon"
            onChange={(event) => changeDungeon(event.target.value as DungeonId)}>
            {dungeonIds.map((id) => <option key={id} value={id}>{speedContent(id).name}</option>)}
          </Dropdown>}
          <Button ref={turnOrderOpener} size="compact" disabled={reading.members.length === 0}
            onClick={() => setShowTurnOrder(true)}>Turn order</Button>
          {!isNew && <Button size="compact" tone="danger" onClick={onRemove}>Remove team</Button>}
        </div>
      </header>

      <div className="overlay-body">
        <SpeedTeamEditor reading={reading} worn={worn} title={title} names={names} general={general}
          choices={choices.filter((choice) => !inTeam.has(choice.unitId))}
          onChange={change}
          onAddMonster={(unitId) => {
            const monster = monsters.get(unitId);
            if (monster) change((team) => withMonsterAdded(team, reading, unitId, monster, totemShare));
          }}
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
