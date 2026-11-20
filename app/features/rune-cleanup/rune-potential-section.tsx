import { WorkspacePage } from '../../ui/workspace-page';
import { PageHeader } from '../../ui/page-chrome';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import type { GeneralSettings, ImportedGame, RunePotentialSettings } from '../../domain/model';
import type { MonsterPreferences } from '../../domain/profiles/monster-preferences';
import type { RuneHolds } from '../../domain/profiles/rune-holds';
import { RuneRecommendations } from './rune-recommendations';
import type { RuneCleanupSession } from './rune-cleanup-session';
import type { OpenRuneOverlay } from '../../ui/gear/rune-link';

/* The verdicts only. What a rune is judged against — the standards, the roles
   and the re-app targets — lives on Settings, because Gems & Grinds, the
   Simulator and the rune overlay read the same standards this page does. */
export function RunePotentialSection({
  game, profiles, runeHolds, lockedRunes, settings, roles, general, hardwareAcceleration, onOpenRune, onUpdate, session,
}: {
  session: RuneCleanupSession;
  game: ImportedGame | null;
  profiles: MonsterPreferences;
  runeHolds: RuneHolds;
  lockedRunes: ReadonlySet<string>;
  settings: RunePotentialSettings;
  onUpdate: (update: Partial<RunePotentialSettings>) => void;
  roles: RuneRole[];
  general: GeneralSettings;
  /** The user's own setting, on its way to the worker that counts the odds. */
  hardwareAcceleration: boolean;
  onOpenRune: OpenRuneOverlay;
}) {
  return <WorkspacePage
    header={<PageHeader
      title="Rune Clean-up"
      tagline="Time to take out the trash, so there is room for more trash." />}
  >
    {/* No bar: the verdicts are the page's only content, and a disclosure
        with nothing beside it to fold away only adds a click and a frame. */}
    <RuneRecommendations session={session} game={game} profiles={profiles} runeHolds={runeHolds} lockedRunes={lockedRunes} settings={settings} roles={roles} general={general}
      hardwareAcceleration={hardwareAcceleration} onOpenRune={onOpenRune} onUpdate={onUpdate} />
  </WorkspacePage>;
}
