import { useEffect, useMemo, useState } from 'react';
import { AncientName } from '../../ui/gear/ancient-mark';
import { CircularArrowsMark } from '../../ui/gear/converted-artifact-mark';
import { EngravedPlace } from '../../ui/gear/engraved-place';
import { Overlay } from '../../ui/overlay';
import { RuneEmblem } from '../../ui/gear/rune-emblem';
import { RuneInnateLine, RuneSubLine } from '../../ui/gear/rune-sub-line';
import { StarIcon } from '../../ui/star-icon';
import { formatNumber } from '../../domain/shared/formatting';
import { runeChanceShown, runeChanceText } from '../../domain/runes/cleanup/rune-cleanup-grid';
import type { AccountSnapshot } from '../../domain/account/account-snapshot';
import type { GameRecord } from '../../domain/account/game-record';
import { monsterCopyNamesIn } from '../../domain/monsters/monster-names';
import { usePresets } from '../../ui/presets-context';
import { runeAdviceChannel } from '../../workspace/jobs/rune-advice-client';
import { rememberedRuneAdvice, rememberRuneAdvice } from '../../workspace/jobs/rune-advice-memory';
import { runeCalculationKey } from '../../domain/runes/rune-calculation-inputs';
import { runeAdviceKey } from '../../domain/runes/cleanup/rune-cleanup-refresh';
import { qualityAllowances, runeCraftSteps, runeQualityText } from '../../domain/runes/cleanup/rune-cleanup-advice';
import type { RoleReading, RuneAdvice, RuneCraftStep } from '../../domain/runes/cleanup/rune-cleanup-advice';
import type { MatchRank } from '../../domain/runes/cleanup/rune-cleanup-model';
import { canLockRune } from '../../domain/profiles/rune-holds';
import { emptyRunePlacement } from '../../domain/placements/rune-placement';
import type { MonsterPreferences } from '../../domain/profiles/monster-preferences';
import type { RuneHold } from '../../domain/profiles/rune-holds';
import { runeLockLabels } from '../../domain/placements/rune-locks';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import { lastSubPropertyLevel } from '../../domain/runes/rune-properties';
import { referenceLines } from '../../domain/reference/rune-reference-stats';
import { runeLineFigure, runeLineStat, runeLineValue, runeStatName } from '../../domain/runes/runes';
import type { Rune } from '../../domain/runes/runes';
import type { GeneralSettings, RunePotentialSettings } from '../../domain/model';

/**
 * One rune, as a record of what it is: its set and slot, its main and innate
 * properties, and its four sub properties with whatever craft already sits on
 * them — and, beside those, the craft its Potential assumes is still to come.
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
  const key = JSON.stringify([runeCalculationKey({ roles, settings, base }), runeAdviceKey(rune)]);
  const [asked, setAsked] = useState<{ key: string; explained: Explained } | null>(null);
  const settled = known?.readings != null || known?.verdict === 'unavailable';
  useEffect(() => {
    if (blocked !== null || settled || game === undefined || base === null) return undefined;
    let current = true;
    void overlayChannel.calculate({ runes: [rune], roles, settings, base, preferWebGpu: hardwareAcceleration, explain: true })
      .then((outcome) => {
        if (!current || outcome.status === 'superseded') return;
        if (outcome.status === 'failed') {
          setAsked({ key, explained: { state: 'unavailable', reason: outcome.message } });
          return;
        }
        rememberRuneAdvice({ data: game, settings, roles }, [rune], outcome.advice);
        const advice = outcome.advice.get(rune.id);
        setAsked({ key, explained: advice ? { state: 'ready', advice } : { state: 'unavailable', reason: 'No role can use this rune' } });
      });
    return () => { current = false; };
  }, [key, rune, game, roles, settings, base, blocked, settled, hardwareAcceleration]);
  /* Closing the overlay gives the worker back rather than finishing into a void. */
  useEffect(() => overlayChannel.cancel, []);
  if (blocked !== null) return { known: undefined, explained: { state: 'unavailable', reason: blocked } };
  if (settled) return { known, explained: known.verdict === 'unavailable'
    ? { state: 'unavailable', reason: known.reason }
    : { state: 'ready', advice: known } };
  return { known, explained: asked?.key === key ? asked.explained : { state: 'pending' } };
}

function maxCraftOf(known: RuneAdvice | undefined, explained: Explained, rune: Rune): MaxCraft {
  if (explained.state === 'ready') return craftOf(rune, explained.advice);
  if (known !== undefined) return craftOf(rune, known);
  return explained;
}

