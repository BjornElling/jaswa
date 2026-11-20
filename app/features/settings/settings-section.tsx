import { WorkspacePage } from '../../ui/workspace-page';
import { Disclosure, PageHeader } from '../../ui/page-chrome';
import { GeneralSettings } from './general-settings';
import { HardwareAccelerationSettings } from './hardware-acceleration-settings';
import { RuneSettings } from './rune-settings';
import { ArtifactSettingsBar } from './artifact-settings';
import { RelicSettingsBar } from './relic-settings';
import type {
  ArtifactSettings, GeneralSettings as GeneralSettingsValue, ImportedGame, Preferences, RunePotentialSettings,
} from '../../domain/model';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import type { RelicSynergyChoices } from '../../domain/relics/relic-synergy';
import type { RelicInvestmentSelectivity } from '../../domain/relics/relic-advice';
import type { GraphicsCardProbe } from '../../workspace/acceleration-status';
import type { ReactNode } from 'react';

/**
 * Every setting that reaches more than one page, in one place.
 *
 * A setting belongs here when changing it changes answers on pages other than
 * the one it would otherwise sit on: the rune standards, roles and re-app
 * targets (Clean-up, Gems & Grinds, the Simulator, the rune overlay), the
 * artifact settings (all three artifact views, the library and the monster
 * overlay), what relics are judged by, the graphics card and the formats.
 * What one calculation asks — Rune Optimization's own switches, a page's
 * filters — stays beside the Calculate it belongs to.
 *
 * Changing a setting here calculates nothing. A page whose answer read it says
 * so when it is next opened, and waits for Calculate (`AGENTS.md` §5).
 */
export function SettingsSection({
  preferences, game, saveFolder, canChooseFolder, sharing, detectGraphicsCard,
  onGeneralChange, onRunePotentialChange, onWriteRoles, onArtifactChange, onRelicSynergyChange,
  onRelicPowerUpThresholdChange, onHardwareAcceleration, onChooseFolder, onForgetFolder, onExport, onImport,
}: {
  preferences: Preferences;
  game: ImportedGame | null;
  sharing?: ReactNode;
  saveFolder: string | null;
  canChooseFolder: boolean;
  detectGraphicsCard: GraphicsCardProbe;
  onGeneralChange: (update: Partial<GeneralSettingsValue>) => void;
  onRunePotentialChange: (update: Partial<RunePotentialSettings>) => void;
  onWriteRoles: (change: (current: RuneRole[]) => RuneRole[]) => void;
  onArtifactChange: (update: Partial<ArtifactSettings>) => void;
  onRelicSynergyChange: (choices: RelicSynergyChoices) => void;
  onRelicPowerUpThresholdChange: (threshold: RelicInvestmentSelectivity) => void;
  onHardwareAcceleration: (enabled: boolean) => void;
  onChooseFolder: () => void;
  onForgetFolder: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return <WorkspacePage
    header={<PageHeader
      title="Settings"
      tagline="Your safe haven, where you regain control after four hours of violent procs." />}
  >
    <RuneSettings
      game={game}
      settings={preferences.runePotential}
      roles={preferences.runeRoles}
      general={preferences.general}
      hardwareAcceleration={preferences.hardwareAcceleration}
      onUpdate={onRunePotentialChange}
      onWriteRoles={onWriteRoles}
    />

    <ArtifactSettingsBar settings={preferences.artifacts} data={game?.data} general={preferences.general}
      onUpdate={onArtifactChange} />

    <RelicSettingsBar synergy={preferences.relicSynergy} powerUpThreshold={preferences.relicPowerUpThreshold}
      onChangeSynergy={onRelicSynergyChange} onChangePowerUpThreshold={onRelicPowerUpThresholdChange} />

    <HardwareAccelerationSettings hardwareAcceleration={preferences.hardwareAcceleration}
      onHardwareAcceleration={onHardwareAcceleration} detectGraphicsCard={detectGraphicsCard} />

    <Disclosure title="General" sessionKey="settings.general">
      <div className="stack">
        <GeneralSettings
          settings={preferences.general}
          saveFolder={saveFolder}
          canChooseFolder={canChooseFolder}
          onChange={onGeneralChange}
          onChooseFolder={onChooseFolder}
          onForgetFolder={onForgetFolder}
          onExport={onExport}
          onImport={onImport}
        />
        {sharing}
      </div>
    </Disclosure>
  </WorkspacePage>;
}
