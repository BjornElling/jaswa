import { useEffect, useMemo, useState } from 'react';
import { AncientName } from './ancient-mark';
import { CircularArrowsMark } from './converted-artifact-mark';
import { MonsterLink } from './monster-link';
import type { MonsterReference, OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation } from '../lib/monster-catalog';
import { runeAdviceChannel } from '../lib/compute/rune-advice-client';
import { rememberedRuneAdvice, rememberRuneAdvice } from '../lib/compute/rune-advice-memory';
import { runeCraftSteps } from '../lib/rune-cleanup-advice';
import type { RuneAdvice, RuneCraftStep } from '../lib/rune-cleanup-advice';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import { lastSubPropertyLevel } from '../lib/rune-properties';
import { referenceLines } from '../lib/rune-reference-stats';
import { runeLineFigure, runeLineStat, runeStatName } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { GeneralSettings, RunePotentialSettings } from '../lib/types';

/**
 * One rune, as a record of what it is: its set and slot, its main and innate
 * properties, and its four sub properties with whatever craft already sits on
 * them — and, beside those, the craft its Max value assumes is still to come.
 *
 * That last column is not a projection of the overlay's own. It is Rune
 * Clean-up's verdict for this one rune, asked of the same engine with the same
 * settings, and it prints the line-up that verdict counted (`craftedLines`). A
 * rune's advice depends on nothing but itself, the presets and the reference
 * monsters, so asking about one rune gives the answer the table gives.
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

/**
 * What the Max stats column has to say, and why it says nothing where it does.
 * Below `+12` the lines are not final, so the engine names no craft (`craftedLines`
 * is `null` there) and neither does this.
 */
type MaxCraft =
  | { state: 'pending' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; steps: RuneCraftStep[]; presetName: string };

function craftOf(rune: Rune, advice: RuneAdvice | undefined): MaxCraft {
  return advice?.craftedLines && advice.preset
    ? { state: 'ready', steps: runeCraftSteps(rune, advice.craftedLines), presetName: advice.preset.name }
    : { state: 'unavailable', reason: 'No preset can use this rune' };
}

/** The overlay's own channel to the advice worker, so opening a rune never
    supersedes a Rune Clean-up calculation in flight. */
const overlayChannel = runeAdviceChannel();

/**
 * The verdict's craft for this rune: read from Rune Clean-up's newest answers when
 * they were calculated with these very inputs — at once, so the column paints with
 * the overlay — and otherwise asked of the worker, off the main thread, where the
 * one-rune calculation takes about a second.
 */
