import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, FilterButton } from './button';
import { ConversionList } from './conversion-list';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { Dropdown } from './dropdown';
import { QualityRule, qualityRuleHost } from './quality-rule';
import { ValueSlider } from './range-slider';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { useAutoRecalculate } from './use-auto-recalculate';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { artifactEquipClassLabel, displaySubProperty } from '../lib/artifact-grid';
import { artifactCategoryLabels, artifactGradeOrder, artifactMainPropertyOrder } from '../lib/artifact-properties';
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';
import { artifactPairScore, engravedStonesFor, scoringSettings } from '../lib/artifact-recommendations';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-species';
import { numberedMonsterNames } from '../lib/monster-names';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactMaximumScore, ArtifactScoreRequest } from '../lib/compute/artifact-score-protocol';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

const artifactLocations = ['inventory', 'equipped'] as const;
const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const recommendationRange = { minimum: 1, maximum: 10 } as const;

type ArtifactLocation = typeof artifactLocations[number];

/* Every one of these narrows the *recommendations*, which is why they sit
   below the monster and its current artifacts rather than above them. Element
   and archetype used to live here too; they only ever narrowed the monster
   dropdown, and the dropdown now simply lists every eligible monster. */
type RecommendationFilters = {
  locations: ArtifactLocation[];
  mainProperties: ArtifactMainProperty[];
  grades: ArtifactGrade[];
  /* A plain boolean rather than a one-entry list: Intangible is one question
     with one answer, and it opens on "yes" because the wildcard artifacts are
     eligible for every monster and hiding them by default would quietly drop
     the scarcest pieces the account owns. */
  includeIntangible: boolean;
  subPropertyId: string;
  /** How many recommendations each category shows. */
  count: number;
  /** Which of the two result sections are shown at all. */
  categories: ArtifactCategory[];
};

const defaultFilters: RecommendationFilters = {
  locations: [], mainProperties: [], grades: [], includeIntangible: true,
  subPropertyId: '', count: recommendationRange.maximum, categories: [...categoryOrder],
};

type MonsterOption = { unitId: string; masterId: string; name: string };

type Calculation = {
  inputKey: string;
  /** The score on the chosen monster, conversions included, per artifact. */
  target: Map<string, ArtifactMaximumScore>;
  backend: 'cpu' | 'webgpu';
  evaluatedPairs: number;
};

type ResultRow = {
  artifact: Artifact;
  index: number;
  target: ArtifactMaximumScore;
  wearer: MonsterOption | undefined;
};

/** Everything the two figure-bearing blocks need to read a pair's scores. */
type ScoreContext = {
  general: GeneralSettings;
  stones: readonly EngravedConversionStone[];
  mode: ArtifactSettings['conversionStoneMode'];
  /** Packed for the chosen monster, so any artifact's score on it is one call away. */
  monsterRequests: readonly ArtifactScoreRequest[];
  /** Packed for every monster wearing something, for the score it has there now. */
  wearerRequests: readonly ArtifactScoreRequest[];
  speciesId: string;
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
    options.push({ unitId, masterId, name: names[unitId] ?? monsterPresentation(masterId).name });
  }
  return options.sort((left, right) => monsterNameCollator.compare(left.name, right.name)
    || monsterNameCollator.compare(left.unitId, right.unitId));
}

function scoreMap(scores: ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.artifactId, score]));
}

/* Whole percentage points already (§17.1): the figure shown is the figure every
   comparison used. No band colour here — this panel gives one figure per entry
   the ink and the size, and a second colour signal on the figures beside it
   would compete with the reading order the layout establishes. */
function Percent({ value, general, fallback = '—' }: {
  value: number | undefined;
  general: GeneralSettings;
  fallback?: string;
}) {
  return <>{value === undefined ? fallback : `${formatNumber(value, general)} %`}</>;
}

/**
 * One label-and-value pair inside a facts list.
 *
 * `group` opens the blank line above a pair that begins a new group, and `lead`
 * marks the one figure an entry is read for. Both are classes on a box that is
 * always there, so no fact can appear or disappear and move the lines under it.
 */
