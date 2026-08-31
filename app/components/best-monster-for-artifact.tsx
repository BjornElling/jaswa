'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { Dropdown } from './dropdown';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequests, buildArtifactScoreRequestsForMonsterIds } from '../lib/compute/artifact-score-input';
import { artifactCategoryLabel, artifactEquipClass, displaySubProperty } from '../lib/artifact-grid';
import { artifactArchetypes, artifactCategoryLabels, artifactElements, artifactGradeOrder, artifactMainPropertyOrder, artifactProperty } from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import { monsterPresentation } from '../lib/monster-catalog';
import { numberedMonsterNames } from '../lib/monster-names';
import type { ArtifactCategory, ArtifactGrade, ArtifactMainProperty } from '../lib/artifact-properties';
import type { ArtifactMaximumScore } from '../lib/compute/artifact-score-protocol';
import type { GameRecord } from '../lib/game-data';
import type { MonsterArchetype } from '../lib/monster-catalog';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

const categoryOrder: readonly ArtifactCategory[] = ['attribute', 'type'];
const restrictionOptions = [...Object.values(artifactElements), ...Object.values(artifactArchetypes)];

type ArtifactFilters = {
  categories: ArtifactCategory[];
  restrictions: string[];
  grades: ArtifactGrade[];
  mainProperties: ArtifactMainProperty[];
};

type MonsterOption = {
  unitId: string;
  masterId: string;
  name: string;
  archetype: MonsterArchetype | undefined;
};

type Calculation = {
  inputKey: string;
  scopeScores: ArtifactMaximumScore[];
  ownedScores: Map<string, ArtifactMaximumScore>;
  backend: 'cpu' | 'webgpu';
  evaluatedPairs: number;
};

const defaultFilters: ArtifactFilters = { categories: [], restrictions: [], grades: [], mainProperties: [] };

const substatLabels: Record<string, string> = {
  'ATK/DEF UP Effect': 'ATK/DEF UP',
  'Bomb Damage': 'BOMB DMG',
  'CRIT DMG Taken': 'CD TAKEN',
  'Life Drain': 'LIFESTEAL',
  'Additional Damage by HP': 'ADD DMG/HP',
  'Additional Damage by ATK': 'ADD DMG/ATK',
  'Additional Damage by DEF': 'ADD DMG/DEF',
  'Additional Damage by SPD': 'ADD DMG/SPD',
  'CRIT DMG as enemy HP is more': 'CD vs EN HP↑',
  'CRIT DMG as enemy HP is less': 'CD vs EN HP↓',
  'Own turn 1-target CRIT DMG': '1T CD',
  'Counterattack/Co-op Attack DMG': 'COUNTER/CO-OP DMG',
  'SPD UP Effect': 'SPD UP',
  'Damage Dealt on Fire': 'DMG DEALT FIRE',
  'Damage Dealt on Water': 'DMG DEALT WATER',
  'Damage Dealt on Wind': 'DMG DEALT WIND',
  'Damage Dealt on Light': 'DMG DEALT LIGHT',
  'Damage Dealt on Dark': 'DMG DEALT DARK',
  'Damage Taken from Fire': 'DMG TAKEN FIRE',
  'Damage Taken from Water': 'DMG TAKEN WATER',
  'Damage Taken from Wind': 'DMG TAKEN WIND',
  'Damage Taken from Light': 'DMG TAKEN LIGHT',
  'Damage Taken from Dark': 'DMG TAKEN DARK',
  '[Skill 1] CRIT DMG': 'S1 CD',
  '[Skill 2] CRIT DMG': 'S2 CD',
  '[Skill 3/4] CRIT DMG': 'S3/4 CD',
  '[Skill 1] Recovery': 'S1 REC',
  '[Skill 2] Recovery': 'S2 REC',
  '[Skill 3] Recovery': 'S3 REC',
  '[Skill 1] Accuracy': 'S1 ACC',
  '[Skill 2] Accuracy': 'S2 ACC',
  '[Skill 3] Accuracy': 'S3 ACC',
  'First Attack CRIT DMG': '1ST ATK CD',
};

