'use client';

import { useMemo, useState } from 'react';
import { Dropdown } from './dropdown';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { SortableHeader, useSortedRows } from './sortable-table';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { scoreArtifactOnMonster } from '../lib/compute/artifact-score-core';
import { ConversionList } from './conversion-list';
import { engravedStonesFor, isWorthwhileGain } from '../lib/artifact-recommendations';
import { allocateArtifactPlacements } from '../lib/artifact-recommendation-allocation';
import type { SortableColumn } from './sortable-table';
import { recordedArtifactPreferenceMonsterIds } from '../lib/artifact-preferences';
import { artifactCategoryLabel, artifactEquipClassLabel, displaySubProperty } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactIntangibleLabel, artifactMainPropertyOrder,
} from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-species';
import { numberedMonsterNames } from '../lib/monster-names';
import { monsterNameCollator } from '../lib/monster-grid';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactConversion, ArtifactScoreRequest, ArtifactScoreResult } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
/* Intangible joins the named classes so the wildcard artifacts can be filtered
   for rather than only found by scrolling. */
const restrictionOptions = [
  ...Object.values(artifactElements), ...Object.values(artifactArchetypes), artifactIntangibleLabel,
];
const artifactLocations = ['inventory', 'equipped'] as const;

type ArtifactLocation = typeof artifactLocations[number];
type ArtifactFilters = { categories: ArtifactCategory[]; restrictions: string[]; grades: ArtifactGrade[]; mainProperties: ArtifactMainProperty[]; subPropertyId: string; locations: ArtifactLocation[] };
type OwnedMonster = { unitId: string; masterId: string; name: string };
type CategoryCalculation = { request: ArtifactScoreRequest; result: ArtifactScoreResult };
type Allocation = { monster: OwnedMonster; value: number; conversions: readonly ArtifactConversion[] };
type Calculation = { inputKey: string; backend: 'cpu' | 'webgpu'; durationMs: number; evaluatedPairs: number; ownedConversionCount: number; categories: CategoryCalculation[]; allocations: Map<string, Allocation>; unfilledSlots: number; slotCount: number };

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
  /* Not owned copies but monsters in the abstract, so each is named as a species
     and a collaboration pair is listed once under both of its names. */
  return recordedArtifactPreferenceMonsterIds.map((speciesId) => ({
    unitId: `species-${speciesId}`,
    masterId: speciesId,
    name: monsterSpeciesPresentation(speciesId).name,
  })).sort((left, right) => monsterNameCollator.compare(left.name, right.name) || monsterNameCollator.compare(left.masterId, right.masterId));
}

/* Score matrices are built per species, while the rows above are per owned copy,
   so an owned master id resolves to its species before it is looked up. */
function scoreAt(calculation: CategoryCalculation, artifactId: string, masterId: string): number | undefined {
  const speciesId = monsterSpeciesId(masterId);
  const artifactIndex = calculation.request.artifacts.findIndex((artifact) => artifact.id === artifactId);
  const monsterIndex = calculation.request.monsters.findIndex((monster) => monster.id === speciesId);
  const matrix = calculation.result.scoreMatrix;
  if (artifactIndex < 0 || monsterIndex < 0 || !matrix) return undefined;
  const value = matrix[artifactIndex * calculation.request.monsters.length + monsterIndex];
  return value < 0 ? undefined : value;
}

function conversionAt(calculation: CategoryCalculation, artifactId: string, masterId: string): readonly ArtifactConversion[] {
  const artifact = calculation.request.artifacts.find((entry) => entry.id === artifactId);
  const monster = calculation.request.monsters.find((entry) => entry.id === monsterSpeciesId(masterId));
  return artifact && monster ? scoreArtifactOnMonster(artifact, monster, calculation.request)?.conversions ?? [] : [];
}

/**
 * Every positive pair enters one common ranking. The leading pair claims its
 * physical artifact and its monster's category slot, then the next pair is
 * tried. This is intentionally not a maximum-sum matching: the player farms
 * replacements, so the best individual fit must remain the first placement.
 */
