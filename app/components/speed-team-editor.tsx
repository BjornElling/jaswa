import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowIcon } from './list-icons';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { useDragReorder } from './use-drag-reorder';
import { formatNumber } from '../lib/formatting';
import { moveItem } from '../lib/list-order';
import type { MonsterCopyName } from '../lib/monster-names';
import { boostsAllies, describeLeaderSkill, describeTurnEffect, leaderSkill, shortAllyBoost, shortLeaderSkill, shortTurnEffect } from '../lib/speed-skills';
import { leaderAreaReaches } from '../lib/speed-tick';
import { combatSpeedName, displaySpeedIntervalText } from '../lib/speed-tuning-analysis';
import type { DisplaySpeedInterval, MemberReading, TeamReading } from '../lib/speed-tuning-analysis';
import { whatIfDisplaySpeedMaximum } from '../lib/speed-tuning-preferences';
import type { SpeedTeam } from '../lib/speed-tuning-preferences';
import type { GeneralSettings } from '../lib/types';

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'}`;
}

/**
 * The one line under a member that says whether it is where it was put, where
 * to tune it, and last, which enemy gets in before it. The fix quotes the
 * Interval column's range and nothing else, so every display speed the line
 * offers is one the team can be tuned through from the top down.
 */
function verdictText(member: MemberReading, names: Record<string, MonsterCopyName>, area: 'arena' | 'dungeon',
  enemiesKnown: boolean, general: GeneralSettings, tiedWith: string | null): string {
  const { verdict } = member;
  if (tiedWith !== null) return `Tied with ${names[tiedWith]?.name ?? 'a teammate'}. Position decides.`;
  const fix = enemiesKnown && !member.inRange ? displaySpeedIntervalText(member.range, general) : null;
  const stages = member.cutInAt;
  const enemyWarning = !enemiesKnown || stages.length === 0 ? ''
    : area === 'arena' ? ' · worst-case enemy cuts in'
      : ` · enemy cuts in (stage${stages.length === 1 ? '' : 's'} ${stages.join(', ')})`;
  const fault = verdict.kind === 'in-place' ? `In place · moves ${ordinal(member.actualPosition)}`
    : verdict.kind === 'order' ? `Too fast · moves ${ordinal(member.actualPosition)}`
      : `Tied with ${names[verdict.with]?.name ?? 'a teammate'}. Position decides.`;
  return `${fault}${fix === null ? '' : ` · ${fix}`}${enemyWarning}`;
}

/* Red for a fault in the order; yellow for a tie, an enemy that gets in, or a
   member in place that a display speed of its own would still improve; green
   only with none of them. */
function verdictState(member: MemberReading, enemiesKnown: boolean): 'good' | 'warn' | 'bad' {
  switch (member.verdict.kind) {
    case 'order': return 'bad';
    case 'in-place': return enemiesKnown && (member.cutInAt.length > 0 || (member.range !== null && !member.inRange)) ? 'warn' : 'good';
    default: return 'warn';
  }
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
     than a zero, and a half-typed number is not read until it is a number.
     Empty until typed in: the imported figure sits one column to the left. */
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (member.whatIf ? String(member.displaySpeed) : '');
  return <input className="speed-what-if" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3}
    autoComplete="off" aria-label={label} value={value}
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
  title: string;
  names: Record<string, MonsterCopyName>;
  general: GeneralSettings;
  onChange: (change: (team: SpeedTeam) => SpeedTeam) => void;
  /** A what-if typed or cleared: saved with the team, but read only by the team's overlay. */
  onWhatIf: (unitId: string, value: number | undefined) => void;
  onOpenMonster: OpenMonsterOverlay;
  /** The way into the tick-by-tick view, set beside the turn order it details. */
  turnOrderAction?: ReactNode;
  /** False while a new dungeon team has no dungeon chosen: its enemies are nobody's yet. */
  enemiesKnown?: boolean;
};

