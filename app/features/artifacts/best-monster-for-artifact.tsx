import { filterIncludes } from '../../domain/shared/filter-selection';
import { type ReactNode, useMemo, useState } from 'react';
import { FilterButton } from '../../ui/button';
import { CalculationActions, CalculationNote } from '../../ui/calculation-actions';
import { GameRefreshNote, OutdatedNotice } from './calculation-notices';
import { CalculationStatus } from '../../ui/calculation-status';
import { useCancellableRun } from '../../ui/use-cancellable-run';
import { isCalculationCancelled } from '../../workspace/jobs/cancellable-worker';
import { Dropdown } from '../../ui/dropdown';
import { ConvertedArtifactMark } from '../../ui/gear/converted-artifact-mark';
import { UnrefinedArtifactMark } from '../../ui/gear/unrefined-artifact-mark';
import { SortableHeader } from '../../ui/sortable-table';
import { useSortedRows } from '../../ui/use-sorted-rows';
import { columnClasses } from '../../ui/table-layouts';
import { calculateArtifactScores } from '../../workspace/jobs/artifact-score-client';
import { combineCalculationBackends } from '../../domain/shared/calculation-summary';
import type { CalculationBackend } from '../../domain/shared/calculation-summary';
import { buildArtifactScoreRequests, buildArtifactScoreRequestsForMonsterIds } from '../../domain/artifacts/score/artifact-score-input';
import { ConversionList } from './conversion-list';
import { isWorthwhileGain, scoringSettings } from '../../domain/artifacts/artifact-recommendations';
import { artifactScoreChanges, artifactScoreUpdateRequests } from '../../domain/artifacts/score/artifact-score-refresh';
import { useArtifactViewState } from './artifact-view-session';
import { useGameRefresh } from './use-game-refresh';
import type { SortableColumn } from '../../ui/use-sorted-rows';
import { artifactCategoryLabel, artifactEngraveClassLabel, artifactValueTint, displaySubProperty } from '../../domain/artifacts/artifact-grid';
import { artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder, artifactIntangibleLabel, artifactMainPropertyOrder } from '../../domain/artifacts/artifact-properties';
import { formatNumber } from '../../domain/shared/formatting';
import { monsterPresentation } from '../../domain/monsters/monster-catalog';
import { monsterSpeciesId } from '../../domain/monsters/monster-identity';
import { monsterCopyNames } from '../../domain/monsters/monster-names';
import type { MonsterCopyName } from '../../domain/monsters/monster-names';
import type { MonsterProfiles } from '../../domain/profiles/monster-preferences';
import { monsterNameCollator } from '../../domain/monsters/monster-grid';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../../domain/artifacts/artifact-properties';
import type { ArtifactMaximumScore, ArtifactScoreRequest, ArtifactScoreResult } from '../../domain/artifacts/score/artifact-score-protocol';
import type { Artifact } from '../../domain/artifacts/artifacts';
import type { EngravedConversionStone } from '../../domain/artifacts/artifact-conversion-stones';
import type { GameRecord } from '../../domain/account/game-record';
import type { MonsterArchetype } from '../../domain/monsters/monster-catalog';
import type { ArtifactSettings, GeneralSettings } from '../../domain/model';
import { artifactOptimizationMonsters } from '../../domain/artifacts/artifact-optimization-monsters';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
/* Intangible is offered alongside the named classes so the wildcard artifacts
   are reachable by filter rather than only findable by scrolling. */
const restrictionOptions = [
  ...Object.values(artifactElements), ...Object.values(artifactArchetypes), artifactIntangibleLabel,
];
const artifactLocations = ['inventory', 'engraved'] as const;

type ArtifactLocation = typeof artifactLocations[number];

type ArtifactFilters = {
  categories: ArtifactCategory[];
  restrictions: string[];
  grades: ArtifactGrade[];
  mainProperties: ArtifactMainProperty[];
  subPropertyId: string;
  locations: ArtifactLocation[];
  /** The chooser belongs to this state so Reset filters clears it as well. */
  selectedArtifactId: string;
};

type MonsterOption = {
  unitId: string;
  masterId: string;
  /* Scores are computed per species, so a copy carries the id its scores are
     filed under as well as the master id the game gave it. */
  speciesId: string;
  name: string;
  archetype: MonsterArchetype | undefined;
};

