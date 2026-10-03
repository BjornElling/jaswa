import type { ReactNode } from 'react';
import { AncientMark } from './ancient-mark';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { Overlay } from './overlay';
import { RuneEmblem } from './rune-emblem';
import { RuneLink } from './rune-link';
import type { OpenRuneOverlay } from './rune-link';
import { RuneInnateLine, RuneSubLine } from './rune-sub-line';
import type { PickedRune } from '../lib/compute/rune-optimization-protocol';
import { formatNumber } from '../lib/formatting';
import type { EndStateLine } from '../lib/rune-craft-end-state';
import type { RankFigure } from '../lib/rune-optimization-problem';
import type { CurrentBuild, CurrentPick, PickIssue } from '../lib/rune-optimization-refresh';
import { presetTargetColumns } from '../lib/rune-potential-presets';
import { runeLineFigure, runeLineStat } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { GeneralSettings } from '../lib/types';

/**
 * **One found build, as the game would show it.** The six runes stand in the
 * game's own rune circle — slot 1 at the top, the rest clockwise — each exactly
 * as it is in the account today, and beside the circle the work the build takes
 * for granted: which line a Gem replaces, which stones go on, which main property
 * is counted at +15 before the rune gets there.
 *
 * The circle shows what the player will find in the game and the list shows what
 * to do to it, so the two read as before and after rather than as two versions of
 * the same rune.
 */

/** A rune carries at most four sub properties; every card reserves all four, so
    the six cards are one size and the circle keeps its shape. */
const subPropertySlots = 4;

export type BuildWearer = { name: string; masterId: string };

/** The monster the build is for, as its portrait and copy name. */
export type BuildMonster = { unitId: string; masterId: string; name: string; imageFilename?: string; initial: string };

type Change =
  | { kind: 'gem'; before: EndStateLine; after: EndStateLine }
  | { kind: 'grind'; statId: number; before: number; after: number }
  | { kind: 'main'; statId: number; before: number; after: number };

const changeLabels: Record<Change['kind'], string> = {
  gem: 'Enchanted Gem',
  grind: 'Grindstone',
  main: 'Counted at +15',
};

const figureNames: Readonly<Record<string, string>> = Object.fromEntries(
  presetTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
);

/** Why one rune cannot be used as the build uses it, as a sentence about that rune. */
export function pickIssueText(issue: PickIssue, wearerName: (unitId: string) => string | undefined): string {
  switch (issue.kind) {
    case 'gone': return 'The rune is no longer in the account';
    case 'locked-away': return issue.wearer === null
      ? 'The rune is locked in the inventory'
      : `The rune is locked to ${wearerName(issue.wearer) ?? 'another monster'}`;
    case 'slot-taken': return 'Another rune is locked into this slot';
    case 'worn-elsewhere': return `The rune is now on ${wearerName(issue.wearer) ?? 'another monster'}, and the settings keep other monsters’ runes`;
    case 'items': return 'Too few items are left for the Gem or Grindstone still to come';
  }
}

const shortText = (short: readonly RankFigure[]) => `Now short of ${short.map((key) => figureNames[key] ?? key).join(', ')}`;

/**
 * Everything that changed under a build since the search, for the table's mark —
 * slot by slot, then the targets its figures no longer reach. Empty where the build
 * still holds as found.
 */
export function buildIssueReading(build: CurrentBuild, wearerName: (unitId: string) => string | undefined): string {
  const lines = [...build.runes].sort((left, right) => left.slot - right.slot)
    .flatMap((picked) => (picked.issue ? [`Slot ${picked.slot}: ${pickIssueText(picked.issue, wearerName)}.`] : []));
  if (build.short.length > 0) lines.push(`${shortText(build.short)}.`);
  if (build.over.length > 0) lines.push(`Now above the range for ${build.over.map((key) => figureNames[key] ?? key).join(', ')}.`);
  return lines.join(' ');
}

/**
 * What the build does to one rune, read off the difference between the rune as
 * imported and the end state the search counted — not decided a second time.
 * A stone on a line a Gem turned into another property starts from no stone,
 * as `newlyGround` counts it.
 */