/** A fraction as a percentage to one decimal — finer than the table's whole points,
    because here Potential sits beside the cutoff it has to reach, and `74 %` against
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
 * gates before those that do not, then by average worth at +15, then Potential — so
 * the starred row leads and no row above it can carry a higher average. The average
 * itself is not printed: it decides the order, and the order is what it means. The one
 * exception is Broken = No, where a role that reads the rune only as broken is
 * listed by its figures but never chosen. Roles that cannot read the rune close
 * the list in their own order.
 */
function ranked(roles: readonly RuneRole[], readings: ReadonlyMap<string, RoleReading>, best: string | undefined) {
  return [...roles].sort((left, right) => {
    if (left.id === best || right.id === best) return Number(right.id === best) - Number(left.id === best);
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
function Evaluation({ rune, roles, explained, quality }: {
  rune: Rune; roles: readonly RuneRole[]; explained: Explained; quality: number;
}) {
  const advice = explained.state === 'ready' ? explained.advice : undefined;
  const readings = new Map((advice?.readings ?? []).map((reading) => [reading.roleId, reading]));
  const chosen = advice?.role ?? null;
  /* While the answer is on its way the main line says so; here it is simply not known yet. */
  const placeholder = explained.state === 'unavailable' ? explained.reason : '—';
  /* A rune at +12 has no odds left to quote; the Rune Clean-up table prints a dash there too. */
  const oddsLeft = rune.level < lastSubPropertyLevel;
  const facts = [
    { label: 'Best role for this rune', value: chosen?.name ?? placeholder },
    { label: 'Rune set and main stat desirability for this role', value: chosen && advice ? suitabilityLabels[advice.rank] : '—' },
    { label: 'Selected Rune quality floor', value: runeQualityText(null, qualityAllowances[quality - 1], true) },
    { label: 'Required quality for this rune', value: runeQualityText(null, advice?.requirement ?? null, true) },
    { label: 'Quality of this rune', value: runeQualityText(advice?.qualityShare ?? null, advice?.requirement ?? null) },
    { label: 'Chance across roles', value: advice && runeChanceShown({ advice, rune }) ? runeChanceText(advice.chance) : '—' },
  ];
  return <section className="rune-overlay-evaluation" aria-labelledby="rune-overlay-evaluation-title">
    <h3 id="rune-overlay-evaluation-title" className="overlay-block-title">Evaluation</h3>
    <dl className="rune-overlay-evaluation-facts">
      {facts.map((fact) => <div key={fact.label}>
        <dt>{fact.label}</dt>
        <dd>{fact.value}</dd>
      </div>)}
    </dl>
    <table className="rune-overlay-readings" aria-label="Every role's reading">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col" title="How the rune's set and main property answer the role: a tick where it prefers both, a ring where it only accepts one or both, nothing where it asked for neither">Match</th>
          <th scope="col" className="rune-overlay-quality" title="Top share at the best reachable +15 score">Quality</th>
          <th scope="col">Potential</th>
          <th scope="col">Chance</th>
          <th scope="col">Best</th>
        </tr>
      </thead>
      <tbody>
        {ranked(roles, readings, chosen?.id).map((role) => {
          const reading = readings.get(role.id);
          const best = chosen?.id === role.id;
          return <tr key={role.id} data-best={best || undefined} aria-current={best ? 'true' : undefined}>
            <th scope="row" title={role.name}>{role.name}</th>
            <td>{reading && <MatchMark rank={reading.rank} />}</td>
            <td>{runeQualityText(reading?.qualityShare ?? null, reading?.requirement ?? null)}</td>
            <td>{reading?.chance != null ? tenths(reading.maxValue) : '—'}</td>
            <td title={reading?.reachable === false ? 'Quality bar is unreachable' : reading?.chance === 0 ? 'Zero hits in the sample' : undefined}>
              {reading?.chance != null && oddsLeft ? runeChanceText(reading.chance) : '—'}
            </td>
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
 * rune's monster in Scenario, so a rune on no monster there cannot take one. It
 * moves nothing, so live sync leaves it on too.
 */
function Instructions({ rune, hold, onHold, locked, onLock }: {
  rune: Rune;
  hold: RuneHold | undefined;
  onHold: (next: RuneHold) => void;
  locked: boolean;
  onLock: (on: boolean) => Promise<void>;
}) {
  const lockable = canLockRune(rune);
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
        title={lockable ? 'Keeps it on its monster in Scenario until the next import' : 'Only a rune on a monster in Scenario can be locked to it'}>
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

/** A gold turning arc and the word, for as long as the worker is still answering. */
function BusyMark({ busy }: { busy: boolean }) {
  return <span className="rune-overlay-busy" data-busy={busy || undefined} aria-hidden={!busy || undefined}>
    <svg className="busy-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" aria-hidden="true">
      <path d="M8 2a6 6 0 1 1-6 6" />
    </svg>
    Calculating…
  </span>;
}

export function RuneOverlay({ rune, game, snapshot, profiles, general, settings, roles, hardwareAcceleration, hold, onHold, locked, onLock, onClose }: {
  rune: Rune;
  game: GameRecord | undefined;
  snapshot: AccountSnapshot | undefined;
  profiles: MonsterPreferences;
  general: GeneralSettings;
  settings: RunePotentialSettings;
  roles: readonly RuneRole[];
  /** Whether the graphics card may count the odds, as for every other calculation. */
  hardwareAcceleration: boolean;
  hold: RuneHold | undefined;
  /** Absent for a rune the account does not own — a simulated one has nothing to hold. */
  onHold?: (runeId: string, next: RuneHold) => void;
  /** Whether the rune is locked to its monster in Scenario (`rune-locks.ts`). */
  locked: boolean;
  onLock: (runeId: string, unitId: string, on: boolean) => Promise<void>;
  onClose: () => void;
}) {
  /* Every location reader takes the same Scenario-first summary. */
  const placements = usePresets();
  const placement = useMemo(() => placements.runes.get(rune.id) ?? emptyRunePlacement, [placements, rune.id]);
  const namesIn = useMemo(() => {
    const units = snapshot?.monsters.map((entry) => entry.record) ?? [];
    return monsterCopyNamesIn(units, profiles, placements.presets);
  }, [snapshot, profiles, placements.presets]);
  const monsterName = (unitId: string, presetId: string) => namesIn(unitId, presetId) ?? 'A monster not in this import';
  const { known, explained } = useRuneAdvice(rune, game, settings, roles, hardwareAcceleration);
  const maxCraft = maxCraftOf(known, explained, rune);
  const figure = (value: number) => formatNumber(value, general);
  const maxHeading = maxCraft.state === 'ready'
    ? rune.level >= lastSubPropertyLevel
      ? `The Gem and Grindstones Potential assumes, for ${maxCraft.roleName}`
      : `The Grindstones Potential assumes, for ${maxCraft.roleName}. The Gem is decided at +${lastSubPropertyLevel}, when a Gem becomes legal`
    : maxCraft.state === 'unavailable' ? maxCraft.reason : 'Calculating';
  const facts = [
    { label: 'Slot', value: String(rune.slot) },
    { label: 'Grade', value: `${rune.stars}★` },
    { label: 'Rarity', value: rune.rarity },
    { label: 'Level', value: `+${rune.level}` },
  ];

  return <Overlay labelledBy="rune-overlay-title" describedBy="rune-overlay-facts" className="rune-overlay" onClose={onClose}>
    <header className="overlay-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="overlay-identity">
        <h2 id="rune-overlay-title" className="overlay-hero-name">
          <AncientName name={rune.setName} ancient={rune.ancient} />
        </h2>
        {/* Location closes the row and reads from the same Scenario-first
            summary as every other rune view. */}
        <dl id="rune-overlay-facts" className="overlay-facts">
          {facts.map((fact) => <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>)}
          <div className="rune-overlay-location">
            <dt>Location</dt>
            <dd>
              <EngravedPlace runePlacement={placement} presets={placements.presets} monsterName={monsterName} />
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
        {/* The main line's far end says when the advice is still being worked out.
            It is always there and only shown or hidden, so its arrival and its
            departure move nothing (`AGENTS.md` §2). */}
        <div className="rune-overlay-main-row">
          <div className="rune-overlay-main" aria-label="Main property">
            {runeLineStat(rune.mainStatId) ?? `Stat ${rune.mainStatId}`} {rune.mainValue > 0 ? runeLineFigure(rune.mainStatId, rune.mainValue, figure) : '—'}
          </div>
          <BusyMark busy={explained.state === 'pending'} />
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
        locked={locked} onLock={(on) => rune.occupiedId === null ? Promise.resolve() : onLock(rune.id, rune.occupiedId, on)} />}

      <Evaluation rune={rune} roles={roles} explained={explained} quality={settings.runeQuality} />
    </div>
  </Overlay>;
}