function compactSubstat(name: string, value: number, sign: string | undefined, general: GeneralSettings): string {
  return `${substatLabels[name] ?? name} ${sign ?? '+'}${formatNumber(value / 100, general)}%`;
}

function scoreMap(scores: readonly ArtifactMaximumScore[]): Map<string, ArtifactMaximumScore> {
  return new Map(scores.map((score) => [score.monsterId, score]));
}

function conversionLabel(score: ArtifactMaximumScore): string | undefined {
  if (!score.conversion) return undefined;
  const property = artifactProperty(score.conversion.propertyId);
  return property ? `Convert sub ${score.conversion.sourceIndex + 1} to ${property.name}` : undefined;
}

function ownMonsterOptions(monsters: readonly GameRecord[]): MonsterOption[] {
  const names = numberedMonsterNames([...monsters]);
  const seen = new Set<string>();
  const options: MonsterOption[] = [];
  for (const monster of monsters) {
    const unitId = typeof monster.unit_id === 'number' || typeof monster.unit_id === 'string' ? String(monster.unit_id) : undefined;
    const masterId = typeof monster.unit_master_id === 'number' || typeof monster.unit_master_id === 'string'
      ? String(monster.unit_master_id) : undefined;
    if (!unitId || !masterId || seen.has(unitId)) continue;
    seen.add(unitId);
    options.push({ unitId, masterId, name: names[unitId] ?? monsterPresentation(masterId).name, archetype: monsterPresentation(masterId).archetype });
  }
  return options.sort((left, right) => left.name.localeCompare(right.name) || left.unitId.localeCompare(right.unitId));
}

