import { useEffect, useMemo, useState } from 'react';
import { AncientName } from './ancient-mark';
import { CircularArrowsMark } from './converted-artifact-mark';
import { MonsterLink } from './monster-link';
import type { MonsterReference, OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import { StarIcon } from './star-icon';
import { formatNumber } from '../lib/formatting';
import { runeChanceText } from '../lib/rune-cleanup-grid';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation } from '../lib/monster-catalog';
import { runeAdviceChannel } from '../lib/compute/rune-advice-client';
import { rememberedRuneAdvice, rememberRuneAdvice } from '../lib/compute/rune-advice-memory';
import { runeCraftSteps } from '../lib/rune-cleanup-advice';
import type { PresetReading, RuneAdvice, RuneCraftStep } from '../lib/rune-cleanup-advice';
import type { RunePotentialPreset } from '../lib/rune-potential-presets';
import { lastSubPropertyLevel } from '../lib/rune-properties';
import { referenceLines } from '../lib/rune-reference-stats';
import { runeLineFigure, runeLineStat, runeLineValue, runeStatName } from '../lib/runes';
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

/** Rune Clean-up's verdict on this rune with every preset's reading beside it. */
type Explained =
  | { state: 'pending' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; advice: RuneAdvice };

/** The overlay's own channel to the advice worker, so opening a rune never
    supersedes a Rune Clean-up calculation in flight. */
const overlayChannel = runeAdviceChannel();

/**
 * The verdict for this rune, explained: read from Rune Clean-up's newest answers
 * when they were calculated with these very inputs, and otherwise asked of the
 * worker, off the main thread, where the one-rune calculation takes about a second.
 *
 * The table's answers carry no per-preset readings — it asks about every rune at
 * once and would pay for nine expectations it never shows — so an answer from there
 * still paints the craft column at once while the explained one is asked for.
 */
