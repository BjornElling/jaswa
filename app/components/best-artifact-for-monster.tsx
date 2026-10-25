import { filterIncludes } from '../lib/filter-selection';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, FilterButton } from './button';
import { CalculationStatus } from './calculation-status';
import { ConversionList } from './conversion-list';
import { ConvertedArtifactMark } from './converted-artifact-mark';
import { Dropdown } from './dropdown';
import { QualityRule } from './quality-rule';
import { qualityRuleHost } from './quality-rule-host';
import { ValueSlider } from './range-slider';
import { UnrefinedArtifactMark } from './unrefined-artifact-mark';
import { useAutoRecalculate } from './use-auto-recalculate';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { combineCalculationBackends } from '../lib/compute/calculation-summary';
import type { CalculationBackend } from '../lib/compute/calculation-summary';
import { buildArtifactScoreRequestsForCopy, buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { artifactEngraveClassLabel, artifactValueTint, displaySubProperty } from '../lib/artifact-grid';
import { artifactCategoryLabels, artifactGradeOrder, artifactMainPropertyOrder } from '../lib/artifact-properties';
import { artifactOptimizationMonsters } from '../lib/artifact-optimization-monsters';
import { artifactPairScore, engravedStonesFor, scoringSettings } from '../lib/artifact-recommendations';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterSpeciesId } from '../lib/monster-identity';
import { monsterCopyNames } from '../lib/monster-names';
import type { MonsterCopyName } from '../lib/monster-names';
import type { MonsterProfiles } from '../lib/monster-preferences';
import type { Artifact } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactConversion, ArtifactMaximumScore, ArtifactScoreRequest } from '../lib/compute/artifact-score-protocol';
import type { EngravedConversionStone } from '../lib/artifact-conversion-stones';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

const artifactLocations = ['inventory', 'engraved'] as const;
const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const recommendationRange = { minimum: 1, maximum: 10, default: 3 } as const;

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
  /** The chooser belongs to this state so Reset filters clears it as well. */
  selectedUnitId: string;
};

const defaultFilters: RecommendationFilters = {
  locations: [], mainProperties: [], grades: [], includeIntangible: true,
  subPropertyId: '', count: recommendationRange.default, categories: [...categoryOrder], selectedUnitId: '',
};

type MonsterOption = { unitId: string; masterId: string; name: string };

type Calculation = {
  inputKey: string;
  /** The score on the chosen monster, conversions included, per artifact. */
  target: Map<string, ArtifactMaximumScore>;
  backend: CalculationBackend;
  evaluatedPairs: number;
  durationMs: number;
};

type ResultRow = {
  artifact: Artifact;
  index: number;
  target: ArtifactMaximumScore;
  engravedOn: MonsterOption | undefined;
};

/** Everything the two figure-bearing blocks need to read a pair's scores. */
type ScoreContext = {
  general: GeneralSettings;
  stones: readonly EngravedConversionStone[];
  mode: ArtifactSettings['conversionStoneMode'];
  /** Packed for the chosen monster, so any artifact's score on it is one call away. */
  monsterRequests: readonly ArtifactScoreRequest[];
  /** Packed for every monster with something engraved, for the score it has there now. */
  engravedRequests: readonly ArtifactScoreRequest[];
  speciesId: string;
  /** The chosen copy, whose own row answers where it has one. */
  unitId: string;
};

/* `names` covers the whole roster, so a copy keeps its number when the
   options are narrowed to a subset. */
function monsterOptions(monsters: readonly GameRecord[], names: Record<string, MonsterCopyName>): MonsterOption[] {
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
    options.push({ unitId, masterId, name: names[unitId]?.name ?? monsterPresentation(masterId).name });
  }
  return options.sort((left, right) => monsterNameCollator.compare(left.name, right.name)
    || monsterNameCollator.compare(left.unitId, right.unitId));
}

function scoreMap(scores: ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.artifactId, score]));
}

/* Whole percentage points already (§17.1): the figure shown is the figure every
   comparison used. */
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
 * `group` opens the blank line above a pair that begins a new group. It is a
 * class on a box that is always there, so no fact can appear or disappear and
 * move the lines under it.
 */
function Fact({ label, children, group = false }: {
  label: string;
  children: ReactNode;
  group?: boolean;
}) {
  const classes = ['best-artifact-fact', group ? 'best-artifact-fact-group' : ''];
  return <div className={classes.filter(Boolean).join(' ')}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>;
}

