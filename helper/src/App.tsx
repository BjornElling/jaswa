import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = {
  hasProfile: boolean;
  profileReady: boolean;
  restartRequired: boolean;
  lastError: string | null;
  source: string | null;
  updatedAt: string | null;
};

type Traffic = {
  enabled: boolean;
  entries: number;
  recorded: boolean;
  full: boolean;
  lastError: string | null;
};

type Dashboard = { status: Status; traffic: Traffic };

function validDashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== 'object') return false;
  const { status, traffic } = value as Partial<Dashboard>;
  const text = (entry: unknown) => entry === null || typeof entry === 'string';
  return Boolean(status && traffic
    && [status.hasProfile, status.profileReady, status.restartRequired, traffic.enabled, traffic.recorded, traffic.full].every((entry) => typeof entry === 'boolean')
    && [status.lastError, status.source, status.updatedAt, traffic.lastError].every(text)
    && Number.isSafeInteger(traffic.entries) && traffic.entries >= 0);
}

async function readStatus(): Promise<unknown> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      invoke<unknown>('helper_status'),
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('The helper status request timed out. Save an error report, then restart the helper.')), 10_000); }),
    ]);
  } finally { window.clearTimeout(timer); }
}

function statusText(status: Status) {
  if (status.lastError) return 'Connection needs attention';
  if (status.profileReady) return status.source === 'live' ? 'Snapshot ready · live sync' : 'Snapshot ready';
  if (status.restartRequired) return 'Restart Summoners War to connect';
  return 'Waiting for Summoners War';
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const busy = useRef(false);
  const polling = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const value = await readStatus();
      if (!validDashboard(value)) throw new Error('The helper returned an invalid status. Save an error report.');
      setDashboard(value);
    } catch (error) {
      setDashboard(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { polling.current = false; }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const call = useCallback(async (command: string, args?: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await invoke<unknown>(command, args);
      // Only a command's own words belong in the message line. Anything else a
      // command returns is state the next refresh reads, not text to show.
      if (typeof result === 'string' && result) setMessage(result);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { busy.current = false; }
  }, [refresh]);

  const traffic = dashboard?.traffic;
  const status = dashboard?.status;
  const recording = traffic?.enabled ?? false;

  async function toggleTraffic() {
    if (!recording && !window.confirm('Record everything Summoners War sends to this computer? This writes decoded account data to a local file and never uploads it.')) return;
    await call('set_traffic_logging', { enabled: !recording });
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Local companion</p>
          <h1>JASWA Helper</h1>
        </div>
        <span className={`signal ${status?.lastError ? 'problem' : status?.profileReady ? 'ready' : ''}`} aria-label={statusText(status ?? { hasProfile: false, profileReady: false, restartRequired: false, lastError: null, source: null, updatedAt: null })} />
      </header>

      <section className="status" aria-live="polite">
        <p className="eyebrow">Capture status</p>
        <p className="status-text">{status ? statusText(status) : 'Starting helper'}</p>
        <p className="detail">{status?.lastError ?? 'Open Summoners War on Steam. The helper keeps your snapshot on this computer.'}</p>
      </section>

      <section className="actions" aria-label="Helper actions">
        <button type="button" onClick={() => void call('open_jaswa')}>Open JASWA</button>
        <button type="button" disabled={!status?.hasProfile} onClick={() => void call('download_json')}>Download JSON</button>
        <button type="button" onClick={() => {
          if (window.confirm('Save a private error report? It may contain account and session data, the failed exchange and your snapshot. Nothing is uploaded. Send the file only to your developer through a private channel.')) void call('save_error_report');
        }}>Save error report</button>
        <button type="button" onClick={() => void call('open_diagnostics')}>Open diagnostic log</button>
        <button type="button" aria-pressed={recording} onClick={() => void toggleTraffic()}>
          {recording ? 'Stop traffic log' : 'Log all traffic'}
        </button>
        <button type="button" disabled={!traffic?.recorded} onClick={() => void call('open_traffic_log')}>Open traffic log</button>
      </section>

      <section className="log-status" aria-live="polite">
        <p className="eyebrow">Traffic log</p>
        <p>{traffic?.enabled ? `Recording ${traffic.entries} exchange${traffic.entries === 1 ? '' : 's'}` : traffic?.recorded ? 'A local recording is ready to inspect' : 'Off'}</p>
        <p className="detail">{traffic?.lastError ?? (traffic?.full ? 'The local log limit was reached.' : 'Record traffic only when needed for troubleshooting.')}</p>
      </section>

      <p className="message" role="status">{message}</p>
    </main>
  );
}
