import { Fragment, useMemo, useState } from 'react';
import { Button, FilterButton } from './button';
import { Dropdown } from './dropdown';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import { columnClasses } from '../lib/table-layouts';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { ConversionList } from './conversion-list';
import { QualityRule, qualityRuleHost } from './quality-rule';
import { useAutoRecalculate } from './use-auto-recalculate';
import { artifactPairScore, engravedStonesFor, scoringSettings } from '../lib/artifact-recommendations';
import { allocateArtifactPlacements } from '../lib/artifact-recommendation-allocation';
import type { SortableColumn } from './use-sorted-rows';
import { artifactPreferenceStatus, recordedArtifactPreferenceMonsterIds } from '../lib/artifact-preferences';
import { artifactCategoryLabel, artifactEquipClassLabel, artifactValueTint, displaySubProperty } from '../lib/artifact-grid';
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
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
/* Intangible joins the named classes so the wildcard artifacts can be filtered
   for rather than only found by scrolling. */
const restrictionOptions = [
  ...Object.values(artifactElements), ...Object.values(artifactArchetypes), artifactIntangibleLabel,
];
const artifactLocations = ['inventory', 'equipped'] as const;

type ArtifactLocation = typeof artifactLocations[number];
/* The one option under "Already matching". It is a list like every other
   filter group so it toggles, labels and clears by the same code, rather than
   a lone boolean with its own handling. */
const matchingFilters = ['hide'] as const;
type MatchingFilter = typeof matchingFilters[number];
type ArtifactFilters = {
  categories: ArtifactCategory[];
  restrictions: string[];
  grades: ArtifactGrade[];
  mainProperties: ArtifactMainProperty[];
  subPropertyId: string;
  /** Where the artifact sits in the imported data, before any advice. */
  locations: ArtifactLocation[];
  /** Where following the plan would put it: equipped if a monster was
   * allocated one, inventory if the advice is to sell it. */
  plannedLocations: ArtifactLocation[];
  matching: MatchingFilter[];
};
type OwnedMonster = { unitId: string; masterId: string; name: string };
type CategoryCalculation = { request: ArtifactScoreRequest; result: ArtifactScoreResult };
type Allocation = { monster: OwnedMonster; value: number; conversions: readonly ArtifactConversion[] };
type UnscoredSlot = { monster: OwnedMonster; category: ArtifactCategory; status: 'missing' | 'empty' };
type Calculation = { inputKey: string; backend: 'cpu' | 'webgpu'; durationMs: number; evaluatedPairs: number; ownedConversionCount: number; categories: CategoryCalculation[]; allocations: Map<string, Allocation>; unfilledSlots: number; slotCount: number; unscoredSlots: readonly UnscoredSlot[] };
/* The view opens on the work the plan asks for: the artifacts it would equip,
   minus the ones already on the monster it names. Everything else — the pieces
   to sell, and the placements that are already right — stays one click away in
   the panel rather than filling the first screen with rows carrying no action.
   Both are ordinary filters, so "Clear results" and the buttons themselves
   return the complete plan. */
const defaultFilters: ArtifactFilters = { categories: [], restrictions: [], grades: [], mainProperties: [], subPropertyId: '', locations: [], plannedLocations: ['equipped'], matching: ['hide'] };

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

function recommendationMonsters(monsters: readonly GameRecord[], settings: ArtifactSettings): OwnedMonster[] {
  const candidates = artifactOptimizationMonsters(monsters, settings);
  if (settings.onlyFactorInOwnedMonsters || settings.onlyLevel40Monsters) return readOwnedMonsters(candidates);
  /* Not owned copies but monsters in the abstract, so each is named as a species
     and a collaboration pair is listed once under both of its names. */
  return recordedArtifactPreferenceMonsterIds.map((speciesId) => ({
    unitId: `species-${speciesId}`,
    masterId: speciesId,
    name: monsterSpeciesPresentation(speciesId).name,
  })).sort((left, right) => monsterNameCollator.compare(left.name, right.name) || monsterNameCollator.compare(left.masterId, right.masterId));
}

