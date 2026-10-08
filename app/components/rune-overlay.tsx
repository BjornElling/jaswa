import { useEffect, useMemo, useState } from 'react';
import { AncientName } from './ancient-mark';
import { CircularArrowsMark } from './converted-artifact-mark';
import { EngravedPlace } from './engraved-place';
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
import { engravingLines } from '../lib/presets';
import { usePresets } from '../lib/presets-context';
import { runeAdviceChannel } from '../lib/compute/rune-advice-client';
import { rememberedRuneAdvice, rememberRuneAdvice } from '../lib/compute/rune-advice-memory';
import { runeCraftSteps } from '../lib/rune-cleanup-advice';
import type { RoleReading, RuneAdvice, RuneCraftStep } from '../lib/rune-cleanup-advice';
import type { MatchRank } from '../lib/rune-cleanup-model';
import { canLockRune } from '../lib/rune-holds';
import type { RuneHold } from '../lib/rune-holds';
import { runeLockLabels } from '../lib/rune-locks';
import type { RuneRole } from '../lib/rune-roles';
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
 * rune's advice depends on nothing but itself, the roles and the reference
 * monsters, so asking about one rune gives the answer the table gives.
 */

/** A rune carries at most four sub properties; the list always reserves all
    four, so a rune with two does not make a shorter panel than one with four. */
const subPropertySlots = 4;

/** A monster the rune is engraved on, as a way into its own overlay. One this
    import does not contain is named as such and opens nothing. */
function engravedOn(unitId: string, game: GameRecord | undefined): {
  target: MonsterReference | null; name: string; imageFilename?: string; initial: string;
} {
  const units = Array.isArray(game?.unit_list) ? game.unit_list as GameRecord[] : [];
  const unit = units.find((entry) => String(entry.unit_id) === unitId);
  if (unit === undefined) return { target: null, name: 'Monster not in this import', initial: '?' };
  const display = monsterPresentation(unit.unit_master_id);
  return {
    target: { kind: 'copy', unitId, masterId: String(unit.unit_master_id) },
    name: display.name,
    imageFilename: display.imageFilename,
    initial: display.shortName,
  };
}

/**
 * What the Improvements column has to say, and why it says nothing where it does.
 * Below `+12` it names the stones alone: a Grindstone may go on at any level, a Gem
 * only from `+12`, and the engine's `craftedLines` already holds exactly that.
 */
type MaxCraft =
  | { state: 'pending' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; steps: RuneCraftStep[]; roleName: string };

function craftOf(rune: Rune, advice: RuneAdvice | undefined): MaxCraft {
  return advice?.craftedLines && advice.role
    ? { state: 'ready', steps: runeCraftSteps(rune, advice.craftedLines), roleName: advice.role.name }
    : { state: 'unavailable', reason: 'No role can use this rune' };
}

/** Rune Clean-up's verdict on this rune with every role's reading beside it. */
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
 * The table's answers carry no per-role readings — it asks about every rune at
 * once and would pay for nine expectations it never shows — so an answer from there
 * still paints the craft column at once while the explained one is asked for.
 */
function useRuneAdvice(rune: Rune, game: GameRecord | undefined, settings: RunePotentialSettings,
  roles: readonly RuneRole[], hardwareAcceleration: boolean,
): { known: RuneAdvice | undefined; explained: Explained } {
  const base = useMemo(() => {
    const lines = referenceLines(game);
    return lines === null ? null : new Map([...lines].map(([type, line]) => [type, line.stats]));
  }, [game]);
  const blocked = game === undefined || base === null ? 'Needs a level 40 monster in the import'
    : roles.length === 0 ? 'Needs a Rune Clean-up role' : null;
  const known = useMemo(
    () => (game === undefined ? undefined : rememberedRuneAdvice({ data: game, settings, roles }, rune)),
    [game, settings, roles, rune],
  );
  const [asked, setAsked] = useState<{ rune: Rune; explained: Explained } | null>(null);
  const settled = known?.readings != null;
  useEffect(() => {
    if (blocked !== null || settled || game === undefined || base === null) return undefined;
    let current = true;
    void overlayChannel.calculate({ runes: [rune], roles, settings, base, preferWebGpu: hardwareAcceleration, explain: true })
      .then((outcome) => {
        if (!current || outcome.status === 'superseded') return;
        if (outcome.status === 'failed') {
          setAsked({ rune, explained: { state: 'unavailable', reason: outcome.message } });
          return;
        }
        rememberRuneAdvice({ data: game, settings, roles }, [rune], outcome.advice);
        const advice = outcome.advice.get(rune.id);
        setAsked({ rune, explained: advice ? { state: 'ready', advice } : { state: 'unavailable', reason: 'No role can use this rune' } });
      });
    return () => { current = false; };
  }, [rune, game, roles, settings, base, blocked, settled, hardwareAcceleration]);
  /* Closing the overlay gives the worker back rather than finishing into a void. */
  useEffect(() => overlayChannel.cancel, []);
  if (blocked !== null) return { known: undefined, explained: { state: 'unavailable', reason: blocked } };
  if (settled) return { known, explained: { state: 'ready', advice: known } };
  return { known, explained: asked?.rune === rune ? asked.explained : { state: 'pending' } };
}

