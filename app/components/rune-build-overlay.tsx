import { useState, type ReactNode } from 'react';
import { Button, InlineButton, LabelSwap } from './button';
import { AncientMark } from './ancient-mark';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { RuneLink } from './rune-link';
import type { OpenRuneOverlay } from './rune-link';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import { alwaysSynchronizedReason } from '../lib/always-synchronized';
import type { PickedRune } from '../lib/compute/rune-optimization-protocol';
import { formatNumber } from '../lib/formatting';
import { scenarioPresetId } from '../lib/presets';
import { pickIssueText } from '../lib/rune-build-issues';
import type { EndStateLine } from '../lib/rune-craft-end-state';
import type { CurrentPick } from '../lib/rune-optimization-refresh';
import { runeLockLabels } from '../lib/rune-locks';
import type { RuneLock } from '../lib/rune-locks';
import { runeLineFigure, runeLineStat } from '../lib/runes';
import { flatMainPropertyAtTwelve } from '../lib/rune-properties';
import type { Rune } from '../lib/runes';
import type { GeneralSettings } from '../lib/types';

/**
 * **One found build, as the game would show it.** The six runes stand in the
 * game's own rune circle — slot 1 at the top, the rest clockwise — each exactly
 * as it is in the account today, and beside the circle the work the build takes
 * for granted: which line a Gem replaces, which stones go on, which main property
 * is counted at +12 or +15 before the rune gets there.
 *
 * The circle shows what the player will find in the game and the list shows what
 * to do to it, so the two read as before and after rather than as two versions of
 * the same rune.
 */

/** A rune carries at most four sub properties; every card reserves all four, so
    the six cards are one size and the circle keeps its shape. */
const subPropertySlots = 4;

export type EngravedOnMonster = { name: string; masterId: string };

/** The monster the build is for, as its portrait and copy name. */
export type BuildMonster = { unitId: string; masterId: string; name: string; imageFilename?: string; initial: string };

type Change =
  | { kind: 'gem'; before: EndStateLine; after: EndStateLine }
  | { kind: 'grind'; statId: number; before: number; after: number }
  | { kind: 'main'; statId: number; before: number; after: number; level: number };

const changeLabels: Record<Change['kind'], string> = {
  gem: 'Enchanted Gem',
  grind: 'Grindstone',
  main: 'Counted at +15',
};

/**
 * What the build does to one rune, read off the difference between the rune as
 * imported and the end state the search counted — not decided a second time.
 * A stone on a line a Gem turned into another property starts from no stone,
 * as `newlyGround` counts it.
 */
function changesOf(rune: Rune, picked: PickedRune): Change[] {
  const changes: Change[] = [];
  if (picked.mainValue !== rune.mainValue) {
    changes.push({ kind: 'main', statId: rune.mainStatId, before: rune.mainValue, after: picked.mainValue,
      level: rune.slot % 2 === 1 && picked.mainValue === flatMainPropertyAtTwelve(rune.stars, rune.mainStatId) ? 12 : 15 });
  }
  const before = rune.subProperties;
  if (picked.gemmedAt >= 0 && before[picked.gemmedAt] && picked.lines[picked.gemmedAt]) {
    const from = before[picked.gemmedAt];
    const to = picked.lines[picked.gemmedAt];
    /* The line as the Gem leaves it: a re-rolled property keeps its stone, a new one starts bare. */
    changes.push({ kind: 'gem', before: from, after: { ...to, grind: to.statId === from.statId ? from.grind : 0 } });
  }
  for (const at of picked.groundAt) {
    const line = picked.lines[at];
    if (!line) continue;
    const had = before[at]?.statId === line.statId ? before[at].grind : 0;
    changes.push({ kind: 'grind', statId: line.statId, before: had, after: line.grind });
  }
  return changes;
}

function Arrow() {
  return <svg className="rune-build-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
}