function Fact({ label, children, lead = false, group = false }: {
  label: string;
  children: ReactNode;
  lead?: boolean;
  group?: boolean;
}) {
  const classes = ['best-artifact-fact', lead ? 'best-artifact-fact-lead' : '', group ? 'best-artifact-fact-group' : ''];
  return <div className={classes.filter(Boolean).join(' ')}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>;
}

function ArtifactName({ artifact }: { artifact: Artifact }) {
  /* The grade is named in text as well as drawn as the margin rule, because a
     colour nobody can read is not a fact (AGENTS.md §5). */
  return <p className="best-artifact-entry-name">
    <UnrefinedArtifactMark unrefined={artifact.unrefined} />{artifact.grade} · {artifactEquipClassLabel(artifact)}
  </p>;
}

function SubProperties({ artifact, general }: { artifact: Artifact; general: GeneralSettings }) {
  return <ul className="artifact-subs">{artifact.subProperties.map((property, index) => <li key={property.definition.id}>
    {displaySubProperty(property, (value) => formatNumber(value, general))}
    {artifact.convertedPropertyIndex === index && <ConvertedArtifactMark position={index} />}
  </li>)}</ul>;
}

/**
 * What the monster is wearing in one slot today, and what it is worth there.
 *
 * Both figures are computed straight from the packed request rather than from a
 * calculation, so the box answers the moment a monster is chosen: the user came
 * to compare, and comparing starts with what they already have.
 */
function CurrentArtifact({ category, artifact, context }: {
  category: ArtifactCategory;
  artifact: Artifact | undefined;
  context: ScoreContext;
}) {
  const label = artifactCategoryLabels[category];
  const asIs = artifact && artifactPairScore(context.monsterRequests, artifact.id, context.speciesId, { conversions: false });
  const potential = artifact && artifactPairScore(context.monsterRequests, artifact.id, context.speciesId, { conversions: true });

  return <article className={`best-artifact-current-slot ${artifact ? qualityRuleHost : ''}`}
    aria-label={`Current ${label.toLowerCase()} artifact`}>
    {artifact && <QualityRule tier={artifact.grade} />}
    <p className="filter-label">{label}</p>
    {artifact ? <>
      <div className="best-artifact-current-facts">
        <ArtifactName artifact={artifact} />
        <dl className="best-artifact-facts">
          <Fact label="Main stat">{artifact.mainProperty}</Fact>
          <Fact label="Value on mon" lead><Percent value={asIs?.value} general={context.general} fallback="Not judged" /></Fact>
          <Fact label="Potential value on mon"><Percent value={potential?.value} general={context.general} fallback="Not judged" /></Fact>
        </dl>
      </div>
      <div className="best-artifact-current-detail">
        <SubProperties artifact={artifact} general={context.general} />
        <ConversionList conversions={potential?.conversions ?? []} artifact={artifact}
          stones={context.stones} mode={context.mode} />
      </div>
    </> : <p className="best-artifact-empty">Nothing in this slot. Any recommendation below would be its first.</p>}
  </article>;
}

/**
 * One recommendation. Facts read down the left, the artifact's own lines and
 * the conversions they invite sit to the right, and "Score on this mon" is the
 * one figure set in full ink — it is what the whole panel is for.
 */