function changesOf(rune: Rune, picked: PickedRune): Change[] {
  const changes: Change[] = [];
  if (picked.mainValue !== rune.mainValue) {
    changes.push({ kind: 'main', statId: rune.mainStatId, before: rune.mainValue, after: picked.mainValue });
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
    <span className="rune-build-change-kind">{changeLabels[change.kind]}</span>
    <span className="rune-build-change-body">{body}</span>
  </li>;
}

function RuneCard({ picked, rune, thisMonster, wearer, format, onOpenRune, onOpenMonster }: {
  picked: CurrentPick;
  rune: Rune | undefined;
  thisMonster: string;
  wearer: (unitId: string) => BuildWearer | undefined;
  format: (value: number) => string;
  onOpenRune: OpenRuneOverlay;
  onOpenMonster: OpenMonsterOverlay;
}) {
  if (!rune) {
    return <li className="rune-build-card" data-slot={picked.slot} aria-label={`Slot ${picked.slot}`}>
      <p className="rune-build-missing">A rune no longer in the account</p>
    </li>;
  }
  let location: ReactNode;
  if (picked.locked) location = 'Locked to this monster';
  else if (picked.issue?.kind === 'locked-away' && rune.occupiedId === null) location = 'Locked in the inventory';
  else if (rune.occupiedId === null) location = 'Inventory';
  else if (rune.occupiedId === thisMonster) location = 'This monster';
  else {
    const worn = wearer(rune.occupiedId);
    const link = worn
      ? <MonsterLink target={{ kind: 'copy', unitId: rune.occupiedId, masterId: worn.masterId }} name={worn.name} onOpen={onOpenMonster} />
      : 'Monster not in this import';
    location = picked.issue?.kind === 'locked-away' ? <>Locked to {link}</> : link;
  }
  return <li className="rune-build-card" data-slot={picked.slot} aria-label={`Slot ${picked.slot}`}>
    <div className="rune-build-card-head">
      <RuneEmblem setName={rune.setName} slot={rune.slot} />
      <div className="rune-build-card-identity">
        <RuneLink target={{ kind: 'account', runeId: rune.id }} label={`Slot ${picked.slot} ${rune.setName}`} onOpen={onOpenRune}>
          Slot {picked.slot} · {rune.setName}
        </RuneLink>
        <span className="rune-build-card-grade">{rune.stars}★ +{rune.level} · {rune.defaultGrade}</span>
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
    <div className="rune-build-card-where">
      <span className="rune-build-card-where-label">Location</span>
      <span className="rune-build-card-where-value">{location}</span>
    </div>
  </li>;
}

export function RuneBuildOverlay({
  index, buildName, moves, runes, short, runesById, monster, wearer, general, onClose, onOpenRune, onOpenMonster,
}: {
  index: number;
  buildName: string;
  moves: number;
  runes: readonly CurrentPick[];
  /** The targets the build's figures no longer reach, since the account changed under it. */
  short: readonly RankFigure[];
  runesById: ReadonlyMap<string, Rune>;
  /** Drawn in the middle of the circle, and the wearer its own runes read as staying on. */
  monster: BuildMonster;
  wearer: (unitId: string) => BuildWearer | undefined;
  general: GeneralSettings;
  onClose: () => void;
  onOpenRune: OpenRuneOverlay;
  onOpenMonster: OpenMonsterOverlay;
}) {
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
    { label: 'Moves', value: formatNumber(moves, general) },
    { label: 'Gems', value: formatNumber(gems, general) },
    { label: 'Grindstones', value: formatNumber(grinds, general) },
    { label: 'Targets', value: short.length === 0 ? 'Met' : shortText(short) },
  ];
  const wearerName = (unitId: string) => wearer(unitId)?.name;

  return <Overlay labelledBy="rune-build-overlay-title" describedBy="rune-build-overlay-facts" className="rune-build-overlay" onClose={onClose}>
    <header className="rune-build-head">
      <h2 id="rune-build-overlay-title" className="overlay-hero-name">Build {index + 1}</h2>
      <dl id="rune-build-overlay-facts" className="overlay-facts">
        {facts.map((fact) => <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>)}
      </dl>
    </header>

    <div className="overlay-body rune-build-body">
      {/* The game's circle around the monster that wears it, as the game draws its
          rune screen. The list sits in the grid by `display: contents`, so its cards
          are placed by slot while it stays in slot order for a screen reader, and
          the monster is not read as a seventh rune. */}
      <div className="rune-build-circle">
        <ol className="rune-build-runes" aria-label="Runes">
          {bySlot.map((picked) => <RuneCard key={picked.slot} picked={picked} rune={runesById.get(picked.runeId)}
            thisMonster={monster.unitId} wearer={wearer} format={format} onOpenRune={onOpenRune} onOpenMonster={onOpenMonster} />)}
        </ol>
        <div className="rune-build-centre">
          <MonsterLink target={{ kind: 'copy', unitId: monster.unitId, masterId: monster.masterId }}
            name={monster.name} portrait={{ imageFilename: monster.imageFilename, initial: monster.initial }} onOpen={onOpenMonster}>
            <span className="rune-build-centre-name" title={monster.name}>{monster.name}</span>
          </MonsterLink>
        </div>
      </div>

      <section className="rune-build-changes" aria-labelledby="rune-build-changes-title">
        <h3 id="rune-build-changes-title" className="overlay-block-title">Modifications</h3>
        {changes.map(({ picked, rune, changes: list }) => <section key={picked.slot} className="rune-build-change-slot"
          aria-label={`Slot ${picked.slot} modifications`}>
          <h4 className="rune-build-change-title">Slot {picked.slot}{rune ? ` · ${rune.setName}` : ''}</h4>
          {picked.issue && <p className="rune-build-issue">{pickIssueText(picked.issue, wearerName)}</p>}
          {list.length === 0
            ? <p className="rune-build-change-none">{picked.locked ? 'Locked, used as worn' : 'As it is'}</p>
            : <ul className="rune-build-change-list">
              {list.map((change, at) => <ChangeLine key={at} change={change} format={format} />)}
            </ul>}
        </section>)}
      </section>
    </div>
  </Overlay>;
}
