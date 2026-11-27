import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../ui/button';
import { CheckboxRow } from '../../ui/form-controls';
import { ArrowIcon } from '../../ui/list-icons';
import { MonsterLink } from '../../ui/gear/monster-link';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import { useDragReorder } from '../../ui/use-drag-reorder';
import { alwaysSynchronizedReason } from '../../domain/placements/always-synchronized';
import { formatNumber } from '../../domain/shared/formatting';
import { moveItem } from '../../domain/shared/list-order';
import type { MonsterCopyName } from '../../domain/monsters/monster-names';
import { boostsAllies, describeLeaderSkill, describeSpeedSkill, describeTurnEffect, leaderSkill, shortAllyBoost, shortLeaderSkill, shortTurnEffect } from '../../domain/speed/speed-skills';
import type { SpeedOpponent } from '../../domain/speed/speed-contents';
import { leaderAreaReaches } from '../../domain/speed/speed-tick';
import { combatSpeedIntervalText } from '../../domain/speed/speed-tuning-analysis';
import type { MemberReading, TeamReading } from '../../domain/speed/speed-tuning-analysis';
import type { CombatSpeedInterval } from '../../domain/speed/speed-tuning-intervals';
import { canKeepSpeedTuning, whatIfCombatSpeedMaximum } from '../../domain/profiles/speed-tuning-preferences';
import type { SpeedTeam } from '../../domain/profiles/speed-tuning-preferences';
import type { GeneralSettings } from '../../domain/model';

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'}`;
}

/* ` · moves 2nd and 4th`: every turn the member takes in the opening, numbered
   as the Ticks view numbers them. */
