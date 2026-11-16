import { Button } from '../../ui/button';
import type { SharingStatus } from '../../workspace/shared-preferences';

export function PreferenceSharingSettings({ status, disabled, onChoose }: {
  status: SharingStatus; disabled: boolean; onChoose: (copy: 'local' | 'shared') => void;
}) {
  return <section className="panel" aria-labelledby="preference-sharing-heading">
    <h3 className="block-title" id="preference-sharing-heading">Shared personalization</h3>
    <div className="stack">
      <p className="lead">JASWA Helper automatically shares your settings, roles and presets between localhost and jaswa.net on this computer. Open jaswa.net first to share its existing choices. With the helper closed, changes stay in this browser and are shared when it returns.</p>
      <p className="preference-sharing-status" role="status">{status.message}</p>
      <p className="lead">If the copies disagree, download a .sw backup before choosing one. Use helper copy replaces this browser’s choices; Use this copy replaces the shared choices.</p>
      <div className="button-row">
        <Button disabled={disabled || status.state !== 'conflict'} onClick={() => onChoose('shared')}>Use helper copy</Button>
        <Button disabled={disabled || (status.state !== 'conflict' && status.state !== 'local')} onClick={() => onChoose('local')}>Use this copy</Button>
      </div>
    </div>
  </section>;
}