function useRuneAdvice(rune: Rune, game: GameRecord | undefined, settings: RunePotentialSettings,
  presets: readonly RunePotentialPreset[], hardwareAcceleration: boolean,
): { known: RuneAdvice | undefined; explained: Explained } {
  const base = useMemo(() => {
    const lines = referenceLines(game);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);
  const blocked = game === undefined || base === null ? 'Needs a level 40 monster in the import'
    : presets.length === 0 ? 'Needs a Rune Clean-up preset' : null;
  const known = useMemo(
    () => (game === undefined ? undefined : rememberedRuneAdvice({ data: game, settings, presets }, rune)),
    [game, settings, presets, rune],
  );
  const [asked, setAsked] = useState<{ rune: Rune; explained: Explained } | null>(null);
  const settled = known?.readings != null;
  useEffect(() => {
    if (blocked !== null || settled || game === undefined || base === null) return undefined;
    let current = true;
    void overlayChannel.calculate({ runes: [rune], presets, settings, base, preferWebGpu: hardwareAcceleration, explain: true })
      .then((outcome) => {
        if (!current || outcome.status === 'superseded') return;
        if (outcome.status === 'failed') {
          setAsked({ rune, explained: { state: 'unavailable', reason: outcome.message } });
          return;
        }
        rememberRuneAdvice({ data: game, settings, presets }, [rune], outcome.advice);
        const advice = outcome.advice.get(rune.id);
        setAsked({ rune, explained: advice ? { state: 'ready', advice } : { state: 'unavailable', reason: 'No preset can use this rune' } });
      });
    return () => { current = false; };
  }, [rune, game, presets, settings, base, blocked, settled, hardwareAcceleration]);
  /* Closing the overlay gives the worker back rather than finishing into a void. */
  useEffect(() => overlayChannel.cancel, []);
  if (blocked !== null) return { known: undefined, explained: { state: 'unavailable', reason: blocked } };
  if (settled) return { known, explained: { state: 'ready', advice: known } };
  return { known, explained: asked?.rune === rune ? asked.explained : { state: 'pending' } };
}

/** Below `+12` the lines are not final, so no craft is named yet, whatever the verdict says. */
function maxCraftOf(rune: Rune, known: RuneAdvice | undefined, explained: Explained): MaxCraft {
  if (rune.level < lastSubPropertyLevel) {
    return { state: 'unavailable', reason: `Decided at +${lastSubPropertyLevel}, when the sub properties are final` };
  }
  if (explained.state === 'ready') return craftOf(rune, explained.advice);
  if (known !== undefined) return craftOf(rune, known);
  return explained;
}

/** A fraction as a percentage to one decimal — finer than the table's whole points,
    because here a Max value sits beside the cutoff it has to reach, and `74 %` against
    `74 %` beside a Sell would explain nothing. */
const tenths = (fraction: number) => `${(fraction * 100).toFixed(1)} %`;

/**
 * The presets in the order Best preset is decided in: the readings that clear both
 * gates before those that do not, then by average worth at +15, then Max value — so
 * the starred row leads and no row above it can carry a higher average. The one
 * exception is Broken = No, where a preset that reads the rune only as broken is
 * listed by its figures but never chosen. Presets that cannot read the rune close
 * the list in their own order.
 */
function ranked(presets: readonly RunePotentialPreset[], readings: ReadonlyMap<string, PresetReading>) {
  return [...presets].sort((left, right) => {
    const a = readings.get(left.id);
    const b = readings.get(right.id);
    if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
    return Number(b.cleared) - Number(a.cleared) || b.expected - a.expected || b.maxValue - a.maxValue;
  });
}

/**
 * **Why Best preset is the preset it is**, and what the floor asked of it.
 *
 * Every preset gets a row whether or not it can read the rune, and every row is
 * drawn while the answer is still on its way, so the box has one height from the
 * first paint to the last. The best row is set apart by ink and a star, never by
 * weight, so marking it moves nothing (`AGENTS.md` §2).
 */
function Evaluation({ rune, presets, explained }: {
  rune: Rune; presets: readonly RunePotentialPreset[]; explained: Explained;
}) {
  const advice = explained.state === 'ready' ? explained.advice : undefined;
  const readings = new Map((advice?.readings ?? []).map((reading) => [reading.presetId, reading]));
  const chosen = advice?.preset ?? null;
  const placeholder = explained.state === 'pending' ? 'Calculating'
    : explained.state === 'unavailable' ? explained.reason : '—';
  /* A rune at +12 has no odds left to quote; the Rune Clean-up table prints a dash there too. */
  const oddsLeft = rune.level < lastSubPropertyLevel;
  const facts = [
    { label: 'Best preset for this rune', value: chosen?.name ?? placeholder },
    { label: 'Based on the Rune quality floor, the rune must be among the best', value: chosen && advice ? tenths(advice.floorShare) : '—' },
    /* A floor that lets the whole box through has no cutoff to state, and says so
       rather than printing the unbounded figure behind it. */
    { label: 'This equals a Max value cutoff of', value: !chosen || !advice ? '—'
      : Number.isFinite(advice.floorMaxValue) ? tenths(advice.floorMaxValue) : 'None' },
  ];
  return <section className="rune-overlay-evaluation" aria-labelledby="rune-overlay-evaluation-title">
    <h3 id="rune-overlay-evaluation-title" className="overlay-block-title">Evaluation</h3>
    <dl className="rune-overlay-evaluation-facts">
      {facts.map((fact) => <div key={fact.label}>
        <dt>{fact.label}</dt>
        <dd>{fact.value}</dd>
      </div>)}
    </dl>
    <table className="rune-overlay-readings" aria-label="Every preset's reading">
      <thead>
        <tr>
          <th scope="col">Preset</th>
          <th scope="col">Max value</th>
          <th scope="col">Chance</th>
          <th scope="col" title="What the rune is worth on average once levelled to +15, against a perfect rune — the figure Best preset is chosen on">Avg. at +15</th>
          <th scope="col">Best</th>
        </tr>
      </thead>
      <tbody>
        {ranked(presets, readings).map((preset) => {
          const reading = readings.get(preset.id);
          const best = chosen?.id === preset.id;
          return <tr key={preset.id} data-best={best || undefined} aria-current={best ? 'true' : undefined}>
            <th scope="row" title={preset.name}>{preset.name}</th>
            <td>{reading ? tenths(reading.maxValue) : '—'}</td>
            <td>{reading && oddsLeft ? runeChanceText(reading.chance) : '—'}</td>
            <td>{reading ? tenths(reading.expected) : '—'}</td>
            <td>{best && <StarIcon className="rune-overlay-best-mark" label="Best preset" />}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </section>;
}

/** A Gem's id, what it rolled, and a stone's figure, written alike in every column that shows them.
    The id stands without a figure, so it is named as a kind — `HP %`, `HP +` — the
    way a filter names one, or the two HP lines would read alike. */
function CraftCell({ gemStatId, gemRoll, grind, statId, format }: {
  gemStatId: number | null;
  /** What the Gem here rolled — or, in Max stats, is counted to roll — its stone
      excluded and printed after it; absent where no Gem is named. */
  gemRoll?: number;
  grind: number; statId: number; format: (value: number) => string;
}) {
  const name = gemStatId === null ? null : runeStatName(gemStatId) ?? `Stat ${gemStatId}`;
  return <span className="rune-overlay-craft">
    {name !== null && <>
      <CircularArrowsMark label="Enchanted Gem to" className="rune-sub-gem" />
      <span>{name}</span>
      {gemRoll !== undefined && gemStatId !== null
        && <span className="rune-overlay-figure">{runeLineValue(gemStatId, gemRoll, format)}</span>}
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
  const { known, explained } = useRuneAdvice(rune, game, settings, presets, hardwareAcceleration);
  const maxCraft = maxCraftOf(rune, known, explained);
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
                    ? <CraftCell gemStatId={step.gemStatId} gemRoll={step.gemValue ?? undefined} grind={step.grind} statId={property.statId} format={figure} />
                    : maxCraft.state === 'unavailable' && <span className="muted">—</span>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <Evaluation rune={rune} presets={presets} explained={explained} />
    </div>
  </Overlay>;
}