function allocateArtifacts(
  categories: readonly CategoryCalculation[],
  scopedMonsters: readonly OwnedMonster[],
  artifactOrder: ReadonlyMap<string, number>,
  artifactsById: ReadonlyMap<string, Artifact>,
  wearerByUnitId: ReadonlyMap<string, OwnedMonster>,
  settings: ArtifactSettings,
): { allocations: Map<string, Allocation>; unfilledSlots: number; slotCount: number } {
  const candidates: Array<{
    artifactId: string;
    artifactOrder: number;
    category: ArtifactCategory;
    monsterId: string;
    monsterOrder: number;
    value: number;
    allocation: Allocation;
  }> = [];
  for (const calculation of categories) {
    const matrix = calculation.result.scoreMatrix;
    if (!matrix) continue;
    const monsterIndexes = new Map(calculation.request.monsters.map((monster, index) => [monster.id, index]));
    for (let artifactIndex = 0; artifactIndex < calculation.request.artifacts.length; artifactIndex += 1) {
      const artifact = calculation.request.artifacts[artifactIndex];
      const category: ArtifactCategory = artifact.category === 1 ? 'attribute' : 'type';
      for (let monsterOrder = 0; monsterOrder < scopedMonsters.length; monsterOrder += 1) {
        const monster = scopedMonsters[monsterOrder];
        const monsterIndex = monsterIndexes.get(monsterSpeciesId(monster.masterId));
        if (monsterIndex === undefined) continue;
        const value = matrix[artifactIndex * calculation.request.monsters.length + monsterIndex];
        if (value <= 0) continue;
        const source = artifactsById.get(artifact.id);
        const currentWearer = source?.occupiedId === null || source === undefined
          ? undefined : wearerByUnitId.get(source.occupiedId);
        /* In the all-monsters scope a species is a comparison target rather
           than a physical current wearer. In the owned scope, however, the
           user's stated action threshold removes a marginal move before it can
           claim a slot; keeping the current artifact remains a candidate. */
        if (currentWearer && !monster.unitId.startsWith('species-') && monster.unitId !== currentWearer.unitId) {
          const current = scoreAt(calculation, artifact.id, currentWearer.masterId);
          if (current !== undefined && !isWorthwhileGain(value, current, settings)) continue;
        }
        candidates.push({
          artifactId: artifact.id,
          artifactOrder: artifactOrder.get(artifact.id) ?? artifactIndex,
          category,
          monsterId: monster.unitId,
          monsterOrder,
          value,
          allocation: { monster, value, conversions: conversionAt(calculation, artifact.id, monster.masterId) },
        });
      }
    }
  }
  const slots = scopedMonsters.flatMap((monster) => categoryOrder.map((category) => ({ monsterId: monster.unitId, category })));
  const selected = allocateArtifactPlacements(candidates, slots);
  const allocations = new Map<string, Allocation>();
  const candidateByPair = new Map(candidates.map((candidate) => [
    `${candidate.artifactId}\u0000${candidate.monsterId}\u0000${candidate.category}`, candidate,
  ]));
  for (const placement of selected.placements) {
    const candidate = candidateByPair.get(`${placement.artifactId}\u0000${placement.monsterId}\u0000${placement.category}`);
    if (!candidate) throw new Error('Artifact allocation lost a selected score pair.');
    allocations.set(placement.artifactId, candidate.allocation);
  }
  return { allocations, unfilledSlots: selected.unfilledSlots.length, slotCount: slots.length };
}

/* Scores arrive as whole percentage points (§17.1), so nothing is rounded here:
   the number shown is the number every comparison used. */
