import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import { SpeedTeamOverlay } from './speed-team-overlay';
import { SpeedVerdictMark } from './speed-verdict-mark';
import type { SpeedVerdict } from './speed-verdict-mark';
import type { OpenMonsterOverlay } from './monster-link';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterCopyNames } from '../lib/monster-names';
import type { PresetColumn } from '../lib/preset-contents';
import { accountItems, monsterInPreset } from '../lib/presets';
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
 * One preset on the page. A preset whose content Speed Tuning has a model for
 * is a team to tune; any other is listed so it is not missing, and says why it
 * is not judged.
 */
type Line =
  | { kind: 'team'; preset: Preset; team: SpeedTeam; monsters: ReadonlyMap<string, GameRecord>; reading: TeamReading }
  | { kind: 'unjudged'; preset: Preset; reason: string };

/** A crown: whose leader skill the team runs. */
function LeaderMark() {
  return <span className="speed-leader-mark" role="img" aria-label="leader" title="Leader">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5h11M3 10.5l-1-6 3.5 3L8 3l2.5 4.5 3.5-3-1 6z" /></svg>
  </span>;
}

/**
 * One line of the page and the button that opens it. Two lines and a mark:
 * the preset's monsters in the order asked for, a sentence saying whether the
 * runes the preset engraves deliver it, and that verdict again at the right
 * edge. What was stated is never coloured; it is the user's choice, not a verdict.
 */
function SummaryLine({ label, status, state, onOpen, children }: {
  label: string;
  status: string;
  state: Verdict;
  /** `undefined` for a preset the page cannot judge: listed, not opened. */
  onOpen?: (opener: HTMLElement) => void;
  children: ReactNode;
}) {
  return <button type="button" className="speed-summary" disabled={onOpen === undefined}
    onClick={(event) => onOpen?.(event.currentTarget)}>
    <span className="visually-hidden">{label}: </span>
    <span className="speed-summary-names">{children}</span>
    <span className="visually-hidden"> — </span>
    <span className="speed-summary-state" data-state={state}>{status}</span>
    <SpeedVerdictMark state={state} />
  </button>;
}

/**
 * A team's verdict in one sentence. The page only ever reads the runes the
 * preset engraves — a what-if lives and dies inside the open editor — so the
 * sentence need not say which reading it is.
 */
function teamStatus(reading: TeamReading): { text: string; state: Verdict } {
  if (reading.missingUnitIds.length) {
    const missing = reading.missingUnitIds.length;
    return { text: `${missing} monster${missing === 1 ? ' is' : 's are'} not in this import`, state: 'bad' };
  }
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

function groupLabel(preset: Preset): string {
  if (preset.content) return preset.content.name;
  return preset.kind === 'own' ? 'Built in JASWA' : 'Not yet named';
}

const columns: readonly { id: PresetColumn; title: string; empty: string }[] = [
  { id: 'dungeons', title: 'Dungeons', empty: 'No dungeon presets.' },
  { id: 'arena', title: 'Arena', empty: 'No arena presets.' },
  { id: 'other', title: 'Other presets', empty: 'No other presets.' },
];

export function SpeedTuningSection({ game, monsters, preferences, presets, openPresetId = null, onWrite, onTeamClosed, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  presets: readonly Preset[];
  /** A team to open on arrival, asked for from another page. */
  openPresetId?: string | null;
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
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

  const names = useMemo(() => monsterCopyNames(monsters, preferences.monsterPreferences), [monsters, preferences.monsterPreferences]);
  const monsterById = useMemo(() => new Map(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => [String(monster.unit_id), monster])), [monsters]);
  const items = useMemo(() => accountItems(game?.data), [game]);
  const totem = useMemo(() => readSkyTribeTotem(game?.data), [game]);
  const totemShare = totem.state === 'built' ? totem.percent : 0;

  /* Every preset with monsters, as a team where its content has a speed model.
     Each reading runs the clock for the whole team, so they are read together,
     once for each change to the presets, the import, the totem or the tuning. */
  const lines = useMemo<Line[]>(() => presets.filter((preset) => preset.kind !== 'default' && preset.members.length > 0).map((preset): Line => {
    const content = preset.content?.speed ?? null;
    if (content === null) {
      return { kind: 'unjudged', preset, reason: preset.content ? 'No speed model for this content yet' : 'Content not yet named' };
    }
    const team = presetSpeedTeam(preset, content, tuning[preset.id]);
    if (team === null) return { kind: 'unjudged', preset, reason: 'More monsters than this content fields' };
    const inPreset = new Map(preset.members.flatMap((unitId) => {
      const monster = monsterById.get(unitId);
      return monster ? [[unitId, monsterInPreset(monster, preset, items)] as const] : [];
    }));
    return { kind: 'team', preset, team, monsters: inPreset, reading: readSpeedTeam({ team, monsters: inPreset, totemPercent: totemShare }) };
  }), [presets, tuning, monsterById, items, totemShare]);

  const editingLine = editing ? lines.find((line) => line.preset.id === editing.presetId) : undefined;

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
        for (const line of lines.filter((entry) => columnOf(entry.preset) === column.id)) {
          const label = groupLabel(line.preset);
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

    {editing && editingLine?.kind === 'team' && <SpeedTeamOverlay key={editingLine.preset.id} initial={editingLine.team} title={editingLine.preset.name}
      monsters={editingLine.monsters} totemShare={totemShare} names={names} general={general}
      onSave={(team) => {
        onWrite((current) => ({ ...current, presets: { ...current.presets, [team.id]: speedTuningOf(team) } }));
        close();
      }}
      onClose={close} onOpenMonster={onOpenMonster} />}
  </WorkspacePage>;

  /* A preset's line: its number, its monsters in the order asked for, its leader marked. */
  function renderLine(line: Line) {
    const order = line.kind === 'team' ? line.team.members.map((member) => member.unitId) : line.preset.members;
    const status = line.kind === 'team' ? teamStatus(line.reading) : { text: line.reason, state: 'none' as const };
    return <SummaryLine label={line.preset.name} status={status.text} state={status.state}
      onOpen={line.kind === 'team' ? (opener) => setEditing({ presetId: line.preset.id, opener }) : undefined}>
      <span className="speed-summary-preset" aria-hidden="true">{line.preset.number ?? ''}</span>
      {order.map((unitId, at) => <span key={unitId} className="speed-summary-member">
        {at > 0 && <span className="speed-summary-step" aria-hidden="true">›</span>}
        <span className="speed-summary-name">{monsterById.has(unitId) ? names[unitId]?.name ?? unitId : 'Not in this import'}</span>
        {line.preset.leaderUnitId === unitId && <LeaderMark />}
        {at < order.length - 1 && <span className="visually-hidden">, </span>}
      </span>)}
    </SummaryLine>;
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
