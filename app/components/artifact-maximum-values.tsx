'use client';

import { useMemo, useState } from 'react';
import { Dropdown } from './dropdown';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { scoreArtifactOnMonster } from '../lib/compute/artifact-score-core';
import { recordedArtifactPreferenceMonsterIds } from '../lib/artifact-preferences';
import { artifactCategoryLabel, artifactEquipClass, displaySubProperty } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactMainPropertyOrder, artifactProperty,
} from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterPresentation } from '../lib/monster-catalog';
import { numberedMonsterNames } from '../lib/monster-names';
import { monsterNameCollator } from '../lib/monster-grid';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactConversion, ArtifactScoreRequest, ArtifactScoreResult } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const restrictionOptions = [...Object.values(artifactElements), ...Object.values(artifactArchetypes)];
const artifactLocations = ['inventory', 'equipped'] as const;

type ArtifactLocation = typeof artifactLocations[number];
type ArtifactFilters = { categories: ArtifactCategory[]; restrictions: string[]; grades: ArtifactGrade[]; mainProperties: ArtifactMainProperty[]; subPropertyId: string; locations: ArtifactLocation[] };
type OwnedMonster = { unitId: string; masterId: string; name: string };
type CategoryCalculation = { request: ArtifactScoreRequest; result: ArtifactScoreResult };
type Allocation = { monster: OwnedMonster; value: number; conversion: ArtifactConversion | undefined };
type Calculation = { inputKey: string; backend: 'cpu' | 'webgpu'; durationMs: number; evaluatedPairs: number; ownedConversionCount: number; categories: CategoryCalculation[]; allocations: Map<string, Allocation> };

const defaultFilters: ArtifactFilters = { categories: [], restrictions: [], grades: [], mainProperties: [], subPropertyId: '', locations: [] };

function readOwnedMonsters(monsters: readonly GameRecord[]): OwnedMonster[] {
  const names = numberedMonsterNames([...monsters]);
  const seen = new Set<string>();
  const owned: OwnedMonster[] = [];
  for (const monster of monsters) {
    const rawUnitId = monster.unit_id;
    const rawMasterId = monster.unit_master_id;
    if ((typeof rawUnitId !== 'number' && typeof rawUnitId !== 'string') || (typeof rawMasterId !== 'number' && typeof rawMasterId !== 'string')) continue;
    const unitId = String(rawUnitId);
    const masterId = String(rawMasterId);
    if (!unitId || !masterId || seen.has(unitId)) continue;
    seen.add(unitId);
    owned.push({ unitId, masterId, name: names[unitId] ?? monsterPresentation(masterId).name });
  }
  return owned.sort((left, right) => monsterNameCollator.compare(left.name, right.name) || monsterNameCollator.compare(left.unitId, right.unitId));
}

function recommendationMonsters(monsters: readonly GameRecord[], onlyOwned: boolean): OwnedMonster[] {
  if (onlyOwned) return readOwnedMonsters(monsters);
  return recordedArtifactPreferenceMonsterIds.map((masterId) => ({
    unitId: `catalog-${masterId}`,
    masterId,
    name: monsterPresentation(masterId).name,
  })).sort((left, right) => monsterNameCollator.compare(left.name, right.name) || monsterNameCollator.compare(left.masterId, right.masterId));
}

function scoreAt(calculation: CategoryCalculation, artifactId: string, masterId: string): number | undefined {
  const artifactIndex = calculation.request.artifacts.findIndex((artifact) => artifact.id === artifactId);
  const monsterIndex = calculation.request.monsters.findIndex((monster) => monster.id === masterId);
  const matrix = calculation.result.scoreMatrix;
  if (artifactIndex < 0 || monsterIndex < 0 || !matrix) return undefined;
  const value = matrix[artifactIndex * calculation.request.monsters.length + monsterIndex];
  return value < 0 ? undefined : value;
}