function Score({ value, general }: { value: number | undefined; general: GeneralSettings }) {
  return value === undefined ? '—' : `${formatNumber(value, general)} %`;
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
  /* Import order, kept only as the sort's stable tiebreak. It is never shown:
     an artifact's position in the export means nothing to the user. */
  const artifactOrder = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const artifactsById = useMemo(() => new Map(artifacts.map((artifact) => [artifact.id, artifact])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
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
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.category, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex, ...artifact.subProperties.map((property) => [property.definition.id, property.valueHundredths, property.maximumHundredths])]),
    monsters: scopedMonsters.map((monster) => [monster.unitId, monster.masterId]), settings,
  });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const visibleArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const restriction = artifactEquipClassLabel(artifact);
    return (!filters.categories.length || filters.categories.includes(artifact.category))
      && (!filters.restrictions.length || filters.restrictions.includes(restriction))
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

  /* Only the results are discarded. The filters describe which rows a user
     wants to inspect, not what was computed, so clearing keeps them set. */
  function clear() {
    setCalculation(undefined);
    setError(undefined);
    setState('idle');
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
        ...allocateArtifacts(categories, scopedMonsters, artifactOrder, artifactsById, wearerByUnitId, settings),
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

  const rows = useMemo(() => !currentCalculation ? [] : visibleArtifacts.map((artifact) => {
    const allocation = currentCalculation?.allocations.get(artifact.id);
    const wearer = artifact.occupiedId === null ? undefined : wearerByUnitId.get(artifact.occupiedId);
    const current = scoreForWearer(artifact);
    return {
      artifact,
      order: artifactOrder.get(artifact.id) ?? 0,
      wearerName: artifact.occupiedId === null ? 'Inventory' : wearer?.name ?? 'Missing monster',
      current,
      allocation,
      action: allocation ? (artifact.occupiedId === allocation.monster.unitId ? 'Keep' : 'Equip') : 'Sell',
    };
    /* `scoreForWearer` reads only the calculation and the wearer map, both of
       which are dependencies here, so it does not need to be one itself. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleArtifacts, currentCalculation, wearerByUnitId, artifactOrder]);

  type RecommendationRow = typeof rows[number];

  const columns: SortableColumn<RecommendationRow>[] = useMemo(() => [
    { key: 'category', label: 'Type', compare: (left, right) => artifactCategoryLabel(left.artifact.category).localeCompare(artifactCategoryLabel(right.artifact.category)) },
    { key: 'restriction', label: 'Fits', compare: (left, right) => artifactEquipClassLabel(left.artifact).localeCompare(artifactEquipClassLabel(right.artifact)) },
    { key: 'main', label: 'Main stat', compare: (left, right) => left.artifact.mainProperty.localeCompare(right.artifact.mainProperty) },
    /* Substats order by the artifact's own grade and then its first line, which
       is the closest thing to "how good is this piece" the column shows. */
    { key: 'subs', label: 'Substats', compare: (left, right) => artifactGradeOrder.indexOf(left.artifact.grade) - artifactGradeOrder.indexOf(right.artifact.grade) || monsterNameCollator.compare(left.artifact.subProperties[0]?.definition.name ?? '', right.artifact.subProperties[0]?.definition.name ?? ''), initialDirection: 'descending' },
    { key: 'location', label: 'Location', compare: (left, right) => monsterNameCollator.compare(left.wearerName, right.wearerName) },
    { key: 'current', label: 'Value on mon', compare: (left, right) => (left.current ?? -1) - (right.current ?? -1), initialDirection: 'descending' },
    { key: 'action', label: 'Plan', compare: (left, right) => left.action.localeCompare(right.action) },
    { key: 'recommendation', label: 'Monster', compare: (left, right) => monsterNameCollator.compare(left.allocation?.monster.name ?? '', right.allocation?.monster.name ?? '') },
    { key: 'value', label: 'New value', compare: (left, right) => (left.allocation?.value ?? -1) - (right.allocation?.value ?? -1), initialDirection: 'descending' },
    { key: 'conversion', label: 'Best conversions', compare: (left, right) => (left.allocation?.conversions[0]?.gain ?? -1) - (right.allocation?.conversions[0]?.gain ?? -1), initialDirection: 'descending' },
    { key: 'refinement', label: '', accessibleLabel: 'Refinement', compare: (left, right) => Number(left.artifact.unrefined) - Number(right.artifact.unrefined), initialDirection: 'descending' },
  ], []);

  const { sorted, sort, toggle: toggleSort } = useSortedRows(
    rows, columns,
    { key: 'value', direction: 'descending' },
    /* Scores tie constantly once they are whole points, so import order settles
       equal rows rather than the sort's internals. */
    (left, right) => left.order - right.order,
  );

  return <div className="artifact-recommendations">
    <p className="lead">Rank every useful fit, then lock one Attribute and one Type artifact per monster. Filters only narrow this complete plan; they never reshuffle it.</p>
    <div className="filter-panel artifact-recommendation-filters">
      {buttonGroup('Type', 'categories', categoryOrder, (category) => artifactCategoryLabels[category], 'artifact-recommendation-filter-type')}
      {buttonGroup('Restriction', 'restrictions', restrictionOptions, (restriction) => restriction, 'artifact-recommendation-filter-restriction')}
      {buttonGroup('Quality', 'grades', artifactGradeOrder, (grade) => grade.slice(0, 3).toUpperCase(), 'artifact-recommendation-filter-quality')}
      <div className="filter-group artifact-recommendation-filter-substat"><label className="filter-label" htmlFor="artifact-recommendation-substat">Substat</label><div className="filter-group-controls"><Dropdown id="artifact-recommendation-substat" value={selectedSubPropertyId} onChange={(event) => setFilters((current) => ({ ...current, subPropertyId: event.target.value }))} aria-label="Filter recommendations by artifact substat" placeholder="All substats">{subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Dropdown></div></div>
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder, (property) => property, 'artifact-recommendation-filter-main')}
      {buttonGroup('Location', 'locations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Equipped', 'artifact-recommendation-filter-location')}
      <div className="artifact-recommendation-actions">
        {/* Both labels are always in the layout and the inactive one is hidden
            with visibility, so the button is as wide as its widest wording and
            never resizes when the work starts or finishes. */}
        <button type="button" className="button important-action artifact-recommendation-calculate" onClick={() => void calculate()} disabled={state === 'calculating'} data-state={state === 'calculating' ? 'busy' : 'idle'}>
          <span className="artifact-recommendation-calculate-label" data-label="idle">Calculate recommendations</span>
          <span className="artifact-recommendation-calculate-label" data-label="busy">Calculating…</span>
        </button>
        <button type="button" className="button artifact-recommendation-clear" onClick={() => clear()} disabled={!calculation || state === 'calculating'}>Clear results</button>
      </div>
    </div>
    {state === 'error' && <p className="notice warning" role="status">{error}</p>}
    {calculation && !currentCalculation && <p className="notice warning" role="status">Settings or imported data changed. Calculate again to refresh these recommendations.</p>}
    {currentCalculation && <>
      <p className="artifact-recommendation-meta" role="status">{formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked · {formatNumber(currentCalculation.slotCount - currentCalculation.unfilledSlots, general)} of {formatNumber(currentCalculation.slotCount, general)} slots filled · {formatNumber(Math.round(currentCalculation.durationMs), general)} ms · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}</p>
      {currentCalculation.unfilledSlots > 0 && <p className="notice warning" role="status">After the ranked placements, no artifact scoring above 0 % remained for {formatNumber(currentCalculation.unfilledSlots, general)} slots. JASWA never fills them with a zero-score match or assigns one artifact twice.</p>}
      {settings.conversionStoneMode === 'owned' && currentCalculation.ownedConversionCount === 0 && <p className="notice warning">This import has no readable engraved conversion stones, so the results keep every artifact as it is.</p>}
      {sorted.length ? <div className="artifact-recommendation-table-wrap"><table className="artifact-recommendation-table">
        <SortableHeader columns={columns} sort={sort} onToggle={toggleSort} />
        <tbody>{sorted.map((row) => <tr key={row.artifact.id}>
          <td>{artifactCategoryLabel(row.artifact.category)}</td>
          <td>{artifactEquipClassLabel(row.artifact)}</td>
          <td>{row.artifact.mainProperty}</td>
          <td><ul className="artifact-subs">{row.artifact.subProperties.map((property) => <li key={property.definition.id}>{displaySubProperty(property, (value) => formatNumber(value, general))}</li>)}</ul></td>
          <td>{row.wearerName}</td>
          <td><Score value={row.current} general={general} /></td>
          <td className={row.action === 'Sell' ? 'artifact-recommendation-sell' : ''}>{row.action}</td>
          <td className={row.allocation ? '' : 'artifact-recommendation-sell'}>{row.allocation?.monster.name ?? '—'}</td>
          <td><Score value={row.allocation?.value} general={general} /></td>
          <td className={row.allocation?.conversions.length ? '' : 'muted'}>
            {row.allocation ? <ConversionList conversions={row.allocation.conversions} artifact={row.artifact}
              stones={stones} mode={settings.conversionStoneMode} /> : '—'}
          </td>
          <td className="artifact-recommendation-flag"><UnrefinedArtifactMark unrefined={row.artifact.unrefined} /></td>
        </tr>)}</tbody>
      </table></div> : <p className="artifact-recommendation-empty">
        {visibleArtifacts.length
          ? 'Every artifact matching these filters is already where it does most good.'
          : 'No artifacts match these filters.'}
      </p>}
    </>}
  </div>;
}