function useMaxCraft(rune: Rune, game: GameRecord | undefined, settings: RunePotentialSettings,
  presets: readonly RunePotentialPreset[], hardwareAcceleration: boolean): MaxCraft {
  const base = useMemo(() => {
    const lines = referenceLines(game);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);
  const blocked = rune.level < lastSubPropertyLevel ? `Decided at +${lastSubPropertyLevel}, when the sub properties are final`
    : game === undefined || base === null ? 'Needs a level 40 monster in the import'
      : presets.length === 0 ? 'Needs a Rune Clean-up preset' : null;
  const known = useMemo(
    () => (game === undefined ? undefined : rememberedRuneAdvice({ data: game, settings, presets }, rune)),
    [game, settings, presets, rune],
  );
  const [asked, setAsked] = useState<{ rune: Rune; craft: MaxCraft } | null>(null);
  useEffect(() => {
    if (blocked !== null || known !== undefined || game === undefined || base === null) return undefined;
    let current = true;
    void overlayChannel.calculate({ runes: [rune], presets, settings, base, preferWebGpu: hardwareAcceleration })
      .then((outcome) => {
        if (!current || outcome.status === 'superseded') return;
        if (outcome.status === 'failed') {
          setAsked({ rune, craft: { state: 'unavailable', reason: outcome.message } });
          return;
        }
        rememberRuneAdvice({ data: game, settings, presets }, [rune], outcome.advice);
        setAsked({ rune, craft: craftOf(rune, outcome.advice.get(rune.id)) });
      });
    return () => { current = false; };
  }, [rune, game, presets, settings, base, blocked, known, hardwareAcceleration]);
  /* Closing the overlay gives the worker back rather than finishing into a void. */
  useEffect(() => overlayChannel.cancel, []);
  if (blocked !== null) return { state: 'unavailable', reason: blocked };
  if (known !== undefined) return craftOf(rune, known);
  return asked?.rune === rune ? asked.craft : { state: 'pending' };
}

/** A Gem's id, what it rolled, and a stone's figure, written alike in every column that shows them.
    The id stands without a figure, so it is named as a kind — `HP %`, `HP +` — the
    way a filter names one, or the two HP lines would read alike. */
function CraftCell({ gemStatId, gemRoll, grind, statId, format }: {
  gemStatId: number | null;
  /** What a Gem already spent here rolled, its stone excluded; absent where none has been. */
  gemRoll?: number;
  grind: number; statId: number; format: (value: number) => string;
}) {
  const name = gemStatId === null ? null : runeStatName(gemStatId) ?? `Stat ${gemStatId}`;
  return <span className="rune-overlay-craft">
    {name !== null && <>
      <CircularArrowsMark label="Enchanted Gem to" className="rune-sub-gem" />
      <span>{name}</span>
      {gemRoll !== undefined && gemStatId !== null
        && <span className="rune-overlay-figure">{runeLineFigure(gemStatId, gemRoll, format)}</span>}
    </>}
    {grind > 0 && <span className="rune-overlay-figure">{runeLineFigure(gemStatId ?? statId, grind, format)}</span>}
  </span>;
}

export function RuneOverlay({ rune, game, general, settings, presets, hardwareAcceleration, onClose, onOpenMonster }: {
  rune: Rune;
  game: GameRecord | undefined;
  general: GeneralSettings;
  settings: RunePotentialSettings;
  presets: readonly RunePotentialPreset[];
  /** Whether the graphics card may count the odds, as for every other calculation. */
  hardwareAcceleration: boolean;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const worn = useMemo(() => wearer(rune, game), [rune, game]);
  const maxCraft = useMaxCraft(rune, game, settings, presets, hardwareAcceleration);
  const figure = (value: number) => formatNumber(value, general);
  const maxHeading = maxCraft.state === 'ready'
    ? `The Gem and Grindstones Max value counts, for ${maxCraft.presetName}`
    : maxCraft.state === 'unavailable' ? maxCraft.reason : 'Calculating';
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
          {runeLineStat(rune.mainStatId) ?? `Stat ${rune.mainStatId}`} {rune.mainValue > 0 ? runeLineFigure(rune.mainStatId, rune.mainValue, figure) : '—'}
        </div>

        <div className="rune-overlay-innate" aria-label="Innate property">
          {rune.prefixStatId === null
            ? <span className="rune-sub-name">No innate</span>
            : <RuneInnateLine statId={rune.prefixStatId} value={rune.prefixValue} format={figure} />}
        </div>

        {/* Four lines always, the ones not revealed yet left blank: the box is
            the same height for a fresh rune as for a finished one. The column
            heads sit in the clear line that sets the sub properties off, so the
            craft columns cost the box no height. Every column is fixed-width, so
            a filled cell and an empty one draw the same row. */}
        <table className="rune-overlay-subs" aria-label="Sub properties">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Sub property</span></th>
              <th scope="col">Grinds</th>
              <th scope="col">Gems</th>
              <th scope="col" title={maxHeading}>Max stats</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: subPropertySlots }, (_, at) => {
              const property = rune.subProperties[at];
              if (property === undefined) return <tr key={`unrevealed-${at}`} aria-hidden="true"><td /><td /><td /><td /></tr>;
              const step = maxCraft.state === 'ready' ? maxCraft.steps[at] : undefined;
              return <tr key={property.statId}>
                <td><RuneSubLine property={property} format={figure} /></td>
                <td><CraftCell gemStatId={null} grind={property.grind} statId={property.statId} format={figure} /></td>
                <td><CraftCell gemStatId={property.gemmed ? property.statId : null} gemRoll={property.value} grind={0} statId={property.statId} format={figure} /></td>
                <td title={maxCraft.state === 'unavailable' ? maxCraft.reason : undefined}>
                  {step
                    ? <CraftCell gemStatId={step.gemStatId} grind={step.grind} statId={property.statId} format={figure} />
                    : maxCraft.state === 'unavailable' && <span className="muted">—</span>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  </Overlay>;
}