function conversionAt(calculation: CategoryCalculation, artifactId: string, masterId: string): ArtifactConversion | undefined {
  const artifact = calculation.request.artifacts.find((entry) => entry.id === artifactId);
  const monster = calculation.request.monsters.find((entry) => entry.id === masterId);
  return artifact && monster ? scoreArtifactOnMonster(artifact, monster, calculation.request)?.conversion : undefined;
}

function conversionLabel(conversion: ArtifactConversion | undefined): string {
  if (!conversion) return 'No conversion';
  const property = artifactProperty(conversion.propertyId);
  return property ? `Convert sub ${conversion.sourceIndex + 1} to ${property.name}` : 'No conversion';
}

/* The allocation follows the stated lock order rather than repeatedly picking
   a new best monster per row: an artifact and one category slot on one monster
   leave the pool together, so no later row can make the same recommendation. */
function allocateArtifacts(categories: readonly CategoryCalculation[], ownedMonsters: readonly OwnedMonster[]): Map<string, Allocation> {
  const allocations = new Map<string, Allocation>();
  for (const calculation of categories) {
    const candidates: Array<{ artifactId: string; monster: OwnedMonster; value: number }> = [];
    const matrix = calculation.result.scoreMatrix;
    if (!matrix) continue;
    const monsterIndexes = new Map(calculation.request.monsters.map((monster, index) => [monster.id, index]));
    for (let artifactIndex = 0; artifactIndex < calculation.request.artifacts.length; artifactIndex += 1) {
      const artifact = calculation.request.artifacts[artifactIndex];
      for (const monster of ownedMonsters) {
        const monsterIndex = monsterIndexes.get(monster.masterId);
        if (monsterIndex === undefined) continue;
        const value = matrix[artifactIndex * calculation.request.monsters.length + monsterIndex];
        /* A zero only says this piece is legal, not that it helps the monster.
           Leaving it unassigned makes the sell recommendation honest. */
        if (value > 0) candidates.push({ artifactId: artifact.id, monster, value });
      }
    }
    candidates.sort((left, right) => right.value - left.value || left.artifactId.localeCompare(right.artifactId) || left.monster.unitId.localeCompare(right.monster.unitId));
    const usedArtifacts = new Set<string>();
    const usedMonsterSlots = new Set<string>();
    for (const candidate of candidates) {
      if (usedArtifacts.has(candidate.artifactId) || usedMonsterSlots.has(candidate.monster.unitId)) continue;
      usedArtifacts.add(candidate.artifactId);
      usedMonsterSlots.add(candidate.monster.unitId);
      allocations.set(candidate.artifactId, {
        monster: candidate.monster,
        value: candidate.value,
        conversion: conversionAt(calculation, candidate.artifactId, candidate.monster.masterId),
      });
    }
  }
  return allocations;
}

function Score({ value, general }: { value: number | undefined; general: GeneralSettings }) {
  return value === undefined ? '—' : `${formatNumber(Math.round(value * 100), general)} %`;
}