/* The user's choices the answer was calculated under, apart from the game it was
   calculated from (`ACCOUNT-TABLES.md` §7). The tables are drawn from the
   artifact, roster and engraved slots the answer scored, so while a game change
   is being merged in they show the held answer whole. */
type Calculation = {
  standardsKey: string;
  data: GameRecord;
  artifact: Artifact;
  stones: readonly EngravedConversionStone[];
  ownMonsters: readonly MonsterOption[];
  engravedSlots: ReadonlyMap<string, ReadonlySet<ArtifactCategory>>;
  scopeRequests: readonly ArtifactScoreRequest[];
  ownedRequests: readonly ArtifactScoreRequest[];
  scopeScores: ArtifactMaximumScore[];
  ownedScores: Map<string, ArtifactMaximumScore>;
  backend: CalculationBackend;
  evaluatedPairs: number;
  durationMs: number;
};

const defaultFilters: ArtifactFilters = {
  categories: [], restrictions: [], grades: [], mainProperties: [], subPropertyId: '', locations: [], selectedArtifactId: '',
};

const optionPartSeparator = '\u2002·\u2002';
const optionRestrictionSeparator = '\u2002/\u2002';
const optionSubstatSeparator = '\u2002|\u2002';

function artifactSortKey(artifact: Artifact): string {
  return [
    artifactCategoryLabel(artifact.category), artifactEngraveClassLabel(artifact), artifact.mainProperty,
    ...artifact.subProperties.map((property) => `${property.definition.name} ${property.valueHundredths}`),
  ].join(' · ');
}

function scoreMap(scores: readonly ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.monsterId, score]));
}

/**
 * One artifact's scores brought up to date with the game: the rows a change
 * touched — every row, if the artifact itself changed — are scored again and
 * every other row keeps its held score. A row the game removed goes with it.
 */
async function refreshedScores(
  requests: readonly ArtifactScoreRequest[],
  heldRequests: readonly ArtifactScoreRequest[],
  held: ReadonlyMap<string, ArtifactMaximumScore>,
  score: (request: ArtifactScoreRequest) => Promise<ArtifactScoreResult>,
): Promise<{ scores: ArtifactMaximumScore[]; results: ArtifactScoreResult[] }> {
  const updates = requests.flatMap((request) => artifactScoreUpdateRequests(request,
    artifactScoreChanges(heldRequests.find((entry) => entry.artifacts[0]?.category === request.artifacts[0]?.category), request)))
    .map((update) => ({ ...update, includeAllScores: true }));
  const results = await Promise.all(updates.map(score));
  const rescored = new Set(updates.flatMap((update) => update.monsters.map((monster) => monster.id)));
  const fresh = scoreMap(results.flatMap((result) => result.allScores));
  const scores = requests.flatMap((request) => request.monsters.flatMap((monster) => {
    const found = rescored.has(monster.id) ? fresh.get(monster.id) : held.get(monster.id);
    return found ? [found] : [];
  }));
  return { scores, results };
}

/* `names` covers the whole roster, so a copy keeps its number when the
   options are narrowed to a subset. */
function ownMonsterOptions(monsters: readonly GameRecord[], names: Record<string, MonsterCopyName>): MonsterOption[] {
  const seen = new Set<string>();
  const options: MonsterOption[] = [];
  for (const monster of monsters) {
    const unitId = typeof monster.unit_id === 'number' || typeof monster.unit_id === 'string' ? String(monster.unit_id) : undefined;
    const masterId = typeof monster.unit_master_id === 'number' || typeof monster.unit_master_id === 'string'
      ? String(monster.unit_master_id) : undefined;
    if (!unitId || !masterId || seen.has(unitId)) continue;
    seen.add(unitId);
    options.push({ unitId, masterId, speciesId: monsterSpeciesId(masterId), name: names[unitId]?.name ?? monsterPresentation(masterId).name, archetype: monsterPresentation(masterId).archetype });
  }
  return options.sort((left, right) => monsterNameCollator.compare(left.name, right.name)
    || monsterNameCollator.compare(left.unitId, right.unitId));
}

/* Scores are already whole percentage points (§17.1), so the figure shown is
   the figure every comparison used, banded by the app's one set of score
   boundaries. */