/**
 * The display speeds a member can be tuned to, as the Interval column states
 * them: a closed range, an open one, or a dash where none will do or the
 * enemies are not known yet.
 */
function rangeText(range: DisplaySpeedInterval | null, general: GeneralSettings): string {
  if (range === null) return '—';
  const minimum = formatNumber(range.minimum, general);
  return range.maximum === null ? `${minimum}+` : `${minimum} – ${formatNumber(range.maximum, general)}`;
}

/**
 * Everything a preset's team states and everything read from it: the leader,
 * each slot and its verdict, and what the team faces. The monsters and the
 * leader are the preset's, so only the turn order wanted and the what-ifs are
 * the user's to change here.
 */
export function SpeedTeamEditor({ reading, title, names, general, onChange, onWhatIf, onOpenMonster, turnOrderAction, enemiesKnown = true }: EditorProps) {
  const { team, content } = reading;
  const reorder = useDragReorder<HTMLTableElement>({ count: team.members.length, onMove: move });
  const speedName = combatSpeedName(reading);
  const readingById = new Map(reading.members.map((member) => [member.unitId, member]));

  function move(from: number, to: number) {
    if (to < 0 || to >= team.members.length || from === to) return;
    onChange((current) => ({ ...current, members: moveItem(current.members, from, to) }));
  }

  const contentWord = content.area === 'arena' ? 'Arena' : 'Dungeon';

  return <div className="speed-team-editor">
    {/* A filled slot is dragged by any part that is not a field; the arrows
        beside it are the same move for the keyboard. */}
    <table className="speed-team-table" {...reorder.containerProps}>
      <colgroup>
        <col className="speed-col-order" /><col className="speed-col-monster" /><col className="speed-col-leader" />
        <col className="speed-col-speed" /><col className="speed-col-interval" /><col className="speed-col-what-if" /><col className="speed-col-speed" />
        <col className="speed-col-controls" />
      </colgroup>
      <thead><tr>
        <th scope="col">#</th>
        <th scope="col">Monster</th>
        <th scope="col" className="align-center">Leader</th>
        <th scope="col" className="align-right">Display speed</th>
        <th scope="col" className="align-right">Interval</th>
        <th scope="col" className="align-right">What if...</th>
        <th scope="col" className="align-right">{contentWord} speed</th>
        <th scope="col"><span className="visually-hidden">Move</span></th>
      </tr></thead>
      {/* One body per slot, two rows each: the name, and under it the
          verdict. Every other cell spans both and sits in their middle, so a
          slot reads as one unit, and grouping the pair keeps a dragged monster
          and its verdict together. */}
      {Array.from({ length: content.teamSize }, (_, at) => {
        const member = team.members[at];
        if (!member) {
          return <tbody key={`empty-${at}`} className="speed-slot speed-slot-empty">
            <tr className="speed-row">
              <td className="speed-order" rowSpan={2}>{at + 1}</td>
              <td className="speed-add-cell" rowSpan={2}><span className="muted">Empty in this preset</span></td>
              <td colSpan={6} />
            </tr>
            <tr className="speed-verdict-row"><td colSpan={6} /></tr>
          </tbody>;
        }
        const monster = readingById.get(member.unitId);
        const name = names[member.unitId]?.name ?? 'Unknown monster';
        const controls = <td className="speed-controls" rowSpan={2}>
          <button type="button" className="speed-icon-button" aria-label={`Move ${name} earlier`}
            disabled={at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
          <button type="button" className="speed-icon-button" aria-label={`Move ${name} later`}
            disabled={at === team.members.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
        </td>;
        /* Numbered by where the slot is drawn, so a drag's preview reads 1 to n down the table. */
        const number = reorder.place(at) + 1;
        if (!monster) {
          return <tbody key={member.unitId} className="speed-slot" {...reorder.entryProps(at)}>
            <tr className="speed-row">
              <td className="speed-order" rowSpan={2}>{number}</td>
              <td><span className="speed-monster-name muted">Not in this import</span></td>
              <td rowSpan={2} />
              <td colSpan={4} rowSpan={2} />
              {controls}
            </tr>
            <tr className="speed-verdict-row"><td /></tr>
          </tbody>;
        }
        const lead = leaderSkill(monster.masterId);
        const leads = team.leaderUnitId === member.unitId;
        const reaches = lead !== null && leaderAreaReaches(lead.area, content.area);
        const { used, uncounted } = monster.profile;
        const boostLabel = [
          used.length ? `${used.map((skill) => `${skill.name}: ${skill.effects.map(describeTurnEffect).join(', ')}`).join('; ')} — counted on every turn` : '',
          uncounted.length ? `Not counted, because its size depends on the battle: ${uncounted.join(', ')}` : '',
        ].filter(Boolean).join('. ');
        const tiedWith = monster.verdict.kind === 'tie' ? monster.verdict.with
          : reading.members.find((other) => other.verdict.kind === 'tie' && other.verdict.with === monster.unitId)?.unitId ?? null;
        const verdict = verdictText(monster, names, content.area, enemiesKnown, general, tiedWith);
        /* Until the dungeon is chosen its enemies are nobody's, so neither is a range. */
        const range = rangeText(enemiesKnown ? monster.range : null, general);
        const noRange = enemiesKnown && monster.range === null;
        /* What this monster's turn does to the other bars, hung on the line
           below its slot. A boost to the whole team is named by its size; a
           boost to one ally also names who its first turn gave it to, as that
           ally may stand anywhere in the order. A boost to itself or a speed
           buff is left to the mark beside the name. */
        const boostTag = [...new Set([
          ...monster.profile.effects.filter((effect) => effect.kind === 'allies-attack-bar').map(shortTurnEffect),
          ...monster.firstAllyBoosts.map((boost) => shortAllyBoost(boost.amount, names[boost.unitId]?.name ?? 'a teammate')),
        ])].join(' + ');
        return <tbody key={member.unitId} className="speed-slot" {...reorder.entryProps(at)}>
          <tr className="speed-row">
            <td className="speed-order" rowSpan={2}>{number}</td>
            <td className="speed-monster">
              <span className="speed-monster-line">
                <MonsterLink target={{ kind: 'copy', unitId: member.unitId, masterId: monster.masterId }}
                  name={name} presetId={team.id} onOpen={onOpenMonster} />
                {/* The mark's box is always there, so a team gaining a booster
                    does not shift the name beside it. */}
                <span className="speed-boost-slot">
                  {(used.length > 0 || uncounted.length > 0) && <BoostMark label={`${name} — ${boostLabel}`}
                    tone={boostsAllies(monster.profile) ? 'team' : 'own'} />}
                </span>
              </span>
            </td>
            {/* The preset names its leader, so the box only reports it. A
                chosen lead that does not count here says so in red; one not
                chosen stays quiet whatever it reaches. */}
            <td className="speed-leader-cell" rowSpan={2}>
              <label className="speed-leader" title={lead ? describeLeaderSkill(lead) : undefined}>
                <input type="checkbox" checked={leads} disabled readOnly
                  aria-label={`${name} leads ${title}`} />
                <span className="speed-leader-skill" data-state={lead === null ? 'none' : !leads ? 'idle' : reaches ? 'chosen' : 'bad'}>
                  {lead ? shortLeaderSkill(lead) : '—'}
                </span>
              </label>
            </td>
            <td className="speed-figure" rowSpan={2}>{formatNumber(monster.importedDisplaySpeed, general)}</td>
            <td className="speed-figure speed-slot-range" rowSpan={2}
              title={!noRange ? undefined : at === 0 ? `No display speed of ${name} gives the team a perfect order with no enemy cutting in`
                : `No display speed gives ${name} a place with no enemy cutting in until a monster above it is tuned`}>{range}</td>
            <td className="speed-figure speed-what-if-cell" rowSpan={2}>
              <WhatIfField member={monster} label={`What-if display speed for ${name} in ${title}`}
                onChange={(value) => onWhatIf(member.unitId, value)} />
            </td>
            <td className="speed-figure speed-combat" rowSpan={2} title={`${formatNumber(monster.combatSpeed, general)} ${speedName}`}>
              {formatNumber(monster.combatSpeed, general)}
            </td>
            {controls}
          </tr>
          <tr className="speed-verdict-row">
            <td className="speed-verdict-cell">
              <span className="speed-verdict type-caption" data-state={tiedWith !== null ? 'warn' : verdictState(monster, enemiesKnown)} title={verdict}>{verdict}</span>
              {boostTag !== '' && <span className="speed-boost-tag type-caption" aria-hidden="true">{boostTag}</span>}
            </td>
          </tr>
        </tbody>;
      })}
    </table>

    {/* Where the first enemy turn lands in the opening: a row per stage, or
        the one worst case in arena. The rows are the content's, never the
        team's, so adding the first monster fills cells rather than adding
        lines. At the row's end, whether that turn comes before every monster
        has had one of its own. */}
    {/* "(1st turn)" is said only beside a "(2nd turn)" or later: alone it
        repeats what the name already tells, while a later turn is always worth
        naming, and naming every row then lets the rows be compared. */}
    <section className="speed-enemy-turns" aria-labelledby={`${team.id}-enemy-cut-in`}>
      <h3 id={`${team.id}-enemy-cut-in`} className="type-label">Enemy cut in</h3>
      <div className="speed-enemy-turns-body">
        <table className="speed-enemy-table">
          <colgroup><col className="speed-col-stage" /><col /><col className="speed-col-cut" /></colgroup>
          <thead><tr>
            <th scope="col">{content.area === 'arena' ? 'Enemy' : 'Stage'}</th>
            <th scope="col">First enemy moves after</th>
            <th scope="col"><span className="visually-hidden">Cuts in</span></th>
          </tr></thead>
          <tbody>
            {(content.area === 'arena' ? [null] : content.stages).map((stage, at, rows) => {
              const enemy = enemiesKnown ? reading.enemies[at] : undefined;
              const laterTurnShown = enemiesKnown && rows.some((_, row) => (reading.enemies[row]?.follows?.turn ?? 1) > 1);
              const cut = enemy === undefined ? undefined : enemy.cutsBefore.length > 0;
              const cutLabel = cut === undefined ? undefined
                : cut ? `Can cut in before ${enemy?.cutsBefore.map((unitId) => names[unitId]?.name ?? 'a teammate').join(', ')}`
                  : 'Cannot cut in';
              return <tr key={at}>
                <th scope="row">{stage ? at + 1 : 'Worst case'}</th>
                <td className="speed-enemy-after">
                  {!enemy ? <span className="muted">—</span>
                    : enemy.follows === null ? 'Before your team'
                      : <>
                        <span className="speed-enemy-after-name">{names[enemy.follows.unitId]?.name ?? 'A teammate'}</span>
                        {(enemy.follows.turn > 1 || laterTurnShown) && <>
                          {' '}<span className="speed-enemy-after-turn">({ordinal(enemy.follows.turn)} turn)</span>
                        </>}
                      </>}
                </td>
                {/* A red cross or a green check, in a box laid out before
                    either is known, so the mark arriving moves nothing. */}
                <td className="speed-cut-cell">
                  <span className="speed-cut-mark" data-state={cut === undefined ? undefined : cut ? 'cut' : 'clear'}
                    role={cutLabel === undefined ? undefined : 'img'} aria-label={cutLabel} title={cutLabel}>
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d={cut === false ? 'M3 8.5l3.5 3.5L13 4.5' : 'M4 4l8 8M12 4l-8 8'} /></svg>
                  </span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      <div className="speed-enemy-turns-action">{turnOrderAction}</div>
      </div>
    </section>
  </div>;
}