function ChangeLine({ change, format }: { change: Change; format: (value: number) => string }) {
  let body: ReactNode;
  if (change.kind === 'gem') {
    body = <>
      <RuneSubLine property={change.before} format={format} />
      <Arrow /><span className="visually-hidden">becomes</span>
      <RuneSubLine property={change.after} format={format} />
    </>;
  } else if (change.kind === 'grind') {
    /* The stone's figure in the game's grind gold, as on the ground line itself. */
    body = <span className="rune-sub" data-ground="true">
      <span className="rune-sub-name">{runeLineStat(change.statId) ?? `Stat ${change.statId}`}</span>
      {change.before > 0 && <>
        <span className="rune-build-replaced">{runeLineFigure(change.statId, change.before, format)}</span>
        <Arrow /><span className="visually-hidden">becomes</span>
      </>}
      <span className="rune-sub-value">{runeLineFigure(change.statId, change.after, format)}</span>
    </span>;
  } else {
    body = <span className="rune-sub">
      <span className="rune-sub-name">{runeLineStat(change.statId) ?? `Stat ${change.statId}`}</span>
      <span className="rune-build-replaced">{runeLineFigure(change.statId, change.before, format)}</span>
      <Arrow /><span className="visually-hidden">becomes</span>
      <span className="rune-sub-value">{runeLineFigure(change.statId, change.after, format)}</span>
    </span>;
  }
  return <li className="rune-build-change" data-kind={change.kind}>
    <span className="rune-build-change-kind">{change.kind === 'main' ? `Counted at +${change.level}` : changeLabels[change.kind]}</span>
    <span className="rune-build-change-body">{body}</span>
  </li>;
}

type Places = {
  thisMonster: string;
  /** The preset the build is for. */
  presetId: string;
  /** The game's engraving outside presets, which its rune list still shows. */
  scenarioPlaces: ReadonlyMap<string, string | null> | undefined;
  engravedOn: (unitId: string) => EngravedOnMonster | undefined;
  onOpenMonster: OpenMonsterOverlay;
};

/* `presetId` is where the monster carries the rune, so its overlay opens on the
   build the rune is part of there. */
function monsterName(place: string, presetId: string, { thisMonster, engravedOn, onOpenMonster }: Places): ReactNode {
  if (place === thisMonster) return 'This monster';
  const engraved = engravedOn(place);
  return engraved
    ? <MonsterLink target={{ kind: 'copy', unitId: place, masterId: engraved.masterId }} name={engraved.name}
      presetId={presetId} onOpen={onOpenMonster} />
    : 'Monster not in this import';
}

/* The preset owns the build's moves. A rune free here but on another monster
   in Scenario names that monster as the game's list does. Scenario's copy of the
   monster being optimized is the one exception: its rune is inventory here. */
function presetPlaceName(place: string | null, places: Places): ReactNode {
  return place === null ? 'Inventory' : monsterName(place, places.presetId, places);
}

function gamePlaceName(runeId: string, place: string | null, places: Places): ReactNode {
  if (place !== null) return presetPlaceName(place, places);
  const inScenario = places.scenarioPlaces?.get(runeId) ?? null;
  return inScenario === null || inScenario === places.thisMonster
    ? 'Inventory' : monsterName(inScenario, scenarioPresetId, places);
}

/* The place a card names for a rune, as an id: the preset's monster, else —
   outside Scenario — the Scenario monster the game's rune list shows, else none. */
function shownPlace(runeId: string, place: string | null, places: Places): string | null {
  if (place !== null || places.presetId === scenarioPresetId) return place;
  const inScenario = places.scenarioPlaces?.get(runeId) ?? null;
  return inScenario === places.thisMonster ? null : inScenario;
}

/* Where the rune was, named as Location named it then. In a preset that left
   it free, that is its Scenario monster, which an engrave in the preset never
   moves; in Scenario itself, free was the inventory, and Scenario's owner now is
   only where the build has put it. */
function previousPlaceName(runeId: string, place: string | null, places: Places): ReactNode {
  return places.presetId === scenarioPresetId ? presetPlaceName(place, places) : gamePlaceName(runeId, place, places);
}

/**
 * The card's Lock and Exclude, for this rune and this monster in the build's
 * preset (`rune-locks.ts`). One choice in two boxes: pressing the one that is on
 * takes it off, pressing the other replaces it. Both are always drawn, and only
 * disabled where no choice can be made, so the card keeps one shape. Each names
 * the move it makes (`runeLockLabels`), and holds both its wordings, since
 * pressing it moves the rune and with it the wording.
 */
