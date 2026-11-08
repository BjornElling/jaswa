import { filterIncludes, filterIsUnrestricted } from '../lib/filter-selection';
import { Fragment, useMemo, useState } from 'react';
import { FilterButton } from './button';
import { CalculationActions, CalculationNote } from './calculation-actions';
import { CalculationStatus } from './calculation-status';
import { useCancellableRun } from './use-cancellable-run';
import { isCalculationCancelled } from '../lib/compute/cancellable-worker';
import { SettledCalculation } from './settled-calculation';
import { Dropdown } from './dropdown';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import { columnClasses } from '../lib/table-layouts';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { combineCalculationBackends } from '../lib/compute/calculation-summary';
import type { CalculationBackend } from '../lib/compute/calculation-summary';
import { buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { ConversionList } from './conversion-list';
import { QualityRule } from './quality-rule';
import { qualityRuleHost } from './quality-rule-host';
import { useAutoRecalculate } from './use-auto-recalculate';
import { artifactPairScore, engravedStonesFor, scoringSettings } from '../lib/artifact-recommendations';
import { allocateArtifactPlacements } from '../lib/artifact-recommendation-allocation';
import type { SortableColumn } from './use-sorted-rows';
import { artifactPreferenceStatus, recordedArtifactPreferenceMonsterIds } from '../lib/artifact-preferences';
import { artifactCategoryLabel, artifactEngraveClassLabel, artifactValueTint, displaySubProperty } from '../lib/artifact-grid';
import {
  artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder,
  artifactIntangibleLabel, artifactMainPropertyOrder,
} from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-identity';
import { monsterCopyNames } from '../lib/monster-names';
import type { MonsterCopyName } from '../lib/monster-names';
import type { MonsterProfiles } from '../lib/monster-preferences';
import { monsterNameCollator } from '../lib/monster-grid';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactConversion, ArtifactScoreRequest, ArtifactScoreResult } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';
import { intangibleRestrictionCode } from '../lib/compute/artifact-score-protocol';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
/* Intangible joins the named classes so the wildcard artifacts can be filtered
   for rather than only found by scrolling. */
const restrictionOptions = [
  ...Object.values(artifactElements), ...Object.values(artifactArchetypes), artifactIntangibleLabel,
];
const artifactLocations = ['inventory', 'engraved'] as const;
const conversionFilters = ['yes', 'no'] as const;

type ArtifactLocation = typeof artifactLocations[number];
/* Whether the plan puts the artifact where it already is. Yes and No, like
   Conversion beside it, so the two read as one question in two parts. */
const matchingFilters = ['yes', 'no'] as const;
type MatchingFilter = typeof matchingFilters[number];
type ArtifactFilters = {
  categories: ArtifactCategory[];
  restrictions: string[];
  grades: ArtifactGrade[];
  mainProperties: ArtifactMainProperty[];
  subPropertyId: string;
  /** Where the artifact sits in the imported data, before any advice. */
  locations: ArtifactLocation[];
  /** Where following the plan would put it: engraved if a monster was
   * allocated one, inventory if the advice is to sell it. */
  plannedLocations: ArtifactLocation[];
  matching: MatchingFilter[];
  conversions: (typeof conversionFilters[number])[];
  /** How Conversion and Already matching combine. */
  adviceJoin: 'and' | 'or';
};
type OwnedMonster = { unitId: string; masterId: string; name: string };
type CategoryCalculation = { request: ArtifactScoreRequest; result: ArtifactScoreResult };
type Allocation = { monster: OwnedMonster; value: number; conversions: readonly ArtifactConversion[] };
type MonsterSlot = { monster: OwnedMonster; category: ArtifactCategory };
type UnscoredSlot = MonsterSlot & { status: 'missing' | 'empty' };
type Calculation = { inputKey: string; backend: CalculationBackend; durationMs: number; evaluatedPairs: number; ownedConversionCount: number; categories: CategoryCalculation[]; allocations: Map<string, Allocation>; unfilledSlots: readonly MonsterSlot[]; slotCount: number; unscoredSlots: readonly UnscoredSlot[] };
/* The view opens on the artifacts the plan would engrave. The pieces to sell
   stay one click away in the panel rather than filling the first screen with
   rows carrying no action. It is an ordinary filter, so toggling it off
   returns the complete plan. */