function movesText(positions: readonly number[]): string {
  if (positions.length === 0) return '';
  const words = positions.map(ordinal);
  return ` · moves ${words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`}`;
}

/**
 * The one line under a member that says whether its first turn is the one its
 * place asks for, where to tune it, and last, which enemy gets in before it.
 * The fix quotes the Interval column's range and nothing else: the combat
 * speeds that put it between the members placed just above and below it, with
 * no enemy turn before it.
 */
function verdictText(member: MemberReading, names: Record<string, MonsterCopyName>, opponent: SpeedOpponent,
  enemiesKnown: boolean, general: GeneralSettings, tiedWith: string | null): string {
  const { verdict } = member;
  const stages = enemiesKnown ? member.cutInAt : [];
  const enemy = stages.length === 0 ? null
    : opponent === 'worst-case' ? 'worst-case enemy cuts in'
      : `enemy cuts in (stage${stages.length === 1 ? '' : 's'} ${stages.join(', ')})`;
  if (tiedWith !== null) return `Tied with ${names[tiedWith]?.name ?? 'a teammate'}. Position decides.${enemy === null ? '' : ` · ${enemy}`}`;
  const fix = member.inRange ? null : combatSpeedIntervalText(member.range, general);
  const moves = movesText(member.turnPositions);
  /* In its place but cut into, the enemy is the fault and leads the line,
     rather than an "In place" the red would contradict. */
  const fault = verdict.kind === 'early' ? `Too fast${moves}`
    : verdict.kind === 'late' ? `Too slow${moves}`
      : verdict.kind === 'tie' ? `Tied with ${names[verdict.with]?.name ?? 'a teammate'}. Position decides.`
        : enemy !== null ? `${enemy.charAt(0).toUpperCase()}${enemy.slice(1)}${moves}` : `In place${moves}`;
  const tail = verdict.kind === 'in-place' || enemy === null ? '' : ` · ${enemy}`;
  return `${fault}${fix === null ? '' : ` · ${fix}`}${tail}`;
}

/* Red for a first turn out of its place or an enemy getting in before it;
   yellow for a tie, or a member in place that is not between its neighbours'
   combat speeds; green only with none of them. */
function verdictState(member: MemberReading, enemiesKnown: boolean): 'good' | 'warn' | 'bad' {
  if (enemiesKnown && member.cutInAt.length > 0) return 'bad';
  switch (member.verdict.kind) {
    case 'early': case 'late': return 'bad';
    case 'in-place': return member.range !== null && !member.inRange ? 'warn' : 'good';
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

const whatIfHint = 'Enter a combat speed with the totem and leader skills already counted.';
const displayHint = 'The display speed for the entered combat speed or, if the field is empty, for the engraved runes.';

function WhatIfField({ member, label, describedBy, disabled, onChange }: {
  member: MemberReading;
  label: string;
  describedBy: string;
  disabled: boolean;
  onChange: (value: number | undefined) => void;
}) {
  /* Held as text while it is typed, so an empty field is "no experiment" rather
     than a zero, and a half-typed number is not read until it is a number.
     Empty until typed in: the combat speed on the runes leads the row. */
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (member.whatIf ? String(member.combatSpeed) : '');
  return <input className="speed-what-if" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3}
    autoComplete="off" aria-label={label} aria-describedby={describedBy} value={value} disabled={disabled}
    onChange={(event) => {
      const digits = event.target.value;
      if (!/^\d*$/.test(digits)) return;
      setDraft(digits);
      if (digits === '') { onChange(undefined); return; }
      const parsed = Number(digits);
      if (Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= whatIfCombatSpeedMaximum) onChange(parsed);
    }}
    onBlur={() => setDraft(null)} />;
}

type EditorProps = {
  reading: TeamReading;
  intervalState: 'pending' | 'ready' | 'failed';
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
  /**
   * How the leader is chosen here: `'free'` passes and takes the lead, `'kept'`
   * only passes it, for a defense, which the game always leads with someone.
   * `'synced'` while live sync owns the preset, and absent where there is no
   * preset to lead; either way the box only reports the lead.
   */
  leading?: 'free' | 'kept' | 'synced';
};

/**
 * The combat speeds that put a member between its neighbours, as the
 * Interval column states them: a closed range, an open one, or a dash where
 * none will do.
 */
function rangeText(range: CombatSpeedInterval | null, general: GeneralSettings): string {
  if (range === null) return '—';
  const minimum = formatNumber(range.minimum, general);
  return range.maximum === null ? `${minimum}+` : `${minimum} – ${formatNumber(range.maximum, general)}`;
}

/**
 * Everything a preset's team states and everything read from it: the leader,
 * each slot and its verdict, and what the team faces. The monsters are the
 * preset's, so the turn order wanted, the what-ifs and — where the preset is
 * the user's to change — the leader are what is changed here.
 */
export function SpeedTeamEditor({ reading, intervalState, title, names, general, onChange, onWhatIf, onOpenMonster, turnOrderAction, enemiesKnown = true, leading }: EditorProps) {
  const { team, content } = reading;
  const whatIfHintId = useId();
  /* What is stated here is kept for the team's species; a member the import
     does not hold leaves them unknown, so nothing here could be kept. */
  const keepable = canKeepSpeedTuning(team);
  const reorder = useDragReorder<HTMLTableElement>({ count: keepable ? team.members.length : 0, onMove: move });
  const readingById = new Map(reading.members.map((member) => [member.unitId, member]));

  function move(from: number, to: number) {
    if (!keepable || to < 0 || to >= team.members.length || from === to) return;
    onChange((current) => ({ ...current, members: moveItem(current.members, from, to), orderStated: true }));
  }

  /* The enemy rows are the content's: one worst case against another player's
     team, a row per stage in a Cairos dungeon, and none where the content has
     no enemy data. */
  const enemyRows = content.opponent === 'worst-case' ? [null] : content.stages;

  return <div className="speed-team-editor">
    {/* A filled slot is dragged by any part that is not a field; the arrows
        beside it are the same move for the keyboard. */}
    <table className="speed-team-table" {...reorder.containerProps}>
      <colgroup>
        <col className="speed-col-order" /><col className="speed-col-monster" /><col className="speed-col-leader" />
        <col className="speed-col-speed" /><col className="speed-col-interval" /><col className="speed-col-what-if" /><col className="speed-col-speed" />
        <col className="speed-col-controls" />
      </colgroup>
      {/* Combat speed leads: it is the speed the turn order is decided by, so
          the interval and the what-if speak it too. Display speed comes last
          and muted, as a reading of the combat speed beside it rather than a
          figure of its own. */}
      <thead><tr>
        <th scope="col">#</th>
        <th scope="col">Monster</th>
        <th scope="col" className="align-center">Leader</th>
        <th scope="col" className="align-right">Combat speed</th>
        <th scope="col" className="align-right">Interval</th>
        {/* Named on its own, so the column is "What if..." to a screen reader;
            the mark still says its piece when focused, and every field's own
            label says combat speed. */}
        <th scope="col" className="align-right" aria-label="What if...">
          <span className="speed-head-with-info">What if...
            <span className="speed-info-mark" tabIndex={0} role="img" aria-label="About what-if combat speed" aria-describedby={whatIfHintId}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 7.2v3.5M8 5.1h.01" /></svg>
            </span>
            <span id={whatIfHintId} className="speed-info-tooltip type-caption" role="tooltip">{whatIfHint}</span>
          </span>
        </th>
        <th scope="col" className="align-right speed-display-head" title={displayHint}>Display speed</th>
        <th scope="col"><span className="visually-hidden">Move</span></th>
      </tr></thead>
      {/* One body per slot, two rows each: the name, and under it the
          verdict. Every other cell spans both and sits in their middle, so a
          slot reads as one unit, and grouping the pair keeps a dragged monster
          and its verdict together. */}
      {Array.from({ length: team.size }, (_, at) => {
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
            disabled={!keepable || at === 0} onClick={() => move(at, at - 1)}><ArrowIcon direction="up" /></button>
          <button type="button" className="speed-icon-button" aria-label={`Move ${name} later`}
            disabled={!keepable || at === team.members.length - 1} onClick={() => move(at, at + 1)}><ArrowIcon direction="down" /></button>
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
        const { used, jointAttack, uncounted } = monster.profile;
        const boostLabel = [
          used.length ? used.map(describeSpeedSkill).join('; ') : '',
          jointAttack.length ? `When attacking together: ${jointAttack.map((skill) => `${skill.name}: ${skill.effects.map(describeTurnEffect).join(', ')}`).join('; ')}` : '',
          uncounted.length ? `Not included in the calculations: ${uncounted.join(', ')}` : '',
        ].filter(Boolean).join('. ');
        const tiedWith = monster.verdict.kind === 'tie' ? monster.verdict.with
          : reading.members.find((other) => other.verdict.kind === 'tie' && other.verdict.with === monster.unitId)?.unitId ?? null;
        const verdict = verdictText(monster, names, content.opponent, enemiesKnown, general, tiedWith);
        const intervalStatus = intervalState === 'pending' ? 'Calculating interval' : intervalState === 'failed' ? 'Interval calculation failed' : undefined;
        const range = intervalState === 'pending' ? '…' : intervalState === 'failed' ? '!' : rangeText(monster.range, general);
        const verdictTone = verdictState(monster, enemiesKnown);
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
                  {(used.length > 0 || jointAttack.length > 0 || uncounted.length > 0) && <BoostMark label={`${name} — ${boostLabel}`}
                    tone={boostsAllies(monster.profile) ? 'team' : 'own'} />}
                </span>
              </span>
            </td>
            {/* The box reports the lead, and passes it where the preset is the
                user's. A chosen lead that does not count here says so in red;
                one not chosen stays quiet whatever it reaches. */}
            <td className="speed-leader-cell" rowSpan={2}>
              <label className="speed-leader" title={lead ? describeLeaderSkill(lead) : undefined}>
                <input type="checkbox" checked={leads} disabled={leading === undefined || leading === 'synced' || (leads && leading === 'kept')}
                  title={leading === 'synced' ? alwaysSynchronizedReason : undefined}
                  onChange={() => onChange((current) => ({ ...current, leaderUnitId: leads ? null : member.unitId }))}
                  aria-label={`${name} leads ${title}`} />
                <span className="speed-leader-skill" data-state={lead === null ? 'none' : !leads ? 'idle' : reaches ? 'chosen' : 'bad'}>
                  {lead ? shortLeaderSkill(lead) : '—'}
                </span>
              </label>
            </td>
            <td className="speed-figure speed-combat" rowSpan={2} title={`${formatNumber(monster.importedCombatSpeed, general)} combat speed${monster.leaderPercent > 0
              ? `, including +${monster.leaderPercent} % SPD from leader skills` : ''}`}>
              {formatNumber(monster.importedCombatSpeed, general)}
            </td>
            <td className="speed-figure speed-slot-range" rowSpan={2} aria-label={intervalStatus}
              title={intervalStatus ?? (monster.range === null
                ? `No combat speed of ${name} moves it between the monsters placed beside it${reading.enemies.length > 0 ? ' ahead of the enemy' : ''}` : undefined)}>{range}</td>
            <td className="speed-figure speed-what-if-cell" rowSpan={2}>
              <WhatIfField member={monster} label={`What-if combat speed for ${name} in ${title}`} describedBy={whatIfHintId} disabled={!keepable}
                onChange={(value) => onWhatIf(member.unitId, value)} />
            </td>
            <td className="speed-figure speed-display" rowSpan={2}
              title={monster.displaySpeed === null
                ? `No display speed of ${name} gives ${formatNumber(monster.combatSpeed, general)} combat speed`
                : `${formatNumber(monster.displaySpeed, general)} display speed gives ${name} ${formatNumber(monster.combatSpeed, general)} combat speed`}>
              {monster.displaySpeed === null ? '—' : formatNumber(monster.displaySpeed, general)}
            </td>
            {controls}
          </tr>
          <tr className="speed-verdict-row">
            <td className="speed-verdict-cell">
              <span className="speed-verdict type-caption" data-state={tiedWith !== null && verdictTone === 'good' ? 'warn' : verdictTone} title={verdict}>{verdict}</span>
              {boostTag !== '' && <span className="speed-boost-tag type-caption" aria-hidden="true">{boostTag}</span>}
            </td>
          </tr>
        </tbody>;
      })}
    </table>

    {/* Ticking it takes the enemy section below away, and the overlay closes
        up on what is left: that is the change asked for, so it may move. */}
    {/* Resetting hands the order back to the runes: the team is shown in the
        order it moves in now, and follows them from then on. */}
    <div className="speed-no-tuning">
      <Button size="compact" disabled={!keepable || !team.orderStated}
        onClick={() => onChange((current) => ({ ...current, orderStated: false }))}>Reset turn order</Button>
      <CheckboxRow label="No speed tuning" checked={team.noSpeedTuning} disabled={!keepable}
        onChange={(checked) => onChange((current) => ({ ...current, noSpeedTuning: checked }))} />
    </div>

    {/* Where the first enemy turn lands in the opening: a row per stage, or
        the one worst case in arena. The rows are the content's, never the
        team's, so adding the first monster fills cells rather than adding
        lines. At the row's end, whether that turn comes before every monster
        has had one of its own. */}
    {/* "(1st turn)" is said only beside a "(2nd turn)" or later: alone it
        repeats what the name already tells, while a later turn is always worth
        naming, and naming every row then lets the rows be compared. */}
    {!team.noSpeedTuning && <section className="speed-enemy-turns" aria-labelledby={`${team.id}-enemy-cut-in`}>
      <h3 id={`${team.id}-enemy-cut-in`} className="type-label">Enemy cut in</h3>
      <div className="speed-enemy-turns-body">
        <table className="speed-enemy-table">
          <colgroup><col className="speed-col-stage" /><col /><col className="speed-col-cut" /></colgroup>
          <thead><tr>
            <th scope="col">{content.opponent === 'worst-case' ? 'Enemy' : 'Stage'}</th>
            <th scope="col">First enemy moves after</th>
            <th scope="col"><span className="visually-hidden">Cuts in</span></th>
          </tr></thead>
          <tbody>
            {enemyRows.length === 0 && <tr>
              <th scope="row">—</th>
              <td className="speed-enemy-after"><span className="muted">No enemy data for this content</span></td>
              <td className="speed-cut-cell" />
            </tr>}
            {enemyRows.map((stage, at, rows) => {
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
    </section>}
  </div>;
}