/**
 * A figure about the chosen monster: what an artifact is worth on it, and what
 * it would be worth once converted. Every one of them is set the same way
 * wherever it appears in this panel, so the box the user is reading and the
 * ranking below it answer in one voice.
 *
 * The label takes full ink so the pair is findable from the other side of the
 * box, and the figure wears its band (`ARTIFACT-CANONICAL.md` §18.2) — the one
 * place in JASWA where a fact takes the accent, because at the top band the
 * number is itself the invitation to act. `artifactValueTint` is asked for the
 * colour rather than a rule of this panel's own, so this view cannot acquire a
 * private idea of what a good score is; the recommendation table and the
 * library read the same boundaries. A score that could not be judged wears no
 * band at all: absent is unjudged, not low (§18.2).
 */
function ScoreFact({ label, value, general, group = false, mark }: {
  label: string;
  value: number | undefined;
  general: GeneralSettings;
  group?: boolean;
  /** A marker trailing the figure, for a fact that carries one. */
  mark?: ReactNode;
}) {
  const classes = ['best-artifact-fact', 'best-artifact-fact-score', group ? 'best-artifact-fact-group' : ''];
  return <div className={classes.filter(Boolean).join(' ')}>
    <dt>{label}</dt>
    <dd {...(value === undefined ? {} : artifactValueTint(value))}>
      <Percent value={value} general={general} fallback="Not judged" />{mark}
    </dd>
  </div>;
}

/**
 * What a conversion stone could still do to an artifact, gathered under one
 * sub-heading and given the full width of the box it sits in.
 *
 * The score it would reach leads, because it is what the lines below it add up
 * to. The block remains visible even when there is nothing to suggest: an
 * Intangible can never be converted at all (§10.1), and an ordinary artifact
 * may simply have no conversion worth taking. In both cases, `None` answers
 * the question that an empty right-hand column would otherwise leave behind.
 */
function Improvements({ label, score, conversions, artifact, context }: {
  /** What the converted score is called where this block appears. */
  label: string;
  score: number | undefined;
  conversions: readonly ArtifactConversion[];
  artifact: Artifact;
  context: ScoreContext;
}) {
  return <div className="best-artifact-improvements">
    <h5 className="best-artifact-improvements-title">Improvements</h5>
    <div className="best-artifact-improvements-content">
      {artifact.intangible || !conversions.length
        ? <p className="best-artifact-improvements-none">None</p>
        : <ConversionList conversions={conversions} artifact={artifact}
          stones={context.stones} mode={context.mode} />}
      {!artifact.intangible && Boolean(conversions.length) && <dl className="best-artifact-facts">
        <ScoreFact label={label} value={score} general={context.general} />
      </dl>}
    </div>
  </div>;
}

function ArtifactName({ artifact }: { artifact: Artifact }) {
  /* The grade is named in text as well as drawn as the margin rule, because a
     colour nobody can read is not a fact (AGENTS.md §5). */
  return <p className="best-artifact-entry-name">
    {artifact.grade} · {artifactEngraveClassLabel(artifact)}
  </p>;
}

function SubProperties({ artifact, general }: { artifact: Artifact; general: GeneralSettings }) {
  return <ul className="artifact-subs">{artifact.subProperties.map((property, index) => <li key={property.definition.id}>
    {displaySubProperty(property, (value) => formatNumber(value, general))}
    {artifact.convertedPropertyIndex === index && <ConvertedArtifactMark position={index} />}
  </li>)}</ul>;
}

/**
 * What the monster has engraved in one slot today, and what it is worth there.
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
  const asIs = artifact && artifactPairScore(context.monsterRequests, artifact.id, context.speciesId,
    { conversions: false, unitId: context.unitId });
  const potential = artifact && artifactPairScore(context.monsterRequests, artifact.id, context.speciesId,
    { conversions: true, unitId: context.unitId });

  return <article className={`best-artifact-current-slot ${artifact ? qualityRuleHost : ''}`}
    aria-label={`Current ${label.toLowerCase()} artifact`}>
    {artifact && <QualityRule tier={artifact.grade} />}
    <h4 className="best-artifact-current-slot-title">{label}</h4>
    {artifact ? <>
      <div className="best-artifact-current-facts">
        <ArtifactName artifact={artifact} />
        <dl className="best-artifact-facts">
          <Fact label="Main stat">{artifact.mainProperty}</Fact>
          <ScoreFact label="Value on mon" value={asIs?.value} general={context.general}
            mark={<UnrefinedArtifactMark unrefined={artifact.unrefined} />} />
        </dl>
      </div>
      <SubProperties artifact={artifact} general={context.general} />
      <Improvements label="Potential value on mon" score={potential?.value}
        conversions={potential?.conversions ?? []} artifact={artifact} context={context} />
    </> : <p className="best-artifact-empty">No artifact engraved</p>}
  </article>;
}

/**
 * One recommendation. The artifact name leads the left column, its facts and
 * held lines start together beneath it, and the conversions that could improve
 * it get a dedicated right-hand column. The score on this monster remains with
 * the facts, where it can be read against the current score without making the
 * card's columns fight over two separate conclusions.
 */
