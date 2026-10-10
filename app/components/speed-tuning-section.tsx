import { useMemo, useState } from 'react';
import { PageHeader } from './page-chrome';
import { useInlineReorder } from './use-drag-reorder';
import { WorkspacePage } from './workspace-page';
import { SpeedTeamOverlay } from './speed-team-overlay';
import { SpeedVerdictMark } from './speed-verdict-mark';
import type { SpeedVerdict } from './speed-verdict-mark';
import type { OpenMonsterOverlay } from './monster-link';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { moveItem } from '../lib/list-order';
import { monsterCopyNames } from '../lib/monster-names';
import { profilesIn } from '../lib/monster-preferences';
import type { MonsterCopyName } from '../lib/monster-names';
import type { PresetColumn } from '../lib/preset-contents';
import { accountItems, monsterInPreset, presetGroupLabel } from '../lib/presets';
import type { Preset } from '../lib/presets';
import { readSkyTribeTotem } from '../lib/sky-tribe-totem';
import { totemMaximumLevel } from '../lib/speed-tick';
import { outOfPlaceCount, readSpeedTeam } from '../lib/speed-tuning-analysis';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import { presetSpeedTeam, speedTuningOf } from '../lib/speed-tuning-preferences';
import type { SpeedTeam, SpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../lib/types';

type Verdict = SpeedVerdict;

/**
 * One preset on the page, always a team to tune. A content without enemy data
 * is read for its own turn order, so every line opens and moves alike.
 */
type Line = { preset: Preset; team: SpeedTeam; monsters: ReadonlyMap<string, GameRecord>; reading: TeamReading };

/** A crown: whose leader skill the team runs. */
function LeaderMark() {
  return <span className="speed-leader-mark" role="img" aria-label="leader" title="Leader">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5h11M3 10.5l-1-6 3.5 3L8 3l2.5 4.5 3.5-3-1 6z" /></svg>
  </span>;
}

/**
 * One line of the page, which opens its preset's team. Two lines and a mark:
 * the preset's monsters in the order asked for, a sentence saying whether the
 * runes the preset engraves deliver it, and that verdict again at the right
 * edge. What was stated is never coloured; it is the user's choice, not a verdict.
 *
 * The names are the team's order and are dragged within the line to change it,
 * saved at once as the overlay's arrows would after Save. So the line is a box
 * that acts as a button rather than a `button`: nothing inside a button can be
 * picked up. Its keyboard way to the same move is the overlay it opens.
 */
function PresetLine({ line, names, known, onOpen, onReorder }: {
  line: Line;
  names: Record<string, MonsterCopyName>;
  known: (unitId: string) => boolean;
  onOpen: (opener: HTMLElement) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const order = line.team.members.map((member) => member.unitId);
  const status = teamStatus(line.reading, line.team.noSpeedTuning);
  const reorder = useInlineReorder<HTMLSpanElement>({ count: order.length, onMove: onReorder });
  return <div className="speed-summary" role="button" tabIndex={0}
    onClick={(event) => onOpen(event.currentTarget)}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onOpen(event.currentTarget);
    }}>
    <span className="visually-hidden">{line.preset.name}: </span>
    <span className="speed-summary-names" {...reorder.containerProps}>
      <span className="speed-summary-preset" aria-hidden="true">{line.preset.number ?? ''}</span>
      {order.map((unitId, at) => {
        /* Drawn in the drop's order while a drag is previewed, so the arrows
           between the names follow the places, not the entries. */
        const place = reorder.place(at);
        return <span key={unitId} className="speed-summary-member" style={{ order: place }} {...reorder.entryProps(at)}>
          {place > 0 && <span className="speed-summary-step" aria-hidden="true">›</span>}
          <span className="speed-summary-name">{known(unitId) ? names[unitId]?.name ?? unitId : 'Not in this import'}</span>
          {line.preset.leaderUnitId === unitId && <LeaderMark />}
          {place < order.length - 1 && <span className="visually-hidden">, </span>}
        </span>;
      })}
    </span>
    <span className="visually-hidden"> — </span>
    <span className="speed-summary-state" data-state={status.state}>{status.text}</span>
    <SpeedVerdictMark state={status.state} />
  </div>;
}

/**
 * A team's verdict in one sentence. The page only ever reads the runes the
 * preset engraves — a what-if lives and dies inside the open editor — so the
 * sentence need not say which reading it is.
 */