function Score({ score, general }: { score: ArtifactMaximumScore | undefined; general: GeneralSettings }) {
  return score
    ? <span {...artifactValueTint(score.value)}>{formatNumber(score.value, general)} %</span>
    : '—';
}

function ResultCard({ title, description, children, empty }: {
  title: string;
  description: string;
  children: ReactNode;
  empty: string | undefined;
}) {
  return <section className="best-artifact-result" aria-labelledby={`${title}-title`}>
    <header>
      <h3 id={`${title}-title`}>{title}</h3>
      <p>{description}</p>
    </header>
    {empty ? <p className="best-artifact-empty">{empty}</p> : <div className="best-monster-result-scroll">{children}</div>}
  </section>;
}

export function BestMonsterForArtifact({ account, data, artifacts, stones, monsters, scenarioProfiles, settings, general, hardwareAcceleration }: {
  account: string | null;
  data: GameRecord;
  artifacts: readonly Artifact[];
  stones: readonly EngravedConversionStone[];
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useArtifactViewState<ArtifactFilters>('best-monster.filters', account, defaultFilters);
  const [calculation, setCalculation] = useArtifactViewState<Calculation | undefined>('best-monster.calculation', account, undefined);
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const artifact of artifacts) {
      for (const subProperty of artifact.subProperties) {
        definitions.set(subProperty.definition.id, { id: subProperty.definition.id, name: subProperty.definition.name });
      }
    }
    return [...definitions.values()].sort((left, right) => monsterNameCollator.compare(left.name, right.name)
      || monsterNameCollator.compare(String(left.id), String(right.id)));
  }, [artifacts]);
  const ownMonsters = useMemo(
    () => ownMonsterOptions(artifactOptimizationMonsters(monsters, settings), monsterCopyNames(monsters, scenarioProfiles)),
    [monsters, scenarioProfiles, settings],
  );
  const selectedSubPropertyId = subPropertyOptions.some((option) => String(option.id) === filters.subPropertyId)
    ? filters.subPropertyId : '';
  const artifactsByFilter = useMemo(() => artifacts.filter((artifact) => {
    const restriction = artifactEngraveClassLabel(artifact);
    return filterIncludes(filters.categories, artifact.category, categoryOrder)
      && filterIncludes(filters.restrictions, restriction, restrictionOptions)
      && filterIncludes(filters.grades, artifact.grade, artifactGradeOrder)
      && filterIncludes(filters.mainProperties, artifact.mainProperty, artifactMainPropertyOrder)
      && (!selectedSubPropertyId || artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId))
      && filterIncludes(filters.locations, artifact.occupiedId === null ? 'inventory' : 'engraved', artifactLocations);
  }).sort((left, right) => monsterNameCollator.compare(artifactSortKey(left), artifactSortKey(right))
    || monsterNameCollator.compare(left.id, right.id)), [artifacts, filters, selectedSubPropertyId]);
  const selectedArtifact = artifactsByFilter.find((artifact) => artifact.id === filters.selectedArtifactId);
  const engravedSlots = useMemo(() => {
    const slots = new Map<string, Set<ArtifactCategory>>();
    for (const artifact of artifacts) {
      if (artifact.occupiedId === null) continue;
      const current = slots.get(artifact.occupiedId) ?? new Set<ArtifactCategory>();
      current.add(artifact.category);
      slots.set(artifact.occupiedId, current);
    }
    return slots;
  }, [artifacts]);
  /* The user's choices only; the game's records are merged, not compared. */
  const standardsKey = JSON.stringify({ scenarioProfiles, selectedArtifactId: filters.selectedArtifactId, settings: scoringSettings(settings) });
  const currentCalculation = calculation?.standardsKey === standardsKey ? calculation : undefined;
  const run = useCancellableRun(standardsKey);
  const scoredArtifact = currentCalculation?.artifact;
  const scoredMonsters = currentCalculation?.ownMonsters ?? [];
  const owner = scoredArtifact?.occupiedId === null || scoredArtifact === undefined
    ? undefined : scoredMonsters.find((monster) => monster.unitId === scoredArtifact.occupiedId);
  /* A copy that wants something its species does not is scored under its own
     row (§19.2); every other copy answers to its species'. */
  const ownedScore = (monster: MonsterOption) =>
    currentCalculation?.ownedScores.get(monster.unitId) ?? currentCalculation?.ownedScores.get(monster.speciesId);
  const currentScore = owner ? ownedScore(owner) : undefined;
  const slotlessRows = scoredMonsters.filter((monster) => scoredArtifact !== undefined
    && !currentCalculation?.engravedSlots.get(monster.unitId)?.has(scoredArtifact.category))
    .map((monster) => ({ monster, score: ownedScore(monster) }))
    .sort((left, right) => (right.score?.value ?? -1) - (left.score?.value ?? -1) || left.monster.name.localeCompare(right.monster.name))
    .slice(0, 10);
  /* §17.2 and §17.3: only a destination that genuinely beats the artifact's
     current home, by more than the band the user called meaningful. */
  const improvementRows = scoredMonsters.map((monster) => ({ monster, score: ownedScore(monster) }))
    .filter((row) => currentScore !== undefined && row.score !== undefined
      && isWorthwhileGain(row.score.value, currentScore.value, settings))
    .sort((left, right) => (right.score?.value ?? 0) - (left.score?.value ?? 0) || left.monster.name.localeCompare(right.monster.name))
    .slice(0, 10);
  const rawRows = currentCalculation?.scopeScores.slice()
    .sort((left, right) => right.value - left.value || left.monsterName.localeCompare(right.monsterName))
    .slice(0, 10) ?? [];

  type MonsterRow = { monster: MonsterOption; score: ArtifactMaximumScore | undefined };
  /* A score, a percentage and a point gain are quantities, so they take the
     right edge and their digits line up down the column; a name reads left. */
  const monsterColumns = useMemo<SortableColumn<MonsterRow>[]>(() => [
    { key: 'monster', label: 'Monster', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.monster.name, right.monster.name) },
    { key: 'score', label: 'Score', align: 'right', compare: (left, right) => (left.score?.value ?? -1) - (right.score?.value ?? -1), initialDirection: 'descending' },
    { key: 'conversion', label: 'Conversions', align: 'left', compare: (left, right) => (left.score?.conversions[0]?.gain ?? -1) - (right.score?.conversions[0]?.gain ?? -1), initialDirection: 'descending' },
  ], []);
  const improvementColumns = useMemo<SortableColumn<MonsterRow>[]>(() => [
    { key: 'monster', label: 'Monster', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.monster.name, right.monster.name) },
    { key: 'here', label: 'Here', align: 'right', compare: (left, right) => (left.score?.value ?? -1) - (right.score?.value ?? -1), initialDirection: 'descending' },
    { key: 'current', label: 'Current', align: 'right' },
    { key: 'gain', label: 'Gain', align: 'right', compare: (left, right) => (left.score?.value ?? 0) - (right.score?.value ?? 0), initialDirection: 'descending' },
  ], []);
  type ScopeRow = { score: ArtifactMaximumScore };
  const scopeColumns = useMemo<SortableColumn<ScopeRow>[]>(() => [
    { key: 'monster', label: 'Monster', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.score.monsterName, right.score.monsterName) },
    { key: 'score', label: 'Score', align: 'right', compare: (left, right) => left.score.value - right.score.value, initialDirection: 'descending' },
    { key: 'conversion', label: 'Conversions', align: 'left', compare: (left, right) => (left.score.conversions[0]?.gain ?? -1) - (right.score.conversions[0]?.gain ?? -1), initialDirection: 'descending' },
  ], []);

  /* Each table's cells take their alignment from that table's own column list,
     so a heading and the figures under it cannot disagree. */
  const monsterCell = columnClasses(monsterColumns);
  const improvementCell = columnClasses(improvementColumns);
  const scopeCell = columnClasses(scopeColumns);

  const byName = (left: MonsterRow, right: MonsterRow) => monsterNameCollator.compare(left.monster.name, right.monster.name);
  const slotless = useSortedRows(slotlessRows, monsterColumns, { key: 'score', direction: 'descending' }, byName);
  const improvements = useSortedRows(improvementRows, improvementColumns, { key: 'here', direction: 'descending' }, byName);
  const scope = useSortedRows(rawRows.map((score) => ({ score })), scopeColumns, { key: 'score', direction: 'descending' },
    (left, right) => monsterNameCollator.compare(left.score.monsterName, right.score.monsterName));

  function toggle(key: keyof ArtifactFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: (current[key] as string[]).includes(value)
        ? (current[key] as string[]).filter((entry) => entry !== value)
        : [...(current[key] as string[]), value],
    }));
  }

  /* The chooser is one of the user's standards, so clearing it sets the held
     answer aside like any other change; choosing the artifact again brings it
     back. */
  function resetFilters() {
    setFilters(defaultFilters);
  }

  const scoreRequests = (artifact: Artifact) => {
    const selected = new Set([artifact.id]);
    return {
      scopeRequests: buildArtifactScoreRequests(data, monsters, settings, selected, scenarioProfiles)
        .map((request) => ({ ...request, includeAllScores: true })),
      ownedRequests: buildArtifactScoreRequestsForMonsterIds(data, ownMonsters.map((monster) => monster.speciesId), settings, selected, scenarioProfiles)
        .map((request) => ({ ...request, includeAllScores: true })),
    };
  };

  async function calculate() {
    if (!selectedArtifact) return;
    const { scopeRequests, ownedRequests } = scoreRequests(selectedArtifact);
    if (!scopeRequests.length) {
      setCalculation(undefined);
      setState('error');
      return;
    }
    const before = state;
    const signal = run.start();
    setState('calculating');
    try {
      const [scopeResults, ownedResults] = await Promise.all([
        Promise.all(scopeRequests.map((request) => calculateArtifactScores(request, hardwareAcceleration, signal))),
        Promise.all(ownedRequests.map((request) => calculateArtifactScores(request, hardwareAcceleration, signal))),
      ]);
      setCalculation({
        standardsKey, data, artifact: selectedArtifact, stones, ownMonsters, engravedSlots, scopeRequests, ownedRequests,
        scopeScores: scopeResults.flatMap((result) => result.allScores),
        ownedScores: scoreMap(ownedResults.flatMap((result) => result.allScores)),
        backend: combineCalculationBackends([...scopeResults, ...ownedResults].map((result) => result.backend)),
        evaluatedPairs: [...scopeResults, ...ownedResults].reduce((total, result) => total + result.evaluatedPairs, 0),
        durationMs: [...scopeResults, ...ownedResults].reduce((total, result) => total + result.durationMs, 0),
      });
      setState('idle');
    } catch (failure) {
      /* Cancelled: the answer from before Calculate stands, and so does its state. */
      if (isCalculationCancelled(failure)) { setState(before === 'calculating' ? 'idle' : before); return; }
      setCalculation(undefined);
      setState('error');
    }
  }

  function clear() {
    setCalculation(undefined);
    setState('idle');
  }

  /* A change in the game re-scores what it touched: every monster if the
     artifact itself changed, otherwise only the monsters whose rows moved. The
     answer is about one artifact, so an artifact the game removed takes the
     answer with it. */
  async function refresh(held: Calculation, signal: AbortSignal): Promise<Calculation | undefined> {
    const artifact = artifacts.find((entry) => entry.id === held.artifact.id);
    if (!artifact) return undefined;
    const { scopeRequests, ownedRequests } = scoreRequests(artifact);
    const score = (request: ArtifactScoreRequest) => calculateArtifactScores(request, hardwareAcceleration, signal);
    const [scope, owned] = await Promise.all([
      refreshedScores(scopeRequests, held.scopeRequests, scoreMap(held.scopeScores), score),
      refreshedScores(ownedRequests, held.ownedRequests, held.ownedScores, score),
    ]);
    const ran = [...scope.results, ...owned.results];
    return {
      ...held, data, artifact, stones, ownMonsters, engravedSlots, scopeRequests, ownedRequests,
      scopeScores: scope.scores,
      ownedScores: scoreMap(owned.scores),
      ...(ran.length > 0 ? {
        backend: combineCalculationBackends(ran.map((result) => result.backend)),
        evaluatedPairs: ran.reduce((total, result) => total + result.evaluatedPairs, 0),
        durationMs: ran.reduce((total, result) => total + result.durationMs, 0),
      } : {}),
    };
  }

  const gameRefresh = useGameRefresh({
    held: currentCalculation, data, busy: state === 'calculating', refresh,
    onRefreshed: (from, next) => setCalculation((current) => current === from ? next : current),
  });

  const buttonGroup =<T extends string>(label: string, key: keyof ArtifactFilters, values: readonly T[], display: (value: T) => string, className: string) => <div className={`filter-group ${className}`} role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {values.map((value) => <FilterButton key={value} active={(filters[key] as string[]).includes(value)}
        onClick={() => toggle(key, value)}>{display(value)}</FilterButton>)}
    </div>
  </div>;

  return <div className="best-monster-for-artifact">
    <p className="lead">Filter the artifact library, choose one piece, then see the monsters that can make the most of it.</p>
    <div className="filter-panel best-monster-filters">
      {buttonGroup('Type', 'categories', categoryOrder, (category) => artifactCategoryLabels[category], 'best-monster-filter-type')}
      {buttonGroup('Restriction', 'restrictions', restrictionOptions, (restriction) => restriction, 'best-monster-filter-restriction')}
      {buttonGroup('Quality', 'grades', artifactGradeOrder, (grade) => grade.slice(0, 3).toUpperCase(), 'best-monster-filter-quality')}
      <div className="filter-group best-monster-filter-substat">
        <label className="filter-label" htmlFor="best-monster-substat">Substat</label>
        <div className="filter-group-controls">
          <Dropdown id="best-monster-substat" value={selectedSubPropertyId}
            onChange={(event) => setFilters((current) => ({ ...current, subPropertyId: event.target.value }))}
            aria-label="Filter artifacts by substat" placeholder="All substats">
            {subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Dropdown>
        </div>
      </div>
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder, (property) => property, 'best-monster-filter-main')}
      {buttonGroup('Location', 'locations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Engraved', 'best-monster-filter-location')}
      <div className="filter-group best-monster-artifact-select">
        <label className="filter-label" htmlFor="best-monster-artifact">Artifact</label>
        <div className="filter-group-controls">
          <Dropdown id="best-monster-artifact" value={filters.selectedArtifactId} onChange={(event) => setFilters((current) => ({ ...current, selectedArtifactId: event.target.value }))}
            placeholder="Choose an artifact" aria-label="Choose an artifact for monster recommendations">
            {artifactsByFilter.map((artifact) => {
              const substats = artifact.subProperties.map((property) =>
                displaySubProperty(property, (value) => formatNumber(value, general))).join(optionSubstatSeparator);
              /* The restriction is always named, readable or not: an option that
                 silently dropped the segment read as an ordinary artifact whose
                 category happened to be the last word before the main stat. */
              const categoryAndRestriction = [
                artifactCategoryLabel(artifact.category), artifactEngraveClassLabel(artifact),
              ].join(optionRestrictionSeparator);
              return <option key={artifact.id} value={artifact.id}>{[
                artifact.grade,
                categoryAndRestriction,
                artifact.mainProperty,
                substats,
              ].join(optionPartSeparator)}</option>;
            })}
          </Dropdown>
        </div>
      </div>
      <CalculationActions className="best-monster-actions" busy={state === 'calculating'} canCalculate={selectedArtifact !== undefined}
        calculateTitle="Choose an artifact first." onCalculate={() => void calculate()} onCancel={run.cancel}
        canClear={calculation !== undefined || state === 'error'} onClear={clear}
        status={state === 'calculating' ? <CalculationNote tone="busy">Calculating…</CalculationNote>
          : state === 'error' ? <CalculationNote tone="failed">JASWA could not calculate monster fits for this artifact from the imported data.</CalculationNote>
            : gameRefresh !== 'current' ? <GameRefreshNote state={gameRefresh} />
            : currentCalculation && selectedArtifact
              ? <CalculationStatus twoLines evaluatedPairs={currentCalculation.evaluatedPairs} durationMs={currentCalculation.durationMs}
                backend={currentCalculation.backend} general={general} />
              : <CalculationNote>{''}</CalculationNote>}
        /* The chosen artifact goes with the filters: it was picked out of the
           narrowed list, so leaving it behind would name a piece the restored
           list no longer points at. */
        resets={<button type="button" className="filter-reset" aria-label="Reset artifact filters"
          onClick={resetFilters}>Reset filters</button>} />
    </div>

    {selectedArtifact && <section className="best-monster-artifact-details" aria-labelledby="selected-artifact-title">
      <div>
        <p className="filter-label">Selected artifact</p>
        <h3 id="selected-artifact-title"><UnrefinedArtifactMark unrefined={selectedArtifact.unrefined} />{selectedArtifact.grade} {artifactCategoryLabel(selectedArtifact.category)}</h3>
        <p>{artifactEngraveClassLabel(selectedArtifact)} · Main stat {selectedArtifact.mainProperty}</p>
        {selectedArtifact.intangible && <p className="best-monster-intangible">
          Intangible: it fits any {selectedArtifact.category === 'attribute' ? 'element' : 'monster type'}, so every
          monster below is eligible.
        </p>}
      </div>
      <ul className="artifact-subs">
        {selectedArtifact.subProperties.map((property, index) => <li key={property.definition.id}>
          {displaySubProperty(property, (value) => formatNumber(value, general))}
          {selectedArtifact.convertedPropertyIndex === index && <ConvertedArtifactMark position={index} />}
        </li>)}
      </ul>
    </section>}

    {/* As in the other two views (`ACCOUNT-TABLES.md` §7): a held result that no
        longer answers the user's standards says so instead of disappearing. */}
    <OutdatedNotice shown={calculation !== undefined && currentCalculation === undefined} />

    {currentCalculation && scoredArtifact && selectedArtifact && <>
      <div className="best-monster-results">
        <ResultCard title="No artifact in this slot" description="The ten strongest eligible monsters with no artifact in this category engraved yet."
          empty={slotlessRows.length ? undefined : 'Every monster already has an artifact in this slot.'}>
          <table className="best-monster-table">
            <SortableHeader columns={monsterColumns} sort={slotless.sort} onToggle={slotless.toggle} />
            <tbody>{slotless.sorted.map(({ monster, score }) => <tr key={monster.unitId}>
              <td className={monsterCell('monster')}>{monster.name}</td>
              <td className={monsterCell('score')}><b><Score score={score} general={general} /></b></td>
              <td className={monsterCell('conversion')}>{score ? <ConversionList conversions={score.conversions} artifact={scoredArtifact} stones={currentCalculation.stones} mode={settings.conversionStoneMode} /> : <span className="muted">Not judged</span>}</td>
            </tr>)}</tbody>
          </table>
        </ResultCard>
        <ResultCard title="Improves on current" description={owner ? `The ten strongest monsters that beat this artifact's ${owner.name} score.` : 'Engrave this inventory artifact first to establish a current score.'}
          empty={owner === undefined ? 'This artifact is in inventory, so it has no current score to improve.' : improvementRows.length ? undefined : 'No monster beats the monster it is engraved on by enough to be worth the move.'}>
          <table className="best-monster-table">
            <SortableHeader columns={improvementColumns} sort={improvements.sort} onToggle={improvements.toggle} />
            <tbody>{improvements.sorted.map(({ monster, score }) => <tr key={monster.unitId}>
              <td className={improvementCell('monster')}>{monster.name}</td>
              <td className={improvementCell('here')}><b><Score score={score} general={general} /></b></td>
              <td className={improvementCell('current')}><Score score={currentScore} general={general} /></td>
              <td className={improvementCell('gain')}><b>{formatNumber((score?.value ?? 0) - (currentScore?.value ?? 0), general)} pp</b></td>
            </tr>)}</tbody>
          </table>
        </ResultCard>
        <ResultCard title="Raw score ranking" description="The ten highest-scoring eligible monsters in the active scope."
          empty={rawRows.length ? undefined : 'No monster in the active scope can be judged for this artifact.'}>
          <table className="best-monster-table">
            <SortableHeader columns={scopeColumns} sort={scope.sort} onToggle={scope.toggle} />
            <tbody>{scope.sorted.map(({ score }) => <tr key={score.monsterId}>
              <td className={scopeCell('monster')}>{score.monsterName}</td>
              <td className={scopeCell('score')}><b><Score score={score} general={general} /></b></td>
              <td className={scopeCell('conversion')}>{score ? <ConversionList conversions={score.conversions} artifact={scoredArtifact} stones={currentCalculation.stones} mode={settings.conversionStoneMode} /> : <span className="muted">Not judged</span>}</td>
            </tr>)}</tbody>
          </table>
        </ResultCard>
      </div>
    </>}
  </div>;
}