export function ArtifactMaximumValues({ data, monsters, settings, general, hardwareAcceleration }: {
  data: GameRecord | undefined;
  monsters: readonly GameRecord[];
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<ArtifactFilters>(defaultFilters);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [error, setError] = useState<string | undefined>();
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index + 1])), [artifacts]);
  const ownedMonsters = useMemo(() => readOwnedMonsters(monsters), [monsters]);
  const scopedMonsters = useMemo(() => recommendationMonsters(monsters, settings.onlyFactorInOwnedMonsters), [monsters, settings.onlyFactorInOwnedMonsters]);
  const wearerByUnitId = useMemo(() => new Map(ownedMonsters.map((monster) => [monster.unitId, monster])), [ownedMonsters]);
  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const artifact of artifacts) for (const property of artifact.subProperties) definitions.set(property.definition.id, { id: property.definition.id, name: property.definition.name });
    return [...definitions.values()].sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.id - right.id);
  }, [artifacts]);
  const selectedSubPropertyId = subPropertyOptions.some((option) => String(option.id) === filters.subPropertyId) ? filters.subPropertyId : '';
  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.category, artifact.mainProperty, artifact.convertedPropertyIndex, ...artifact.subProperties.map((property) => [property.definition.id, property.valueHundredths, property.maximumHundredths])]),
    monsters: scopedMonsters.map((monster) => [monster.unitId, monster.masterId]), settings,
  });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const visibleArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const restriction = artifactEquipClass(artifact);
    return (!filters.categories.length || filters.categories.includes(artifact.category))
      && (!filters.restrictions.length || (restriction !== null && filters.restrictions.includes(restriction)))
      && (!filters.grades.length || filters.grades.includes(artifact.grade))
      && (!filters.mainProperties.length || filters.mainProperties.includes(artifact.mainProperty))
      && (!selectedSubPropertyId || artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId))
      && (!filters.locations.length || filters.locations.includes(artifact.occupiedId === null ? 'inventory' : 'equipped'));
  }), [artifacts, filters, selectedSubPropertyId]);

  function toggle(key: keyof ArtifactFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: (current[key] as string[]).includes(value)
      ? (current[key] as string[]).filter((entry) => entry !== value)
      : [...(current[key] as string[]), value] }));
  }

  async function calculate() {
    const requests = buildArtifactScoreRequestsForMonsterIds(data, scopedMonsters.map((monster) => monster.masterId), settings)
      .map((request) => ({ ...request, includeScoreMatrix: true }));
    if (!requests.length || !scopedMonsters.length) {
      setCalculation(undefined);
      setError('There is not enough artifact or monster data to make recommendations yet.');
      setState('error');
      return;
    }
    setState('calculating');
    setError(undefined);
    try {
      const results = await Promise.all(requests.map((request) => calculateArtifactScores(request, hardwareAcceleration)));
      const categories = requests.map((request, index) => ({ request, result: results[index] }));
      setCalculation({
        inputKey,
        backend: results.every((result) => result.backend === 'webgpu') ? 'webgpu' : 'cpu',
        durationMs: results.reduce((total, result) => total + result.durationMs, 0),
        evaluatedPairs: results.reduce((total, result) => total + result.evaluatedPairs, 0),
        ownedConversionCount: Math.max(...results.map((result) => result.ownedConversionCount)),
        categories,
        allocations: allocateArtifacts(categories, scopedMonsters),
      });
      setState('idle');
    } catch {
      setCalculation(undefined);
      setError('JASWA could not calculate artifact recommendations from this data.');
      setState('error');
    }
  }

  const buttonGroup = <T extends string>(label: string, key: keyof ArtifactFilters, values: readonly T[], display: (value: T) => string, className: string) => <div className={`filter-group ${className}`} role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">{values.map((value) => <button key={value} type="button" className={(filters[key] as string[]).includes(value) ? 'filter-button active' : 'filter-button'} onClick={() => toggle(key, value)} aria-pressed={(filters[key] as string[]).includes(value)}>{display(value)}</button>)}</div>
  </div>;

  const scoreForWearer = (artifact: Artifact): number | undefined => {
    if (!currentCalculation || artifact.occupiedId === null) return undefined;
    const wearer = wearerByUnitId.get(artifact.occupiedId);
    const category = currentCalculation.categories.find((entry) => entry.request.artifacts[0]?.category === (artifact.category === 'attribute' ? 1 : 2));
    return wearer && category ? scoreAt(category, artifact.id, wearer.masterId) : undefined;
  };

  return <div className="artifact-recommendations">
    <p className="lead">Calculate one recommended Attribute artifact and one Type artifact for each monster in the selected scope. Filters only narrow this table; they never reshuffle the recommendations.</p>
    <div className="artifact-recommendation-filters">
      {buttonGroup('Type', 'categories', categoryOrder, (category) => artifactCategoryLabels[category], 'artifact-recommendation-filter-type')}
      {buttonGroup('Restriction', 'restrictions', restrictionOptions, (restriction) => restriction, 'artifact-recommendation-filter-restriction')}
      {buttonGroup('Quality', 'grades', artifactGradeOrder, (grade) => grade.slice(0, 3).toUpperCase(), 'artifact-recommendation-filter-quality')}
      <div className="filter-group artifact-recommendation-filter-substat"><label className="filter-label" htmlFor="artifact-recommendation-substat">Substat</label><div className="filter-group-controls"><Dropdown id="artifact-recommendation-substat" value={selectedSubPropertyId} onChange={(event) => setFilters((current) => ({ ...current, subPropertyId: event.target.value }))} aria-label="Filter recommendations by artifact substat" placeholder="All substats">{subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Dropdown></div></div>
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder, (property) => property, 'artifact-recommendation-filter-main')}
      {buttonGroup('Location', 'locations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Equipped', 'artifact-recommendation-filter-location')}
      <button type="button" className="button important-action artifact-recommendation-calculate" onClick={() => void calculate()} disabled={state === 'calculating'}>{state === 'calculating' ? 'Calculating…' : 'Calculate recommendations'}</button>
    </div>
    {state === 'error' && <p className="notice warning" role="status">{error}</p>}
    {calculation && !currentCalculation && <p className="notice warning" role="status">Settings or imported data changed. Calculate again to refresh these recommendations.</p>}
    {currentCalculation && <>
      <p className="artifact-recommendation-meta" role="status">{formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked in {formatNumber(Math.round(currentCalculation.durationMs), general)} ms · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}</p>
      {settings.conversionStoneMode === 'owned' && currentCalculation.ownedConversionCount === 0 && <p className="notice warning">This import has no readable engraved conversion stones, so the results keep every artifact as it is.</p>}
      {visibleArtifacts.length ? <div className="artifact-recommendation-table-wrap"><table className="artifact-recommendation-table"><thead><tr><th scope="col">#</th><th scope="col">Type</th><th scope="col">Restriction</th><th scope="col">Main stat</th><th scope="col">Substats</th><th scope="col">Location</th><th scope="col">Value on mon</th><th scope="col">Recommendation</th><th scope="col">New value</th><th scope="col">Best conversion</th></tr></thead><tbody>{visibleArtifacts.map((artifact) => {
        const wearer = artifact.occupiedId === null ? undefined : wearerByUnitId.get(artifact.occupiedId);
        const allocation = currentCalculation.allocations.get(artifact.id);
        return <tr key={artifact.id}><td><UnrefinedArtifactMark unrefined={artifact.unrefined} />#{String(artifactNumbers.get(artifact.id) ?? artifact.id)}</td><td>{artifactCategoryLabel(artifact.category)}</td><td>{artifactEquipClass(artifact) ?? 'Unknown'}</td><td>{artifact.mainProperty} +{formatNumber(artifact.mainValue, general)}</td><td><ul className="artifact-subs">{artifact.subProperties.map((property) => <li key={property.definition.id}>{displaySubProperty(property, (value) => formatNumber(value, general))}</li>)}</ul></td><td>{artifact.occupiedId === null ? 'Inventory' : wearer?.name ?? 'Missing monster'}</td><td><Score value={scoreForWearer(artifact)} general={general} /></td><td className={allocation ? '' : 'artifact-recommendation-sell'}>{allocation ? allocation.monster.name : 'Sell'}</td><td><Score value={allocation?.value} general={general} /></td><td className={allocation ? '' : 'muted'}>{allocation ? conversionLabel(allocation.conversion) : '—'}</td></tr>;
      })}</tbody></table></div> : <p className="artifact-recommendation-empty">No artifacts match these filters.</p>}
    </>}
  </div>;
}
