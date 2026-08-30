import { WorkspacePage } from './workspace-page';
import { PageHeader } from './page-chrome';
import { GeneralSettings } from './general-settings';
import type { GeneralSettings as GeneralSettingsValue } from '../lib/types';

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
    />

    <section className="panel">
      <h3 className="block-title">Your preferences</h3>
      <div className="stack">
        <p className="lead">
          Personal names, monster goals and rune requirements are stored
          separately from the game import, so replacing your data keeps them.
        </p>
        <div className="button-row">
          <button className="button" onClick={onExport}>Download .sw file</button>
          <button className="button" onClick={onImport}>Load .sw file</button>
        </div>
      </div>
    </section>
  </WorkspacePage>;
}
