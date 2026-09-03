'use client';

import { useMemo, useState } from 'react';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequests, buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { readArtifacts } from '../lib/artifacts';
import { artifactCategoryLabel, artifactEquipClassLabel } from '../lib/artifact-grid';
import { artifactCategoryLabels, artifactGradeOrder } from '../lib/artifact-properties';
import { SortableHeader, useSortedRows } from './sortable-table';
import { ConversionList } from './conversion-list';
import { engravedStonesFor } from '../lib/artifact-recommendations';
import { monsterNameCollator } from '../lib/monster-grid';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { SortableColumn } from './sortable-table';
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

const monsterElements = ['Water', 'Fire', 'Wind', 'Light', 'Dark'] as const;
const monsterArchetypes = ['Attack', 'Defense', 'HP', 'Support'] as const;
const artifactLocations = ['inventory', 'equipped'] as const;

type ArtifactLocation = typeof artifactLocations[number];

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
  return <>{score ? `${formatNumber(score.value, general)} %` : fallback}</>;
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
  const columns = useMemo<SortableColumn<ResultRow>[]>(() => [
    { key: 'artifact', label: 'Artifact', compare: (left, right) => artifactGradeOrder.indexOf(left.artifact.grade) - artifactGradeOrder.indexOf(right.artifact.grade) || left.index - right.index, initialDirection: 'descending' },
    { key: 'target', label: `On ${selectedMonster.name}`, compare: (left, right) => left.target.value - right.target.value, initialDirection: 'descending' },
    { key: 'location', label: 'Location', compare: (left, right) => monsterNameCollator.compare(left.currentMonsterName ?? 'Inventory', right.currentMonsterName ?? 'Inventory') },
    { key: 'maximum', label: 'Best', compare: (left, right) => (left.maximum?.value ?? -1) - (right.maximum?.value ?? -1), initialDirection: 'descending' },
  ], [selectedMonster.name]);
  const { sorted, sort, toggle } = useSortedRows(rows, columns, { key: 'target', direction: 'descending' },
    (left, right) => left.index - right.index);

  return <section className="best-artifact-result" aria-labelledby={`${title}-title`}>
    <header>
      <h3 id={`${title}-title`}>{title}</h3>
      <p>{description}</p>
    </header>
    {rows.length ? <div className="best-artifact-result-scroll">
      <table>
        <SortableHeader columns={columns} sort={sort} onToggle={toggle} />
        <tbody>{sorted.map((row) => <tr key={row.artifact.id}>
          <td>
            <b><UnrefinedArtifactMark unrefined={row.artifact.unrefined} />#{String(row.index + 1).padStart(2, '0')}</b>
            <span>{artifactCategoryLabel(row.artifact.category)} · {artifactEquipClassLabel(row.artifact)}</span>
          </td>
          <td>
            <b><Score score={row.target} general={general} /></b>
            <ConversionList conversions={row.target.conversions} artifact={row.artifact} stones={stones} mode={mode} />
          </td>
          <td>
            {row.artifact.occupiedId === null ? <span className="muted">Inventory</span> : <>
              <b><Score score={row.current} general={general} fallback="Not judged" /></b>
              <span>{row.currentMonsterName ?? 'Unknown monster'}</span>
            </>}
          </td>
          <td>
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
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [selectedArchetypes, setSelectedArchetypes] = useState<MonsterArchetype[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<ArtifactLocation[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [calculation, setCalculation] = useState<ArtifactScoreMaps | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');

  const allMonsters = useMemo(() => monsterOptions(monsters), [monsters]);
  const filteredMonsters = useMemo(() => allMonsters.filter((monster) =>
    (!selectedElements.length || (monster.element !== undefined && selectedElements.includes(monster.element)))
    && (!selectedArchetypes.length || (monster.archetype !== undefined && selectedArchetypes.includes(monster.archetype)))),
  [allMonsters, selectedArchetypes, selectedElements]);
  const selectedMonster = filteredMonsters.find((monster) => monster.unitId === selectedUnitId);
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const wearers = useMemo(() => new Map(allMonsters.map((monster) => [monster.unitId, monster])), [allMonsters]);
  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]),
    monsterIds: allMonsters.map((monster) => [monster.unitId, monster.masterId]),
    selectedUnitId,
    settings,
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
  const visibleRows = rows.filter((row) => !selectedLocations.length
    || selectedLocations.includes(row.artifact.occupiedId === null ? 'inventory' : 'equipped'));
  const categoryRows = (category: ArtifactCategory) => visibleRows
    .filter((row) => row.artifact.category === category)
    .slice(0, 10);

  function toggleElement(element: string) {
    setSelectedElements((current) => current.includes(element)
      ? current.filter((entry) => entry !== element)
      : [...current, element]);
  }

  function toggleArchetype(archetype: MonsterArchetype) {
    setSelectedArchetypes((current) => current.includes(archetype)
      ? current.filter((entry) => entry !== archetype)
      : [...current, archetype]);
  }

  function toggleLocation(location: ArtifactLocation) {
    setSelectedLocations((current) => current.includes(location)
      ? current.filter((entry) => entry !== location)
      : [...current, location]);
  }

  async function calculate() {
    if (!selectedMonster) return;
    const currentMonsterIds = new Map<string, string>();
    for (const artifact of artifacts) {
      if (artifact.occupiedId === null) continue;
      const wearer = wearers.get(artifact.occupiedId);
      if (wearer) currentMonsterIds.set(artifact.id, monsterSpeciesId(wearer.masterId));
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

  return <div className="best-artifact-for-monster">
    <p className="lead">Filter your roster, choose a monster, then compare every compatible artifact using the active optimization settings.</p>
    <div className="filter-panel best-artifact-filters">
      <div className="filter-group best-artifact-filter-element" role="group" aria-label="Filter monsters by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {monsterElements.map((element) => <button key={element} type="button"
            className={selectedElements.includes(element) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleElement(element)} aria-pressed={selectedElements.includes(element)}
          >{element}</button>)}
        </div>
      </div>
      <div className="filter-group best-artifact-filter-archetype" role="group" aria-label="Filter monsters by archetype">
        <span className="filter-label">Archetype</span>
        <div className="filter-group-controls">
          {monsterArchetypes.map((archetype) => <button key={archetype} type="button"
            className={selectedArchetypes.includes(archetype) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleArchetype(archetype)} aria-pressed={selectedArchetypes.includes(archetype)}
          >{archetype}</button>)}
        </div>
      </div>
      <div className="filter-group best-artifact-filter-location" role="group" aria-label="Filter artifacts by location">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls">
          {artifactLocations.map((location) => <button key={location} type="button"
            className={selectedLocations.includes(location) ? 'filter-button active' : 'filter-button'}
            onClick={() => toggleLocation(location)} aria-pressed={selectedLocations.includes(location)}
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
      <button type="button" className="button important-action best-artifact-calculate" onClick={() => void calculate()}
        disabled={!selectedMonster || state === 'calculating'}>
        {state === 'calculating' ? 'Calculating…' : 'Calculate artifacts'}
      </button>
    </div>

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate this monster’s artifact fits from the imported data.</p>}

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
