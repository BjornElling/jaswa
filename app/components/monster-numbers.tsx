import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';
import { MonsterStorage } from './monster-storage';
import type { OpenMonsterOverlay } from './monster-link';
import type { GameRecord } from '../lib/game-data';
import type { Preferences } from '../lib/types';

export function MonsterNumbers(props: {
  monsters: GameRecord[];
  gameData: GameRecord;
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  return <WorkspacePage header={<PageHeader
    title="Monster Numbers"
    tagline="A menagerie of statistics, storage, and questionable life choices." />}
  >
    <MonsterStorage {...props} />
  </WorkspacePage>;
}