function LockChoices({ slot, lock, onMonster, disabled, onLock }: {
  slot: number;
  lock: RuneLock | undefined;
  /** Whether the rune is on this monster in the build's preset now. */
  onMonster: boolean;
  disabled: boolean;
  onLock: (lock: RuneLock | null) => void;
}) {
  const toggle = (choice: RuneLock) => onLock(lock === choice ? null : choice);
  const label = (choice: RuneLock) => <LabelSwap faces={runeLockLabels[choice]} showing={onMonster ? 'onMonster' : 'elsewhere'} />;
  /* Only Always synchronized turns these off. */
  const title = disabled ? alwaysSynchronizedReason : undefined;
  return <div className="rune-build-card-locks" role="group" aria-label={`Slot ${slot} rune for this monster`}>
    <InlineButton pressed={lock === 'locked'} disabled={disabled} title={title} onClick={() => toggle('locked')}>{label('locked')}</InlineButton>
    <InlineButton pressed={lock === 'excluded'} disabled={disabled} title={title} onClick={() => toggle('excluded')}>{label('excluded')}</InlineButton>
  </div>;
}

function RuneCard({ picked, rune, loadedPlace, places, format, onOpenRune, lock, lockDisabled, onLock }: {
  picked: CurrentPick;
  rune: Rune | undefined;
  /** Where the rune sat when the import was loaded, where JASWA has moved it since; else `undefined`. */
  loadedPlace: string | null | undefined;
  places: Places;
  format: (value: number) => string;
  onOpenRune: OpenRuneOverlay;
  lock: RuneLock | undefined;
  lockDisabled: boolean;
  onLock: (lock: RuneLock | null) => void;
}) {
  if (!rune) {
    return <li className="rune-build-card" data-slot={picked.slot} aria-label={`Slot ${picked.slot}`}>
      <p className="rune-build-missing">A rune no longer in the account</p>
    </li>;
  }
  let location: ReactNode;
  /* The pressed Lock beside it says the rest. */
  if (picked.locked) location = 'This monster';
  else if (picked.issue?.kind === 'locked-away' && rune.occupiedId === null) location = 'Locked in the inventory';
  else if (rune.occupiedId === null || rune.occupiedId === places.thisMonster) {
    location = gamePlaceName(rune.id, rune.occupiedId, places);
  } else {
    const link = gamePlaceName(rune.id, rune.occupiedId, places);
    location = picked.issue?.kind === 'locked-away' ? <>Locked to {link}</> : link;
  }
  /* Only where the place shown has really changed since the import: one moved
     and moved back is where the game has it, and a rune freed in this preset
     from a monster that still carries it in Scenario is shown on that monster
     before and after, so Previously would only repeat Location. */
  const moved = loadedPlace !== undefined
    && shownPlace(rune.id, loadedPlace, places) !== shownPlace(rune.id, rune.occupiedId, places);
  return <li className="rune-build-card" data-slot={picked.slot} aria-label={`Slot ${picked.slot}`}>
    <div className="rune-build-card-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="rune-build-card-identity">
        <RuneLink target={{ kind: 'account', runeId: rune.id }} label={`Slot ${picked.slot} ${rune.setName}`} onOpen={onOpenRune}>
          Slot {picked.slot} · {rune.setName}
        </RuneLink>
        <span className="rune-build-card-grade">{rune.stars}★ +{rune.level} · {rune.rarity}</span>
        <div className="rune-build-card-main" aria-label="Main property">
          {runeLineStat(rune.mainStatId) ?? `Stat ${rune.mainStatId}`} {rune.mainValue > 0 ? runeLineFigure(rune.mainStatId, rune.mainValue, format) : '—'}
        </div>
      </div>
      <span className="rune-build-card-ancient" data-ancient={rune.ancient} aria-hidden={!rune.ancient}>
        <AncientMark />
      </span>
    </div>
    <div className="rune-build-card-innate" aria-label="Innate property">
      {rune.prefixStatId === null
        ? <span className="rune-sub-name">No innate</span>
        : <RuneInnateLine statId={rune.prefixStatId} value={rune.prefixValue} format={format} />}
    </div>
    <ul className="rune-build-card-subs" aria-label="Sub properties">
      {Array.from({ length: subPropertySlots }, (_, at) => {
        const line = rune.subProperties[at];
        return line
          ? <RuneSubLine key={at} as="li" format={format} property={line} />
          : <li key={at} className="rune-sub" aria-hidden="true" />;
      })}
    </ul>
    {/* Where the rune is on the left and what the user says about it at the
        bottom right, so the two choices stand in the same corner of every card. */}
    <div className="rune-build-card-foot">
      <div className="rune-build-card-places">
        <div className="rune-build-card-where">
          <span className="rune-build-card-where-label">Location</span>
          <span className="rune-build-card-where-value">{location}</span>
        </div>
        {/* Always in the card and hidden when there is nothing to say, so engraving
            the build cannot make six cards grow under the click (`AGENTS.md` §2). */}
        <div className="rune-build-card-where" data-visible={moved} aria-hidden={!moved}>
          <span className="rune-build-card-where-label">Previously</span>
          <span className="rune-build-card-where-value">
            {moved ? previousPlaceName(rune.id, loadedPlace, places) : ''}
          </span>
        </div>
      </div>
      <LockChoices slot={picked.slot} lock={lock} onMonster={rune.occupiedId === places.thisMonster} disabled={lockDisabled} onLock={onLock} />
    </div>
  </li>;
}

