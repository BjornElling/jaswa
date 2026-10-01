import { useState } from 'react';
import type { DragEvent } from 'react';
import { CheckboxRow } from './form-controls';
import { Dropdown } from './dropdown';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { formatNumber } from '../lib/formatting';
import type { MonsterCopyName } from '../lib/monster-names';
import { boostsAllies, describeLeaderSkill, describeTurnEffect, speedLeaderSkill } from '../lib/speed-skills';
import { combatSpeedName, displaySpeedIntervalText, hasWhatIf, outOfPlaceCount } from '../lib/speed-tuning-analysis';
import type { MemberReading, TeamReading } from '../lib/speed-tuning-analysis';
import { speedMarginMaximum, whatIfDisplaySpeedMaximum } from '../lib/speed-tuning-preferences';
import type { SpeedTeam } from '../lib/speed-tuning-preferences';
import type { GeneralSettings } from '../lib/types';

export type MonsterChoice = { unitId: string; masterId: string; name: string };

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'}`;
}

/** The one line under a member that says whether it is where it was put, and if not, what would put it there. */
function verdictText(member: MemberReading, names: Record<string, MonsterCopyName>, margin: number, general: GeneralSettings): string {
  const { verdict } = member;
  switch (verdict.kind) {
    case 'in-place': return `In place · moves ${ordinal(member.actualPosition)}`;
    case 'order': {
      const problem = verdict.tooSlow && verdict.tooFast ? 'Out of order' : verdict.tooSlow ? 'Too slow' : 'Too fast';
      return `${problem} · moves ${ordinal(member.actualPosition)} · ${displaySpeedIntervalText(verdict.interval, general)}`;
    }
    case 'margin': return `In order, inside the ${margin}-speed margin · ${displaySpeedIntervalText(verdict.interval, general)}`;
    case 'tie': return `Tied with ${names[verdict.with]?.name ?? 'a teammate'} · position decides · ${displaySpeedIntervalText(verdict.interval, general)}`;
  }
}

function verdictState(member: MemberReading): 'good' | 'warn' | 'bad' {
  switch (member.verdict.kind) {
    case 'in-place': return 'good';
    case 'order': return 'bad';
    default: return 'warn';
  }
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return <svg className="speed-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d={direction === 'up' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'} />
  </svg>;
}

function RemoveIcon() {
  return <svg className="speed-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>;
}

/** The mark for a monster that moves somebody else's turn: two chevrons, a push forward. */
export function BoostMark({ label, tone }: { label: string; tone: 'team' | 'own' }) {
  /* Full ink for a boost that moves a teammate, dimmed for one that moves only
     the monster itself — the page's two-tone device, not a new colour. */
  return <span className="speed-boost-mark" data-tone={tone} role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4l4 4-4 4M8 4l4 4-4 4" /></svg>
  </span>;
}

function WhatIfField({ member, label, onChange }: {
  member: MemberReading;
  label: string;
  onChange: (value: number | undefined) => void;
}) {
  /* Held as text while it is typed, so an empty field is "no experiment" rather
     than a zero, and a half-typed number is not saved until it is a number. */
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (member.whatIf ? String(member.displaySpeed) : '');
  return <input className="speed-what-if" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3}
    autoComplete="off" aria-label={label} placeholder={String(member.importedDisplaySpeed)} value={value}
    onChange={(event) => {
      const digits = event.target.value.replace(/\D/g, '');
      setDraft(digits);
      if (digits === '') { onChange(undefined); return; }
      const parsed = Number(digits);
      if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= whatIfDisplaySpeedMaximum) onChange(parsed);
    }}
    onBlur={() => setDraft(null)} />;
}

type EditorProps = {
  reading: TeamReading;
  /** The same team without its what-ifs: the runes worn today. */
  worn: TeamReading;
  title: string;
  names: Record<string, MonsterCopyName>;
  /** Owned monsters not yet in this team. */
  choices: readonly MonsterChoice[];
  general: GeneralSettings;
  onChange: (change: (team: SpeedTeam) => SpeedTeam) => void;
  onAddMonster: (unitId: string) => void;
  onOpenMonster: OpenMonsterOverlay;
};

