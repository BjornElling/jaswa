import { lazy, Suspense } from 'react';
import { WorkspacePage } from '../../ui/workspace-page';
import { Disclosure, PageHeader } from '../../ui/page-chrome';
import { ArtifactMaximumValues } from './artifact-maximum-values';
import { BestArtifactForMonster } from './best-artifact-for-monster';
import { BestMonsterForArtifact } from './best-monster-for-artifact';
import type { ImportedGame, Preferences } from '../../domain/model';
import type { GameRecord } from '../../domain/account/game-record';
import type { Artifact } from '../../domain/artifacts/artifacts';
import type { EngravedConversionStone } from '../../domain/artifacts/artifact-conversion-stones';
import { scenarioPresetId } from '../../domain/placements/presets';
import { profilesIn } from '../../domain/profiles/monster-preferences';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';

const ArtifactList = lazy(() => import('./artifact-list').then(({ ArtifactList }) => ({ default: ArtifactList })));
const noArtifacts: readonly Artifact[] = [];
const noConversionStones: readonly EngravedConversionStone[] = [];

export function ArtifactsSection({ game, monsters, preferences, onOpenMonster }: {
  game: ImportedGame | null;
  monsters: GameRecord[];
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const { artifacts: settings, general, hardwareAcceleration } = preferences;
  const data = game?.data;
  const snapshot = game?.snapshot;
  const scenarioProfiles = profilesIn(preferences.monsterPreferences, scenarioPresetId);
  const artifacts = snapshot?.artifacts ?? noArtifacts;
  const conversionStones = snapshot?.conversionStones ?? noConversionStones;
  const account = snapshot?.accountId ?? null;

  return <WorkspacePage
    header={<PageHeader
      title="Artifact Optimization"
      tagline="An intervention for artifacts in bad relationships." />}
  >
    {!data && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Recommendations" sessionKey="artifacts.recommendations">
      {data ? <ArtifactMaximumValues account={account} data={data} artifacts={artifacts} stones={conversionStones} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then ask every artifact where it can shine.</p>}
    </Disclosure>

    <Disclosure title="Best monster for this artifact" sessionKey="artifacts.best-monster">
      {data ? <BestMonsterForArtifact account={account} data={data} artifacts={artifacts} stones={conversionStones} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then find the monster that can make an artifact shine.</p>}
    </Disclosure>

    <Disclosure title="Best artifact for this monster" sessionKey="artifacts.best-artifact">
      {data ? <BestArtifactForMonster account={account} data={data} artifacts={artifacts} stones={conversionStones} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then compare artifacts against one monster at a time.</p>}
    </Disclosure>

    <Disclosure title="Overview" sessionKey="artifacts.overview" deferContent>
      <Suspense fallback={<p className="lead">Reading your artifacts…</p>}>
        <ArtifactList game={game} monsters={monsters} preferences={preferences} onOpenMonster={onOpenMonster} />
      </Suspense>
    </Disclosure>
  </WorkspacePage>;
}
