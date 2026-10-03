import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Button } from './button';
import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import type { MonsterChoice } from './speed-team-editor';
import { SpeedRuleOverlay } from './speed-rule-overlay';
import { SpeedTeamOverlay } from './speed-team-overlay';
import { SpeedVerdictMark } from './speed-verdict-mark';
import type { SpeedVerdict } from './speed-verdict-mark';
import type { OpenMonsterOverlay } from './monster-link';
import { reorderKeyStep, useDragReorder } from './use-drag-reorder';
import { formatNumber } from '../lib/formatting';
import { moveItem, moveWithin } from '../lib/list-order';
import type { GameRecord } from '../lib/game-data';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterCopyNames } from '../lib/monster-names';
import { readSkyTribeTotem, totemPercent } from '../lib/sky-tribe-totem';
import { dungeonIds, speedContent } from '../lib/speed-contents';
import type { SpeedContentId } from '../lib/speed-contents';
import { totemMaximumLevel } from '../lib/speed-tick';
import { readSpeedRule, speedRuleKind, speedRuleScopeText, speedRuleSentence, speedRuleVerdict } from '../lib/speed-rules';
import { outOfPlaceCount, readSpeedTeam } from '../lib/speed-tuning-analysis';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import { newSpeedTuningId, speedTeamTitle } from '../lib/speed-tuning-preferences';
import type { SpeedRule, SpeedTeam, SpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../lib/types';

type Titled = { reading: TeamReading; title: string };
type Verdict = SpeedVerdict;

type ReadingContext = {
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  cache: WeakMap<SpeedTeam, TeamReading>;
};

function newReadingContext(monsters: ReadonlyMap<string, GameRecord>, totemPercent: number): ReadingContext {
  return { monsters, totemPercent, cache: new WeakMap() };
}

function cachedReading(context: ReadingContext, team: SpeedTeam): TeamReading {
  const held = context.cache.get(team);
  if (held) return held;
  const reading = readSpeedTeam({ team, monsters: context.monsters, totemPercent: context.totemPercent });
  context.cache.set(team, reading);
  return reading;
}

function newTeam(content: SpeedContentId): SpeedTeam {
  return { id: newSpeedTuningId('team'), content, members: [], leaderUnitId: null };
}

function PlusIcon() {
  return <svg className="speed-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
}

/** A crown: whose leader skill the team runs. */
function LeaderMark() {
  return <span className="speed-leader-mark" role="img" aria-label="leader" title="Leader">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5h11M3 10.5l-1-6 3.5 3L8 3l2.5 4.5 3.5-3-1 6z" /></svg>
  </span>;
}

/**
 * One line of the page — a team or a rule — and the button that opens it.
 * Two lines and a mark: what the user stated, a sentence saying whether the
 * runes worn deliver it, and that verdict again at the right edge. What was
 * stated is never coloured; it is the user's choice, not a verdict.
 */
function SummaryLine({ label, status, state, spoken, keys, onOpen, children }: {
  /** Read before the line's content, so a line is found by its name. */
  label: string;
  status: string;
  state: Verdict;
  /** The verdict in words, for a line whose status does not already say it. */
  spoken?: string;
  keys: LineKeys;
  onOpen: (opener: HTMLElement) => void;
  children: ReactNode;
}) {
  return <button type="button" className="speed-summary" onClick={(event) => onOpen(event.currentTarget)}
    aria-keyshortcuts={keys.shortcuts} onKeyDown={keys.onKeyDown}>
    <span className="visually-hidden">{label}: </span>
    <span className="speed-summary-names">{children}</span>
    <span className="visually-hidden"> — </span>
    <span className="speed-summary-state" data-state={state}>{status}</span>
    {spoken !== undefined && <span className="visually-hidden"> — {spoken}</span>}
    <SpeedVerdictMark state={state} />
  </button>;
}

/** How a line answers the keyboard's way to move it. */
type LineKeys = { shortcuts?: string; onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void };

/**
 * One column's lines, in the order the user put them: dragged into place, or
 * moved a place at a time with Alt and an arrow on the focused line. The order
 * is saved, and it is what a team's number counts.
 */
function SummaryList<T>({ entries, keyOf, onMove, render }: {
  entries: readonly T[];
  keyOf: (entry: T) => string;
  onMove: (from: number, to: number) => void;
  render: (entry: T, keys: LineKeys) => ReactNode;
}) {
  const reorder = useDragReorder<HTMLUListElement>({ count: entries.length, onMove });
  const keys = (at: number): LineKeys => entries.length < 2 ? {} : {
    shortcuts: 'Alt+ArrowUp Alt+ArrowDown',
    onKeyDown: (event) => {
      const to = at + reorderKeyStep(event);
      if (to === at || to < 0 || to >= entries.length) return;
      event.preventDefault();
      /* The line is the same element after the move, but moving it in the
         document drops its focus; the keyboard stays with it. */
      const line = event.currentTarget;
      onMove(at, to);
      requestAnimationFrame(() => line.focus());
    },
  };
  return <ul className="speed-summary-list" {...reorder.containerProps}>
    {entries.map((entry, at) => <li key={keyOf(entry)} {...reorder.entryProps(at)}>{render(entry, keys(at))}</li>)}
  </ul>;
}

/**
 * A team's verdict in one sentence. The page only ever reads the runes worn —
 * a what-if lives and dies inside the open editor — so the sentence need not
 * say which reading it is.
 */
function teamStatus(reading: TeamReading): { text: string; state: Verdict } {
  if (reading.team.members.length === 0) return { text: 'No monsters yet', state: 'none' };
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

type Opened<T> = { value: T; isNew: boolean; opener: HTMLElement | null; fallback: RefObject<HTMLButtonElement | null> };

export function SpeedTuningSection({ game, monsters, preferences, onWrite, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const { teams, rules } = preferences.speedTuning;
  const general = preferences.general;
  const [editingTeam, setEditingTeam] = useState<Opened<SpeedTeam> | null>(null);
  /* A rule not yet saved has no rule to open, only the id it will be saved under. */
  const [editingRule, setEditingRule] = useState<Opened<{ id: string; saved: SpeedRule | null }> | null>(null);
  /* The one Add button, and where focus returns when the entry it was
     opened for is gone. */
  const addButton = useRef<HTMLButtonElement>(null);

  const names = useMemo(() => monsterCopyNames(monsters, preferences.monsterPreferences), [monsters, preferences.monsterPreferences]);
  const monsterById = useMemo(() => new Map(monsters
    .filter((monster) => monster.unit_id !== undefined && monster.unit_id !== null)
    .map((monster) => [String(monster.unit_id), monster])), [monsters]);
  const choices = useMemo<MonsterChoice[]>(() => [...monsterById.entries()]
    .map(([unitId, monster]) => ({ unitId, masterId: String(monster.unit_master_id ?? ''), name: names[unitId]?.name ?? unitId }))
    .sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.unitId.localeCompare(right.unitId)),
  [monsterById, names]);

  const totem = useMemo(() => readSkyTribeTotem(game?.data), [game]);
  const totemShare = totemPercent(totem);

  /* A reading costs tens of milliseconds — an interval is found by running the
     clock at every candidate display speed — so each team keeps its reading
     until that team itself changes. An edit replaces only the edited team's
     object, which is what the cache is keyed on; the import, the totem and the
     rules reach every team, so a change to any of them starts a new context. */
  const readingContext = useMemo(() => newReadingContext(monsterById, totemShare), [monsterById, totemShare]);
  const ruleReadings = useMemo(() => new Map(rules.map((rule) => [rule.id, readSpeedRule(rule, monsterById, totemShare)])),
    [rules, monsterById, totemShare]);

  /* Numbered within their own kind, in the order they are listed: the first
     arena team is Arena team #1 whatever the dungeons hold, and dragging a
     team to the top makes it #1. */
  const titled = (content: SpeedContentId): Titled[] => teams.filter((team) => team.content === content)
    .map((team) => ({
      reading: cachedReading(readingContext, team),
      title: speedTeamTitle(teams, team),
    }));
  const arenaTeams = titled('arena');
  const dungeonGroups = dungeonIds.map((id) => ({ id, entries: titled(id) })).filter((group) => group.entries.length > 0);

  /* A saved entry keeps its place in its list, so a team's number does not
     change under it; a new one goes last, which is where its overlay said. */
  function saveTeam(saved: SpeedTeam) {
    onWrite((current) => ({ ...current, teams: upsert(current.teams, saved) }));
  }
  function saveRule(saved: SpeedRule) {
    onWrite((current) => ({ ...current, rules: upsert(current.rules, saved) }));
  }
  /* Within one list only: a dungeon's teams among themselves, arena's among its own. */
  function moveTeam(content: SpeedContentId, from: number, to: number) {
    onWrite((current) => ({ ...current, teams: moveWithin(current.teams, (team) => team.content === content, from, to) }));
  }

  /* Back to the line that was opened; an entry just removed has no line, and
     a new one's opener was its Add button, which is still the right place. */
  function refocus(opened: Opened<unknown>) {
    requestAnimationFrame(() => (opened.opener?.isConnected ? opened.opener : opened.fallback.current)?.focus());
  }
  function closeTeam() {
    if (editingTeam) refocus(editingTeam);
    setEditingTeam(null);
  }
  function closeRule() {
    if (editingRule) refocus(editingRule);
    setEditingRule(null);
  }

  if (!game) {
    return <WorkspacePage header={<SpeedHeader />}>
      <section className="empty-state">
        <h2>Tunes the teams you name to move in the order you choose.</h2>
        <p className="next-step">Import your game data first. Speed Tuning reads every monster&apos;s own runes, so there is nothing to tune without them.</p>
      </section>
    </WorkspacePage>;
  }

  return <WorkspacePage header={<SpeedHeader />}>
    <SpeedBasis totem={totem} general={general} action={<AddMenu triggerRef={addButton} onChoose={(choice, opener) => {
      if (choice === 'rule') setEditingRule({ value: { id: newSpeedTuningId('rule'), saved: null }, isNew: true, opener, fallback: addButton });
      else setEditingTeam({ value: newTeam(choice === 'dungeon' ? dungeonIds[0] : 'arena'), isNew: true, opener, fallback: addButton });
    }} />} />

    <div className="speed-columns">
      <section className="speed-column" aria-labelledby="speed-dungeons-title">
        <ColumnHead id="speed-dungeons-title" title="Dungeons" />
        {dungeonGroups.length === 0
          ? <p className="speed-column-empty type-caption">No dungeon teams yet.</p>
          : dungeonGroups.map((group) => <section key={group.id} className="speed-group" aria-labelledby={`speed-dungeon-${group.id}`}>
            <h3 id={`speed-dungeon-${group.id}`} className="speed-group-title">{speedContent(group.id).name}</h3>
            <SummaryList entries={group.entries} keyOf={(entry) => entry.reading.team.id}
              onMove={(from, to) => moveTeam(group.id, from, to)} render={renderTeam} />
          </section>)}
      </section>

      <section className="speed-column" aria-labelledby="speed-arena-title">
        <ColumnHead id="speed-arena-title" title="Arena offence" />
        {arenaTeams.length === 0
          ? <p className="speed-column-empty type-caption">No arena teams yet.</p>
          : <SummaryList entries={arenaTeams} keyOf={(entry) => entry.reading.team.id}
            onMove={(from, to) => moveTeam('arena', from, to)} render={renderTeam} />}
      </section>

      <section className="speed-column" aria-labelledby="speed-rules-title">
        <ColumnHead id="speed-rules-title" title="Rules" />
        {rules.length === 0
          ? <p className="speed-column-empty type-caption">No rules yet.</p>
          : <SummaryList entries={rules} keyOf={(rule) => rule.id}
            onMove={(from, to) => onWrite((current) => ({ ...current, rules: moveItem(current.rules, from, to) }))}
            render={renderRule} />}
      </section>
    </div>

    {editingTeam && <SpeedTeamOverlay key={editingTeam.value.id} initial={editingTeam.value} isNew={editingTeam.isNew} teams={teams}
      monsters={monsterById} totemShare={totemShare} names={names} choices={choices} general={general}
      onSave={(team) => { saveTeam(team); closeTeam(); }}
      onRemove={() => {
        const id = editingTeam.value.id;
        onWrite((current) => ({ ...current, teams: current.teams.filter((team) => team.id !== id) }));
        closeTeam();
      }}
      onClose={closeTeam} onOpenMonster={onOpenMonster} />}

    {editingRule && <SpeedRuleOverlay key={editingRule.value.id} id={editingRule.value.id} initial={editingRule.value.saved}
      choices={choices} names={names} monsters={monsterById} totemShare={totemShare} general={general}
      onSave={(rule) => { saveRule(rule); closeRule(); }}
      onRemove={() => {
        const id = editingRule.value.id;
        onWrite((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }));
        closeRule();
      }}
      onClose={closeRule} />}
  </WorkspacePage>;

  /* A team's line: the order asked for, its leader marked. */
  function renderTeam(entry: Titled, keys: LineKeys) {
    const { team } = entry.reading;
    const status = teamStatus(entry.reading);
    return <SummaryLine label={entry.title} status={status.text} state={status.state} keys={keys}
      onOpen={(opener) => setEditingTeam({ value: team, isNew: false, opener, fallback: addButton })}>
      {team.members.map((member, at) => <span key={member.unitId} className="speed-summary-member">
        {at > 0 && <span className="speed-summary-step" aria-hidden="true">›</span>}
        <span className="speed-summary-name">{monsterById.has(member.unitId) ? names[member.unitId]?.name ?? member.unitId : 'Not in this import'}</span>
        {team.leaderUnitId === member.unitId && <LeaderMark />}
        {at < team.members.length - 1 && <span className="visually-hidden">, </span>}
      </span>)}
    </SummaryLine>;
  }

  /* A rule's line: the rule as a sentence, its monsters and figures in full
     ink, where it is checked under it, and whether it holds there at the edge. */
  function renderRule(rule: SpeedRule, keys: LineKeys) {
    const reading = ruleReadings.get(rule.id) ?? readSpeedRule(rule, monsterById, totemShare);
    const state = speedRuleVerdict(rule, reading);
    const nameOf = (unitId: string) => monsterById.has(unitId) ? names[unitId]?.name ?? unitId : 'Not in this import';
    const figure = (value: number) => <span className="speed-summary-member"><span className="speed-summary-name speed-summary-figure">{formatNumber(value, general)}</span></span>;
    const { must } = rule;
    return <SummaryLine label={`Rule ${speedRuleSentence(rule, nameOf, (value) => formatNumber(value, general))}`}
      status={speedRuleScopeText(rule)} state={state} keys={keys}
      spoken={state === 'good' ? 'holds' : state === 'bad' ? 'does not hold' : 'not judged'}
      onOpen={(opener) => setEditingRule({ value: { id: rule.id, saved: rule }, isNew: false, opener, fallback: addButton })}>
      <span className="speed-summary-member"><span className="speed-summary-name">{nameOf(rule.unitId)}</span></span>
      <span className="speed-summary-step">must {speedRuleKind(must.kind).label.toLowerCase()}</span>
      {must.kind === 'move-before' || must.kind === 'move-after'
        ? <span className="speed-summary-member"><span className="speed-summary-name">{nameOf(must.unitId)}</span></span>
        : must.kind === 'stay-between'
          ? <>{figure(must.minimum)}<span className="speed-summary-step">and</span>{figure(must.maximum)}</>
          : figure(must.speed)}
    </SummaryLine>;
  }
}

function upsert<T extends { id: string }>(list: readonly T[], saved: T): T[] {
  return list.some((entry) => entry.id === saved.id)
    ? list.map((entry) => entry.id === saved.id ? saved : entry)
    : [...list, saved];
}

/** A column's title, ruled off from its lines. */
function ColumnHead({ id, title }: { id: string; title: string }) {
  return <header className="speed-column-head">
    <h2 id={id} className="type-title">{title}</h2>
  </header>;
}

type AddChoice = 'dungeon' | 'arena' | 'rule';
const addChoices: readonly { choice: AddChoice; label: string }[] = [
  { choice: 'dungeon', label: 'Dungeon team' },
  { choice: 'arena', label: 'Arena team' },
  { choice: 'rule', label: 'Rule' },
];

/**
 * The page's one way to add anything: a button that opens a short menu of
 * the three things the page holds. One button in the strip every figure
 * starts from, rather than one per column head, so the columns are ruled
 * titles over their lines and the action is in one predictable place.
 *
 * The menu is absolutely placed, so opening it moves nothing (AGENTS.md §2).
 * Escape, a click outside and Tab close it; Escape and a choice hand focus
 * back to the button, which is also where a closed overlay returns it.
 */
function AddMenu({ triggerRef, onChoose }: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onChoose: (choice: AddChoice, opener: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    function onPointer(event: MouseEvent) {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    const at = items.current.findIndex((item) => item === document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const last = addChoices.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : (at + step + addChoices.length) % addChoices.length;
    items.current[next]?.focus();
  }

  return <div ref={holder} className="speed-add" onKeyDown={onKeyDown}>
    <Button ref={triggerRef} tone="important" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen((current) => !current)}>
      <PlusIcon />Add…
    </Button>
    {open && <div id={menuId} className="speed-add-menu" role="menu" aria-label="Add">
      {addChoices.map(({ choice, label }, at) => <button key={choice} ref={(element) => { items.current[at] = element; }}
        type="button" role="menuitem" className="speed-add-item" tabIndex={-1}
        onClick={() => {
          setOpen(false);
          if (triggerRef.current) onChoose(choice, triggerRef.current);
        }}>{label}</button>)}
    </div>}
  </div>;
}

function SpeedHeader() {
  return <PageHeader title="Speed Tuning"
    tagline="Turn order is a solved problem. Getting your own team to respect it is the hard part." />;
}

/**
 * The one thing every figure on the page counts that belongs to the account
 * rather than to a team: the totem. Everything else that moves a turn belongs to one monster or one team (a
 * leader skill, a skill that boosts or buffs) and is read where that monster
 * or team is.
 */
function SpeedBasis({ totem, general, action }: {
  totem: ReturnType<typeof readSkyTribeTotem>;
  general: Preferences['general'];
  /** The page's one action, at the strip's far edge. */
  action: ReactNode;
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
    {action}
  </div>;
}