/** Everything a team states and everything read from it: the leader, the margin, each slot and its verdict, and what the team faces. */
export function SpeedTeamEditor({ reading, worn, title, names, choices, general, onChange, onAddMonster, onOpenMonster }: EditorProps) {
  const { team, content } = reading;
  const [dragging, setDragging] = useState<number | null>(null);
  const speedName = combatSpeedName(reading);
  const readingById = new Map(reading.members.map((member) => [member.unitId, member]));
  const full = team.members.length >= content.teamSize;

  function move(from: number, to: number) {
    if (to < 0 || to >= team.members.length || from === to) return;
    onChange((current) => {
      const members = [...current.members];
      const [moved] = members.splice(from, 1);
      members.splice(to, 0, moved);
      return { ...current, members };
    });
  }

  function removeMember(unitId: string) {
    onChange((current) => ({
      ...current,
      members: current.members.filter((member) => member.unitId !== unitId),
      leaderUnitId: current.leaderUnitId === unitId ? null : current.leaderUnitId,
    }));
  }

  function setWhatIf(unitId: string, value: number | undefined) {
    onChange((current) => ({
      ...current,
      members: current.members.map((member) => {
        if (member.unitId !== unitId) return member;
        return value === undefined ? { unitId } : { unitId, whatIfDisplaySpeed: value };
      }),
    }));
  }

  function drop(event: DragEvent, to: number) {
    event.preventDefault();
    if (dragging !== null) move(dragging, to);
    setDragging(null);
  }

  /* With what-ifs typed, the table is read with them and the line says so, and
     quotes the runes worn beside it — the count the page's own line shows. */
  const tried = hasWhatIf(team);
  const wornNote = !tried ? '' : worn.perfect ? ' · in place with the runes worn'
    : ` · ${outOfPlaceCount(worn)} of ${worn.members.length} with the runes worn`;
  const status = team.members.length === 0
    ? 'Add the monsters, then drag them into the order they should move.'
    : reading.missingUnitIds.length
      ? `${reading.missingUnitIds.length} saved monster${reading.missingUnitIds.length === 1 ? ' is' : 's are'} not in this import.`
      : tried
        ? `${reading.perfect ? 'Perfect tune' : `${outOfPlaceCount(reading)} of ${reading.members.length} out of place`} with your what-ifs${wornNote}.`
        : reading.perfect ? 'Perfect tune: everyone moves where you put them.'
          : `${outOfPlaceCount(reading)} of ${reading.members.length} out of place.`;
  const statusState = team.members.length === 0 ? 'none' : reading.perfect && !reading.missingUnitIds.length ? 'good' : 'bad';

  const leaderOptions = team.members.filter((member) => readingById.has(member.unitId));
  const leaderReading = reading.leader;

  return <div className="speed-team-editor">
    <div className="speed-team-settings">
      <div className="speed-team-leader">
        <label className="filter-label" htmlFor={`${team.id}-leader`}>Leader</label>
        <Dropdown id={`${team.id}-leader`} value={team.leaderUnitId ?? ''}
          onChange={(event) => onChange((current) => ({ ...current, leaderUnitId: event.target.value || null }))}>
          <option value="">No leader</option>
          {leaderOptions.map((member) => {
            const monster = readingById.get(member.unitId);
            const skill = monster ? speedLeaderSkill(monster.masterId) : null;
            return <option key={member.unitId} value={member.unitId}>
              {names[member.unitId]?.name ?? member.unitId}{skill ? ` — ${describeLeaderSkill(skill)}` : ' — no speed lead'}
            </option>;
          })}
        </Dropdown>
      </div>
      <div className="speed-team-margin">
        <CheckboxRow label="Add speed margin" checked={team.marginEnabled}
          onChange={(checked) => onChange((current) => ({ ...current, marginEnabled: checked }))} />
        <Dropdown aria-label={`Speed margin for ${title}, in ${speedName}`} value={String(team.margin)}
          disabled={!team.marginEnabled} className="speed-margin-select"
          onChange={(event) => onChange((current) => ({ ...current, margin: Number(event.target.value) }))}>
          {Array.from({ length: speedMarginMaximum }, (_, at) => at + 1).map((margin) => <option key={margin} value={margin}>
            {margin} {speedName}
          </option>)}
        </Dropdown>
      </div>
    </div>
    <p className="speed-team-leader-note type-caption">
      {leaderReading === null
        ? 'No leader skill counted.'
        : leaderReading.skill === null
          ? `${names[leaderReading.unitId]?.name ?? 'The leader'} has no speed lead.`
          : `${describeLeaderSkill(leaderReading.skill)}${(leaderReading.skill.area === 'Arena' && content.area !== 'arena')
            || (leaderReading.skill.area === 'Dungeon' && content.area !== 'dungeon') || leaderReading.skill.area === 'Guild'
            ? ' — does not count here' : ''}.`}
    </p>

    <table className="speed-team-table">
      <colgroup>
        <col className="speed-col-order" /><col className="speed-col-monster" /><col className="speed-col-speed" />
        <col className="speed-col-what-if" /><col className="speed-col-speed" /><col className="speed-col-controls" />
      </colgroup>
      <thead><tr>
        <th scope="col">#</th>
        <th scope="col">Monster</th>
        <th scope="col" className="align-right"><span aria-label="Display speed from the import">Display</span></th>
        <th scope="col" className="align-right"><span aria-label="What-if display speed for this team">What if</span></th>
        <th scope="col" className="align-right">{content.area === 'arena' ? 'Arena' : 'Dungeon'}</th>
        <th scope="col"><span className="visually-hidden">Move or remove</span></th>
      </tr></thead>
      {/* One body per slot, two rows each: the figures, and under them the
          verdict across the full width, where an interval has room to be read
          whole. Grouping the pair keeps a dragged monster and its verdict one unit. */}
      {Array.from({ length: content.teamSize }, (_, at) => {
        const member = team.members[at];
        if (!member) {
          const firstEmpty = at === team.members.length;
          return <tbody key={`empty-${at}`} className="speed-slot speed-slot-empty">
            <tr className="speed-row">
              <td className="speed-order" rowSpan={2}>{at + 1}</td>
              <td colSpan={5}>
                {firstEmpty && !full
                  ? <Dropdown aria-label={`Add a monster to ${title}`} value="" placeholder="Add a monster"
                    className="speed-add-monster"
                    onChange={(event) => { if (event.target.value) onAddMonster(event.target.value); }}>
                    {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
                  </Dropdown>
                  : <span className="speed-empty-slot type-caption">Empty slot</span>}
              </td>
            </tr>
            <tr className="speed-verdict-row"><td colSpan={5} /></tr>
          </tbody>;
        }
        const monster = readingById.get(member.unitId);
        const name = names[member.unitId]?.name ?? 'Unknown monster';
        const controls = <td className="speed-controls">
          <button type="button" className="speed-icon-button" aria-label={`Move ${name} earlier`}
            disabled={at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
          <button type="button" className="speed-icon-button" aria-label={`Move ${name} later`}
            disabled={at === team.members.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
          <button type="button" className="speed-icon-button" aria-label={`Remove ${name} from ${title}`}
            onClick={() => removeMember(member.unitId)}><RemoveIcon /></button>
        </td>;
        if (!monster) {
          return <tbody key={member.unitId} className="speed-slot">
            <tr className="speed-row">
              <td className="speed-order" rowSpan={2}>{at + 1}</td>
              <td colSpan={4}><span className="speed-monster-name muted">Not in this import</span></td>
              {controls}
            </tr>
            <tr className="speed-verdict-row"><td colSpan={5}>
              <span className="speed-verdict type-caption" data-state="bad">Import the account again, or remove this slot.</span>
            </td></tr>
          </tbody>;
        }
        const { used, uncounted } = monster.profile;
        const boostLabel = [
          used.length ? `${used.map((skill) => `${skill.name}: ${skill.effects.map(describeTurnEffect).join(', ')}`).join('; ')} — counted on every turn` : '',
          uncounted.length ? `Not counted, because its size depends on the battle: ${uncounted.join(', ')}` : '',
        ].filter(Boolean).join('. ');
        const verdict = verdictText(monster, names, team.margin, general);
        return <tbody key={member.unitId} className="speed-slot" draggable
          data-dragging={dragging === at ? 'true' : undefined}
          onDragStart={(event) => { setDragging(at); event.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={(event) => drop(event, at)}>
          <tr className="speed-row">
            <td className="speed-order" rowSpan={2}>{at + 1}</td>
            <td className="speed-monster">
              <span className="speed-monster-line">
                <MonsterLink target={{ kind: 'copy', unitId: member.unitId, masterId: monster.masterId }}
                  name={name} onOpen={onOpenMonster} />
                {/* The mark's box is always there, so a team gaining a booster
                    does not shift the name beside it. */}
                <span className="speed-boost-slot">
                  {(used.length > 0 || uncounted.length > 0) && <BoostMark label={`${name} — ${boostLabel}`}
                    tone={boostsAllies(monster.profile) ? 'team' : 'own'} />}
                </span>
              </span>
            </td>
            <td className="speed-figure">{formatNumber(monster.importedDisplaySpeed, general)}</td>
            <td className="speed-figure">
              <WhatIfField member={monster} label={`What-if display speed for ${name} in ${title}`}
                onChange={(value) => setWhatIf(member.unitId, value)} />
            </td>
            <td className="speed-figure speed-combat" title={`${formatNumber(monster.combatSpeed, general)} ${speedName}`}>
              {formatNumber(monster.combatSpeed, general)}
            </td>
            {controls}
          </tr>
          <tr className="speed-verdict-row"><td colSpan={5}>
            <span className="speed-verdict type-caption" data-state={verdictState(monster)} title={verdict}>{verdict}</span>
          </td></tr>
        </tbody>;
      })}
    </table>

    <ul className="speed-team-facts">
      <li className="speed-team-status" data-state={statusState}>{status}</li>
      {content.area === 'arena'
        ? <li>{reading.enemies[0]
          ? `Worst-case enemy at ${formatNumber(reading.enemies[0].enemySpeed, general)} arena speed ${cutIn(reading.enemies[0].allyTurnsBefore, reading.members.length)}`
          : 'Worst-case enemy: add a monster to see when an enemy can first cut in.'}</li>
        : content.stages.map((stage, at) => {
          const enemy = reading.enemies[at];
          return <li key={at}>
            Stage {at + 1} · fastest enemy {formatNumber(stage.fastest, general)} dungeon speed
            {enemy ? ` ${cutIn(enemy.allyTurnsBefore, reading.members.length)}` : ''}
          </li>;
        })}
    </ul>
  </div>;
}

function cutIn(allyTurnsBefore: number, teamSize: number): string {
  if (teamSize > 0 && allyTurnsBefore >= teamSize) return '· first moves after your whole team';
  if (allyTurnsBefore === 0) return '· moves before your team';
  return `· first moves after your ${ordinal(allyTurnsBefore)} turn`;
}
