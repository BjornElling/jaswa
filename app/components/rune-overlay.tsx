import { useMemo } from 'react';
import { AncientName } from './ancient-mark';
import { MonsterLink } from './monster-link';
import type { MonsterReference, OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { RuneSubLine } from './rune-sub-line';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation } from '../lib/monster-catalog';
import { runeStatName } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { GeneralSettings } from '../lib/types';

/**
 * One rune, as a record of what it is: its set and slot, its main and innate
 * properties, and its four sub properties with whatever craft already sits on
 * them.
 *
 * It states facts and nothing else. What the rune could still become is the
 * business of the pages that judge it — Rune Clean-up and the simulator — and a
 * projection repeated here was a second reading of the same rune that could
 * only drift from theirs.
 */

/** A rune carries at most four sub properties; the list always reserves all
    four, so a rune with two does not make a shorter panel than one with four. */
const subPropertySlots = 4;

/** Who wears the rune, as a way into that monster's own overlay. A wearer this
    import does not contain is named as such and opens nothing. */
function wearer(rune: Rune, game: GameRecord | undefined): {
  target: MonsterReference | null; name: string; imageFilename?: string; initial: string;
} | null {
  if (rune.occupiedId === null) return null;
  const units = Array.isArray(game?.unit_list) ? game.unit_list as GameRecord[] : [];
  const unit = units.find((entry) => String(entry.unit_id) === rune.occupiedId);
  if (unit === undefined) return { target: null, name: 'Monster not in this import', initial: '?' };
  const display = monsterPresentation(unit.unit_master_id);
  return {
    target: { kind: 'copy', unitId: rune.occupiedId, masterId: String(unit.unit_master_id) },
    name: display.name,
    imageFilename: display.imageFilename,
    initial: display.shortName,
  };
}

export function RuneOverlay({ rune, game, general, onClose, onOpenMonster }: {
  rune: Rune;
  game: GameRecord | undefined;
  general: GeneralSettings;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const worn = useMemo(() => wearer(rune, game), [rune, game]);
  const figure = (value: number) => formatNumber(value, general);
  const statName = (statId: number) => runeStatName(statId) ?? `Stat ${statId}`;
  const facts = [
    { label: 'Slot', value: String(rune.slot) },
    { label: 'Grade', value: `${rune.stars}★` },
    { label: 'Quality', value: rune.defaultGrade },
    { label: 'Level', value: `+${rune.level}` },
  ];

  return <Overlay labelledBy="rune-overlay-title" describedBy="rune-overlay-facts" className="rune-overlay" onClose={onClose}>
    <header className="overlay-head rune-overlay-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="overlay-identity rune-overlay-identity">
        <h2 id="rune-overlay-title" className="overlay-hero-name">
          <AncientName name={rune.setName} ancient={rune.ancient} />
        </h2>
        {/* Location is the last fact in the same row, pushed to the far end: its
            label reads on the line the other labels read on, and its value on
            theirs. Gold where it is a monster, because there it is also the way
            into that monster; plain white where it is the inventory, a fact with
            nowhere to go. */}
        <dl id="rune-overlay-facts" className="rune-overlay-facts">
          {facts.map((fact) => <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>)}
          <div className="rune-overlay-location">
            <dt>Location</dt>
            <dd>
              {worn === null
                ? 'Inventory'
                : <MonsterLink target={worn.target} name={worn.name} portrait={{ imageFilename: worn.imageFilename, initial: worn.initial }}
                  onOpen={onOpenMonster} />}
            </dd>
          </div>
        </dl>
      </div>
    </header>

    {/* One box, read top to bottom in the order the rune was made: the main
        property it dropped for, the innate one it dropped with, and the sub
        properties that decide whether it is worth keeping. No headings — the
        three read for what they are by size and position alone. Divs rather
        than paragraphs: `.dialog p` outranks the type voices. */}
    <div className="overlay-body rune-overlay-body">
      <div className="rune-overlay-stats">
        <div className="rune-overlay-main" aria-label="Main property">
          {/* "HP +" and its kin are the flat stats; the plus goes on the figure. */}
          {statName(rune.mainStatId).replace(/ \+$/, '')} {rune.mainValue > 0 ? `+${figure(rune.mainValue)}` : '—'}
        </div>

        <div className="rune-overlay-innate" aria-label="Innate property">
          {rune.prefixStatId === null
            ? <span className="rune-sub-name">No innate</span>
            : <span className="rune-sub">
              <span className="rune-sub-name">{statName(rune.prefixStatId)}</span>
              <span className="rune-sub-value">{figure(rune.prefixValue)}</span>
            </span>}
        </div>

        {/* Four lines always, the ones not revealed yet left blank: the box is
            the same height for a fresh rune as for a finished one. */}
        <ul className="rune-overlay-subs" aria-label="Sub properties">
          {Array.from({ length: subPropertySlots }, (_, at) => {
            const property = rune.subProperties[at];
            if (property === undefined) return <li key={`unrevealed-${at}`} aria-hidden="true" />;
            return <RuneSubLine key={property.statId} as="li" property={property}
              name={statName(property.statId)} format={figure} />;
          })}
        </ul>
      </div>
    </div>
  </Overlay>;
}
