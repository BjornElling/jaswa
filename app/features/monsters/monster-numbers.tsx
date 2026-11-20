import { PageHeader } from '../../ui/page-chrome';
import { WorkspacePage } from '../../ui/workspace-page';
import { MonsterStorage } from './monster-storage';
import type { OpenMonsterOverlay } from '../../ui/gear/monster-link';
import type { GameRecord } from '../../domain/account/game-record';
import type { AccountSnapshot } from '../../domain/account/account-snapshot';
import type { Preferences } from '../../domain/model';

export function MonsterNumbers(props: {
  monsters: GameRecord[];
  snapshot: AccountSnapshot | undefined;
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  return <WorkspacePage header={<PageHeader
    title="Monster Usage"
    tagline="A menagerie of statistics, storage, and questionable life choices." />}
  >
    <MonsterStorage {...props} />
  </WorkspacePage>;
}