function maxCraftOf(known: RuneAdvice | undefined, explained: Explained, rune: Rune): MaxCraft {
  if (explained.state === 'ready') return craftOf(rune, explained.advice);
  if (known !== undefined) return craftOf(rune, known);
  return explained;
}

/** A fraction as a percentage to one decimal — finer than the table's whole points,
    because here a Max value sits beside the cutoff it has to reach, and `74 %` against
    `74 %` beside a Sell would explain nothing. */
const tenths = (fraction: number) => `${(fraction * 100).toFixed(1)} %`;

/** How the rune's set and main answer Best role, in the words the role editor uses. */
const suitabilityLabels: Record<MatchRank, string> = { preferred: 'Preferred', acceptable: 'Accepted', broken: 'Broken' };

/**
 * A preferred rune gets a tick and an accepted one a ring: two shapes rather than
 * one shape in two tones, so the difference survives a glance, and the ring is also
 * dimmed, the house's device for acceptable against preferred. A rune the role
 * names neither way gets nothing: a blank cell is quicker to read past than a third mark.
 */
function MatchMark({ rank }: { rank: MatchRank }) {
  if (rank === 'broken') return null;
  const preferred = rank === 'preferred';
  const label = preferred ? 'Preferred' : 'Accepted';
  return <svg className="rune-overlay-match-mark" data-rank={rank} viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
    <title>{label}</title>
    {preferred ? <path d="M3.5 8.5 6.5 11.5 12.5 4.5" /> : <circle cx="8" cy="8" r="4" />}
  </svg>;
}

/**
 * The roles in the order Best role is decided in: the readings that clear both
 * gates before those that do not, then by average worth at +15, then Max value — so
 * the starred row leads and no row above it can carry a higher average. The one
 * exception is Broken = No, where a role that reads the rune only as broken is
 * listed by its figures but never chosen. Roles that cannot read the rune close
 * the list in their own order.
 */
function ranked(roles: readonly RuneRole[], readings: ReadonlyMap<string, RoleReading>) {
  return [...roles].sort((left, right) => {
    const a = readings.get(left.id);
    const b = readings.get(right.id);
    if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
    return Number(b.cleared) - Number(a.cleared) || b.expected - a.expected || b.maxValue - a.maxValue;
  });
}

/**
 * **Why Best role is the role it is**, and what the floor asked of it.
 *
 * Every role gets a row whether or not it can read the rune, and every row is
 * drawn while the answer is still on its way, so the box has one height from the
 * first paint to the last. The best row is set apart by ink and a star, never by
 * weight, so marking it moves nothing (`AGENTS.md` §2).
 */