function Recommendation({ row, context }: { row: ResultRow; context: ScoreContext }) {
  const { artifact, target, wearer } = row;
  const onThisMon = artifactPairScore(context.monsterRequests, artifact.id, context.speciesId, { conversions: false });
  const onCurrentMon = wearer
    ? artifactPairScore(context.wearerRequests, artifact.id, monsterSpeciesId(wearer.masterId), { conversions: false })
    : undefined;

  return <li className={`best-artifact-entry ${qualityRuleHost}`}>
    <QualityRule tier={artifact.grade} />
    <div className="best-artifact-entry-facts">
      <ArtifactName artifact={artifact} />
      <dl className="best-artifact-facts">
        <Fact label="Main stat">{artifact.mainProperty}</Fact>
        <Fact label="Current location" group>{wearer?.name ?? 'Inventory'}</Fact>
        <Fact label="Score on current mon">
          <Percent value={onCurrentMon?.value} general={context.general}
            fallback={wearer ? 'Not judged' : '—'} />
        </Fact>
        <Fact label="Score on this mon" lead group>
          <Percent value={onThisMon?.value} general={context.general} fallback="Not judged" />
        </Fact>
      </dl>
    </div>
    <SubProperties artifact={artifact} general={context.general} />
    <div className="best-artifact-entry-conversions">
      <ConversionList conversions={target.conversions} artifact={artifact}
        stones={context.stones} mode={context.mode} />
      <dl className="best-artifact-facts">
        <Fact label="Score on this mon with conversions">
          <Percent value={target.value} general={context.general} />
        </Fact>
      </dl>
    </div>
  </li>;
}

