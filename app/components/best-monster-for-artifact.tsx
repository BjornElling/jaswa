import { type ReactNode, useMemo, useState } from 'react';
import { Button, FilterButton } from './button';
import { CalculationStatus } from './calculation-status';
import { Dropdown } from './dropdown';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import { columnClasses } from '../lib/table-layouts';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { combineCalculationBackends } from '../lib/compute/calculation-summary';
import type { CalculationBackend } from '../lib/compute/calculation-summary';
import { buildArtifactScoreRequests, buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { ConversionList } from './conversion-list';
import { engravedStonesFor, isWorthwhileGain, scoringSettings } from '../lib/artifact-recommendations';
import { useAutoRecalculate } from './use-auto-recalculate';
import type { SortableColumn } from './use-sorted-rows';
import { artifactCategoryLabel, artifactEngraveClassLabel, artifactValueTint, displaySubProperty } from '../lib/artifact-grid';
import { artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder, artifactIntangibleLabel, artifactMainPropertyOrder } from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-identity';
import { monsterCopyNames } from '../lib/monster-names';
import type { MonsterCopyName } from '../lib/monster-names';
import type { MonsterProfiles } from '../lib/monster-preferences';
import { monsterNameCollator } from '../lib/monster-grid';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactMaximumScore } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { MonsterArchetype } from '../lib/monster-catalog';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';

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

type Calculation = {
  inputKey: string;
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

function artifactSortKey(artifact: ReturnType<typeof readArtifacts>[number]): string {
  return [
    artifactCategoryLabel(artifact.category), artifactEngraveClassLabel(artifact), artifact.mainProperty,
    ...artifact.subProperties.map((property) => `${property.definition.name} ${property.valueHundredths}`),
  ].join(' · ');
}

function scoreMap(scores: readonly ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.monsterId, score]));
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