function Recommendation({ row, context }: { row: ResultRow; context: ScoreContext }) {
  const { artifact, target, engravedOn } = row;
  const onThisMon = artifactPairScore(context.monsterRequests, artifact.id, context.speciesId,
    { conversions: false, unitId: context.unitId });
  const onCurrentMon = engravedOn
    ? artifactPairScore(context.engravedRequests, artifact.id, monsterSpeciesId(engravedOn.masterId),
      { conversions: false, unitId: engravedOn.unitId })
    : undefined;

  return <li className={`best-artifact-entry ${qualityRuleHost}`}>
    <QualityRule tier={artifact.grade} />
    <ArtifactName artifact={artifact} />
    <div className="best-artifact-entry-facts">
      <dl className="best-artifact-facts">
        <Fact label="Main stat">{artifact.mainProperty}</Fact>
        <Fact label="Current location" group>{engravedOn?.name ?? 'Inventory'}</Fact>
        {/* Where it is worth something today, so a move can be weighed against
            what it costs the monster it is engraved on. Deliberately quiet: it is
            context for the score above, not the decision. */}
        <Fact label="Score on current mon">
          <Percent value={onCurrentMon?.value} general={context.general}
            fallback={engravedOn ? 'Not judged' : '—'} />
        </Fact>
        <ScoreFact label="Score on this mon" value={onThisMon?.value}
          general={context.general} group />
      </dl>
    </div>
    <SubProperties artifact={artifact} general={context.general} />
    <Improvements label="Score on this mon with conversions" score={target.value}
      conversions={target.conversions} artifact={artifact} context={context} />
  </li>;
}

