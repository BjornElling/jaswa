import { useMemo, useState } from 'react';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequests, buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { readArtifacts } from '../lib/artifacts';
import { artifactCategoryLabel, artifactEquipClassLabel, artifactValueTint } from '../lib/artifact-grid';
import { artifactCategoryLabels, artifactGradeOrder } from '../lib/artifact-properties';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import { columnClasses } from '../lib/table-layouts';
import { ConversionList } from './conversion-list';
import { engravedStonesFor, scoringSettings } from '../lib/artifact-recommendations';
import { useAutoRecalculate } from './use-auto-recalculate';
import { monsterNameCollator } from '../lib/monster-grid';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { SortableColumn } from './use-sorted-rows';
import { Dropdown } from './dropdown';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { formatNumber } from '../lib/formatting';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactMaximumScore } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { MonsterArchetype } from '../lib/monster-catalog';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-species';
import { numberedMonsterNames } from '../lib/monster-names';
import { elementName } from '../lib/rune-sets';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';
import type { ArtifactCategory } from '../lib/artifact-properties';
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';

const monsterElements = ['Water', 'Fire', 'Wind', 'Light', 'Dark'] as const;
const monsterArchetypes = ['Attack', 'Defense', 'HP', 'Support'] as const;
const artifactLocations = ['inventory', 'equipped'] as const;

type ArtifactLocation = typeof artifactLocations[number];

/* One object rather than three lists, so the panel has a single named starting
   point for Reset to put back — the same shape the other two chooser panels
   keep their filters in. */
type MonsterFilters = {
  elements: string[];
  archetypes: MonsterArchetype[];
  locations: ArtifactLocation[];
};

const defaultFilters: MonsterFilters = { elements: [], archetypes: [], locations: [] };

type MonsterOption = {
  unitId: string;
  masterId: string;
  name: string;
  element: string | undefined;
  archetype: MonsterArchetype | undefined;
};

type ArtifactScoreMaps = {
  inputKey: string;
  target: Map<string, ArtifactMaximumScore>;
  current: Map<string, ArtifactMaximumScore>;
  maximum: Map<string, ArtifactMaximumScore>;
  backend: 'cpu' | 'webgpu';
  evaluatedPairs: number;
};

type ResultRow = {
  artifact: Artifact;
  index: number;
  target: ArtifactMaximumScore;
  current: ArtifactMaximumScore | undefined;
  currentMonsterName: string | undefined;
  maximum: ArtifactMaximumScore | undefined;
};

function monsterOptions(monsters: readonly GameRecord[]): MonsterOption[] {
  const names = numberedMonsterNames([...monsters]);
  const seen = new Set<string>();
  const options: MonsterOption[] = [];
  for (const monster of monsters) {
    const rawUnitId = monster.unit_id;
    const rawMasterId = monster.unit_master_id;
    if ((typeof rawUnitId !== 'number' && typeof rawUnitId !== 'string')
      || (typeof rawMasterId !== 'number' && typeof rawMasterId !== 'string')) continue;
    const unitId = String(rawUnitId);
    const masterId = String(rawMasterId);
    if (!unitId || !masterId || seen.has(unitId)) continue;
    seen.add(unitId);
    const presentation = monsterPresentation(masterId);
    options.push({
      unitId,
      masterId,
      name: names[unitId] ?? presentation.name,
      element: elementName(monster.attribute),
      archetype: presentation.archetype,
    });
  }
  return options.sort((left, right) => monsterNameCollator.compare(left.name, right.name)
    || monsterNameCollator.compare(left.unitId, right.unitId));
}

function scoreMap(scores: ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.artifactId, score]));
}

async function calculateRequests(
  requests: ReturnType<typeof buildArtifactScoreRequests>,
  hardwareAcceleration: boolean,
) {
  return Promise.all(requests.map((request) => calculateArtifactScores(request, hardwareAcceleration)));
}

/* Whole percentage points already (§17.1): the figure shown is the figure every
   comparison used. */