function Score({ score, general }: { score: ArtifactMaximumScore | undefined; general: GeneralSettings }) {
  return score ? `${formatNumber(Math.round(score.value * 100), general)} %` : '—';
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

export function BestMonsterForArtifact({ data, monsters, settings, general, hardwareAcceleration }: {
  data: GameRecord;
  monsters: readonly GameRecord[];
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [filters, setFilters] = useState<ArtifactFilters>(defaultFilters);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index])), [artifacts]);
  const ownMonsters = useMemo(() => ownMonsterOptions(monsters), [monsters]);
  const artifactsByFilter = useMemo(() => artifacts.filter((artifact) => {
    const restriction = artifactEquipClass(artifact);
    return (!filters.categories.length || filters.categories.includes(artifact.category))
      && (!filters.restrictions.length || (restriction !== null && filters.restrictions.includes(restriction)))
      && (!filters.grades.length || filters.grades.includes(artifact.grade))
      && (!filters.mainProperties.length || filters.mainProperties.includes(artifact.mainProperty));
  }), [artifacts, filters]);
  const selectedArtifact = artifactsByFilter.find((artifact) => artifact.id === selectedArtifactId);
  const equippedSlots = useMemo(() => {
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
  const inputKey = JSON.stringify({ artifactInput, monsterIds: ownMonsters.map((monster) => [monster.unitId, monster.masterId]), selectedArtifactId, settings });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const owner = selectedArtifact?.occupiedId === null || selectedArtifact === undefined
    ? undefined : ownMonsters.find((monster) => monster.unitId === selectedArtifact.occupiedId);
  const currentScore = owner ? currentCalculation?.ownedScores.get(owner.masterId) : undefined;
  const slotlessRows = ownMonsters.filter((monster) => selectedArtifact !== undefined
    && !equippedSlots.get(monster.unitId)?.has(selectedArtifact.category))
    .map((monster) => ({ monster, score: currentCalculation?.ownedScores.get(monster.masterId) }))
    .sort((left, right) => (right.score?.value ?? -1) - (left.score?.value ?? -1) || left.monster.name.localeCompare(right.monster.name))
    .slice(0, 10);
  const improvementRows = ownMonsters.map((monster) => ({ monster, score: currentCalculation?.ownedScores.get(monster.masterId) }))
    .filter((row) => currentScore !== undefined && row.score !== undefined && row.score.value > currentScore.value)
    .sort((left, right) => (right.score?.value ?? 0) - (left.score?.value ?? 0) || left.monster.name.localeCompare(right.monster.name))
    .slice(0, 10);
  const rawRows = currentCalculation?.scopeScores.slice()
    .sort((left, right) => right.value - left.value || left.monsterName.localeCompare(right.monsterName))
    .slice(0, 10) ?? [];

  function toggle(key: keyof ArtifactFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: (current[key] as string[]).includes(value)
        ? (current[key] as string[]).filter((entry) => entry !== value)
        : [...(current[key] as string[]), value],
    }));
  }

  async function calculate() {
    if (!selectedArtifact) return;
    const selected = new Set([selectedArtifact.id]);
    const scopeRequests = buildArtifactScoreRequests(data, monsters, settings, selected)
      .map((request) => ({ ...request, includeAllScores: true }));
    const ownedRequests = buildArtifactScoreRequestsForMonsterIds(data, ownMonsters.map((monster) => monster.masterId), settings, selected)
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
        backend: [...scopeResults, ...ownedResults].every((result) => result.backend === 'webgpu') ? 'webgpu' : 'cpu',
        evaluatedPairs: [...scopeResults, ...ownedResults].reduce((total, result) => total + result.evaluatedPairs, 0),
      });
      setState('idle');
    } catch {
      setCalculation(undefined);
      setState('error');
    }
  }

  const buttonGroup = <T extends string>(label: string, key: keyof ArtifactFilters, values: readonly T[], display: (value: T) => string) => <div className="filter-group" role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {values.map((value) => <button key={value} type="button" className={(filters[key] as string[]).includes(value) ? 'filter-button active' : 'filter-button'}
        onClick={() => toggle(key, value)} aria-pressed={(filters[key] as string[]).includes(value)}>{display(value)}</button>)}
    </div>
  </div>;

  return <div className="best-monster-for-artifact">
    <p className="lead">Filter the artifact library, choose one piece, then see the monsters that can make the most of it.</p>
    <div className="best-monster-filters">
      {buttonGroup('Type', 'categories', categoryOrder, (category) => artifactCategoryLabels[category])}
      {buttonGroup('Restriction', 'restrictions', restrictionOptions, (restriction) => restriction)}
      {buttonGroup('Quality', 'grades', artifactGradeOrder, (grade) => grade.slice(0, 3).toUpperCase())}
      {buttonGroup('Main stat', 'mainProperties', artifactMainPropertyOrder, (property) => property)}
      <div className="filter-group best-monster-artifact-select">
        <label className="filter-label" htmlFor="best-monster-artifact">Artifact</label>
        <div className="filter-group-controls">
          <Dropdown id="best-monster-artifact" value={selectedArtifact?.id ?? ''} onChange={(event) => setSelectedArtifactId(event.target.value)}
            placeholder="Choose an artifact" aria-label="Choose an artifact for monster recommendations">
            {artifactsByFilter.map((artifact) => {
              const index = artifactNumbers.get(artifact.id) ?? 0;
              const restriction = artifactEquipClass(artifact);
              const substats = artifact.subProperties.map((property) =>
                compactSubstat(property.definition.name, property.valueHundredths, property.definition.valueSign, general)).join(' | ');
              return <option key={artifact.id} value={artifact.id}>#{String(index + 1).padStart(2, '0')} · {artifactCategoryLabel(artifact.category)}{restriction ? ` / ${restriction}` : ''} · {artifact.mainProperty}+{formatNumber(artifact.mainValue, general)} · {substats}</option>;
            })}
          </Dropdown>
        </div>
      </div>
      <button type="button" className="button best-monster-calculate" onClick={() => void calculate()} disabled={!selectedArtifact || state === 'calculating'}>
        {state === 'calculating' ? 'Calculating…' : 'Calculate monster fits'}
      </button>
    </div>

    {selectedArtifact && <section className="best-monster-artifact-details" aria-labelledby="selected-artifact-title">
      <div>
        <p className="filter-label">Selected artifact</p>
        <h3 id="selected-artifact-title">#{String((artifactNumbers.get(selectedArtifact.id) ?? 0) + 1).padStart(2, '0')} · {selectedArtifact.grade} {artifactCategoryLabel(selectedArtifact.category)}</h3>
        <p>{artifactEquipClass(selectedArtifact) ?? 'Unknown restriction'} · Main stat {selectedArtifact.mainProperty} +{formatNumber(selectedArtifact.mainValue, general)}</p>
      </div>
      <ul className="artifact-subs">
        {selectedArtifact.subProperties.map((property, index) => <li key={property.definition.id}>
          {displaySubProperty(property, (value) => formatNumber(value, general))}
          {selectedArtifact.convertedPropertyIndex === index && <span className="best-monster-converted">Converted</span>}
        </li>)}
      </ul>
    </section>}

    {state === 'error' && <p className="notice warning" role="status">JASWA could not calculate monster fits for this artifact from the imported data.</p>}

    {currentCalculation && selectedArtifact && <>
      <p className="best-artifact-meta" role="status">{formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}</p>
      <div className="best-artifact-results">
        <ResultCard title="No artifact in this slot" description="The ten strongest eligible monsters with no artifact in this category equipped yet."
          empty={slotlessRows.length ? undefined : 'Every monster already has an artifact in this slot.'}>
          <table className="best-monster-table"><thead><tr><th scope="col">Monster</th><th scope="col">Score</th><th scope="col">Conversion</th></tr></thead><tbody>
            {slotlessRows.map(({ monster, score }) => <tr key={monster.unitId}><td>{monster.name}</td><td><b><Score score={score} general={general} /></b></td><td>{score ? conversionLabel(score) ?? 'Keep it real' : 'Not judged'}</td></tr>)}
          </tbody></table>
        </ResultCard>
        <ResultCard title="Improves on current" description={owner ? `The ten strongest monsters that score higher than this artifact's ${owner.name} score.` : 'Equip this inventory artifact first to establish a current score.'}
          empty={owner === undefined ? 'This artifact is in inventory, so it has no current score to improve.' : improvementRows.length ? undefined : 'No monster scores higher than its current wearer.'}>
          <table className="best-monster-table"><thead><tr><th scope="col">Monster</th><th scope="col">Here</th><th scope="col">Current</th><th scope="col">Gain</th></tr></thead><tbody>
            {improvementRows.map(({ monster, score }) => <tr key={monster.unitId}><td>{monster.name}</td><td><b><Score score={score} general={general} /></b></td><td><Score score={currentScore} general={general} /></td><td><b>{formatNumber(Math.round(((score?.value ?? 0) - (currentScore?.value ?? 0)) * 100), general)} pp</b></td></tr>)}
          </tbody></table>
        </ResultCard>
        <ResultCard title="Raw score ranking" description="The ten highest-scoring eligible monsters in the active scope."
          empty={rawRows.length ? undefined : 'No monster in the active scope can be judged for this artifact.'}>
          <table className="best-monster-table"><thead><tr><th scope="col">Monster</th><th scope="col">Score</th><th scope="col">Conversion</th></tr></thead><tbody>
            {rawRows.map((score) => <tr key={score.monsterId}><td>{score.monsterName}</td><td><b><Score score={score} general={general} /></b></td><td>{conversionLabel(score) ?? 'Keep it real'}</td></tr>)}
          </tbody></table>
        </ResultCard>
      </div>
    </>}
  </div>;
}
