import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

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

function statusText(status: Status) {
  if (status.lastError) return 'Connection needs attention';
  if (status.profileReady) return status.source === 'live' ? 'Snapshot ready · live sync' : 'Snapshot ready';
  if (status.restartRequired) return 'Restart Summoners War to connect';
  return 'Waiting for Summoners War';
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDashboard(await invoke<Dashboard>('helper_status'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JASWA Helper could not read its status.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const call = useCallback(async (command: string, args?: Record<string, unknown>) => {
    try {
      const result = await invoke<string | undefined>(command, args);
      if (result) setMessage(result);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
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
        {status?.lastError && <p className="detail">{status.lastError}</p>}
        {!status?.lastError && <p className="detail">Open Summoners War on Steam. The helper keeps your snapshot on this computer.</p>}
      </section>

      <section className="actions" aria-label="Helper actions">
        <button type="button" onClick={() => void call('open_jaswa')}>Open JASWA</button>
        <button type="button" disabled={!status?.hasProfile} onClick={() => void call('download_json')}>Download JSON</button>
        <button type="button" onClick={() => void call('open_diagnostics')}>Open diagnostic log</button>
        <button type="button" aria-pressed={recording} onClick={() => void toggleTraffic()}>
          {recording ? 'Stop traffic log' : 'Log all traffic'}
        </button>
        <button type="button" disabled={!traffic?.recorded} onClick={() => void call('open_traffic_log')}>Open traffic log</button>
      </section>

      <section className="log-status" aria-live="polite">
        <p className="eyebrow">Traffic log</p>
        <p>{traffic?.enabled ? `Recording ${traffic.entries} exchange${traffic.entries === 1 ? '' : 's'}` : traffic?.recorded ? 'A local recording is ready to inspect' : 'Off'}</p>
        {traffic?.full && <p className="detail">The local log limit was reached.</p>}
        {traffic?.lastError && <p className="detail">{traffic.lastError}</p>}
      </section>

      {message && <p className="message" role="status">{message}</p>}
    </main>
  );
}
