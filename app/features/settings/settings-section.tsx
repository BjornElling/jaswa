import { WorkspacePage } from '../../ui/workspace-page';
import { PageHeader } from '../../ui/page-chrome';
import { GeneralSettings } from './general-settings';
import type { GeneralSettings as GeneralSettingsValue } from '../../domain/model';

export function SettingsSection({ general, saveFolder, canChooseFolder, onGeneralChange, onChooseFolder, onForgetFolder, onExport, onImport }: {
  general: GeneralSettingsValue;
  saveFolder: string | null;
  canChooseFolder: boolean;
  onGeneralChange: (update: Partial<GeneralSettingsValue>) => void;
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
    <GeneralSettings
      settings={general}
      saveFolder={saveFolder}
      canChooseFolder={canChooseFolder}
      onChange={onGeneralChange}
      onChooseFolder={onChooseFolder}
      onForgetFolder={onForgetFolder}
      onExport={onExport}
      onImport={onImport}
    />
  </WorkspacePage>;
}
