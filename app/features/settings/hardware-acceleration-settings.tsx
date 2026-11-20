import { useEffect, useState } from 'react';
import { CheckboxRow } from '../../ui/form-controls';
import { Disclosure } from '../../ui/page-chrome';
import { disabledStatus } from '../../workspace/acceleration-status';
import type { AccelerationStatus, GraphicsCardProbe } from '../../workspace/acceleration-status';
import { StatusMark, accelerationLabels } from '../home/public';

/**
 * Whether the heavy calculations may use the graphics card. Every calculating
 * page reads this one choice (`docs/HARDWARE-ACCELERATION.md`), so it sits on
 * Settings rather than on Home beside the import.
 */
export function HardwareAccelerationSettings({ hardwareAcceleration, onHardwareAcceleration, detectGraphicsCard }: {
  hardwareAcceleration: boolean;
  onHardwareAcceleration: (enabled: boolean) => void;
  /** The browser's graphics-card probe, supplied by the shell; it describes the card and decides nothing. */
  detectGraphicsCard: GraphicsCardProbe;
}) {
  /* What the card answered, kept apart from the setting: switching the setting
     off must not throw away a verdict that is still true. */
  const [detected, setDetected] = useState<AccelerationStatus | null>(null);

  useEffect(() => {
    if (!hardwareAcceleration || detected) return;
    let current = true;
    void detectGraphicsCard().then((status) => { if (current) setDetected(status); });
    return () => { current = false; };
  }, [hardwareAcceleration, detected, detectGraphicsCard]);

  const status: AccelerationStatus = !hardwareAcceleration ? disabledStatus
    : detected ?? { state: 'checking', adapterName: 'Asking the browser…', detail: 'Looking for a graphics card to compute on.' };

  return <Disclosure title="Hardware acceleration" sessionKey="settings.hardware-acceleration">
    <div className="settings-layout">
      <div className="stack acceleration-choice">
        <p className="lead">
          Graphics cards are designed to calculate thousands of little
          things simultaneously. Like runes.<br />
          You should utilize this, unless it causes the program to misbehave.
        </p>
        <CheckboxRow label="Use the graphics card for heavy calculations" checked={hardwareAcceleration}
          onChange={onHardwareAcceleration} />
      </div>

      <div className="settings-rule" role="presentation" />

      <aside className="settings-aside">
        <section className={`statistics acceleration ${status.state}`} role="status" aria-label="Graphics card connection">
          <div className="acceleration-verdict">
            <StatusMark state={status.state} />
            <p className="acceleration-word">{accelerationLabels[status.state]}</p>
          </div>
          <p className="acceleration-adapter">
            <span>Graphics card:</span>
            <b>{status.adapterName}</b>
          </p>
        </section>
      </aside>
    </div>
  </Disclosure>;
}