const defaultFilters: ArtifactFilters = { categories: [], restrictions: [], grades: [], mainProperties: [], subPropertyId: '', locations: [], plannedLocations: ['engraved'], matching: [], conversions: [], adviceJoin: 'and' };

/* `names` is read off the whole roster, never off `monsters`: numbering a
   filtered subset would call the second Lushen "Lushen" whenever the first was
   filtered away, and the same copy would read differently on every page. */
function readOwnedMonsters(monsters: readonly GameRecord[], names: Record<string, MonsterCopyName>): OwnedMonster[] {
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
    owned.push({ unitId, masterId, name: names[unitId]?.name ?? monsterPresentation(masterId).name });
  }
  return owned.sort((left, right) => monsterNameCollator.compare(left.name, right.name) || monsterNameCollator.compare(left.unitId, right.unitId));
}

function recommendationMonsters(monsters: readonly GameRecord[], settings: ArtifactSettings, names: Record<string, MonsterCopyName>): OwnedMonster[] {
  const candidates = artifactOptimizationMonsters(monsters, settings);
  if (settings.onlyFactorInOwnedMonsters || settings.onlyLevel40Monsters) return readOwnedMonsters(candidates, names);
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
function currentScoreAt(calculation: CategoryCalculation, artifactId: string, monster: OwnedMonster): number | undefined {
  return artifactPairScore([calculation.request], artifactId, monsterSpeciesId(monster.masterId),
    { conversions: false, unitId: monster.unitId })?.value;
}

function conversionAt(calculation: CategoryCalculation, artifactId: string, monster: OwnedMonster): readonly ArtifactConversion[] {
  return artifactPairScore([calculation.request], artifactId, monsterSpeciesId(monster.masterId),
    { conversions: true, unitId: monster.unitId })?.conversions ?? [];
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
): { allocations: Map<string, Allocation>; unfilledSlots: MonsterSlot[]; slotCount: number } {
  const candidates: Array<{
    artifactId: string;
    artifactOrder: number;
    category: ArtifactCategory;
    monsterId: string;
    monsterOrder: number;
    value: number;
    exclusiveGroup?: string;
    allocation: Allocation;
  }> = [];
  for (const calculation of categories) {
    const matrix = calculation.result.scoreMatrix;
    if (!matrix) continue;
    /* A copy with a row of its own is read from it (§19.2); every other copy
       from its species' row. */
    const speciesIndexes = new Map<string, number>();
    const copyIndexes = new Map<string, number>();
    calculation.request.monsters.forEach((monster, index) => {
      if (monster.ownerUnitId === undefined) speciesIndexes.set(monster.id, index);
      else copyIndexes.set(monster.ownerUnitId, index);
    });
    for (let artifactIndex = 0; artifactIndex < calculation.request.artifacts.length; artifactIndex += 1) {
      const artifact = calculation.request.artifacts[artifactIndex];
      const category: ArtifactCategory = artifact.category === 1 ? 'attribute' : 'type';
      const order = artifactOrder.get(artifact.id);
      if (order === undefined) throw new Error('Artifact allocation scored an artifact the import does not carry.');
      for (let monsterOrder = 0; monsterOrder < scopedMonsters.length; monsterOrder += 1) {
        const monster = scopedMonsters[monsterOrder];
        const monsterIndex = copyIndexes.get(monster.unitId) ?? speciesIndexes.get(monsterSpeciesId(monster.masterId));
        if (monsterIndex === undefined) continue;
        const value = matrix[artifactIndex * calculation.request.monsters.length + monsterIndex];
        if (value <= 0) continue;
        candidates.push({
          artifactId: artifact.id,
          artifactOrder: order,
          category,
          monsterId: monster.unitId,
          monsterOrder,
          value,
          /* Intangible artifacts are wildcards, but the game allows one on a
             monster across both artifact categories. The allocator owns this
             cross-slot constraint with the rest of the placement rules. */
          exclusiveGroup: artifact.restriction === intangibleRestrictionCode ? 'intangible' : undefined,
          allocation: { monster, value, conversions: conversionAt(calculation, artifact.id, monster) },
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
  const monsterById = new Map(scopedMonsters.map((monster) => [monster.unitId, monster]));
  const unfilledSlots = selected.unfilledSlots.map(({ monsterId, category }) => {
    const monster = monsterById.get(monsterId);
    if (!monster) throw new Error('Artifact allocation left a slot for a monster outside the scope.');
    return { monster, category };
  });
  return { allocations, unfilledSlots, slotCount: slots.length };
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

function describeMonsterSlots(slots: readonly MonsterSlot[]): string {
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

/* Short enough to read at a glance. Five names still fit on a line or two;
   beyond that the list stops helping and the count says enough on its own.
   Names only: a copy name already carries its own parenthesis, and a second
   one for the slot type read as clutter. */
function describeUnfilledSlots(slots: readonly MonsterSlot[], general: GeneralSettings): string {
  const names = [...new Map(slots.map((slot) => [slot.monster.unitId, slot.monster.name])).values()];
  const counted = `${formatNumber(names.length, general)} ${names.length === 1 ? 'monster' : 'monsters'}`;
  return names.length <= 5
    ? `No suitable artifacts were left for ${counted}: ${names.join(', ')}.`
    : `No suitable artifacts were left for ${counted}.`;
}

/* Scores arrive as whole percentage points (§17.1), so nothing is rounded here:
   the number shown is the number every comparison used. The bands are the
   library's, from `artifact-grid.ts`: two tables judging the same number must
   not disagree about what counts as a good score. */
function Score({ value, general }: { value: number | undefined; general: GeneralSettings }) {
  return value === undefined ? '—' : <span {...artifactValueTint(value)}>{formatNumber(value, general)} %</span>;
}

export function ArtifactMaximumValues({ data, monsters, scenarioProfiles, settings, general, hardwareAcceleration }: {
  data: GameRecord | undefined;
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<ArtifactFilters>(defaultFilters);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [error, setError] = useState<string | undefined>();
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  /* The tiebreak is the artifact's own order (§17.1), never its position in the
     import: the import lists the inventory before the engraved, so engraving
     one of two tied artifacts moved it behind the other, and the plan then
     recommended swapping back — every time. `obtainedOrder` does not move. */
  const artifactOrder = useMemo(() => new Map(artifacts.map((artifact) => [artifact.id, artifact.obtainedOrder])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const copyNames = useMemo(() => monsterCopyNames(monsters, scenarioProfiles), [monsters, scenarioProfiles]);
  const ownedMonsters = useMemo(() => readOwnedMonsters(monsters, copyNames), [monsters, copyNames]);
  const scopedMonsters = useMemo(() => recommendationMonsters(monsters, settings, copyNames), [monsters, settings, copyNames]);
  const monsterByUnitId = useMemo(() => new Map(ownedMonsters.map((monster) => [monster.unitId, monster])), [ownedMonsters]);
  const scopedMonsterIds = useMemo(() => new Set(scopedMonsters.map((monster) => monster.unitId)), [scopedMonsters]);
  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const artifact of artifacts) for (const property of artifact.subProperties) definitions.set(property.definition.id, { id: property.definition.id, name: property.definition.name });
    return [...definitions.values()].sort((left, right) => monsterNameCollator.compare(left.name, right.name) || left.id - right.id);
  }, [artifacts]);
  const selectedSubPropertyId = subPropertyOptions.some((option) => String(option.id) === filters.subPropertyId) ? filters.subPropertyId : '';
  const inputKey = JSON.stringify({
    stones: settings.conversionStoneMode === 'owned' ? stones : [],
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.category, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex, ...artifact.subProperties.map((property) => [property.definition.id, property.valueHundredths, property.maximumHundredths])]),
    monsters: scopedMonsters.map((monster) => [monster.unitId, monster.masterId]), scenarioProfiles, settings: scoringSettings(settings),
  });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const run = useCancellableRun(inputKey);
  const visibleArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const restriction = artifactEngraveClassLabel(artifact);
    return filterIncludes(filters.categories, artifact.category, categoryOrder)
      && filterIncludes(filters.restrictions, restriction, restrictionOptions)
      && filterIncludes(filters.grades, artifact.grade, artifactGradeOrder)
      && filterIncludes(filters.mainProperties, artifact.mainProperty, artifactMainPropertyOrder)
      && (!selectedSubPropertyId || artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId))
      && filterIncludes(filters.locations, artifact.occupiedId === null ? 'inventory' : 'engraved', artifactLocations);
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
    const requests = buildArtifactScoreRequestsForMonsterIds(data, scopedMonsters.map((monster) => monster.masterId), settings, undefined, scenarioProfiles)
      .map((request) => ({ ...request, includeScoreMatrix: true }));
    if (!requests.length || !scopedMonsters.length) {
      setCalculation(undefined);
      setError('There is not enough artifact or monster data to make recommendations yet.');
      setState('error');
      return;
    }
    const before = { state, error };
    const signal = run.start();
    setState('calculating');
    setError(undefined);
    try {
      const results = await Promise.all(requests.map((request) => calculateArtifactScores(request, hardwareAcceleration, signal)));
      const categories = requests.map((request, index) => ({ request, result: results[index] }));
      setCalculation({
        inputKey,
        backend: combineCalculationBackends(results.map((result) => result.backend)),
        durationMs: results.reduce((total, result) => total + result.durationMs, 0),
        evaluatedPairs: results.reduce((total, result) => total + result.evaluatedPairs, 0),
        ownedConversionCount: Math.max(...results.map((result) => result.ownedConversionCount)),
        categories,
        ...allocateArtifacts(categories, scopedMonsters, artifactOrder),
        unscoredSlots: unscoredArtifactSlots(scopedMonsters),
      });
      setState('idle');
    } catch (failure) {
      /* Cancelled: the answer from before Calculate stands, and so does its state. */
      if (isCalculationCancelled(failure)) {
        setError(before.error);
        setState(before.state === 'calculating' ? 'idle' : before.state);
        return;
      }
      setCalculation(undefined);
      setError('JASWA could not calculate artifact recommendations from this data.');
      setState('error');
    }
  }

  useAutoRecalculate({
    mode: settings.recalculate,
    stale: calculation !== undefined && currentCalculation === undefined && !run.cancelledHere,
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

  const scoreWhereEngraved = (artifact: Artifact): number | undefined => {
    if (!currentCalculation || artifact.occupiedId === null) return undefined;
    if (!scopedMonsterIds.has(artifact.occupiedId)) return undefined;
    const engravedOn = monsterByUnitId.get(artifact.occupiedId);
    const category = currentCalculation.categories.find((entry) => entry.request.artifacts[0]?.category === (artifact.category === 'attribute' ? 1 : 2));
    return engravedOn && category ? currentScoreAt(category, artifact.id, engravedOn) : undefined;
  };

  const rows = useMemo(() => !currentCalculation ? [] : visibleArtifacts.map((artifact) => {
    const allocation = currentCalculation?.allocations.get(artifact.id);
    const engravedOn = artifact.occupiedId === null ? undefined : monsterByUnitId.get(artifact.occupiedId);
    const current = scoreWhereEngraved(artifact);
    return {
      artifact,
      order: artifactOrder.get(artifact.id) ?? 0,
      engravedOnName: artifact.occupiedId === null ? 'Inventory' : engravedOn?.name ?? 'Missing monster',
      current,
      allocation,
      action: allocation ? (artifact.occupiedId === allocation.monster.unitId ? 'Keep' : 'Engrave') : 'Sell',
    };
    /* `scoreWhereEngraved` reads only the calculation and the monster map, both of
       which are dependencies here, so it does not need to be one itself. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleArtifacts, currentCalculation, monsterByUnitId, artifactOrder]);

  /* These filters ask about the advice rather than the artifact, so they
     cannot run in `visibleArtifacts` with the rest: the allocation is not known
     until the calculation has been paired with the row. They narrow which rows
     are shown and nothing else — the allocation itself is computed over the
     whole library, exactly as before, so a filter still never changes the
     advice in the rows that remain. */
  const plannedRows = useMemo(() => rows.filter((row) => {
    const plannedLocation: ArtifactLocation = row.allocation ? 'engraved' : 'inventory';
    const alreadyMatching = row.allocation !== undefined
      && row.artifact.occupiedId === row.allocation.monster.unitId;
    /* Or joins only the groups that narrow. An unset group means "every row",
       so letting it take part in an Or would make the other group's choice
       do nothing at all. */
    const advice = [
      { selected: filters.conversions, value: row.allocation?.conversions.length ? 'yes' : 'no', options: conversionFilters },
      { selected: filters.matching, value: alreadyMatching ? 'yes' : 'no', options: matchingFilters },
    ].filter((group) => !filterIsUnrestricted<string>(group.selected, group.options))
      .map((group) => filterIncludes<string>(group.selected, group.value, group.options));
    const adviceIncludes = !advice.length
      || (filters.adviceJoin === 'and' ? advice.every(Boolean) : advice.some(Boolean));
    return filterIncludes(filters.plannedLocations, plannedLocation, artifactLocations) && adviceIncludes;
  }), [rows, filters.plannedLocations, filters.conversions, filters.matching, filters.adviceJoin]);

  /* Every slot in the scope, split into the three states it can be in. They
     are derived from one total here rather than reported independently, which
     is what guarantees the figures on the page reconcile: `slotCount` counts
     only the scorable slots, so the unscored ones have to be added back in to
     get the number a user would arrive at by counting monsters. */
  const awaitingSlots = currentCalculation?.unscoredSlots.length ?? 0;
  const totalSlots = (currentCalculation?.slotCount ?? 0) + awaitingSlots;
  const unfilledSlots = currentCalculation?.unfilledSlots.length ?? 0;
  const filledSlots = (currentCalculation?.slotCount ?? 0) - unfilledSlots;
  const slotRemainder = [
    ...(unfilledSlots ? [`${formatNumber(unfilledSlots, general)} unfilled`] : []),
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
    { key: 'location', label: 'Location', align: 'left', compare: (left, right) => monsterNameCollator.compare(left.engravedOnName, right.engravedOnName) },
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
    /* Scores tie constantly once they are whole points, so the artifact's own
       order settles equal rows rather than the sort's internals. */
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
      {buttonGroup('Location before', 'locations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Engraved', 'artifact-recommendation-filter-location')}
      {buttonGroup('Location after', 'plannedLocations', artifactLocations, (location) => location === 'inventory' ? 'Inventory' : 'Engraved', 'artifact-recommendation-filter-planned-location')}
      {/* The one place two groups are joined in words, and the one place the
          join is the user's to choose. Both are Yes/No questions about the
          same advice, so "conversions or already placed" is a list worth
          asking for; everywhere else the groups narrow with And. */}
      <div className="artifact-recommendation-filter-advice">
        {buttonGroup('Conversion', 'conversions', conversionFilters, (value) => value === 'yes' ? 'Yes' : 'No', 'artifact-recommendation-filter-conversion')}
        <div className="filter-group artifact-recommendation-filter-join" role="group" aria-label="Join Conversion and Already matching">
          <span className="filter-label" aria-hidden="true">And/Or</span>
          <div className="filter-group-controls">{(['and', 'or'] as const).map((join) => <FilterButton key={join}
            active={filters.adviceJoin === join}
            onClick={() => setFilters((current) => ({ ...current, adviceJoin: join }))}>{join === 'and' ? 'And' : 'Or'}</FilterButton>)}</div>
        </div>
        {buttonGroup('Already matching', 'matching', matchingFilters, (value) => value === 'yes' ? 'Yes' : 'No', 'artifact-recommendation-filter-matching')}
      </div>
      <CalculationActions className="artifact-recommendation-actions" busy={state === 'calculating'} canCalculate
        onCalculate={() => void calculate()} onCancel={run.cancel}
        canClear={calculation !== undefined || state === 'error'} onClear={clear}
        status={state === 'calculating' ? <CalculationNote tone="busy">Calculating…</CalculationNote>
          : state === 'error' ? <CalculationNote tone="failed">{error}</CalculationNote>
            : currentCalculation
              /* The slot figures have to add up on the page: the total is every
                 slot the scope has, and the parts not filled are named beside
                 it, so filled + unfilled + awaiting always equals the total. */
              ? <CalculationStatus twoLines evaluatedPairs={currentCalculation.evaluatedPairs} durationMs={currentCalculation.durationMs}
                backend={currentCalculation.backend} general={general}
                detail={<>{formatNumber(filledSlots, general)} of {formatNumber(totalSlots, general)} slots filled{slotRemainder.length > 0 && <> ({slotRemainder.join(', ')})</>}</>} />
              : <CalculationNote>{''}</CalculationNote>}
        /* Two different undos, kept apart: Clear results discards the
           calculation, Reset filters only puts the filters back. */
        resets={<button type="button" className="filter-reset" aria-label="Reset recommendation filters"
          onClick={() => setFilters(defaultFilters)}>Reset filters</button>} />
    </div>
    {/* In the on-change mode the recalculation is already under way, so the
        notice reports it rather than asking for a button the user has told
        JASWA not to make them press. */}
    <p className="notice warning" role="status" style={{ visibility: calculation && !currentCalculation ? 'visible' : 'hidden' }}
      aria-hidden={!calculation || Boolean(currentCalculation)}>{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these recommendations…'
      : 'Settings or imported data changed. Calculate again to refresh these recommendations.'}</p>
    <SettledCalculation current={Boolean(currentCalculation)} retain={Boolean(calculation) && settings.recalculate === 'on-change'}>
    {currentCalculation && <>
      {/* "Left", not "found": the artifacts that would suit these slots
          usually exist, and the ranked pass gave them to monsters they suit
          at least as well. */}
      {unfilledSlots > 0 && <p className="notice warning" role="status">{describeUnfilledSlots(currentCalculation.unfilledSlots, general)}</p>}
      {missingPreferenceSlots.length > 0 && <p className="notice warning" role="status">Artifact preferences are not yet recorded for {describeMonsterSlots(missingPreferenceSlots)}. That leaves {countedSlots(missingPreferenceSlots.length, general)} awaiting data, and out of the scoring.</p>}
      {emptyPreferenceSlots.length > 0 && <p className="notice warning" role="status">No preferred or acceptable artifact properties are recorded for {describeMonsterSlots(emptyPreferenceSlots)}. That leaves {countedSlots(emptyPreferenceSlots.length, general)} awaiting preferences, and out of the scoring.</p>}
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
            : row.artifact.occupiedId === null ? '' : 'artifact-recommendation-engraved-on')}>{row.engravedOnName}</td>
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
    </SettledCalculation>
  </div>;
}
