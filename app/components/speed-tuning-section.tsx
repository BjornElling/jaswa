import { useMemo, useRef, useState } from 'react';
import { Button, FilterButton } from './button';
import { CheckboxRow } from './form-controls';
import { Dropdown } from './dropdown';
import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import { SpeedTeamCard, ruleStateText } from './speed-team-card';
import type { MonsterChoice } from './speed-team-card';
import { SpeedTurnOrderDialog } from './speed-turn-order-dialog';
import type { OpenMonsterOverlay } from './monster-link';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterCopyNames } from '../lib/monster-names';
import { readSkyTribeTotem, totemPercent } from '../lib/sky-tribe-totem';
import { dungeonIds, speedContent } from '../lib/speed-contents';
import type { DungeonId, SpeedContentId } from '../lib/speed-contents';
import { speedBuffPercent, swiftPercent, totemMaximumLevel } from '../lib/speed-tick';
import { naturalInsertIndex, readSpeedTeam } from '../lib/speed-tuning-analysis';
import type { TeamReading } from '../lib/speed-tuning-analysis';
import { newSpeedTuningId } from '../lib/speed-tuning-preferences';
import type { SpeedRule, SpeedTeam, SpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import type { ImportedGame, Preferences } from '../lib/types';

type Titled = { reading: TeamReading; title: string };

type ReadingContext = {
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  rules: readonly SpeedRule[];
  cache: WeakMap<SpeedTeam, TeamReading>;
};

function newReadingContext(monsters: ReadonlyMap<string, GameRecord>, totemPercent: number, rules: readonly SpeedRule[]): ReadingContext {
  return { monsters, totemPercent, rules, cache: new WeakMap() };
}

function cachedReading(context: ReadingContext, team: SpeedTeam): TeamReading {
  const held = context.cache.get(team);
  if (held) return held;
  const reading = readSpeedTeam({ team, monsters: context.monsters, totemPercent: context.totemPercent, rules: context.rules });
  context.cache.set(team, reading);
  return reading;
}

function newTeam(content: SpeedContentId): SpeedTeam {
  return { id: newSpeedTuningId('team'), content, members: [], leaderUnitId: null, marginEnabled: false, margin: 1 };
}

export function SpeedTuningSection({ game, monsters, preferences, onWrite, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: readonly GameRecord[];
  preferences: Preferences;
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const { teams, rules } = preferences.speedTuning;
  const general = preferences.general;
  const [newDungeon, setNewDungeon] = useState<DungeonId>('giants');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  /* The Turn order button that opened the dialog, so closing it puts focus back where the reader was. */
  const dialogOpener = useRef<HTMLElement | null>(null);

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
  const readings = useMemo(() => new Map(teams.map((team) => [team.id, cachedReading(readingContext, team)])), [teams, readingContext]);

  /* Numbered within their own kind, in the order they were added: the first
     arena team is Arena team #1 whatever the dungeons hold. */
  const titled = (filter: (team: SpeedTeam) => boolean, label: (team: SpeedTeam) => string): Titled[] => {
    const counts = new Map<string, number>();
    return teams.filter(filter).map((team) => {
      const base = label(team);
      const number = (counts.get(base) ?? 0) + 1;
      counts.set(base, number);
      return { reading: readings.get(team.id) as TeamReading, title: `${base} #${number}` };
    });
  };
  const arenaTeams = titled((team) => team.content === 'arena', () => 'Arena team');
  const dungeonTeams = dungeonIds.flatMap((id) => titled((team) => team.content === id, () => `${speedContent(id).name} team`));
  const allTitled = [...dungeonTeams, ...arenaTeams];
  const openTeam = allTitled.find((entry) => entry.reading.team.id === openTeamId);

  function changeTeam(id: string, change: (team: SpeedTeam) => SpeedTeam) {
    onWrite((current) => ({ ...current, teams: current.teams.map((team) => team.id === id ? change(team) : team) }));
  }

  function addTeam(content: SpeedContentId) {
    onWrite((current) => ({ ...current, teams: [...current.teams, newTeam(content)] }));
  }

  function removeTeam(id: string) {
    onWrite((current) => ({ ...current, teams: current.teams.filter((team) => team.id !== id) }));
  }

  /* A monster joins where its own speed puts it; from there the user moves it. */
  function addMonster(reading: TeamReading, unitId: string) {
    const monster = monsterById.get(unitId);
    if (!monster) return;
    const presentIndex = naturalInsertIndex(reading, { unitId, monster }, totemShare);
    const before = reading.members[presentIndex]?.unitId;
    changeTeam(reading.team.id, (team) => {
      if (team.members.some((member) => member.unitId === unitId) || team.members.length >= speedContent(team.content).teamSize) return team;
      const at = before === undefined ? team.members.length : team.members.findIndex((member) => member.unitId === before);
      const members = [...team.members];
      members.splice(at === -1 ? members.length : at, 0, { unitId });
      return { ...team, members };
    });
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
    <SpeedRules totem={totem} general={general} />

    <div className="speed-columns">
      <section className="speed-column" aria-labelledby="speed-dungeons-title">
        <header className="speed-column-head">
          <h2 id="speed-dungeons-title" className="type-title">Dungeons</h2>
          <div className="speed-column-add">
            <Dropdown aria-label="Dungeon for the new team" value={newDungeon}
              onChange={(event) => setNewDungeon(event.target.value as DungeonId)}>
              {dungeonIds.map((id) => <option key={id} value={id}>{speedContent(id).name}</option>)}
            </Dropdown>
            <Button tone="important" onClick={() => addTeam(newDungeon)}>Add dungeon team</Button>
          </div>
        </header>
        {dungeonTeams.length === 0
          ? <p className="speed-column-empty type-caption">No dungeon teams yet. Choose a dungeon and add one; each is tuned against its hardest floor.</p>
          : dungeonTeams.map(renderTeam)}
      </section>

      <section className="speed-column" aria-labelledby="speed-arena-title">
        <header className="speed-column-head">
          <h2 id="speed-arena-title" className="type-title">Arena offence</h2>
          <div className="speed-column-add">
            <Button tone="important" onClick={() => addTeam('arena')}>Add arena team</Button>
          </div>
        </header>
        {arenaTeams.length === 0
          ? <p className="speed-column-empty type-caption">No arena teams yet. Add one for every offence you tune.</p>
          : arenaTeams.map(renderTeam)}
      </section>

      <RuleColumn rules={rules} choices={choices} names={names} readings={allTitled} onWrite={onWrite} />
    </div>

    {openTeam && <SpeedTurnOrderDialog reading={openTeam.reading} title={openTeam.title} names={names} general={general}
      onClose={() => {
        setOpenTeamId(null);
        if (dialogOpener.current?.isConnected) dialogOpener.current.focus();
      }} />}
  </WorkspacePage>;

  /* A render function rather than a component declared here: a component made
     inside this one would be a new type on every render, remounting each card
     and dropping the focus of a what-if field mid-number. */
  function renderTeam(entry: Titled) {
    const inTeam = new Set(entry.reading.team.members.map((member) => member.unitId));
    return <SpeedTeamCard key={entry.reading.team.id} reading={entry.reading} title={entry.title} names={names} general={general}
      choices={choices.filter((choice) => !inTeam.has(choice.unitId))}
      onChange={(change) => changeTeam(entry.reading.team.id, change)}
      onRemove={() => removeTeam(entry.reading.team.id)}
      onShowTurnOrder={(opener) => { dialogOpener.current = opener; setOpenTeamId(entry.reading.team.id); }}
      onAddMonster={(unitId) => addMonster(entry.reading, unitId)}
      onOpenMonster={onOpenMonster} />;
  }
}

function SpeedHeader() {
  return <PageHeader title="Speed Tuning"
    tagline="Turn order is a solved problem. Getting your own team to respect it is the hard part." />;
}

/**
 * What the page counts before a single rune: the account's own totem, and the
 * rules every figure on the page is read by. Stated once here rather than on
 * every card, because they are the same for every team.
 */
function SpeedRules({ totem, general }: { totem: ReturnType<typeof readSkyTribeTotem>; general: Preferences['general'] }) {
  const totemText = totem.state === 'built'
    ? `Level ${totem.level} of ${totemMaximumLevel} · +${formatNumber(totem.percent, general)} % of base speed`
    : totem.state === 'not-built' ? 'Not built · +0 %' : 'Not in this import · counted as +0 %';
  return <section className="speed-rules" aria-label="What every speed on this page counts">
    <dl className="speed-rule-facts">
      <div><dt className="filter-label">Sky Tribe Totem</dt><dd>{totemText}</dd><dd className="type-caption">Arena and dungeons alike</dd></div>
      <div><dt className="filter-label">Leader skill</dt><dd>Chosen per team</dd><dd className="type-caption">General and element leads count everywhere; arena and dungeon leads only in their own</dd></div>
      <div><dt className="filter-label">Swift</dt><dd>+{swiftPercent} % of base speed</dd><dd className="type-caption">Rounded up in display speed, exact in battle</dd></div>
      <div><dt className="filter-label">Guild</dt><dd>No speed bonus</dd><dd className="type-caption">Guild skills raise other stats in dungeons, never speed</dd></div>
      <div><dt className="filter-label">Speed buff</dt><dd>+{speedBuffPercent} %</dd><dd className="type-caption">Of the whole unrounded combat speed</dd></div>
      <div><dt className="filter-label">Tick</dt><dd>7 % of combat speed</dd><dd className="type-caption">Fullest bar past 100 % moves; one monster per tick</dd></div>
    </dl>
    <p className="speed-rules-note type-caption">
      Display speed is base plus runes, as the game shows it. Arena speed and dungeon speed are the combat speeds:
      base × (1 + totem + leader + Swift) + rune speed, rounded up once. Every attack-bar boost and speed buff a monster has is counted on every one of its turns.
    </p>
  </section>;
}

function RuleColumn({ rules, choices, names, readings, onWrite }: {
  rules: readonly SpeedRule[];
  choices: readonly MonsterChoice[];
  names: ReturnType<typeof monsterCopyNames>;
  readings: readonly Titled[];
  onWrite: (change: (current: SpeedTuningPreferences) => SpeedTuningPreferences) => void;
}) {
  const [faster, setFaster] = useState('');
  const [slower, setSlower] = useState('');
  const [arena, setArena] = useState(true);
  const [dungeons, setDungeons] = useState(true);
  const canAdd = faster !== '' && slower !== '' && faster !== slower && (arena || dungeons);

  function changeRule(id: string, change: Partial<SpeedRule>) {
    onWrite((current) => ({ ...current, rules: current.rules.map((rule) => rule.id === id ? { ...rule, ...change } : rule) }));
  }

  return <section className="speed-column speed-rule-column" aria-labelledby="speed-rules-title">
    <header className="speed-column-head">
      <h2 id="speed-rules-title" className="type-title">Rules</h2>
    </header>
    <form className="speed-rule-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canAdd) return;
      onWrite((current) => ({ ...current, rules: [...current.rules, { id: newSpeedTuningId('rule'), fasterUnitId: faster, slowerUnitId: slower, arena, dungeons }] }));
      setFaster('');
      setSlower('');
    }}>
      <div className="speed-rule-pick">
        <label className="filter-label" htmlFor="speed-rule-faster">Moves first</label>
        <Dropdown id="speed-rule-faster" value={faster} placeholder="Choose a monster" onChange={(event) => setFaster(event.target.value)}>
          {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
        </Dropdown>
      </div>
      <div className="speed-rule-pick">
        <label className="filter-label" htmlFor="speed-rule-slower">Moves after</label>
        <Dropdown id="speed-rule-slower" value={slower} placeholder="Choose a monster" onChange={(event) => setSlower(event.target.value)}>
          {choices.map((choice) => <option key={choice.unitId} value={choice.unitId}>{choice.name}</option>)}
        </Dropdown>
      </div>
      <div className="speed-rule-where">
        <CheckboxRow label="Arena" checked={arena} onChange={setArena} />
        <CheckboxRow label="Dungeons" checked={dungeons} onChange={setDungeons} />
        <Button type="submit" tone="important" disabled={!canAdd}>Add rule</Button>
      </div>
    </form>

    {rules.length === 0
      ? <p className="speed-column-empty type-caption">No rules yet. A rule holds in every team of the ticked kinds that has both monsters.</p>
      : <ul className="speed-rule-list">
        {rules.map((rule) => {
          const verdicts = readings.flatMap((entry) => entry.reading.rules
            .filter((reading) => reading.rule.id === rule.id)
            .map((reading) => ({ title: entry.title, state: reading.state })));
          const fasterName = names[rule.fasterUnitId]?.name ?? 'Not in this import';
          const slowerName = names[rule.slowerUnitId]?.name ?? 'Not in this import';
          const failing = verdicts.filter((verdict) => verdict.state !== 'holds');
          return <li key={rule.id} className="speed-rule">
            <p className="speed-rule-text"><span className="speed-rule-monster" title={fasterName}>{fasterName}</span>
              <span className="type-caption"> moves before </span>
              <span className="speed-rule-monster" title={slowerName}>{slowerName}</span></p>
            <div className="speed-rule-controls">
              <FilterButton active={rule.arena} onClick={() => changeRule(rule.id, { arena: !rule.arena })}
                disabled={rule.arena && !rule.dungeons} aria-label="Applies in arena">Arena</FilterButton>
              <FilterButton active={rule.dungeons} onClick={() => changeRule(rule.id, { dungeons: !rule.dungeons })}
                disabled={rule.dungeons && !rule.arena} aria-label="Applies in dungeons">Dungeons</FilterButton>
              <Button size="compact" aria-label={`Remove the rule ${fasterName} before ${slowerName}`}
                onClick={() => onWrite((current) => ({ ...current, rules: current.rules.filter((entry) => entry.id !== rule.id) }))}>Remove</Button>
            </div>
            <p className="speed-rule-state type-caption" data-state={verdicts.length === 0 ? 'none' : failing.length ? 'bad' : 'good'}
              title={failing.map((verdict) => `${verdict.title}: ${ruleStateText[verdict.state]}`).join(' · ')}>
              {verdicts.length === 0
                ? 'No team holds both yet.'
                : failing.length === 0
                  ? `Holds in ${verdicts.length === 1 ? 'the one team' : `all ${verdicts.length} teams`} with both.`
                  : failing.map((verdict) => `${verdict.title}: ${ruleStateText[verdict.state]}`).join(' · ')}
            </p>
          </li>;
        })}
      </ul>}
  </section>;
}