export function BestArtifactForMonster({ data, monsters, settings, general, hardwareAcceleration }: {
  data: GameRecord;
  monsters: readonly GameRecord[];
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<RecommendationFilters>(defaultFilters);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');

  const allMonsters = useMemo(() => monsterOptions(monsters), [monsters]);
  const eligibleMonsters = useMemo(
    () => monsterOptions(artifactOptimizationMonsters(monsters, settings)),
    [monsters, settings],
  );
  const selectedMonster = eligibleMonsters.find((monster) => monster.unitId === selectedUnitId);
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const wearers = useMemo(() => new Map(allMonsters.map((monster) => [monster.unitId, monster])), [allMonsters]);
  const subPropertyOptions = useMemo(() => {
    const definitions = new Map<number, { id: number; name: string }>();
    for (const artifact of artifacts) {
      for (const property of artifact.subProperties) {
        definitions.set(property.definition.id, { id: property.definition.id, name: property.definition.name });
      }
    }
    return [...definitions.values()].sort((left, right) => monsterNameCollator.compare(left.name, right.name)
      || left.id - right.id);
  }, [artifacts]);
  const selectedSubPropertyId = subPropertyOptions.some((option) => String(option.id) === filters.subPropertyId)
    ? filters.subPropertyId : '';

  /* Packed once for the chosen monster and once for every monster wearing
     something. Both are the same input the compute backends are given, so a
     figure shown beside a ranking was produced by the scorer that built it. */
  const monsterRequests = useMemo(() => selectedMonster
    ? buildArtifactScoreRequestsForMonsterIds(data, [monsterSpeciesId(selectedMonster.masterId)], settings)
    : [], [data, selectedMonster, settings]);
  const wearerRequests = useMemo(() => {
    const speciesIds = new Set<string>();
    for (const artifact of artifacts) {
      if (artifact.occupiedId === null) continue;
      const wearer = wearers.get(artifact.occupiedId);
      if (wearer) speciesIds.add(monsterSpeciesId(wearer.masterId));
    }
    return buildArtifactScoreRequestsForMonsterIds(data, [...speciesIds], settings);
  }, [artifacts, data, settings, wearers]);

  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]),
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
        wearer: artifact.occupiedId === null ? undefined : wearers.get(artifact.occupiedId),
      }];
    }).sort((left, right) => right.target.value - left.target.value || left.index - right.index);
  }, [artifacts, artifactNumbers, currentCalculation, selectedMonster, wearers]);

  /* Every filter narrows a ranking that was already calculated, so clicking one
     answers immediately rather than asking for the scores again. The order is
     never touched: the list stays the ranking, minus the rows filtered out. */
  const visibleRows = rows.filter((row) => (!filters.locations.length
    || filters.locations.includes(row.artifact.occupiedId === null ? 'inventory' : 'equipped'))
    && (!filters.mainProperties.length || filters.mainProperties.includes(row.artifact.mainProperty))
    && (!filters.grades.length || filters.grades.includes(row.artifact.grade))
    && (filters.includeIntangible || !row.artifact.intangible)
    && (!selectedSubPropertyId || row.artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId)));
  const categoryRows = (category: ArtifactCategory) => visibleRows
    .filter((row) => row.artifact.category === category)
    .slice(0, filters.count);

  const wornArtifacts = useMemo(() => {
    const worn = new Map<ArtifactCategory, Artifact>();
    if (!selectedMonster) return worn;
    for (const artifact of artifacts) {
      if (artifact.occupiedId === selectedMonster.unitId) worn.set(artifact.category, artifact);
    }
    return worn;
  }, [artifacts, selectedMonster]);

  const context: ScoreContext | undefined = selectedMonster ? {
    general, stones, mode: settings.conversionStoneMode, monsterRequests, wearerRequests,
    speciesId: monsterSpeciesId(selectedMonster.masterId),
  } : undefined;

  function toggle<T extends string>(key: keyof RecommendationFilters, value: T) {
    setFilters((current) => {
      const chosen = current[key] as T[];
      return {
        ...current,
        [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value],
      };
    });
  }

  async function calculate() {
    if (!selectedMonster) return;
    /* The same packed requests the boxes above already read their figures from,
       rather than a second build of the same thing. */
    const requests = monsterRequests;
    if (!requests.length) {
      setCalculation(undefined);
      setState('error');
      return;
    }
    setState('calculating');
    try {
      const results = await Promise.all(requests.map((request) => calculateArtifactScores(request, hardwareAcceleration)));
      setCalculation({
        inputKey,
        /* One monster in the request, so its maximum over the monsters *is* its
           score on this monster — conversions and all. */
        target: scoreMap(results.flatMap((result) => result.maxima)),
        backend: results.every((result) => result.backend === 'webgpu') ? 'webgpu' : 'cpu',
        evaluatedPairs: results.reduce((total, result) => total + result.evaluatedPairs, 0),
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

  const buttonGroup = <T extends string>(
    label: string, key: keyof RecommendationFilters, values: readonly T[],
    display: (value: T) => string, className: string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">{values.map((value) => <FilterButton key={value}
      active={(filters[key] as T[]).includes(value)}
      onClick={() => toggle(key, value)}>{display(value)}</FilterButton>)}</div>
  </div>;

  return <div className="best-artifact-for-monster">
    <p className="lead">Choose a monster, see what it wears today, then rank every artifact that could take the slot.</p>

    {/* The monster leads: everything below it — the current artifacts, the
        filters, the two rankings — is an answer about this one monster. */}
    <div className="filter-panel best-artifact-monster-panel">
      <div className="filter-group best-artifact-monster-select">
        <label className="filter-label" htmlFor="best-artifact-monster">Monster</label>
        <div className="filter-group-controls">
          <Dropdown id="best-artifact-monster" value={selectedMonster?.unitId ?? ''}
            onChange={(event) => setSelectedUnitId(event.target.value)} placeholder="Choose a monster"
            aria-label="Choose a monster for artifact recommendations">
            {eligibleMonsters.map((monster) => <option key={monster.unitId} value={monster.unitId}>{monster.name}</option>)}
          </Dropdown>
        </div>
      </div>
      <div className="filter-panel-actions best-artifact-actions">
        <Button tone="important" size="prominent" busy={state === 'calculating'} busyLabel="Calculating…"
          onClick={() => void calculate()} disabled={!selectedMonster}>Calculate artifacts</Button>
        {/* Only the filters go back. The monster is the panel's subject rather
            than one of its filters, and it is no longer narrowed by any of
            them, so resetting them leaves the choice standing. */}
        <button type="button" className="filter-reset" aria-label="Reset filters for this monster"
          onClick={() => setFilters(defaultFilters)}>Reset filters</button>
      </div>
    </div>

    {selectedMonster && context && <section className="best-artifact-current" aria-labelledby="best-artifact-current-title">
      <h3 id="best-artifact-current-title">Current artifacts</h3>
      <div className="best-artifact-current-slots">
        {categoryOrder.map((category) => <CurrentArtifact key={category} category={category}
          artifact={wornArtifacts.get(category)} context={context} />)}
      </div>
    </section>}

    <div className="filter-panel best-artifact-filters">
      {buttonGroup('Location', 'locations', artifactLocations,
        (location) => location === 'inventory' ? 'Inventory' : 'Equipped', 'best-artifact-filter-location')}
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder,
        (property) => property, 'best-artifact-filter-main')}
      {buttonGroup('Quality', 'grades', artifactGradeOrder,
        (grade) => grade.slice(0, 3).toUpperCase(), 'best-artifact-filter-quality')}
      <div className="filter-group best-artifact-filter-include" role="group" aria-label="Intangible">
        <span className="filter-label">Intangible</span>
        <div className="filter-group-controls">
          <FilterButton active={filters.includeIntangible}
            onClick={() => setFilters((current) => ({ ...current, includeIntangible: !current.includeIntangible }))}
          >Include</FilterButton>
        </div>
      </div>
      <div className="filter-group best-artifact-filter-substat">
        <label className="filter-label" htmlFor="best-artifact-substat">Must have substat</label>
        <div className="filter-group-controls">
          <Dropdown id="best-artifact-substat" value={selectedSubPropertyId}
            onChange={(event) => setFilters((current) => ({ ...current, subPropertyId: event.target.value }))}
            placeholder="Any substat">
            {subPropertyOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Dropdown>
        </div>
      </div>
      <div className="filter-group best-artifact-filter-count" role="group" aria-label="Number of recommendations">
        <span className="filter-label"># of recommendations</span>
        <div className="filter-group-controls">
          <ValueSlider minimum={recommendationRange.minimum} maximum={recommendationRange.maximum}
            value={filters.count} label="Number of recommendations per category"
            valueText={(value) => `${value} ${value === 1 ? 'recommendation' : 'recommendations'} per category`}
            onChange={(count) => setFilters((current) => ({ ...current, count }))} />
        </div>
      </div>
      {/* Not a filter on the artifacts but on the page: which of the two
          rankings the user wants to read at all. */}
      {buttonGroup('Type', 'categories', categoryOrder,
        (category) => artifactCategoryLabels[category], 'best-artifact-filter-categories')}
    </div>

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate this monster’s artifact fits from the imported data.</p>}

    {/* Without this the results simply vanished on a settings change and the
        page looked as though nothing had ever been calculated. §17.11: a result
        that stops being current says so. */}
    {calculation && !currentCalculation && <p className="notice warning" role="status">{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these results…'
      : 'Settings or imported data changed. Calculate again to refresh these results.'}</p>}

    {currentCalculation && selectedMonster && context && <>
      <p className="best-artifact-meta" role="status">
        {formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}
      </p>
      <div className="best-artifact-results">
        {filters.categories.length ? categoryOrder.filter((category) => filters.categories.includes(category))
          .map((category) => {
            const shown = categoryRows(category);
            return <section key={category} className="best-artifact-category"
              aria-labelledby={`best-artifact-${category}-title`}>
              <h3 id={`best-artifact-${category}-title`}>{artifactCategoryLabels[category]}</h3>
              {/* Which figure the order follows, because it is not always the
                  one set in ink: the ranking is the score the active conversion
                  settings produce, exactly as the Recommendations table ranks
                  its plan, while the entry leads with what the artifact is
                  worth today. Saying so turns a list that looks unsorted into
                  one that says what it sorted by. */}
              <p className="best-artifact-ranking">{settings.conversionStoneMode === 'none'
                ? 'Ranked by score on this mon.'
                : 'Ranked by score on this mon with conversions.'}</p>
              {shown.length
                ? <ol className="best-artifact-entries">{shown.map((row) => <Recommendation key={row.artifact.id}
                  row={row} context={context} />)}</ol>
                : <p className="best-artifact-empty">No artifact matches these filters in this category.</p>}
            </section>;
          })
          : <p className="best-artifact-empty">Both rankings are switched off. Turn Attribute or Type back on under Type above.</p>}
      </div>
    </>}
  </div>;
}