export function RuneBuildOverlay({
  index, buildName, moves, runes, runesById, presetId, loadedPlacements, scenarioPlaces, monster, engravedOn, general, canEngrave, onEngrave,
  canLock, lockOf, onLock, onClose, onOpenRune, onOpenMonster,
}: {
  index: number;
  /** The preset the build is for. */
  presetId: string;
  buildName: string;
  moves: number;
  runes: readonly CurrentPick[];
  runesById: ReadonlyMap<string, Rune>;
  /** Where the runes JASWA has moved sat in this preset when the import was loaded (`ImportedGame`). */
  loadedPlacements: Readonly<Record<string, string | null>> | undefined;
  /** Scenario's owner, which the game's rune list shows even when this preset leaves the rune free. */
  scenarioPlaces: ReadonlyMap<string, string | null> | undefined;
  /** Drawn in the middle of the circle, and the monster its own runes read as staying on. */
  monster: BuildMonster;
  engravedOn: (unitId: string) => EngravedOnMonster | undefined;
  general: GeneralSettings;
  canEngrave: boolean;
  onEngrave: (unitId: string, runeIds: readonly string[]) => Promise<void>;
  /** Whether Lock and Exclude may change: not while JASWA is synchronized with the game. */
  canLock: boolean;
  /** What the user has said about a rune for this monster in this preset. */
  lockOf: (runeId: string) => RuneLock | undefined;
  /** Sets or clears one rune's choice; a lock engraves the rune first. */
  onLock: (runeId: string, lock: RuneLock | null) => Promise<void>;
  onClose: () => void;
  onOpenRune: OpenRuneOverlay;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  /* The rune whose choice is being saved; every card waits for it, since a lock can move another card's rune. */
  const [locking, setLocking] = useState<string | null>(null);
  const format = (value: number) => formatNumber(value, general);
  const bySlot = [...runes].sort((left, right) => left.slot - right.slot);
  const changes = bySlot.map((picked) => {
    const rune = runesById.get(picked.runeId);
    return { picked, rune, changes: rune ? changesOf(rune, picked) : [] };
  });
  const gems = changes.filter((entry) => entry.changes.some((change) => change.kind === 'gem')).length;
  const grinds = changes.reduce((sum, entry) => sum + entry.changes.filter((change) => change.kind === 'grind').length, 0);
  const facts = [
    { label: 'Sets', value: buildName || 'No set completed' },
    { label: 'Changes', value: formatNumber(moves, general) },
    { label: 'Gems', value: formatNumber(gems, general) },
    { label: 'Grindstones', value: formatNumber(grinds, general) },
  ];
  const engravedOnName = (unitId: string) => engravedOn(unitId)?.name;
  const places: Places = { thisMonster: monster.unitId, presetId, scenarioPlaces, engravedOn, onOpenMonster };
  const complete = bySlot.length === 6 && bySlot.every((picked) => runesById.has(picked.runeId));
  const alreadyEngraved = complete && bySlot.every((picked) => runesById.get(picked.runeId)?.occupiedId === monster.unitId);

  /* A click while a choice is saving is let go rather than the boxes disabled:
     disabling the box under the pointer drops its focus, and Escape with it. */
  async function lock(runeId: string, choice: RuneLock | null) {
    if (locking !== null || saving) return;
    setLocking(runeId);
    setSaveError(false);
    try {
      await onLock(runeId, choice);
    } catch {
      setSaveError(true);
    } finally {
      setLocking(null);
    }
  }

  async function engrave() {
    setSaving(true);
    setSaveError(false);
    try {
      /* The overlay stays open: the button turns to Engraved and each card says
         where its rune came from, which is the confirmation. */
      await onEngrave(monster.unitId, bySlot.map((picked) => picked.runeId));
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return <Overlay labelledBy="rune-build-overlay-title" describedBy="rune-build-overlay-facts" className="rune-build-overlay" onClose={onClose}>
    <header className="rune-build-head">
      <h2 id="rune-build-overlay-title" className="overlay-hero-name">Build {index + 1}</h2>
      <dl id="rune-build-overlay-facts" className="overlay-facts">
        {facts.map((fact) => <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>)}
      </dl>
      <div className="rune-build-engrave">
        <Button type="button" tone="primary" disabled={!canEngrave || !complete} busy={saving}
          busyLabel="Engraving…" done={alreadyEngraved} doneLabel="Engraved"
          title={canEngrave ? undefined : alwaysSynchronizedReason}
          onClick={() => void engrave()}>Engrave on monster</Button>
        <span className="rune-build-engrave-info" tabIndex={canEngrave ? -1 : 0}
          role="img" aria-hidden={canEngrave}
          aria-label={canEngrave ? undefined : alwaysSynchronizedReason}
          title={alwaysSynchronizedReason}
          data-visible={!canEngrave}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 7.2v3.5M8 5.1h.01" /></svg>
        </span>
        <span className="rune-build-engrave-error" role="alert" aria-hidden={!saveError}
          data-visible={saveError}>Could not save this build.</span>
      </div>
    </header>

    <div className="overlay-body rune-build-body">
      {/* The game's circle around the monster it is engraved on, as the game draws its
          rune screen. The list sits in the grid by `display: contents`, so its cards
          are placed by slot while it stays in slot order for a screen reader, and
          the monster is not read as a seventh rune. */}
      <div className="rune-build-circle">
        <ol className="rune-build-runes" aria-label="Runes">
          {bySlot.map((picked) => <RuneCard key={picked.slot} picked={picked} rune={runesById.get(picked.runeId)}
            loadedPlace={loadedPlacements?.[picked.runeId]} places={places} format={format} onOpenRune={onOpenRune}
            lock={lockOf(picked.runeId)} lockDisabled={!canLock}
            onLock={(choice) => void lock(picked.runeId, choice)} />)}
        </ol>
        <div className="rune-build-centre">
          <MonsterLink target={{ kind: 'copy', unitId: monster.unitId, masterId: monster.masterId }}
            name={monster.name} portrait={{ imageFilename: monster.imageFilename, initial: monster.initial }} presetId={presetId} onOpen={onOpenMonster}>
            <span className="rune-build-centre-name" title={monster.name}>{monster.name}</span>
          </MonsterLink>
        </div>
      </div>

      <section className="rune-build-changes" aria-labelledby="rune-build-changes-title">
        <h3 id="rune-build-changes-title" className="overlay-block-title">Modifications</h3>
        {changes.map(({ picked, rune, changes: list }) => <section key={picked.slot} className="rune-build-change-slot"
          aria-label={`Slot ${picked.slot} modifications`}>
          <h4 className="rune-build-change-title">Slot {picked.slot}{rune ? ` · ${rune.setName}` : ''}</h4>
          {picked.issue && <p className="rune-build-issue">{pickIssueText(picked.issue, engravedOnName)}</p>}
          {list.length === 0
            ? <p className="rune-build-change-none">{picked.locked ? 'Locked, used as engraved' : 'As it is'}</p>
            : <ul className="rune-build-change-list">
              {list.map((change, at) => <ChangeLine key={at} change={change} format={format} />)}
            </ul>}
        </section>)}
      </section>
    </div>
  </Overlay>;
}