export function BestArtifactForMonster({ data, monsters, scenarioProfiles, settings, general, hardwareAcceleration }: {
  data: GameRecord;
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<RecommendationFilters>(defaultFilters);
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');

  const copyNames = useMemo(() => monsterCopyNames(monsters, scenarioProfiles), [monsters, scenarioProfiles]);
  const allMonsters = useMemo(() => monsterOptions(monsters, copyNames), [monsters, copyNames]);
  const eligibleMonsters = useMemo(
    () => monsterOptions(artifactOptimizationMonsters(monsters, settings), copyNames),
    [monsters, settings, copyNames],
  );
  const selectedMonster = eligibleMonsters.find((monster) => monster.unitId === filters.selectedUnitId);
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const stones = useMemo(() => engravedStonesFor(data), [data]);
  const monstersByUnitId = useMemo(() => new Map(allMonsters.map((monster) => [monster.unitId, monster])), [allMonsters]);
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

  /* Packed once for the chosen monster and once for every monster with
     something. Both are the same input the compute backends are given, so a
     figure shown beside a ranking was produced by the scorer that built it. */
  const monsterRequests = useMemo(() => selectedMonster
    ? buildArtifactScoreRequestsForCopy(data, selectedMonster.unitId, selectedMonster.masterId, settings, scenarioProfiles)
    : [], [data, selectedMonster, settings, scenarioProfiles]);
  const engravedRequests = useMemo(() => {
    const speciesIds = new Set<string>();
    for (const artifact of artifacts) {
      if (artifact.occupiedId === null) continue;
      const engravedOn = monstersByUnitId.get(artifact.occupiedId);
      if (engravedOn) speciesIds.add(monsterSpeciesId(engravedOn.masterId));
    }
    return buildArtifactScoreRequestsForMonsterIds(data, [...speciesIds], settings, undefined, scenarioProfiles);
  }, [artifacts, data, settings, monstersByUnitId, scenarioProfiles]);

  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.occupiedId, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]),
    selectedUnitId: filters.selectedUnitId,
    scenarioProfiles,
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
        engravedOn: artifact.occupiedId === null ? undefined : monstersByUnitId.get(artifact.occupiedId),
      }];
    }).sort((left, right) => right.target.value - left.target.value || left.index - right.index);
  }, [artifacts, artifactNumbers, currentCalculation, selectedMonster, monstersByUnitId]);

  /* Every filter narrows a ranking that was already calculated, so clicking one
     answers immediately rather than asking for the scores again. The order is
     never touched: the list stays the ranking, minus the rows filtered out. */
  const visibleRows = rows.filter((row) => filterIncludes(filters.locations, row.artifact.occupiedId === null ? 'inventory' : 'engraved', artifactLocations)
    && filterIncludes(filters.mainProperties, row.artifact.mainProperty, artifactMainPropertyOrder)
    && filterIncludes(filters.grades, row.artifact.grade, artifactGradeOrder)
    && (filters.includeIntangible || !row.artifact.intangible)
    && (!selectedSubPropertyId || row.artifact.subProperties.some((property) => String(property.definition.id) === selectedSubPropertyId)));
  const categoryRows = (category: ArtifactCategory) => visibleRows
    .filter((row) => row.artifact.category === category)
    .slice(0, filters.count);

  const engravedArtifacts = useMemo(() => {
    const engraved = new Map<ArtifactCategory, Artifact>();
    if (!selectedMonster) return engraved;
    for (const artifact of artifacts) {
      if (artifact.occupiedId === selectedMonster.unitId) engraved.set(artifact.category, artifact);
    }
    return engraved;
  }, [artifacts, selectedMonster]);

  const context: ScoreContext | undefined = selectedMonster ? {
    general, stones, mode: settings.conversionStoneMode, monsterRequests, engravedRequests,
    speciesId: monsterSpeciesId(selectedMonster.masterId),
    unitId: selectedMonster.unitId,
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

  function resetFilters() {
    setFilters(defaultFilters);
    /* The selected monster is part of the calculation key. Once Reset clears
       it, the old result no longer answers the panel's question either. */
    setCalculation(undefined);
    setState('idle');
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
        backend: combineCalculationBackends(results.map((result) => result.backend)),
        evaluatedPairs: results.reduce((total, result) => total + result.evaluatedPairs, 0),
        durationMs: results.reduce((total, result) => total + result.durationMs, 0),
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
    <p className="lead">Choose a monster, see what it has engraved today, then rank every artifact that could take the slot.</p>

    {/* The monster leads: everything below it — the current artifacts, the
        filters, the two rankings — is an answer about this one monster. */}
    <div className="filter-panel best-artifact-monster-panel">
      <div className="filter-group best-artifact-monster-select">
        <label className="filter-label" htmlFor="best-artifact-monster">Monster</label>
        <div className="filter-group-controls">
          <Dropdown id="best-artifact-monster" value={filters.selectedUnitId}
            onChange={(event) => setFilters((current) => ({ ...current, selectedUnitId: event.target.value }))} placeholder="Choose a monster"
            aria-label="Choose a monster for artifact recommendations">
            {eligibleMonsters.map((monster) => <option key={monster.unitId} value={monster.unitId}>{monster.name}</option>)}
          </Dropdown>
        </div>
      </div>
      <div className="filter-panel-actions best-artifact-actions">
        <Button tone="primary" size="prominent" busy={state === 'calculating'} busyLabel="Calculating…"
          onClick={() => void calculate()} disabled={!selectedMonster}>Calculate artifacts</Button>
        {/* The chooser belongs to the same state as the filters, so this one
            reset restores every control in the panel to its default. */}
        <button type="button" className="filter-reset" aria-label="Reset filters for this monster"
          onClick={resetFilters}>Reset filters</button>
      </div>
    </div>

    <div className="filter-panel best-artifact-filters">
      {buttonGroup('Location', 'locations', artifactLocations,
        (location) => location === 'inventory' ? 'Inventory' : 'Engraved', 'best-artifact-filter-location')}
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

    {selectedMonster && context && <section className="best-artifact-current" aria-labelledby="best-artifact-current-title">
      <h3 id="best-artifact-current-title">Current artifacts</h3>
      <div className="best-artifact-current-slots">
        {categoryOrder.map((category) => <CurrentArtifact key={category} category={category}
          artifact={engravedArtifacts.get(category)} context={context} />)}
      </div>
    </section>}

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate this monster’s artifact fits from the imported data.</p>}

    {/* Without this the results simply vanished on a settings change and the
        page looked as though nothing had ever been calculated. `ACCOUNT-TABLES.md` §7: a result
        that stops being current says so. */}
    {calculation && !currentCalculation && <p className="notice warning" role="status">{settings.recalculate === 'on-change'
      ? 'Settings or imported data changed. Refreshing these results…'
      : 'Settings or imported data changed. Calculate again to refresh these results.'}</p>}

    {currentCalculation && selectedMonster && context && <>
      <CalculationStatus evaluatedPairs={currentCalculation.evaluatedPairs} durationMs={currentCalculation.durationMs}
        backend={currentCalculation.backend} general={general} />
      <div className="best-artifact-results">
        {categoryOrder.filter((category) => filterIncludes(filters.categories, category, categoryOrder))
          .map((category) => {
            const shown = categoryRows(category);
            return <section key={category} className="best-artifact-category"
              aria-labelledby={`best-artifact-${category}-title`}>
              <h3 id={`best-artifact-${category}-title`}>{artifactCategoryLabels[category]}</h3>
              {/* Which figure the order follows, because it is not always the
                  one set in ink: the ranking is the score the active conversion
                  settings produce, exactly as the recommendation table ranks
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
          })}
      </div>
    </>}
  </div>;
}
