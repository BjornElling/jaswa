import { Button } from '../../ui/button';
import type { SharingStatus } from '../../workspace/shared-preferences';
import { SettingsCard } from './settings-card';

/* Shown only while there is sharing to speak of: the helper answered, and the
   copies are either shared, in conflict, or in a state the user can repair.
   With no helper running there is nothing to share and nothing to choose, so
   the card stays away rather than explaining a feature that is not in use. */
const shownStates: ReadonlySet<SharingStatus['state']> = new Set(['shared', 'conflict', 'local']);

export function PreferenceSharingSettings({ status, disabled, onChoose }: {
  status: SharingStatus; disabled: boolean; onChoose: (copy: 'local' | 'shared') => void;
}) {
  if (!shownStates.has(status.state)) return null;
  const choosing = status.state === 'conflict';
  const restoring = status.state === 'local';
  /* The two buttons keep their place when nothing is to be chosen, only
     hidden, so resolving a conflict changes the card's words and not its size. */
  return <SettingsCard title="Shared personalization" className="preference-sharing">
    <div className="preference-sharing-line">
      <p className="preference-sharing-status" data-state={status.state} role="status">{status.message}</p>
      <div className="button-row preference-sharing-actions" data-idle={choosing || restoring ? undefined : 'true'}>
        <Button disabled={disabled || !choosing} title="Replace this browser’s choices with the helper’s copy"
          onClick={() => onChoose('shared')}>Use helper copy</Button>
        <Button disabled={disabled || !(choosing || restoring)} title="Replace the helper’s copy with this browser’s choices"
          onClick={() => onChoose('local')}>Use this copy</Button>
      </div>
    </div>
  </SettingsCard>;
}
