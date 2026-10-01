import { useState } from 'react';
import { FilterButton } from './button';
import { Overlay } from './overlay';
import { formatNumber } from '../lib/formatting';
import type { MonsterCopyName } from '../lib/monster-names';
import { describeTurnEffect } from '../lib/speed-skills';
import { fullAttackBar } from '../lib/speed-tick';
import type { BattleTrace } from '../lib/speed-tick';
import { combatSpeedName } from '../lib/speed-tuning-analysis';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import type { GeneralSettings } from '../lib/types';

type View = { id: string; label: string; trace: BattleTrace; enemySpeeds: readonly number[] };

function views(reading: TeamReading): View[] {
  const own: View = { id: 'team', label: 'Your team alone', trace: reading.trace, enemySpeeds: [] };
  const enemies = reading.enemies.map((enemy, at): View => ({
    id: `stage-${at}`,
    label: reading.content.area === 'arena' ? 'Worst-case enemy' : `Stage ${at + 1}`,
    trace: enemy.trace,
    enemySpeeds: enemy.enemySpeeds,
  }));
  return [...enemies, own];
}

/**
 * Every tick of one opening, drawn: a row per monster, a column per tick, the
 * bar's fill in each cell and a numbered mark where a turn is taken.
 *
 * The rows are the team in the order the user wants it, then the enemies, so
 * a turn out of place reads as a mark out of its diagonal.
 */
export function SpeedTurnOrderDialog({ reading, title, names, general, onClose }: {
  reading: TeamReading;
  title: string;
  names: Record<string, MonsterCopyName>;
  general: GeneralSettings;
  onClose: () => void;
}) {
  const choices = views(reading);
  const [viewId, setViewId] = useState(choices[0].id);
  const view = choices.find((entry) => entry.id === viewId) ?? choices[0];

  const speedName = combatSpeedName(reading);
  const memberById = new Map(reading.members.map((member) => [member.unitId, member]));
  const rows = [
    ...reading.members.map((member) => ({
      key: member.unitId,
      name: names[member.unitId]?.name ?? member.unitId,
      speed: member.combatSpeed,
      enemy: false,
    })),
    ...view.enemySpeeds.map((speed, at) => ({
      key: `enemy-${at + 1}`,
      name: view.enemySpeeds.length > 1 ? `Enemy ${at + 1}` : 'Enemy',
      speed,
      enemy: true,
    })),
  ];
  const lastTick = view.trace.events.at(-1)?.tick ?? 0;
  const snapshots = view.trace.snapshots.slice(0, lastTick);
  const turnNumber = new Map(view.trace.events.map((event, at) => [`${event.key}@${event.tick}`, at + 1]));

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
        <div className="speed-timeline" role="table" aria-label={`Attack bars tick by tick: ${view.label}`}
          style={{ gridTemplateColumns: `var(--speed-timeline-label) repeat(${Math.max(1, snapshots.length)}, var(--speed-timeline-tick))` }}>
          <div role="row" className="speed-timeline-row">
            <span role="columnheader" className="speed-timeline-label filter-label">Tick</span>
            {snapshots.map((snapshot) => <span key={snapshot.tick} role="columnheader" className="speed-timeline-tick-head type-caption">{snapshot.tick}</span>)}
          </div>
          {rows.map((row) => <div key={row.key} role="row" className="speed-timeline-row" data-enemy={row.enemy ? 'true' : undefined}>
            <span role="rowheader" className="speed-timeline-label">
              <span className="speed-timeline-name">{row.name}</span>
              <span className="type-caption">{formatNumber(row.speed, general)} {speedName}</span>
            </span>
            {snapshots.map((snapshot) => {
              const bar = snapshot.bars[row.key] ?? 0;
              const turn = snapshot.mover === row.key ? turnNumber.get(`${row.key}@${snapshot.tick}`) : undefined;
              const fill = Math.min(100, bar / fullAttackBar * 100);
              return <span key={snapshot.tick} role="cell" className="speed-timeline-cell"
                aria-label={turn ? `Tick ${snapshot.tick}: turn ${turn}` : `Tick ${snapshot.tick}: ${Math.floor(bar / 100)} %`}>
                <span className="speed-timeline-fill" style={{ height: `${fill}%` }} />
                {turn !== undefined && <span className="speed-timeline-turn">{turn}</span>}
              </span>;
            })}
          </div>)}
        </div>

        <ol className="speed-turn-list">
          {view.trace.events.map((event, at) => {
            const member = memberById.get(event.key);
            const row = rows.find((entry) => entry.key === event.key);
            const effects = member ? member.profile.effects.map(describeTurnEffect) : [];
            return <li key={`${event.key}-${event.tick}`} data-enemy={event.side === 'enemy' ? 'true' : undefined}>
              <span className="speed-turn-index">{at + 1}</span>
              <span className="speed-turn-tick type-caption">tick {event.tick}</span>
              <span className="speed-turn-name">{row?.name ?? event.key}</span>
              <span className="speed-turn-effects type-caption">
                {[
                  `${Math.floor(event.attackBar / 100)} % bar`,
                  ...(event.tiedWith.length ? [`tied with ${event.tiedWith.map((key) => rows.find((entry) => entry.key === key)?.name ?? key).join(', ')} — position decides`] : []),
                  ...effects,
                ].join(' · ')}
              </span>
            </li>;
          })}
        </ol>
      </div>
  </Overlay>;
}
