import { useState } from 'react';
import { FilterButton } from './button';
import { Overlay } from './overlay';
import { formatNumber } from '../lib/formatting';
import type { MonsterCopyName } from '../lib/monster-names';
import { attackBarPercent } from '../lib/speed-skills';
import { fullAttackBar } from '../lib/speed-tick';
import type { BattleTrace } from '../lib/speed-tick';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import type { GeneralSettings } from '../lib/types';

type View = { id: string; label: string; trace: BattleTrace; enemySpeeds: readonly number[]; enemyNames: readonly string[] };
type Row = { key: string; name: string; speed: number; enemy: boolean };

function views(reading: TeamReading): View[] {
  const own: View = { id: 'team', label: 'Your team alone', trace: reading.trace, enemySpeeds: [], enemyNames: [] };
  const enemies = reading.enemies.map((enemy, at): View => ({
    id: `stage-${at}`,
    label: reading.content.opponent === 'worst-case' ? 'Worst-case enemy' : `Stage ${at + 1}`,
    trace: enemy.trace,
    enemySpeeds: enemy.enemySpeeds,
    enemyNames: enemy.enemyNames,
  }));
  return [...enemies, own];
}

/* One lane's drawing, in pixels. The figures under it sit in columns of the
   same width, so a tick's peak and its percentage share one x. */
const tickWidth = 48;
const laneHeight = 44;
const lanePad = 4;
const plotHeight = laneHeight - 2 * lanePad;
/* The top of the lane is 150 %: room above the dashed full line for the
   overflow that decides who moves, without flattening the climb below it. A
   higher bar is clipped there; its figure still says how high. */
const laneCeiling = fullAttackBar * 1.5;

const barY = (bar: number) => lanePad + plotHeight - Math.min(bar, laneCeiling) / laneCeiling * plotHeight;
const barPercent = (bar: number) => Math.floor(bar / 100);

/* What a turn added to one bar: the jump from where the bar stood — empty for
   the mover itself — to where the turn left it. */
function boostAt(snapshot: BattleTrace['snapshots'][number], key: string): number {
  if (!snapshot.after) return 0;
  const before = snapshot.mover === key ? 0 : snapshot.bars[key] ?? 0;
  return (snapshot.after[key] ?? 0) - before;
}

/**
 * One view's ticks: a lane per monster in which its attack bar climbs tick by
 * tick and drops to nothing on its turn, against a dashed 100 % line. The
 * numbered disc is the turn; the figure under each tick is the bar after that
 * tick's fill, before anyone moves — so where two lanes cross the line on the
 * same tick, the figures say why the higher one went first.
 */
