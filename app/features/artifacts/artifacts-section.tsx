import type { ReactNode } from 'react';
import { WorkspacePage } from '../../ui/workspace-page';
import { Disclosure, PageHeader } from '../../ui/page-chrome';
import { ArtifactMaximumValues } from './artifact-maximum-values';
import { BestArtifactForMonster } from './best-artifact-for-monster';
import { BestMonsterForArtifact } from './best-monster-for-artifact';
import type { ArtifactSettings, GeneralSettings } from '../../domain/model';
import type { GameRecord } from '../../domain/account/game-record';
import type { AccountSnapshot } from '../../domain/account/account-snapshot';
import type { Artifact } from '../../domain/artifacts/artifacts';
import type { MonsterProfiles } from '../../domain/profiles/monster-preferences';
import type { EngravedConversionStone } from '../../domain/artifacts/artifact-conversion-stones';

const noArtifacts: readonly Artifact[] = [];
const noConversionStones: readonly EngravedConversionStone[] = [];

/* The library is deliberately separate from this workspace: it answers what
   the account owns, while this page will answer what to change. Keeping those
   questions apart leaves the optimizer room for a clear, decision-first draft.
   What the three views judge by is on Settings (`artifact-settings.tsx`): the
   library and the monster overlay read the same settings, so they belong to
   no one page. */

export function ArtifactsSection({ settings, data, snapshot, monsters, scenarioProfiles, general, hardwareAcceleration, relics }: {
  /** Relic Optimization, supplied by the shell so this page does not have to
      carry everything the relic views read. */
  relics: ReactNode;
  settings: ArtifactSettings;
  data: GameRecord | undefined;
  snapshot: AccountSnapshot | undefined;
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
}) {
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

    {/* Last, because it answers about other gear. `deferContent` keeps the
        relic code — and the engraving statistics behind its roster — unloaded
        until the bar is opened. */}
    <Disclosure title="Relic Optimization" sessionKey="artifacts.relics" deferContent>
      {relics}
    </Disclosure>
  </WorkspacePage>;
}