function teamStatus(reading: TeamReading, noSpeedTuning: boolean): { text: string; state: Verdict } {
  if (reading.missingUnitIds.length) {
    const missing = reading.missingUnitIds.length;
    return { text: `${missing} monster${missing === 1 ? ' is' : 's are'} not in this import`, state: 'bad' };
  }
  /* A team the user says is not speed tuned is fine by its own terms: neither
     its order nor an enemy cutting in is held against it. */
  if (noSpeedTuning) return { text: 'No speed tuning', state: 'good' };
  const cut = cutInText(reading);
  /* In arena the worst-case enemy is the one the team must open against, so
     its cutting in fails the team; a dungeon stage's enemies may simply be
     faster than any build, and there it is reported without a verdict. */
  const cutFails = reading.content.area === 'arena' && cut !== '';
  if (reading.perfect) return { text: `Turn order holds${cut}`, state: cutFails ? 'bad' : 'good' };
  if (outOfPlaceCount(reading) === 0) return { text: `Tied · position decides${cut}`, state: cutFails ? 'bad' : 'good' };
  return { text: `${outOfPlaceCount(reading)} of ${reading.members.length} out of place${cut}`, state: 'bad' };
}

/* Whether an enemy moves before the team's last monster has had its first
   turn, read off the same traces the Ticks view draws — boosts, buffs and
   Leo's cap included. A dungeon names its stages; arena has the one worst case. */
function cutInText(reading: TeamReading): string {
  const stages = reading.enemies.flatMap((enemy, at) => enemy.cutsBefore.length > 0 ? [at + 1] : []);
  if (stages.length === 0) return '';
  return reading.content.area === 'arena' ? ' · Enemy can cut in' : ` · Enemy can cut in (stage ${stages.join(', ')})`;
}

/* The page's three columns: dungeons, arena, and everything else. A preset
   whose content is not yet named, or a preset built here without one, goes to
   the last. */
function columnOf(preset: Preset): PresetColumn {
  return preset.content?.column ?? 'other';
}

/* The arena column opens on the defences: there are one or two of them against
   a long list of attack teams, and they would otherwise sit below it. Every
   other column keeps the game's order. */
function columnLines(lines: readonly Line[], column: PresetColumn): Line[] {
  const inColumn = lines.filter((line) => columnOf(line.preset) === column);
  if (column !== 'arena') return inColumn;
  const attack = (line: Line) => line.preset.content?.id === 'arena-attack';
  return [...inColumn.filter((line) => !attack(line)), ...inColumn.filter(attack)];
}

const columns: readonly { id: PresetColumn; title: string; empty: string }[] = [
  { id: 'dungeons', title: 'Dungeons', empty: 'No dungeon presets.' },
  { id: 'arena', title: 'Arena', empty: 'No arena presets.' },
  { id: 'other', title: 'Other presets', empty: 'No other presets.' },
];

