'use client';

import { useMemo, useState } from 'react';
import { calculateArtifactScores } from '../lib/compute/artifact-score-client';
import { buildArtifactScoreRequests } from '../lib/compute/artifact-score-input';
import { artifactProperty } from '../lib/artifact-properties';
import { readArtifacts } from '../lib/artifacts';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import type { ArtifactMaximumScore } from '../lib/compute/artifact-score-protocol';
import type { ArtifactSettings, GeneralSettings } from '../lib/types';

type Calculation = {
  inputKey: string;
  backend: 'cpu' | 'webgpu';
  durationMs: number;
  evaluatedPairs: number;
  ownedConversionCount: number;
  maxima: ArtifactMaximumScore[];
};

function conversionLabel(maximum: ArtifactMaximumScore): string | undefined {
  if (!maximum.conversion) return undefined;
  const property = artifactProperty(maximum.conversion.propertyId);
  return property ? `Convert sub ${maximum.conversion.sourceIndex + 1} to ${property.name}` : undefined;
}

export function ArtifactMaximumValues({ data, monsters, settings, general, hardwareAcceleration }: {
  data: GameRecord | undefined;
  monsters: readonly GameRecord[];
  settings: ArtifactSettings;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
  const [calculation, setCalculation] = useState<Calculation | undefined>();
  const [state, setState] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [error, setError] = useState<string | undefined>();
  const artifacts = useMemo(() => readArtifacts(data), [data]);
  const artifactNumbers = useMemo(() => new Map(artifacts.map((artifact, index) => [artifact.id, index + 1])), [artifacts]);
  const inputKey = JSON.stringify({
    artifacts: artifacts.map((artifact) => [artifact.id, artifact.mainProperty, artifact.convertedPropertyIndex,
      ...artifact.subProperties.map((subProperty) => [subProperty.definition.id, subProperty.valueHundredths, subProperty.maximumHundredths])]),
    monsterIds: monsters.map((monster) => monster.unit_master_id), settings,
  });
  const currentCalculation = calculation?.inputKey === inputKey ? calculation : undefined;
  const maxima = useMemo(() => currentCalculation?.maxima.slice().sort((left, right) =>
    right.value - left.value || left.artifactId.localeCompare(right.artifactId)) ?? [], [currentCalculation]);

  async function calculate() {
    const requests = buildArtifactScoreRequests(data, monsters, settings);
    if (!requests.length) {
      setCalculation(undefined);
      setError('There is not enough eligible artifact or monster data to calculate a value yet.');
      setState('error');
      return;
    }
    setState('calculating');
    setError(undefined);
    try {
      const results = [];
      for (const request of requests) results.push(await calculateArtifactScores(request, hardwareAcceleration));
      setCalculation({
        inputKey,
        backend: results.every((result) => result.backend === 'webgpu') ? 'webgpu' : 'cpu',
        durationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
        evaluatedPairs: results.reduce((sum, result) => sum + result.evaluatedPairs, 0),
        ownedConversionCount: Math.max(...results.map((result) => result.ownedConversionCount)),
        maxima: results.flatMap((result) => result.maxima),
      });
      setState('idle');
    } catch {
      setCalculation(undefined);
      setError('JASWA could not calculate artifact values from this data.');
      setState('error');
    }
  }

  return <div className="artifact-maximum-values">
    <div className="artifact-maximum-intro">
      <p className="lead">Find the highest value every artifact can reach on an eligible monster in the selected scope.</p>
      <button type="button" className="button" onClick={() => void calculate()} disabled={state === 'calculating'}>
        {state === 'calculating' ? 'Calculating…' : 'Calculate highest values'}
      </button>
    </div>

    {state === 'error' && <p className="notice warning" role="status">{error}</p>}

    {calculation && !currentCalculation && <p className="notice warning" role="status">
      Settings or imported data changed. Calculate again to refresh these values.
    </p>}

    {currentCalculation && <>
      <p className="artifact-maximum-meta" role="status">
        {formatNumber(currentCalculation.evaluatedPairs, general)} pairs checked in {formatNumber(Math.round(currentCalculation.durationMs), general)} ms · {currentCalculation.backend === 'webgpu' ? 'Graphics card' : 'Processor'}
      </p>
      {settings.conversionStoneMode === 'owned' && currentCalculation.ownedConversionCount === 0 && <p className="notice warning">
        This import has no readable engraved conversion stones, so the results keep every artifact as it is.
      </p>}
      {maxima.length > 0 ? <div className="artifact-maximum-table-wrap">
        <table className="artifact-maximum-table">
          <thead><tr><th scope="col">Artifact</th><th scope="col">Best monster</th><th scope="col">Highest value</th><th scope="col">Best conversion</th></tr></thead>
          <tbody>{maxima.map((maximum) => <tr key={maximum.artifactId}>
            <td>#{String(artifactNumbers.get(maximum.artifactId) ?? maximum.artifactId)}</td>
            <td>{maximum.monsterName}</td>
            <td>{formatNumber(Math.round(maximum.value * 100), general)} %</td>
            <td className={maximum.conversion ? '' : 'muted'}>{conversionLabel(maximum) ?? 'Keep it real'}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="artifact-maximum-empty">None of these artifacts can be judged against the monsters in this scope yet.</p>}
    </>}
  </div>;
}