function TurnTimeline({ view, rows, general, active }: {
  view: View;
  rows: Row[];
  general: GeneralSettings;
  active: boolean;
}) {
  const lastTick = view.trace.events.at(-1)?.tick ?? 0;
  const snapshots = view.trace.snapshots.slice(0, lastTick);
  const turns = new Map(view.trace.events.map((event, at) => [`${event.key}@${event.tick}`, { number: at + 1, event }]));
  const nameOf = (key: string) => rows.find((row) => row.key === key)?.name ?? key;
  const width = Math.max(1, snapshots.length) * tickWidth;
  const centre = (at: number) => at * tickWidth + tickWidth / 2;

  /* Every view is laid out and the ones not chosen are only hidden, so the
     panel is as large as the largest of them and does not resize under the
     switch between them. */
  return <div className="speed-lanes" role="table" aria-label={`Attack bars tick by tick: ${view.label}`}
    data-active={active ? 'true' : undefined} inert={!active}
    style={{ gridTemplateColumns: `var(--speed-lane-label) ${width}px` }}>
    <div role="row" className="speed-lane-row">
      <span role="columnheader" className="speed-lane-label filter-label">Tick</span>
      <span className="speed-lane-ticks" style={{ gridTemplateColumns: `repeat(${snapshots.length}, ${tickWidth}px)` }}>
        {snapshots.map((snapshot) => <span key={snapshot.tick} role="columnheader" className="speed-lane-tick type-caption">{snapshot.tick}</span>)}
      </span>
    </div>
    {rows.map((row) => {
      /* A turn's boosts land between two ticks, so they are drawn as the
         vertical jump they are rather than folded into the next climb. */
      let path = `M0,${barY(0)}`;
      snapshots.forEach((snapshot, at) => {
        path += `L${centre(at)},${barY(snapshot.bars[row.key] ?? 0)}`;
        if (snapshot.mover === row.key) path += `L${centre(at)},${barY(0)}`;
        if (boostAt(snapshot, row.key) > 0) path += `L${centre(at)},${barY(snapshot.after?.[row.key] ?? 0)}`;
      });
      const lastBar = snapshots.at(-1);
      path += `L${width},${barY(lastBar ? lastBar.after?.[row.key] ?? lastBar.bars[row.key] ?? 0 : 0)}`;
      return <div key={row.key} role="row" className="speed-lane-row" data-enemy={row.enemy ? 'true' : undefined}>
        <span role="rowheader" className="speed-lane-label">
          <span className="speed-lane-name">{row.name}</span>
          <span className="type-caption">{formatNumber(row.speed, general)} combat speed</span>
        </span>
        <span className="speed-lane-track">
          <svg className="speed-lane-plot" width={width} height={laneHeight} viewBox={`0 0 ${width} ${laneHeight}`} aria-hidden="true">
            <rect className="speed-lane-ground" x={0} y={0} width={width} height={laneHeight} rx={3} />
            <line className="speed-lane-full" x1={0} x2={width} y1={barY(fullAttackBar)} y2={barY(fullAttackBar)} />
            <path className="speed-lane-area" d={`${path}L${width},${barY(0)}Z`} />
            <path className="speed-lane-line" d={path} />
            {snapshots.map((snapshot, at) => {
              const gain = boostAt(snapshot, row.key);
              if (gain <= 0) return null;
              const x = centre(at);
              const y = barY(snapshot.after?.[row.key] ?? 0);
              return <g key={`boost-${snapshot.tick}`} className="speed-lane-boost">
                <title>{`+${attackBarPercent(gain)} % attack bar from ${nameOf(snapshot.mover ?? '')}`}</title>
                <path d={`M${x - 4},${y + 4}L${x},${y}L${x + 4},${y + 4}`} />
              </g>;
            })}
            {snapshots.map((snapshot, at) => {
              const turn = snapshot.mover === row.key ? turns.get(`${row.key}@${snapshot.tick}`) : undefined;
              if (!turn) return null;
              const y = barY(snapshot.bars[row.key] ?? 0);
              return <g key={snapshot.tick} className="speed-lane-turn">
                <circle cx={centre(at)} cy={y} r={9} />
                <text x={centre(at)} y={y} textAnchor="middle" dominantBaseline="central">{turn.number}</text>
              </g>;
            })}
          </svg>
          <span className="speed-lane-figures" style={{ gridTemplateColumns: `repeat(${snapshots.length}, ${tickWidth}px)` }}>
            {snapshots.map((snapshot) => {
              const bar = snapshot.bars[row.key] ?? 0;
              const turn = snapshot.mover === row.key ? turns.get(`${row.key}@${snapshot.tick}`) : undefined;
              const tie = turn?.event.tiedWith.length ? `, tied with ${turn.event.tiedWith.map(nameOf).join(', ')} — position decides` : '';
              const gain = boostAt(snapshot, row.key);
              const extras = `${snapshot.buffed.includes(row.key) ? ', under speed buff' : ''}${gain > 0
                ? `, +${attackBarPercent(gain)} % attack bar from ${nameOf(snapshot.mover ?? '')}` : ''}`;
              const label = turn
                ? `Tick ${snapshot.tick}: turn ${turn.number} at ${barPercent(bar)} %${tie}${extras}`
                : `Tick ${snapshot.tick}: ${barPercent(bar)} %${extras}`;
              return <span key={snapshot.tick} role="cell" className="speed-lane-figure"
                data-state={turn ? 'turn' : bar >= fullAttackBar ? 'waiting' : undefined} aria-label={label} title={label}>
                {barPercent(bar)}
              </span>;
            })}
          </span>
        </span>
      </div>;
    })}
  </div>;
}

/**
 * Every tick of an opening and the team's second lap, drawn. The rows are the
 * team in the order the user wants it, then the enemies, so a turn out of
 * place reads as a disc out of its diagonal.
 */
export function SpeedTurnOrderDialog({ reading, title, names, general, onClose }: {
  reading: TeamReading;
  title: string;
  names: Record<string, MonsterCopyName>;
  general: GeneralSettings;
  onClose: () => void;
}) {
  const choices = views(reading);
  /* Opened on the worst stage: the verdicts number each member's turns there. */
  const [viewId, setViewId] = useState(choices[reading.worstStage ?? 0].id);
  const view = choices.find((entry) => entry.id === viewId) ?? choices[0];

  const rowsOf = (choice: View): Row[] => [
    ...reading.members.map((member) => ({
      key: member.unitId,
      name: names[member.unitId]?.name ?? member.unitId,
      speed: member.combatSpeed,
      enemy: false,
    })),
    ...choice.enemySpeeds.map((speed, at) => ({
      key: `enemy-${at + 1}`,
      name: choice.enemyNames[at] ?? 'Enemy',
      speed,
      enemy: true,
    })),
  ];

  return <Overlay labelledBy="speed-turn-title" className="speed-turn-dialog" onClose={onClose}>
      <header className="speed-turn-head">
        <div>
          <p className="eyebrow">Turn order</p>
          <h2 id="speed-turn-title">{title}</h2>
        </div>
        <div className="speed-turn-views" role="group" aria-label="Choose what the team faces">
          {choices.map((choice) => <FilterButton key={choice.id} active={choice.id === view.id}
            onClick={() => setViewId(choice.id)}>{choice.label}</FilterButton>)}
        </div>
      </header>

      <div className="speed-turn-body">
        <div className="speed-turn-stack">
          {choices.map((choice) => <TurnTimeline key={choice.id} view={choice} rows={rowsOf(choice)}
            general={general} active={choice.id === view.id} />)}
        </div>
      </div>
  </Overlay>;
}
