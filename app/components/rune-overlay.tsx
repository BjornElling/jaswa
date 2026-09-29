import { useMemo } from 'react';
import { AncientName } from './ancient-mark';
import { CircularArrowsMark } from './converted-artifact-mark';
import { MonsterLink } from './monster-link';
import type { MonsterReference, OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation } from '../lib/monster-catalog';
import { mainPropertyMaximum } from '../lib/rune-properties';
import { runeSetPieceCount } from '../lib/rune-sets';
import { runeStatName, runeSubValue } from '../lib/runes';
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
  const mainName = runeStatName(rune.mainStatId) ?? `Stat ${rune.mainStatId}`;
  const pieces = runeSetPieceCount[rune.setName];
  const facts = [
    `Slot ${rune.slot}`,
    `${rune.stars}★ ${rune.defaultGrade}`,
    `+${rune.level}`,
    pieces === undefined ? undefined : `${pieces}-piece set`,
  ].filter((fact): fact is string => fact !== undefined);

  return <Overlay labelledBy="rune-overlay-title" describedBy="rune-overlay-facts" className="rune-overlay" onClose={onClose}>
    <header className="overlay-head rune-overlay-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="overlay-identity">
        <p className="eyebrow">Rune</p>
        <h2 id="rune-overlay-title" className="overlay-hero-name">
          <AncientName name={rune.setName} ancient={rune.ancient} />
        </h2>
        <p id="rune-overlay-facts" className="overlay-hero-facts">{facts.join(' · ')}</p>
      </div>
      <div className="rune-overlay-wearer">
        <p className="overlay-row-label">{worn === null ? 'Location' : 'Worn by'}</p>
        {worn === null
          ? <p className="overlay-current-value">Inventory</p>
          : <MonsterLink target={worn.target} name={worn.name} portrait={{ imageFilename: worn.imageFilename, initial: worn.initial }}
            onOpen={onOpenMonster} />}
      </div>
    </header>

    <div className="overlay-body rune-overlay-body">
      <section className="rune-overlay-main" aria-labelledby="rune-overlay-main-title">
        <h3 id="rune-overlay-main-title" className="overlay-row-label">Main property</h3>
        <p className="rune-overlay-main-stat">
          <span className="rune-overlay-main-name">{mainName}</span>
          <span className="rune-overlay-main-value">{rune.mainValue > 0 ? figure(rune.mainValue) : '—'}</span>
        </p>
        <p className="rune-overlay-main-ceiling">At +15: {figure(mainPropertyMaximum(rune.stars, rune.mainStatId))}</p>

        <h3 className="overlay-row-label rune-overlay-innate-title">Innate property</h3>
        <p className="rune-overlay-line">
          {rune.prefixStatId === null
            ? <span className="rune-overlay-line-name overlay-empty">None</span>
            : <>
              <span className="rune-overlay-line-name">{runeStatName(rune.prefixStatId) ?? `Stat ${rune.prefixStatId}`}</span>
              <span className="rune-overlay-line-value">{figure(rune.prefixValue)}</span>
            </>}
        </p>
      </section>

      {/* The column heading names the block, so it carries no title of its own
          above a second row of headings saying the same thing. */}
      <table className="rune-overlay-sub-table" aria-label="Sub properties">
        <thead>
          <tr>
            <th scope="col">Sub properties</th>
            <th scope="col">Value</th>
            <th scope="col"><abbr title="Enchanted Gem">Gem</abbr></th>
            <th scope="col"><abbr title="Grindstone">Grind</abbr></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: subPropertySlots }, (_, at) => {
            const property = rune.subProperties[at];
            if (property === undefined) {
              return <tr key={`empty-${at}`} className="rune-overlay-sub-empty">
                <th scope="row">Not revealed yet</th><td>—</td><td /><td />
              </tr>;
            }
            const name = runeStatName(property.statId) ?? `Stat ${property.statId}`;
            return <tr key={property.statId}>
              <th scope="row">{name}</th>
              <td>{figure(runeSubValue(property))}</td>
              <td>{property.gemmed && <CircularArrowsMark label={`${name} came from an Enchanted Gem`} />}</td>
              <td>{property.grind > 0 ? `+${figure(property.grind)}` : ''}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </Overlay>;
}
