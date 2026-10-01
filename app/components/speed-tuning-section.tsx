import { useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button } from './button';
import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import type { MonsterChoice } from './speed-team-editor';
import { SpeedRuleOverlay } from './speed-rule-overlay';
import { SpeedTeamOverlay } from './speed-team-overlay';
import type { OpenMonsterOverlay } from './monster-link';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterCopyNames } from '../lib/monster-names';
import { readSkyTribeTotem, totemPercent } from '../lib/sky-tribe-totem';
import { dungeonIds, speedContent } from '../lib/speed-contents';
import type { SpeedContentId } from '../lib/speed-contents';
import { totemMaximumLevel } from '../lib/speed-tick';
import { hasWhatIf, outOfPlaceCount, readSpeedTeam, ruleStateText, withoutWhatIfs } from '../lib/speed-tuning-analysis';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import { newSpeedTuningId, speedTeamTitle } from '../lib/speed-tuning-preferences';
import type { SpeedRule, SpeedTeam, SpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../lib/types';

type Titled = { reading: TeamReading; worn: TeamReading; title: string };
type Verdict = 'good' | 'bad' | 'none';

type ReadingContext = {
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  rules: readonly SpeedRule[];
  cache: WeakMap<SpeedTeam, TeamReading>;
  worn: WeakMap<SpeedTeam, TeamReading>;
};

function newReadingContext(monsters: ReadonlyMap<string, GameRecord>, totemPercent: number, rules: readonly SpeedRule[]): ReadingContext {
  return { monsters, totemPercent, rules, cache: new WeakMap(), worn: new WeakMap() };
}

function cachedReading(context: ReadingContext, team: SpeedTeam): TeamReading {
  const held = context.cache.get(team);
  if (held) return held;
  const reading = readSpeedTeam({ team, monsters: context.monsters, totemPercent: context.totemPercent, rules: context.rules });
  context.cache.set(team, reading);
  return reading;
}

/* Every verdict on the page answers whether the runes worn hold the tune, so
   it reads the team without its what-ifs (`withoutWhatIfs`); the experiment
   is the editor's. */
function wornReading(context: ReadingContext, team: SpeedTeam): TeamReading {
  if (!hasWhatIf(team)) return cachedReading(context, team);
  const held = context.worn.get(team);
  if (held) return held;
  const reading = readSpeedTeam({ team: withoutWhatIfs(team), monsters: context.monsters, totemPercent: context.totemPercent, rules: context.rules });
  context.worn.set(team, reading);
  return reading;
}

function newTeam(content: SpeedContentId): SpeedTeam {
  return { id: newSpeedTuningId('team'), content, members: [], leaderUnitId: null, marginEnabled: false, margin: 1 };
}

function newRule(): SpeedRule {
  return { id: newSpeedTuningId('rule'), fasterUnitId: '', slowerUnitId: '', arena: true, dungeons: true };
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

/* A tick or a cross, large enough to be read down a column of lines before
   any name is: the one question the page is opened to answer. */
function SummaryMark({ state }: { state: Verdict }) {
  const path = state === 'good' ? 'M3.5 8.5l3 3 6-7' : state === 'bad' ? 'M4 4l8 8M12 4l-8 8' : 'M4 8h8';
  return <span className="speed-summary-mark" data-state={state} aria-hidden="true">
    <svg viewBox="0 0 16 16"><path d={path} /></svg>
  </span>;
}

/**
 * One line of the page — a team or a rule — and the button that opens it.
 * Two lines and a mark: what the user stated, a sentence saying whether the
 * runes worn deliver it, and that verdict again at the right edge. What was
 * stated is never coloured; it is the user's choice, not a verdict.
 */
function SummaryLine({ label, status, state, onOpen, children }: {
  /** Read before the line's content, so a line is found by its name. */
  label: string;
  status: string;
  state: Verdict;
  onOpen: (opener: HTMLElement) => void;
  children: ReactNode;
}) {
  return <button type="button" className="speed-summary" onClick={(event) => onOpen(event.currentTarget)}>
    <span className="visually-hidden">{label}: </span>
    <span className="speed-summary-names">{children}</span>
    <span className="visually-hidden"> — </span>
    <span className="speed-summary-state" data-state={state}>{status}</span>
    <SummaryMark state={state} />
  </button>;
}

/**
 * A team's verdict in one sentence, read from the runes worn. Where the
 * editor holds what-ifs, the sentence quotes their count too: the editor reads
 * the team with them, and two counts that disagree without saying why read as
 * one of them being wrong.
 */
function teamStatus(worn: TeamReading, experiment: TeamReading): { text: string; state: Verdict } {
  if (worn.team.members.length === 0) return { text: 'No monsters yet', state: 'none' };
  if (worn.missingUnitIds.length) {
    const missing = worn.missingUnitIds.length;
    return { text: `${missing} monster${missing === 1 ? ' is' : 's are'} not in this import`, state: 'bad' };
  }
  const tried = hasWhatIf(experiment.team) ? ` · ${outOfPlaceCount(experiment)} with your what-ifs` : '';
  if (worn.perfect) return { text: `Turn order holds with the runes worn${tried}`, state: 'good' };
  return { text: `${outOfPlaceCount(worn)} of ${worn.members.length} out of place with the runes worn${tried}`, state: 'bad' };
}

const ruleScope = (rule: SpeedRule) => rule.arena && rule.dungeons ? 'Arena and dungeons' : rule.arena ? 'Arena' : 'Dungeons';

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
  const [editingRule, setEditingRule] = useState<Opened<SpeedRule> | null>(null);
  const addDungeonTeam = useRef<HTMLButtonElement>(null);
  const addArenaTeam = useRef<HTMLButtonElement>(null);
  const addRule = useRef<HTMLButtonElement>(null);

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
  const readingContext = useMemo(() => newReadingContext(monsterById, totemShare, rules), [monsterById, totemShare, rules]);

  /* Numbered within their own kind, in the order they were added: the first
     arena team is Arena team #1 whatever the dungeons hold. */
  const titled = (content: SpeedContentId): Titled[] => teams.filter((team) => team.content === content)
    .map((team) => ({
      reading: cachedReading(readingContext, team),
      worn: wornReading(readingContext, team),
      title: speedTeamTitle(teams, team),
    }));
  const arenaTeams = titled('arena');
  const dungeonGroups = dungeonIds.map((id) => ({ id, entries: titled(id) })).filter((group) => group.entries.length > 0);
  const allTitled = [...dungeonGroups.flatMap((group) => group.entries), ...arenaTeams];

  /* A saved entry keeps its place in its list, so a team's number does not
     change under it; a new one goes last, which is where its overlay said. */
  function saveTeam(saved: SpeedTeam) {
    onWrite((current) => ({ ...current, teams: upsert(current.teams, saved) }));
  }
  function saveRule(saved: SpeedRule) {
    onWrite((current) => ({ ...current, rules: upsert(current.rules, saved) }));
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
    <SpeedBasis totem={totem} general={general} />

    <div className="speed-columns">
      <section className="speed-column" aria-labelledby="speed-dungeons-title">
        <ColumnHead id="speed-dungeons-title" title="Dungeons" addLabel="Add team" addRef={addDungeonTeam}
          onAdd={(opener) => setEditingTeam({ value: newTeam(dungeonIds[0]), isNew: true, opener, fallback: addDungeonTeam })} />
        {dungeonGroups.length === 0
          ? <p className="speed-column-empty type-caption">No dungeon teams yet. Add one; each is tuned against its dungeon&apos;s hardest floor.</p>
          : dungeonGroups.map((group) => <section key={group.id} className="speed-group" aria-labelledby={`speed-dungeon-${group.id}`}>
            <h3 id={`speed-dungeon-${group.id}`} className="speed-group-title">{speedContent(group.id).name}</h3>
            <ul className="speed-summary-list">
              {group.entries.map((entry) => <li key={entry.reading.team.id}>{renderTeam(entry, addDungeonTeam)}</li>)}
            </ul>
          </section>)}
      </section>

      <section className="speed-column" aria-labelledby="speed-arena-title">
        <ColumnHead id="speed-arena-title" title="Arena offence" addLabel="Add team" addRef={addArenaTeam}
          onAdd={(opener) => setEditingTeam({ value: newTeam('arena'), isNew: true, opener, fallback: addArenaTeam })} />
        {arenaTeams.length === 0
          ? <p className="speed-column-empty type-caption">No arena teams yet. Add one for every offence you tune; each faces a worst-case enemy read from the team itself.</p>
          : <ul className="speed-summary-list">
            {arenaTeams.map((entry) => <li key={entry.reading.team.id}>{renderTeam(entry, addArenaTeam)}</li>)}
          </ul>}
      </section>

      <section className="speed-column" aria-labelledby="speed-rules-title">
        <ColumnHead id="speed-rules-title" title="Rules" addLabel="Add rule" addRef={addRule}
          onAdd={(opener) => setEditingRule({ value: newRule(), isNew: true, opener, fallback: addRule })} />
        {rules.length === 0
          ? <p className="speed-column-empty type-caption">No rules yet. A rule says one monster moves before another, in every team that holds them both.</p>
          : <ul className="speed-summary-list">{rules.map((rule) => <li key={rule.id}>{renderRule(rule)}</li>)}</ul>}
      </section>
    </div>

    {editingTeam && <SpeedTeamOverlay key={editingTeam.value.id} initial={editingTeam.value} isNew={editingTeam.isNew} teams={teams}
      monsters={monsterById} totemShare={totemShare} rules={rules} names={names} choices={choices} general={general}
      onSave={(team) => { saveTeam(team); closeTeam(); }}
      onRemove={() => {
        const id = editingTeam.value.id;
        onWrite((current) => ({ ...current, teams: current.teams.filter((team) => team.id !== id) }));
        closeTeam();
      }}
      onClose={closeTeam} onOpenMonster={onOpenMonster} />}

    {editingRule && <SpeedRuleOverlay key={editingRule.value.id} initial={editingRule.value} isNew={editingRule.isNew}
      choices={choices} names={names}
      onSave={(rule) => { saveRule(rule); closeRule(); }}
      onRemove={() => {
        const id = editingRule.value.id;
        onWrite((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }));
        closeRule();
      }}
      onClose={closeRule} />}
  </WorkspacePage>;

  /* A team's line: the order asked for, its leader marked. */
  function renderTeam(entry: Titled, fallback: RefObject<HTMLButtonElement | null>) {
    const { team } = entry.reading;
    const status = teamStatus(entry.worn, entry.reading);
    return <SummaryLine label={entry.title} status={status.text} state={status.state}
      onOpen={(opener) => setEditingTeam({ value: team, isNew: false, opener, fallback })}>
      {team.members.map((member, at) => <span key={member.unitId} className="speed-summary-member">
        {at > 0 && <span className="speed-summary-step" aria-hidden="true">›</span>}
        <span className="speed-summary-name">{monsterById.has(member.unitId) ? names[member.unitId]?.name ?? member.unitId : 'Not in this import'}</span>
        {team.leaderUnitId === member.unitId && <LeaderMark />}
        {at < team.members.length - 1 && <span className="visually-hidden">, </span>}
      </span>)}
    </SummaryLine>;
  }

  /* A rule's line: who moves before whom, where it reaches, and every team
     with both that breaks it — named, since that is where the fix is made. */
  function renderRule(rule: SpeedRule) {
    const verdicts = allTitled.flatMap((entry) => entry.worn.rules
      .filter((reading) => reading.rule.id === rule.id)
      .map((reading) => ({ title: entry.title, state: reading.state })));
    const failing = verdicts.filter((verdict) => verdict.state !== 'holds');
    const fasterName = monsterById.has(rule.fasterUnitId) ? names[rule.fasterUnitId]?.name ?? rule.fasterUnitId : 'Not in this import';
    const slowerName = monsterById.has(rule.slowerUnitId) ? names[rule.slowerUnitId]?.name ?? rule.slowerUnitId : 'Not in this import';
    const verdict = verdicts.length === 0
      ? 'no team holds both yet'
      : failing.length === 0
        ? `holds in ${verdicts.length === 1 ? 'the one team' : `all ${verdicts.length} teams`} with both`
        : failing.map((entry) => `${entry.title}: ${ruleStateText[entry.state]}`).join(' · ');
    const state: Verdict = verdicts.length === 0 ? 'none' : failing.length ? 'bad' : 'good';
    return <SummaryLine label={`Rule ${fasterName} before ${slowerName}`} status={`${ruleScope(rule)} · ${verdict}`} state={state}
      onOpen={(opener) => setEditingRule({ value: rule, isNew: false, opener, fallback: addRule })}>
      <span className="speed-summary-member"><span className="speed-summary-name">{fasterName}</span></span>
      <span className="speed-summary-step">before</span>
      <span className="speed-summary-member"><span className="speed-summary-name">{slowerName}</span></span>
    </SummaryLine>;
  }
}

function upsert<T extends { id: string }>(list: readonly T[], saved: T): T[] {
  return list.some((entry) => entry.id === saved.id)
    ? list.map((entry) => entry.id === saved.id ? saved : entry)
    : [...list, saved];
}

/** A column's title and its one action, on one line, the action at the far edge. */
function ColumnHead({ id, title, addLabel, addRef, onAdd }: {
  id: string;
  title: string;
  addLabel: string;
  addRef: RefObject<HTMLButtonElement | null>;
  onAdd: (opener: HTMLElement) => void;
}) {
  return <header className="speed-column-head">
    <h2 id={id} className="type-title">{title}</h2>
    <Button ref={addRef} tone="important" size="compact" onClick={(event) => onAdd(event.currentTarget)}>
      <PlusIcon />{addLabel}
    </Button>
  </header>;
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
function SpeedBasis({ totem, general }: { totem: ReturnType<typeof readSkyTribeTotem>; general: Preferences['general'] }) {
  const level = totem.state === 'built' ? `Level ${totem.level} of ${totemMaximumLevel}`
    : totem.state === 'not-built' ? 'Not built' : 'Not in this import';
  const percent = totem.state === 'built' ? totem.percent : 0;
  /* The bonus is the figure every combat speed on the page counts, so it is
     the one in full ink; the level is where it comes from, and dimmed. */
  return <section className="speed-basis" aria-labelledby="speed-basis-title">
    <h2 id="speed-basis-title" className="speed-basis-title">Sky Tribe Totem</h2>
    <p className="speed-basis-level">{level}</p>
    <p className="speed-basis-bonus">
      <span className="speed-basis-figure">+{formatNumber(percent, general)} %</span> of base speed
    </p>
  </section>;
}