export function BestMonsterForArtifact({ data, monsters, scenarioProfiles, settings, general, hardwareAcceleration }: {
  data: GameRecord;
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<ArtifactFilters>(defaultFilters);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
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
    return (!filters.categories.length || filters.categories.includes(artifact.category))
      && (!filters.restrictions.length || filters.restrictions.includes(restriction))
      && (!filters.grades.length || filters.grades.includes(artifact.grade))
      && (!filters.mainProperties.length || filters.mainProperties.includes(artifact.mainProperty))
      && (!selectedSubPropertyId || artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId))
      && (!filters.locations.length || filters.locations.includes(artifact.occupiedId === null ? 'inventory' : 'engraved'));
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
  const artifactInput = artifacts.map((artifact) => [artifact.id, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex,
    ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]);
  const inputKey = JSON.stringify({ artifactInput, monsterIds: ownMonsters.map((monster) => [monster.unitId, monster.speciesId]), scenarioProfiles, selectedArtifactId: filters.selectedArtifactId, settings: scoringSettings(settings) });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const owner = selectedArtifact?.occupiedId === null || selectedArtifact === undefined
    ? undefined : ownMonsters.find((monster) => monster.unitId === selectedArtifact.occupiedId);
  /* A copy that wants something its species does not is scored under its own
     row (§19.2); every other copy answers to its species'. */
  const ownedScore = (monster: MonsterOption) =>
    currentCalculation?.ownedScores.get(monster.unitId) ?? currentCalculation?.ownedScores.get(monster.speciesId);
  const currentScore = owner ? ownedScore(owner) : undefined;
  const slotlessRows = ownMonsters.filter((monster) => selectedArtifact !== undefined
    && !engravedSlots.get(monster.unitId)?.has(selectedArtifact.category))
    .map((monster) => ({ monster, score: ownedScore(monster) }))
    .sort((left, right) => (right.score?.value ?? -1) - (left.score?.value ?? -1) || left.monster.name.localeCompare(right.monster.name))
    .slice(0, 10);
  /* §17.2 and §17.3: only a destination that genuinely beats the artifact's
     current home, by more than the band the user called meaningful. */
  const improvementRows = ownMonsters.map((monster) => ({ monster, score: ownedScore(monster) }))
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

  function resetFilters() {
    setFilters(defaultFilters);
    /* The selected artifact is part of the calculation key. Once Reset clears
       it, the old result no longer answers the panel's question either. */
    setCalculation(undefined);
    setState('idle');
  }

  async function calculate() {
    if (!selectedArtifact) return;
    const selected = new Set([selectedArtifact.id]);
    const scopeRequests = buildArtifactScoreRequests(data, monsters, settings, selected, scenarioProfiles)
      .map((request) => ({ ...request, includeAllScores: true }));
    const ownedRequests = buildArtifactScoreRequestsForMonsterIds(data, ownMonsters.map((monster) => monster.speciesId), settings, selected, scenarioProfiles)
      .map((request) => ({ ...request, includeAllScores: true }));
    if (!scopeRequests.length) {
      setCalculation(undefined);
      setState('error');
      return;
    }
    setState('calculating');
    try {
      const [scopeResults, ownedResults] = await Promise.all([
        Promise.all(scopeRequests.map((request) => calculateArtifactScores(request, hardwareAcceleration))),
        Promise.all(ownedRequests.map((request) => calculateArtifactScores(request, hardwareAcceleration))),
      ]);
      setCalculation({
        inputKey,
        scopeScores: scopeResults.flatMap((result) => result.allScores),
        ownedScores: scoreMap(ownedResults.flatMap((result) => result.allScores)),
        backend: combineCalculationBackends([...scopeResults, ...ownedResults].map((result) => result.backend)),
        evaluatedPairs: [...scopeResults, ...ownedResults].reduce((total, result) => total + result.evaluatedPairs, 0),
        durationMs: [...scopeResults, ...ownedResults].reduce((total, result) => total + result.durationMs, 0),
      });
      setState('idle');
    } catch {
      setCalculation(undefined);
      setState('error');
    }
  }

  useAutoRecalculate({
    mode: settings.recalculate,
    stale: calculation !== undefined && currentCalculation === undefined,
    calculating: state === 'calculating',
    calculate: () => void calculate(),
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
      <div className="filter-panel-actions best-monster-actions">
        <Button tone="primary" size="prominent" busy={state === 'calculating'} busyLabel="Calculating…"
          onClick={() => void calculate()} disabled={!selectedArtifact}>Calculate monsters</Button>
        {/* The chosen artifact goes with the filters: it was picked out of the
            narrowed list, so leaving it behind would name a piece the restored
            list no longer points at. */}
        <button type="button" className="filter-reset" aria-label="Reset artifact filters"
          onClick={resetFilters}>Reset filters</button>
      </div>
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

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate monster fits for this artifact from the imported data.</p>}

    {/* As in the other two views (`ACCOUNT-TABLES.md` §7): a held result that no longer answers
        the current settings says so instead of disappearing. */}
    {calculation && !currentCalculation && <p className="notice warning" role="status">{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these results…'
      : 'Settings or imported data changed. Calculate again to refresh these results.'}</p>}

    {currentCalculation && selectedArtifact && <>
      <CalculationStatus evaluatedPairs={currentCalculation.evaluatedPairs} durationMs={currentCalculation.durationMs}
        backend={currentCalculation.backend} general={general} />
      <div className="best-monster-results">
        <ResultCard title="No artifact in this slot" description="The ten strongest eligible monsters with no artifact in this category engraved yet."
          empty={slotlessRows.length ? undefined : 'Every monster already has an artifact in this slot.'}>
          <table className="best-monster-table">
            <SortableHeader columns={monsterColumns} sort={slotless.sort} onToggle={slotless.toggle} />
            <tbody>{slotless.sorted.map(({ monster, score }) => <tr key={monster.unitId}>
              <td className={monsterCell('monster')}>{monster.name}</td>
              <td className={monsterCell('score')}><b><Score score={score} general={general} /></b></td>
              <td className={monsterCell('conversion')}>{score ? <ConversionList conversions={score.conversions} artifact={selectedArtifact} stones={stones} mode={settings.conversionStoneMode} /> : <span className="muted">Not judged</span>}</td>
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
              <td className={scopeCell('conversion')}>{score ? <ConversionList conversions={score.conversions} artifact={selectedArtifact} stones={stones} mode={settings.conversionStoneMode} /> : <span className="muted">Not judged</span>}</td>
            </tr>)}</tbody>
          </table>
        </ResultCard>
      </div>
    </>}
  </div>;
}