/* The allocation matrix includes the best projected conversion: that is the
   right figure for choosing a future plan. The row's current-value column,
   however, describes the artifact as it is now, before spending a stone.
   Keeping the two readings separate makes a listed conversion prove its own
   gain instead of appearing to reproduce the value already on screen.

   Both readings come from `artifactPairScore`, which every artifact view uses,
   so a figure here cannot disagree with the same pair shown on another page. */
function currentScoreAt(calculation: CategoryCalculation, artifactId: string, masterId: string): number | undefined {
  return artifactPairScore([calculation.request], artifactId, monsterSpeciesId(masterId),
    { conversions: false })?.value;
}

function conversionAt(calculation: CategoryCalculation, artifactId: string, masterId: string): readonly ArtifactConversion[] {
  return artifactPairScore([calculation.request], artifactId, monsterSpeciesId(masterId),
    { conversions: true })?.conversions ?? [];
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
  /* A missing preference is a visible data gap, not an allocation failure. It
     must therefore stay out of the allocator's slot count and be reported by
     the caller separately. In contrast, a valid preference with no owned
     artifacts remains a real unfilled slot. */
  const slots = scopedMonsters.flatMap((monster) => categoryOrder
    .filter((category) => artifactPreferenceStatus(monster.masterId, category) === 'scorable')
    .map((category) => ({ monsterId: monster.unitId, category })));
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

function unscoredArtifactSlots(monsters: readonly OwnedMonster[]): UnscoredSlot[] {
  return monsters.flatMap((monster) => categoryOrder.flatMap((category) => {
    const status = artifactPreferenceStatus(monster.masterId, category);
    return status === 'scorable' ? [] : [{ monster, category, status }];
  }));
}

/* "1 slots" read as a defect in the arithmetic rather than in the sentence, and
   it appeared in the one notice a user reaches while already wondering whether
   the plan is wrong. Every notice counting slots goes through here. */
function countedSlots(count: number, general: GeneralSettings): string {
  return `${formatNumber(count, general)} ${count === 1 ? 'slot' : 'slots'}`;
}

function describeUnscoredMonsters(slots: readonly UnscoredSlot[]): string {
  const categoriesByMonster = new Map<string, { name: string; categories: ArtifactCategory[] }>();
  for (const slot of slots) {
    const current = categoriesByMonster.get(slot.monster.unitId) ?? { name: slot.monster.name, categories: [] };
    current.categories.push(slot.category);
    categoriesByMonster.set(slot.monster.unitId, current);
  }
  return [...categoriesByMonster.values()]
    .map(({ name, categories }) => `${name} (${categories.map((category) => artifactCategoryLabel(category)).join(' and ')})`)
    .join(', ');
}

/* Scores arrive as whole percentage points (§17.1), so nothing is rounded here:
   the number shown is the number every comparison used. The bands are the
   library's, from `artifact-grid.ts`: two tables judging the same number must
   not disagree about what counts as a good score. */
function Score({ value, general }: { value: number | undefined; general: GeneralSettings }) {
  return value === undefined ? '—' : <span {...artifactValueTint(value)}>{formatNumber(value, general)} %</span>;
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
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const ownedMonsters = useMemo(() => readOwnedMonsters(monsters), [monsters]);
  const scopedMonsters = useMemo(() => recommendationMonsters(monsters, settings), [monsters, settings]);
  const wearerByUnitId = useMemo(() => new Map(ownedMonsters.map((monster) => [monster.unitId, monster])), [ownedMonsters]);
  const scopedMonsterIds = useMemo(() => new Set(scopedMonsters.map((monster) => monster.unitId)), [scopedMonsters]);
  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const artifact of artifacts) for (const property of artifact.subProperties) definitions.set(property.definition.id, { id: property.definition.id, name: property.definition.name });
    return [...definitions.values()].sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.id - right.id);
  }, [artifacts]);
  const selectedSubPropertyId = subPropertyOptions.some((option) => String(option.id) === filters.subPropertyId) ? filters.subPropertyId : '';
  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.category, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex, ...artifact.subProperties.map((property) => [property.definition.id, property.valueHundredths, property.maximumHundredths])]),
    monsters: scopedMonsters.map((monster) => [monster.unitId, monster.masterId]), settings: scoringSettings(settings),
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
        ...allocateArtifacts(categories, scopedMonsters, artifactOrder),
        unscoredSlots: unscoredArtifactSlots(scopedMonsters),
      });
      setState('idle');
    } catch {
      setCalculation(undefined);
      setError('JASWA could not calculate artifact recommendations from this data.');
      setState('error');
    }
  }

  useAutoRecalculate({
    mode: settings.recalculate,
    stale: calculation !== undefined && currentCalculation === undefined,
    calculating: state === 'calculating',
    calculate: () => void calculate(),
  });

  const buttonGroup =<T extends string>(label: string, key: keyof ArtifactFilters, values: readonly T[], display: (value: T) => string, className: string, dividerIndexes: readonly number[] = []) => <div className={`filter-group ${className}`} role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">{values.map((value, index) => <Fragment key={value}>
      {dividerIndexes.includes(index) && <span className="artifact-restriction-divider" role="presentation" aria-hidden="true" />}
      <FilterButton active={(filters[key] as string[]).includes(value)} onClick={() => toggle(key, value)}>{display(value)}</FilterButton>
    </Fragment>)}</div>
  </div>;

  const scoreForWearer = (artifact: Artifact): number | undefined => {
    if (!currentCalculation || artifact.occupiedId === null) return undefined;
    if (!scopedMonsterIds.has(artifact.occupiedId)) return undefined;
    const wearer = wearerByUnitId.get(artifact.occupiedId);
    const category = currentCalculation.categories.find((entry) => entry.request.artifacts[0]?.category === (artifact.category === 'attribute' ? 1 : 2));
    return wearer && category ? currentScoreAt(category, artifact.id, wearer.masterId) : undefined;
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

  /* Two of the filters ask about the advice rather than the artifact, so they
     cannot run in `visibleArtifacts` with the rest: the allocation is not known
     until the calculation has been paired with the row. They narrow which rows
     are shown and nothing else — the allocation itself is computed over the
     whole library, exactly as before, so a filter still never changes the
     advice in the rows that remain. */
  const plannedRows = useMemo(() => rows.filter((row) => {
    const plannedLocation: ArtifactLocation = row.allocation ? 'equipped' : 'inventory';
    const alreadyMatching = row.allocation !== undefined
      && row.artifact.occupiedId === row.allocation.monster.unitId;
    return (!filters.plannedLocations.length || filters.plannedLocations.includes(plannedLocation))
      && !(filters.matching.includes('hide') && alreadyMatching);
  }), [rows, filters.plannedLocations, filters.matching]);

  /* Every slot in the scope, split into the three states it can be in. They
     are derived from one total here rather than reported independently, which
     is what guarantees the figures on the page reconcile: `slotCount` counts
     only the scorable slots, so the unscored ones have to be added back in to
     get the number a user would arrive at by counting monsters. */
  const awaitingSlots = currentCalculation?.unscoredSlots.length ?? 0;
  const totalSlots = (currentCalculation?.slotCount ?? 0) + awaitingSlots;
  const filledSlots = (currentCalculation?.slotCount ?? 0) - (currentCalculation?.unfilledSlots ?? 0);
  const slotRemainder = [
    ...(currentCalculation?.unfilledSlots ? [`${formatNumber(currentCalculation.unfilledSlots, general)} unfilled`] : []),
    ...(awaitingSlots ? [`${formatNumber(awaitingSlots, general)} awaiting preferences`] : []),
  ];

  const missingPreferenceSlots = useMemo(() => currentCalculation?.unscoredSlots.filter((slot) => slot.status === 'missing') ?? [], [currentCalculation]);
  const emptyPreferenceSlots = useMemo(() => currentCalculation?.unscoredSlots.filter((slot) => slot.status === 'empty') ?? [], [currentCalculation]);

  type RecommendationRow = typeof rows[number];

  const columns: SortableColumn<RecommendationRow>[] = useMemo(() => [
    /* Scores and percentages take the right edge so their digits line up down
       the column; every descriptive column reads from the left. */
    { key: 'category', label: 'Type', align: 'left', compare: (left, right) => artifactCategoryLabel(left.artifact.category).localeCompare(artifactCategoryLabel(right.artifact.category)) },
    /* The restriction stays a filter and loses its column. It is the one fact
       in the row the user has usually already fixed from the panel above, so
       repeating it in every row spent a column on an answer they had just
       given. */
    { key: 'main', label: 'Main stat', align: 'left', compare: (left, right) => left.artifact.mainProperty.localeCompare(right.artifact.mainProperty) },
    /* Substats order by the artifact's own grade and then its first line, which
       is the closest thing to "how good is this piece" the column shows. */
    { key: 'subs', label: 'Substats', align: 'left', compare: (left, right) => artifactGradeOrder.indexOf(left.artifact.grade) - artifactGradeOrder.indexOf(right.artifact.grade) || monsterNameCollator.compare(left.artifact.subProperties[0]?.definition.name ?? '', right.artifact.subProperties[0]?.definition.name ?? ''), initialDirection: 'descending' },
    { key: 'location', label: 'Location', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.wearerName, right.wearerName) },
    { key: 'current', label: 'Value on mon', align: 'right', compare: (left, right) => (left.current ?? -1) - (right.current ?? -1), initialDirection: 'descending' },
    { key: 'action', label: 'Plan', align: 'left', compare: (left, right) => left.action.localeCompare(right.action) },
    { key: 'recommendation', label: 'Monster', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.allocation?.monster.name ?? '', right.allocation?.monster.name ?? '') },
    { key: 'value', label: 'New value', align: 'right', compare: (left, right) => (left.allocation?.value ?? -1) - (right.allocation?.value ?? -1), initialDirection: 'descending' },
    { key: 'conversion', label: 'Best conversions', align: 'left', compare: (left, right) => (left.allocation?.conversions[0]?.gain ?? -1) - (right.allocation?.conversions[0]?.gain ?? -1), initialDirection: 'descending' },
    { key: 'refinement', label: '', accessibleLabel: 'Refinement', align: 'right', compare: (left, right) => Number(left.artifact.unrefined) - Number(right.artifact.unrefined), initialDirection: 'descending' },
    /* No column of its own: this answers "what have I picked up lately", which
       is a question about the order of the rows rather than a fact worth a
       twelfth column. The filter panel's button drives it, newest first,
       because the recent arrivals are the ones whose plan the user has not
       seen yet.

       It orders by the acquisition sequence, not by `date_add`, so that the
       table reproduces the game's own Obtained sort. `date_add` resolves only
       to the second and the game grants artifacts in bulk — one run put 139 of
       this account's artifacts on a single timestamp — so inside a batch the
       date decides nothing and the rows fell back to import order, which is
       not the order the game shows. `obtainedOrder` is unique per artifact and
       needs no tiebreak. */
    { key: 'obtained', label: 'Obtained', header: false, initialDirection: 'descending',
      compare: (left, right) => left.artifact.obtainedOrder - right.artifact.obtainedOrder },
  ], []);

  const cellClass = columnClasses(columns);

  const { sorted, sort, toggle: toggleSort } = useSortedRows(
    plannedRows, columns,
    { key: 'value', direction: 'descending' },
    /* Scores tie constantly once they are whole points, so import order settles
       equal rows rather than the sort's internals. */
    (left, right) => left.order - right.order,
  );

  return <div className="artifact-recommendations">
    <p className="lead">Rank every useful fit, then lock one Attribute and one Type artifact per monster. Filters only narrow this complete plan; they never reshuffle it.</p>
    <div className="filter-panel artifact-recommendation-filters">
      {buttonGroup('Type', 'categories', categoryOrder, (category) => artifactCategoryLabels[category], 'artifact-recommendation-filter-type')}
      {buttonGroup('Restriction', 'restrictions', restrictionOptions, (restriction) => restriction, 'artifact-recommendation-filter-restriction', [5, 9])}
      {buttonGroup('Quality', 'grades', artifactGradeOrder, (grade) => grade.slice(0, 3).toUpperCase(), 'artifact-recommendation-filter-quality')}
      <div className="filter-group artifact-recommendation-filter-substat"><label className="filter-label" htmlFor="artifact-recommendation-substat">Substat</label><div className="filter-group-controls"><Dropdown id="artifact-recommendation-substat" value={selectedSubPropertyId} onChange={(event) => setFilters((current) => ({ ...current, subPropertyId: event.target.value }))} aria-label="Filter recommendations by artifact substat" placeholder="All substats">{subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Dropdown></div></div>
      {/* Ordering, not filtering. It is a filter group like the rest so it
          keeps the panel's one source of indentation and label alignment, and
          its own left rule is drawn strong: everything left of that line
          narrows the rows, this one only rearranges them. */}
      <div className="filter-group artifact-recommendation-filter-obtained" role="group" aria-label="Order recommendations">
        <span className="filter-label">Order</span>
        <div className="filter-group-controls">
          <FilterButton active={sort.key === 'obtained'}
            onClick={() => toggleSort('obtained')}>Sort by obtained</FilterButton>
        </div>
      </div>
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder, (property) => property, 'artifact-recommendation-filter-main')}
      {/* Two questions about one artifact, and they are different questions:
          where it sits in the import, and where following this plan would put
          it. Naming them "before" and "after" is what keeps them from reading
          as one filter shown twice. */}
      {buttonGroup('Location before', 'locations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Equipped', 'artifact-recommendation-filter-location')}
      {buttonGroup('Location after', 'plannedLocations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Equipped', 'artifact-recommendation-filter-planned-location')}
      {/* On by default (`defaultFilters`): a row where the plan agrees with
          reality is still part of the plan, but it asks nothing of the user, so
          the view opens on the work list and the button restores the whole
          allocation. */}
      {buttonGroup('Already matching', 'matching', matchingFilters, () => 'Hide', 'artifact-recommendation-filter-matching')}
      <div className="filter-panel-actions artifact-recommendation-actions">
        <Button tone="important" size="prominent" busy={state === 'calculating'} busyLabel="Calculating…"
          onClick={() => void calculate()}>Calculate recommendations</Button>
        <Button tone="danger" size="compact" className="artifact-recommendation-clear"
          onClick={() => clear()} disabled={!calculation || state === 'calculating'}>Clear results</Button>
        {/* Two different undos, and the panel keeps them apart: Clear results
            discards the calculation, this one only puts the filters back. It
            is always available, because narrowing the view is possible before
            there is anything to narrow. */}
        <button type="button" className="filter-reset" aria-label="Reset recommendation filters"
          onClick={() => setFilters(defaultFilters)}>Reset filters</button>
      </div>
    </div>
    {state === 'error' && <p className="notice warning" role="status">{error}</p>}
    {/* In the on-change mode the recalculation is already under way, so the
        notice reports it rather than asking for a button the user has told
        JASWA not to make them press. */}
    {calculation && !currentCalculation && <p className="notice warning" role="status">{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these recommendations…'
      : 'Settings or imported data changed. Calculate again to refresh these recommendations.'}</p>}
    {currentCalculation && <>
      {/* The slot figures have to add up on the page. Reporting "558 of 558
          filled" and then warning about 2 more slots left the user with three
          numbers and no way to see how they relate: the 558 counted only the
          scorable slots, so the unscored two were nowhere in the arithmetic.

          The total is now every slot the scope has, and the parts that are not
          filled are named beside it, so filled + unfilled + awaiting always
          equals the total. Each part is only named when it is non-zero, so an
          account with complete preferences still reads as a plain
          "560 of 560 slots filled". */}
      <p className="artifact-recommendation-meta" role="status">{formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked · {formatNumber(filledSlots, general)} of {formatNumber(totalSlots, general)} slots filled{slotRemainder.length > 0 && <> ({slotRemainder.join(', ')})</>} · {formatNumber(Math.round(currentCalculation.durationMs), general)} ms · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}</p>
      {/* Not "no artifact scores above 0 % here", which is what the old wording
          was read as and is almost never true: the artifacts that would suit
          this slot exist, and the ranked pass gave every one of them to a
          monster that scores at least as well. Saying where they went makes the
          empty slot the plan's answer rather than a fault in it. */}
      {currentCalculation.unfilledSlots > 0 && <p className="notice warning" role="status">The plan leaves {countedSlots(currentCalculation.unfilledSlots, general)} empty: every artifact that scores above 0 % there was claimed by a monster it suits at least as well. JASWA never fills a slot with a zero-score match.</p>}
      {missingPreferenceSlots.length > 0 && <p className="notice warning" role="status">Artifact preferences are not yet recorded for {describeUnscoredMonsters(missingPreferenceSlots)}. That leaves {countedSlots(missingPreferenceSlots.length, general)} awaiting data, and out of the scoring.</p>}
      {emptyPreferenceSlots.length > 0 && <p className="notice warning" role="status">No preferred or acceptable artifact properties are recorded for {describeUnscoredMonsters(emptyPreferenceSlots)}. That leaves {countedSlots(emptyPreferenceSlots.length, general)} awaiting preferences, and out of the scoring.</p>}
      {settings.conversionStoneMode === 'owned' && currentCalculation.ownedConversionCount === 0 && <p className="notice warning">This import has no readable engraved conversion stones, so the results keep every artifact as it is.</p>}
      {sorted.length ? <div className="artifact-recommendation-table-wrap"><table className="artifact-recommendation-table">
        <SortableHeader columns={columns} sort={sort} onToggle={toggleSort} />
        <tbody>{sorted.map((row) => <tr key={row.artifact.id}>
          {/* The artifact's quality reads as the coloured rule down the row's
              leading edge, where it is a margin mark rather than a stripe
              inside the row. */}
          <td className={cellClass('category', qualityRuleHost)}><QualityRule tier={row.artifact.grade} />{artifactCategoryLabel(row.artifact.category)}</td>
          <td className={cellClass('main')}>{row.artifact.mainProperty}</td>
          <td className={cellClass('subs')}><ul className="artifact-subs">{row.artifact.subProperties.map((property, index) => <li key={property.definition.id}>
            {displaySubProperty(property, (value) => formatNumber(value, general))}
            {row.artifact.convertedPropertyIndex === index && <ConvertedArtifactMark position={index} />}
          </li>)}</ul></td>
          {/* Three readings, in order of what the user needs from the cell.
              Gold where the artifact is already on the monster the plan names,
              which is the one case the column reports as settled. Otherwise
              "Inventory" keeps full ink: it says the piece is free to move,
              which is what makes a row actionable. A monster name is dimmed —
              it is the address the artifact has to be taken off, secondary to
              the plan's own column beside it, and dimming it stops a table of
              names from reading as loudly as the advice. */}
          <td className={cellClass('location', row.artifact.occupiedId === row.allocation?.monster.unitId
            ? 'artifact-recommendation-keep'
            : row.artifact.occupiedId === null ? '' : 'artifact-recommendation-wearer')}>{row.wearerName}</td>
          <td className={cellClass('current')}><Score value={row.current} general={general} /></td>
          <td className={cellClass('action', row.action === 'Sell' ? 'artifact-recommendation-sell' : row.action === 'Keep' ? 'artifact-recommendation-keep' : '')}>{row.action}</td>
          <td className={cellClass('recommendation', row.allocation ? row.artifact.occupiedId === row.allocation.monster.unitId ? 'artifact-recommendation-keep' : '' : 'artifact-recommendation-sell')}>{row.allocation?.monster.name ?? '—'}</td>
          <td className={cellClass('value')}><Score value={row.allocation?.value} general={general} /></td>
          <td className={cellClass('conversion', row.allocation?.conversions.length ? '' : row.allocation ? 'artifact-recommendation-no-conversion' : 'muted')}>
            {row.allocation ? <ConversionList conversions={row.allocation.conversions} artifact={row.artifact}
              stones={stones} mode={settings.conversionStoneMode} emptyClassName="artifact-recommendation-no-conversion" /> : '—'}
          </td>
          <td className={cellClass('refinement', 'artifact-recommendation-flag')}><UnrefinedArtifactMark unrefined={row.artifact.unrefined} /></td>
        </tr>)}</tbody>
      </table></div> : <p className="artifact-recommendation-empty">
        {/* Three ways to end up with no rows, and they are worth telling
            apart: nothing survived the artifact filters, nothing survived the
            filters that ask about the plan, or the plan itself had nothing to
            say about what did survive. */}
        {!visibleArtifacts.length
          ? 'No artifacts match these filters.'
          : rows.length
            ? 'No artifact matches these filters once the plan is taken into account.'
            : 'Every artifact matching these filters is already where it does most good.'}
      </p>}
    </>}
  </div>;
}