function Score({ score, general, fallback = '—' }: { score: ArtifactMaximumScore | undefined; general: GeneralSettings; fallback?: string }) {
  /* Banded like every other score in the app: one set of boundaries, so a
     figure does not change meaning between two tables. A missing score keeps
     the fallback's own plain reading — it is unjudged, not low. */
  return score
    ? <span {...artifactValueTint(score.value)}>{formatNumber(score.value, general)} %</span>
    : <>{fallback}</>;
}

function ArtifactResults({ title, description, rows, general, selectedMonster, stones, mode }: {
  title: string;
  description: string;
  rows: readonly ResultRow[];
  general: GeneralSettings;
  selectedMonster: MonsterOption;
  stones: readonly EngravedConversionStone[];
  mode: ArtifactSettings['conversionStoneMode'];
}) {
  /* Scores take the right edge so their digits line up down the column; the
     artifact and its location read from the left. */
  const columns = useMemo<SortableColumn<ResultRow>[]>(() => [
    { key: 'artifact', label: 'Artifact', align: 'left', compare: (left, right) => artifactGradeOrder.indexOf(left.artifact.grade) - artifactGradeOrder.indexOf(right.artifact.grade) || left.index - right.index, initialDirection: 'descending' },
    { key: 'target', label: `On ${selectedMonster.name}`, align: 'right', compare: (left, right) => left.target.value - right.target.value, initialDirection: 'descending' },
    { key: 'location', label: 'Location', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.currentMonsterName ?? 'Inventory', right.currentMonsterName ?? 'Inventory') },
    { key: 'maximum', label: 'Best', align: 'right', compare: (left, right) => (left.maximum?.value ?? -1) - (right.maximum?.value ?? -1), initialDirection: 'descending' },
  ], [selectedMonster.name]);
  const { sorted, sort, toggle } = useSortedRows(rows, columns, { key: 'target', direction: 'descending' },
    (left, right) => left.index - right.index);
  const cellClass = columnClasses(columns);

  return <section className="best-artifact-result" aria-labelledby={`${title}-title`}>
    <header>
      <h3 id={`${title}-title`}>{title}</h3>
      <p>{description}</p>
    </header>
    {rows.length ? <div className="best-artifact-result-scroll">
      <table>
        <SortableHeader columns={columns} sort={sort} onToggle={toggle} />
        <tbody>{sorted.map((row) => <tr key={row.artifact.id}>
          <td className={cellClass('artifact')}>
            <b><UnrefinedArtifactMark unrefined={row.artifact.unrefined} />{row.artifact.grade} {row.artifact.mainProperty}</b>
            <span>{artifactCategoryLabel(row.artifact.category)} · {artifactEquipClassLabel(row.artifact)}</span>
          </td>
          <td className={cellClass('target')}>
            <b><Score score={row.target} general={general} /></b>
            <ConversionList conversions={row.target.conversions} artifact={row.artifact} stones={stones} mode={mode} />
          </td>
          <td className={cellClass('location')}>
            {row.artifact.occupiedId === null ? <span className="muted">Inventory</span> : <>
              <b><Score score={row.current} general={general} fallback="Not judged" /></b>
              <span>{row.currentMonsterName ?? 'Unknown monster'}</span>
            </>}
          </td>
          <td className={cellClass('maximum')}>
            <b><Score score={row.maximum} general={general} fallback="Not judged" /></b>
            <span>{row.maximum?.monsterName ?? '—'}</span>
          </td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="best-artifact-empty">No artifacts belong in this view yet.</p>}
  </section>;
}

export function BestArtifactForMonster({ data, monsters, settings, general, hardwareAcceleration }: {
  data: GameRecord;
  monsters: readonly GameRecord[];
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<MonsterFilters>(defaultFilters);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [calculation, setCalculation] = useState<ArtifactScoreMaps | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');

  const allMonsters = useMemo(() => monsterOptions(monsters), [monsters]);
  const eligibleMonsters = useMemo(
    () => monsterOptions(artifactOptimizationMonsters(monsters, settings)),
    [monsters, settings],
  );
  const filteredMonsters = useMemo(() => eligibleMonsters.filter((monster) =>
    (!filters.elements.length || (monster.element !== undefined && filters.elements.includes(monster.element)))
    && (!filters.archetypes.length || (monster.archetype !== undefined && filters.archetypes.includes(monster.archetype)))),
  [eligibleMonsters, filters.archetypes, filters.elements]);
  const selectedMonster = filteredMonsters.find((monster) => monster.unitId === selectedUnitId);
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const wearers = useMemo(() => new Map(allMonsters.map((monster) => [monster.unitId, monster])), [allMonsters]);
  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]),
    monsterIds: eligibleMonsters.map((monster) => [monster.unitId, monster.masterId]),
    selectedUnitId,
    settings: scoringSettings(settings),
  });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;

  const rows = useMemo<ResultRow[]>(() => {
    if (!currentCalculation || !selectedMonster) return [];
    return artifacts.flatMap((artifact) => {
      const target = currentCalculation.target.get(artifact.id);
      const index = artifactNumbers.get(artifact.id);
      if (!target || index === undefined) return [];
      return [{
        artifact,
        index,
        target,
        current: currentCalculation.current.get(artifact.id),
        currentMonsterName: artifact.occupiedId === null ? undefined : wearers.get(artifact.occupiedId)?.name,
        maximum: currentCalculation.maximum.get(artifact.id),
      }];
    }).sort((left, right) => right.target.value - left.target.value || left.index - right.index);
  }, [artifacts, artifactNumbers, currentCalculation, selectedMonster, wearers]);

  /* The location filter narrows the ranking that was already calculated, so
     switching it answers immediately instead of asking for the scores again.
     Intangible is no longer asked here: §17.7 puts that one question in
     Settings, where every view reads the same answer. */
  const visibleRows = rows.filter((row) => !filters.locations.length
    || filters.locations.includes(row.artifact.occupiedId === null ? 'inventory' : 'equipped'));
  const categoryRows = (category: ArtifactCategory) => visibleRows
    .filter((row) => row.artifact.category === category)
    .slice(0, 10);

  function toggle<K extends keyof MonsterFilters>(key: K, value: MonsterFilters[K][number]) {
    setFilters((current) => {
      const chosen = current[key] as MonsterFilters[K][number][];
      return {
        ...current,
        [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value],
      };
    });
  }

  async function calculate() {
    if (!selectedMonster) return;
    const currentMonsterIds = new Map<string, string>();
    for (const artifact of artifacts) {
      if (artifact.occupiedId === null) continue;
      const wearer = wearers.get(artifact.occupiedId);
      if (wearer && eligibleMonsters.some((monster) => monster.unitId === wearer.unitId)) {
        currentMonsterIds.set(artifact.id, monsterSpeciesId(wearer.masterId));
      }
    }
    const allRequests = buildArtifactScoreRequests(data, monsters, settings);
    const targetRequests = buildArtifactScoreRequestsForMonsterIds(data, [monsterSpeciesId(selectedMonster.masterId)], settings);
    const currentRequests = buildArtifactScoreRequestsForMonsterIds(data, [...new Set(currentMonsterIds.values())], settings)
      .map((request) => ({ ...request, targetMonsterIdByArtifact: Object.fromEntries(currentMonsterIds) }));
    if (!targetRequests.length || !allRequests.length) {
      setCalculation(undefined);
      setState('error');
      return;
    }
    setState('calculating');
    try {
      const [allResults, targetResults, currentResults] = await Promise.all([
        calculateRequests(allRequests, hardwareAcceleration),
        calculateRequests(targetRequests, hardwareAcceleration),
        calculateRequests(currentRequests, hardwareAcceleration),
      ]);
      setCalculation({
        inputKey,
        maximum: scoreMap(allResults.flatMap((result) => result.maxima)),
        target: scoreMap(targetResults.flatMap((result) => result.maxima)),
        current: scoreMap(currentResults.flatMap((result) => result.targetScores)),
        backend: [...allResults, ...targetResults, ...currentResults].every((result) => result.backend === 'webgpu') ? 'webgpu' : 'cpu',
        evaluatedPairs: [...allResults, ...targetResults, ...currentResults]
          .reduce((total, result) => total + result.evaluatedPairs, 0),
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

  return <div className="best-artifact-for-monster">
    <p className="lead">Filter your roster, choose a monster, then compare every compatible artifact using the active optimization settings.</p>
    <div className="filter-panel best-artifact-filters">
      <div className="filter-group best-artifact-filter-element" role="group" aria-label="Filter monsters by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {monsterElements.map((element) => <button key={element} type="button"
            className={filters.elements.includes(element) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggle('elements', element)} aria-pressed={filters.elements.includes(element)}
          >{element}</button>)}
        </div>
      </div>
      <div className="filter-group best-artifact-filter-archetype" role="group" aria-label="Filter monsters by archetype">
        <span className="filter-label">Archetype</span>
        <div className="filter-group-controls">
          {monsterArchetypes.map((archetype) => <button key={archetype} type="button"
            className={filters.archetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggle('archetypes', archetype)} aria-pressed={filters.archetypes.includes(archetype)}
          >{archetype}</button>)}
        </div>
      </div>
      <div className="filter-group best-artifact-filter-location" role="group" aria-label="Filter artifacts by location">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls">
          {artifactLocations.map((location) => <button key={location} type="button"
            className={filters.locations.includes(location) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggle('locations', location)} aria-pressed={filters.locations.includes(location)}
          >{location === 'inventory' ? 'Inventory' : 'Equipped'}</button>)}
        </div>
      </div>
      <div className="filter-group best-artifact-monster-select">
        <label className="filter-label" htmlFor="best-artifact-monster">Monster</label>
        <div className="filter-group-controls">
          <Dropdown id="best-artifact-monster" value={selectedMonster?.unitId ?? ''}
            onChange={(event) => setSelectedUnitId(event.target.value)} placeholder="Choose a monster"
            aria-label="Choose a monster for artifact recommendations">
            {filteredMonsters.map((monster) => <option key={monster.unitId} value={monster.unitId}>{monster.name}</option>)}
          </Dropdown>
        </div>
      </div>
      <div className="filter-panel-actions best-artifact-actions">
        <button type="button" className="button important-action best-artifact-calculate" onClick={() => void calculate()}
          disabled={!selectedMonster || state === 'calculating'}>
          {state === 'calculating' ? 'Calculating…' : 'Calculate artifacts'}
        </button>
        {/* The chosen monster goes with the filters: it was picked out of the
            narrowed roster, so leaving it behind would name a monster the
            restored roster no longer points at. */}
        <button type="button" className="filter-reset" aria-label="Reset monster filters"
          onClick={() => { setFilters(defaultFilters); setSelectedUnitId(''); }}>Reset filters</button>
      </div>
    </div>

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate this monster’s artifact fits from the imported data.</p>}

    {/* Without this the table simply vanished on a settings change and the page
        looked as though nothing had ever been calculated. §17.11: a result that
        stops being current says so. */}
    {calculation && !currentCalculation && <p className="notice warning" role="status">{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these results…'
      : 'Settings or imported data changed. Calculate again to refresh these results.'}</p>}

    {currentCalculation && selectedMonster && <>
      <p className="best-artifact-meta" role="status">
        {formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}
      </p>
      <div className="best-artifact-results">
        {(['attribute', 'type'] as const).map((category) => <ArtifactResults key={category}
          title={artifactCategoryLabels[category]}
          description={`The ten highest-scoring compatible ${artifactCategoryLabels[category].toLowerCase()} artifacts for this monster.`}
          rows={categoryRows(category)} general={general} selectedMonster={selectedMonster}
          stones={stones} mode={settings.conversionStoneMode} />)}
      </div>
    </>}
  </div>;
}