export function SpeedTuningSection({ game, monsters, preferences, presets, openPresetId = null, canChangePresets, onWrite, onLead, onTeamClosed, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  presets: readonly Preset[];
  /** A team to open on arrival, asked for from another page. */
  openPresetId?: string | null;
  /** Whether the game's presets are the user's to change: false while live sync would put them back. */
  canChangePresets: boolean;
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
  /** A preset's leader, `null` for none. */
  onLead: (presetId: string, unitId: string | null) => void;
  /** Told when a team's overlay closes, so a request to open one is spent. */
  onTeamClosed?: () => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const tuning = preferences.speedTuning.presets;
  const general = preferences.general;
  /* A team asked for from elsewhere has no line here that opened it, so focus
     goes nowhere in particular when it closes. */
  const [editing, setEditing] = useState<{ presetId: string; opener: HTMLElement | null } | null>(
    () => (openPresetId === null ? null : { presetId: openPresetId, opener: null }));

  const monsterById = useMemo(() => new Map(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => [String(monster.unit_id), monster])), [monsters]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  const totem = useMemo(() => readSkyTribeTotem(game?.data), [game]);
  const totemShare = totem.state === 'built' ? totem.percent : 0;

  /* Every preset with monsters, as a team. Each reading runs the clock for the
     whole team, so they are read together, once for each change to the
     presets, the import, the totem or the tuning. */
  const lines = useMemo<Line[]>(() => presets.filter((preset) => preset.kind !== 'default' && preset.members.length > 0).map((preset): Line => {
    const team = presetSpeedTeam(preset, tuning[preset.id]);
    const inPreset = new Map(preset.members.flatMap((unitId) => {
      const monster = monsterById.get(unitId);
      return monster ? [[unitId, monsterInPreset(monster, preset, items)] as const] : [];
    }));
    return { preset, team, monsters: inPreset, reading: readSpeedTeam({ team, monsters: inPreset, totemPercent: totemShare }) };
  }), [presets, tuning, monsterById, items, totemShare]);

  const editingLine = editing ? lines.find((line) => line.preset.id === editing.presetId) : undefined;
  /* Each team names its copies as its own preset's profiles do: a label is part
     of a copy's profile in one preset, and the next line is another preset. */
  const namesByPreset = useMemo(() => new Map(lines.map((line) =>
    [line.preset.id, monsterCopyNames(monsters, profilesIn(preferences.monsterPreferences, line.preset.id))])),
  [lines, monsters, preferences.monsterPreferences]);
  const namesIn = (presetId: string) => namesByPreset.get(presetId) ?? {};

  function close() {
    const opener = editing?.opener;
    setEditing(null);
    onTeamClosed?.();
    requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
  }

  if (!game) {
    return <WorkspacePage header={<SpeedHeader />}>
      <section className="empty-state">
        <h2>Checks that every preset moves in the order you want.</h2>
        <p className="next-step">Import your game data first. Speed Tuning reads your presets and the runes they engrave.</p>
      </section>
    </WorkspacePage>;
  }

  return <WorkspacePage header={<SpeedHeader />}>
    <SpeedBasis totem={totem} general={general} />

    <div className="speed-columns">
      {columns.map((column) => {
        const groups: { label: string; lines: Line[] }[] = [];
        for (const line of columnLines(lines, column.id)) {
          const label = presetGroupLabel(line.preset);
          const group = groups.find((entry) => entry.label === label);
          if (group) group.lines.push(line); else groups.push({ label, lines: [line] });
        }
        return <section key={column.id} className="speed-column" aria-labelledby={`speed-${column.id}-title`}>
          <ColumnHead id={`speed-${column.id}-title`} title={column.title} />
          {groups.length === 0
            ? <p className="speed-column-empty type-caption">{column.empty}</p>
            : groups.map((group) => <section key={group.label} className="speed-group" aria-label={group.label}>
              <h3 className="speed-group-title">{group.label}</h3>
              <ul className="speed-summary-list">
                {group.lines.map((line) => <li key={line.preset.id}>{renderLine(line)}</li>)}
              </ul>
            </section>)}
        </section>;
      })}
    </div>

    {editing && editingLine && <SpeedTeamOverlay key={editingLine.preset.id} initial={editingLine.team} title={editingLine.preset.name}
      monsters={editingLine.monsters} totemShare={totemShare} names={namesIn(editingLine.preset.id)} general={general}
      leading={leadingIn(editingLine.preset)}
      onSave={(team) => {
        onWrite((current) => ({ ...current, presets: { ...current.presets, [team.id]: speedTuningOf(team) } }));
        if (team.leaderUnitId !== editingLine.team.leaderUnitId) onLead(team.id, team.leaderUnitId);
        close();
      }}
      onClose={close} onOpenMonster={onOpenMonster} />}
  </WorkspacePage>;

  /* A preset built here is always the user's; the game's only while live sync
     is off, and a defense is always led by someone, so its lead only passes on. */
  function leadingIn(preset: Preset): 'free' | 'kept' | undefined {
    if (preset.kind === 'own') return 'free';
    if (preset.kind !== 'game' || !canChangePresets) return undefined;
    return preset.deck !== null && preset.deck.source.kind !== 'deck' ? 'kept' : 'free';
  }

  /* A preset's line: its number, its monsters in the order asked for, its leader marked. */
  function renderLine(line: Line) {
    return <PresetLine line={line} names={namesIn(line.preset.id)} known={(unitId) => monsterById.has(unitId)}
      onOpen={(opener) => setEditing({ presetId: line.preset.id, opener })}
      onReorder={(from, to) => {
        const team = { ...line.team, members: moveItem(line.team.members, from, to) };
        onWrite((current) => ({ ...current, presets: { ...current.presets, [team.id]: speedTuningOf(team) } }));
      }} />;
  }
}

/** A column's title, ruled off from its lines. */
function ColumnHead({ id, title }: { id: string; title: string }) {
  return <header className="speed-column-head">
    <h2 id={id} className="type-title">{title}</h2>
  </header>;
}

function SpeedHeader() {
  return <PageHeader title="Speed Tuning"
    tagline="Turn order is a solved problem. Getting your own team to respect it is the hard part." />;
}

/**
 * The one thing every figure on the page counts that belongs to the account
 * rather than to a team: the totem. Everything else that moves a turn belongs
 * to one monster or one team (a leader skill, a skill that boosts or buffs)
 * and is read where that monster or team is.
 */
function SpeedBasis({ totem, general }: {
  totem: ReturnType<typeof readSkyTribeTotem>;
  general: Preferences['general'];
}) {
  const level = totem.state === 'built' ? `Level ${totem.level} of ${totemMaximumLevel}`
    : totem.state === 'not-built' ? 'Not built' : 'Not in this import';
  const percent = totem.state === 'built' ? totem.percent : 0;
  /* The bonus is the figure every combat speed on the page counts, so it is
     the one in full ink; the level is where it comes from, and dimmed. */
  return <div className="speed-basis">
    <section className="speed-basis-facts" aria-labelledby="speed-basis-title">
      <h2 id="speed-basis-title" className="speed-basis-title">Sky Tribe Totem</h2>
      <p className="speed-basis-level">{level}</p>
      <p className="speed-basis-bonus">
        <span className="speed-basis-figure">+{formatNumber(percent, general)} %</span> of base speed
      </p>
    </section>
  </div>;
}