function Evaluation({ rune, roles, explained }: {
  rune: Rune; roles: readonly RuneRole[]; explained: Explained;
}) {
  const advice = explained.state === 'ready' ? explained.advice : undefined;
  const readings = new Map((advice?.readings ?? []).map((reading) => [reading.roleId, reading]));
  const chosen = advice?.role ?? null;
  const placeholder = explained.state === 'pending' ? 'Calculating'
    : explained.state === 'unavailable' ? explained.reason : '—';
  /* A rune at +12 has no odds left to quote; the Rune Clean-up table prints a dash there too. */
  const oddsLeft = rune.level < lastSubPropertyLevel;
  const facts = [
    { label: 'Best role for this rune', value: chosen?.name ?? placeholder },
    { label: 'Rune set and main stat desirability for this role', value: chosen && advice ? suitabilityLabels[advice.rank] : '—' },
    /* The floor and its cutoff are one statement, set a step apart from which role
       it is and how well the rune suits it. */
    { label: 'Based on the Rune quality floor, the rune must be among the best', value: chosen && advice ? tenths(advice.floorShare) : '—', opensGroup: true },
    /* A floor that lets the whole box through has no cutoff to state, and says so
       rather than printing the unbounded figure behind it. */
    { label: 'This equals a Max value cutoff of', value: !chosen || !advice ? '—'
      : Number.isFinite(advice.floorMaxValue) ? tenths(advice.floorMaxValue) : 'None' },
  ];
  return <section className="rune-overlay-evaluation" aria-labelledby="rune-overlay-evaluation-title">
    <h3 id="rune-overlay-evaluation-title" className="overlay-block-title">Evaluation</h3>
    <dl className="rune-overlay-evaluation-facts">
      {facts.map((fact) => <div key={fact.label} data-opens-group={('opensGroup' in fact) || undefined}>
        <dt>{fact.label}</dt>
        <dd>{fact.value}</dd>
      </div>)}
    </dl>
    <table className="rune-overlay-readings" aria-label="Every role's reading">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col" title="How the rune's set and main property answer the role: a tick where it prefers both, a ring where it only accepts one or both, nothing where it asked for neither">Match</th>
          <th scope="col">Max value</th>
          <th scope="col">Chance</th>
          <th scope="col" title="What the rune is worth on average once levelled to +15, against a perfect rune — the figure Best role is chosen on">Avg. at +15</th>
          <th scope="col">Best</th>
        </tr>
      </thead>
      <tbody>
        {ranked(roles, readings).map((role) => {
          const reading = readings.get(role.id);
          const best = chosen?.id === role.id;
          return <tr key={role.id} data-best={best || undefined} aria-current={best ? 'true' : undefined}>
            <th scope="row" title={role.name}>{role.name}</th>
            <td>{reading && <MatchMark rank={reading.rank} />}</td>
            <td>{reading ? tenths(reading.maxValue) : '—'}</td>
            <td>{reading && oddsLeft ? runeChanceText(reading.chance) : '—'}</td>
            <td>{reading ? tenths(reading.expected) : '—'}</td>
            <td>{best && <StarIcon className="rune-overlay-best-mark" label="Best role" />}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </section>;
}

/**
 * **The user's own word on the rune**, which Rune Clean-up prints over its advice
 * and files under Keep. Stored by `rune_id`, so no import and no live sync resets it.
 *
 * The lock is the one every Lock control sets (`rune-locks.ts`), here for the
 * rune's monster in Default, so a rune on no monster there cannot take one. Like
 * every lock it lasts until the next import and is off while synchronized.
 */
function Instructions({ rune, hold, onHold, locked, canLock, onLock }: {
  rune: Rune;
  hold: RuneHold | undefined;
  onHold: (next: RuneHold) => void;
  locked: boolean;
  canLock: boolean;
  onLock: (on: boolean) => Promise<void>;
}) {
  const lockable = canLock && canLockRune(rune);
  /* The box shows the choice from the click on, while it is being saved. */
  const [saving, setSaving] = useState<boolean | null>(null);
  const change = (key: keyof RuneHold, on: boolean) => {
    const next: RuneHold = { ...hold };
    if (on) next[key] = true; else delete next[key];
    onHold(next);
  };
  /* A click while one is saving is let go rather than the box disabled: disabling the
     box under the pointer drops its focus, and Escape with it. */
  const lock = (on: boolean) => {
    if (saving !== null) return;
    setSaving(on);
    /* A failed save is reported by the page; the box goes back to saying what is stored. */
    void onLock(on).catch(() => undefined).finally(() => setSaving(null));
  };
  return <section className="rune-overlay-hold" aria-labelledby="rune-overlay-hold-title">
    <h3 id="rune-overlay-hold-title" className="overlay-block-title">Instructions</h3>
    <div className="rune-overlay-hold-choices">
      <label className="checkbox-row">
        <input type="checkbox" checked={hold?.unsellable === true} onChange={(event) => change('unsellable', event.target.checked)} />
        <span>Unsellable</span>
      </label>
      <label className="checkbox-row" data-disabled={!lockable || undefined}
        title={!canLock ? 'Locks are off while JASWA is synchronized with the game'
          : lockable ? 'Keeps it on its monster in Default until the next import' : 'Only a rune on a monster in Default can be locked to it'}>
        <input type="checkbox" checked={saving ?? locked} disabled={!lockable} aria-busy={saving !== null || undefined} onChange={(event) => lock(event.target.checked)} />
        {/* It locks a rune to the monster it is on, which moves nothing. */}
        <span>{runeLockLabels.locked.onMonster}</span>
      </label>
    </div>
  </section>;
}

/** A Gem's id, what it rolled, and a stone's figure, written alike in every column that shows them.
    The id stands without a figure, so it is named as a kind — `HP %`, `HP +` — the
    way a filter names one, or the two HP lines would read alike. The Gem's mark
    follows its value, where the sub property column and the game put it. */
function CraftCell({ gemStatId, gemRoll, grind, statId, format }: {
  gemStatId: number | null;
  /** What the Gem here rolled — or, in Improvements, is counted to roll — its stone
      excluded and printed after it; absent where no Gem is named. */
  gemRoll?: number;
  grind: number; statId: number; format: (value: number) => string;
}) {
  const name = gemStatId === null ? null : runeStatName(gemStatId) ?? `Stat ${gemStatId}`;
  return <span className="rune-overlay-craft">
    {name !== null && <>
      <span>{name}</span>
      {gemRoll !== undefined && gemStatId !== null
        && <span className="rune-overlay-figure">{runeLineValue(gemStatId, gemRoll, format)}</span>}
      <CircularArrowsMark label={`${name} from an Enchanted Gem`} className="rune-sub-gem" />
    </>}
    {grind > 0 && <span className="rune-overlay-figure">{runeLineFigure(gemStatId ?? statId, grind, format)}</span>}
  </span>;
}

export function RuneOverlay({ rune, game, general, settings, roles, hardwareAcceleration, hold, onHold, locked, canLock, onLock, onClose, onOpenMonster }: {
  rune: Rune;
  game: GameRecord | undefined;
  general: GeneralSettings;
  settings: RunePotentialSettings;
  roles: readonly RuneRole[];
  /** Whether the graphics card may count the odds, as for every other calculation. */
  hardwareAcceleration: boolean;
  hold: RuneHold | undefined;
  /** Absent for a rune the account does not own — a simulated one has nothing to hold. */
  onHold?: (runeId: string, next: RuneHold) => void;
  /** Whether the rune is locked to its monster in Default (`rune-locks.ts`). */
  locked: boolean;
  /** Whether locks may change: not while JASWA is synchronized with the game. */
  canLock: boolean;
  onLock: (runeId: string, unitId: string, on: boolean) => Promise<void>;
  onClose: () => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  /* Every place the rune is engraved. One place is named and opens its
     monster; more are counted, and named on hover. */
  const placements = usePresets();
  const places = useMemo(() => placements.runes.get(rune.id) ?? [], [placements, rune.id]);
  const engraved = useMemo(() => (places.length === 1 ? engravedOn(places[0].unitId, game) : null), [places, game]);
  const monsterName = (unitId: string) => engravedOn(unitId, game).name;
  const { known, explained } = useRuneAdvice(rune, game, settings, roles, hardwareAcceleration);
  const maxCraft = maxCraftOf(known, explained, rune);
  const figure = (value: number) => formatNumber(value, general);
  const maxHeading = maxCraft.state === 'ready'
    ? rune.level >= lastSubPropertyLevel
      ? `The Gem and Grindstones Max value counts, for ${maxCraft.roleName}`
      : `The Grindstones Max value counts, for ${maxCraft.roleName}. The Gem is decided at +${lastSubPropertyLevel}, when a Gem becomes legal`
    : maxCraft.state === 'unavailable' ? maxCraft.reason : 'Calculating';
  const facts = [
    { label: 'Slot', value: String(rune.slot) },
    { label: 'Grade', value: `${rune.stars}★` },
    { label: 'Quality', value: rune.defaultGrade },
    { label: 'Level', value: `+${rune.level}` },
  ];

  return <Overlay labelledBy="rune-overlay-title" describedBy="rune-overlay-facts" className="rune-overlay" onClose={onClose}>
    <header className="overlay-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="overlay-identity">
        <h2 id="rune-overlay-title" className="overlay-hero-name">
          <AncientName name={rune.setName} ancient={rune.ancient} />
        </h2>
        {/* Location is the last fact in the same row, pushed to the far end: its
            label reads on the line the other labels read on, and its value on
            theirs. Gold where it is a monster, because there it is also the way
            into that monster; plain white where it is the inventory, a fact with
            nowhere to go. */}
        <dl id="rune-overlay-facts" className="overlay-facts">
          {facts.map((fact) => <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>)}
          <div className="rune-overlay-location">
            <dt>Location</dt>
            <dd>
              {engraved === null
                ? <EngravedPlace places={places} presets={placements.presets} monsterName={monsterName} />
                : <span title={engravingLines(places, placements.presets, monsterName).join('\n')}>
                  <MonsterLink target={engraved.target} name={engraved.name} portrait={{ imageFilename: engraved.imageFilename, initial: engraved.initial }}
                    presetId={places[0].presetId} onOpen={onOpenMonster} />
                </span>}
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
              <th scope="col" title={maxHeading}>Improvements</th>
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

      {onHold && <Instructions rune={rune} hold={hold} onHold={(next) => onHold(rune.id, next)}
        locked={locked} canLock={canLock} onLock={(on) => rune.occupiedId === null ? Promise.resolve() : onLock(rune.id, rune.occupiedId, on)} />}

      <Evaluation rune={rune} roles={roles} explained={explained} />
    </div>
  </Overlay>;
}
