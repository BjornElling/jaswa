import { PageHeader } from '../../ui/page-chrome';
import { WorkspacePage } from '../../ui/workspace-page';
import { MonsterStorage } from './monster-storage';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import type { GameRecord } from '../../domain/account/game-record';
import type { Preferences } from '../../domain/model';

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
