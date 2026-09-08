import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = {
  version: string;
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
    && typeof status.version === 'string' && status.version.length > 0
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

/* The one place the helper decides what it is doing.
   The backend reports four independent facts — an error, a captured snapshot, a
   game holding the redirect open, and a snapshot the game has since patched —
   and every line in the window is read off this single reading of them. The
   previous version derived the headline from those facts but kept its
   explanation as a constant, so a connected, capturing helper still told the
   user to open Summoners War. Headline, explanation and light now cannot
   disagree, because one function answers all three. */
type Reading = {
  /** Machine state, in the vocabulary of `--state-*`. */
  state: 'good' | 'warn' | 'bad' | 'idle';
  /** The badge beside the light: two or three words, never a sentence. */
  label: string;
  /** The headline: what the helper is doing right now. */
  headline: string;
  /** Why that is the case, and what the user does about it. */
  detail: string;
};

function reading(status: Status | null): Reading {
  if (!status) {
    return {
      state: 'idle',
      label: 'Starting',
      headline: 'Waking up',
      detail: 'Reading the helper’s own state. This takes a moment after launch.',
    };
  }
  if (status.lastError) {
    return {
      state: 'bad',
      label: 'Needs you',
      headline: 'Capture stopped',
      detail: status.lastError,
    };
  }
  if (status.restartRequired) {
    return {
      state: 'warn',
      label: 'Restart game',
      headline: 'Summoners War logged in too early',
      detail: 'The helper is connected, but it started after the game had already logged in, so it missed the exchange that carries your account. Quit Summoners War and open it again — that replays it.',
    };
  }
  if (status.profileReady) {
    /* `source` separates two genuinely different good states, and conflating
       them is what made the old text feel arbitrary: `game-start` is the login
       snapshot, `live` means the game has since sent a change the helper
       applied. Both are healthy, so both read as healthy — the second simply
       says more. */
    return status.source === 'live'
      ? {
        state: 'good',
        label: 'Live',
        headline: 'Following your account',
        detail: 'Your snapshot is captured and keeps up with what you do in the game. Open JASWA whenever you like — it reads this computer.',
      }
      : {
        state: 'good',
        label: 'Captured',
        headline: 'Account captured',
        detail: 'The helper read your account when the game logged in, and will follow along as you play. Open JASWA whenever you like.',
      };
  }
  if (status.hasProfile) {
    /* A snapshot with no game behind it. The watchdog clears the snapshot when
       the game goes, so this is the brief window between the two. */
    return {
      state: 'warn',
      label: 'Game closed',
      headline: 'Summoners War is not running',
      detail: 'A snapshot is still in hand from the last session. Open the game to capture a fresh one.',
    };
  }
  return {
    state: 'idle',
    label: 'Waiting',
    headline: 'Waiting for Summoners War',
    detail: 'Open Summoners War on Steam and log in. The helper captures your account as it loads and keeps it on this computer.',
  };
}

/* Stroked paths sized to the type, per the house style — no emoji, whose weight
   changes with whatever font the platform substitutes. */
function Glyph({ name }: { name: 'jaswa' | 'download' | 'report' | 'log' | 'record' | 'open' }) {
  const paths = {
    jaswa: <path d="M8 2.5 12.5 5v6L8 13.5 3.5 11V5z" />,
    download: <path d="M8 2.5v7.5m0 0L5 7m3 3 3-3M3 13h10" />,
    report: <path d="M8 2.5 14 13H2zM8 6.5v3M8 11.2v.3" />,
    log: <path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" />,
    record: <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></>,
    open: <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />,
  };
  return (
    <svg className="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/** The capture light: a ring that reads as a state, with its name beside it. */
function Signal({ state, label }: { state: Reading['state']; label: string }) {
  return (
    <span className={`signal signal-${state}`}>
      <span className="signal-dot" aria-hidden="true" />
      {label}
    </span>
  );
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
  const status = dashboard?.status ?? null;
  const recording = traffic?.enabled ?? false;
  const now = reading(status);

  async function toggleTraffic() {
    if (!recording && !window.confirm('Record everything Summoners War sends to this computer? This writes decoded account data to a local file and never uploads it.')) return;
    await call('set_traffic_logging', { enabled: !recording });
  }

  return (
    <main>
      <header>
        <p className="brand">JAS<span className="brand-sw">W</span>A Helper</p>
        <span className="version" aria-label={`Helper version ${status?.version ?? 'unknown'}`}>v{status?.version ?? '—'}</span>
      </header>

      <section className={`capture state-${now.state}`} aria-live="polite">
        <div className="capture-head">
          <p className="eyebrow">Capture</p>
          <Signal state={now.state} label={now.label} />
        </div>
        <p className="capture-headline">{now.headline}</p>
        <p className="detail">{now.detail}</p>
      </section>

      <section className="actions" aria-label="Helper actions">
        <button type="button" className="primary" onClick={() => void call('open_jaswa')}>
          <Glyph name="jaswa" />Open JASWA
        </button>
        <button type="button" disabled={!status?.hasProfile} onClick={() => void call('download_json')}>
          <Glyph name="download" />Download JSON
        </button>
      </section>

      <section className="tools" aria-label="Troubleshooting">
        <p className="eyebrow">Troubleshooting</p>
        <div className="tool-grid">
          <button type="button" onClick={() => {
            if (window.confirm('Save a private error report? It may contain account and session data, the failed exchange and your snapshot. Nothing is uploaded. Send the file only to your developer through a private channel.')) void call('save_error_report');
          }}>
            <Glyph name="report" />Save error report
          </button>
          <button type="button" onClick={() => void call('open_diagnostics')}>
            <Glyph name="log" />Open diagnostic log
          </button>
          <button type="button" aria-pressed={recording} onClick={() => void toggleTraffic()}>
            <Glyph name="record" />{recording ? 'Stop traffic log' : 'Log all traffic'}
          </button>
          <button type="button" disabled={!traffic?.recorded} onClick={() => void call('open_traffic_log')}>
            <Glyph name="open" />Open traffic log
          </button>
        </div>
        <p className="detail" aria-live="polite">
          {traffic?.lastError
            ?? (traffic?.enabled
              ? `Recording — ${traffic.entries.toLocaleString('en-GB')} exchange${traffic.entries === 1 ? '' : 's'} written so far.${traffic.full ? ' The local log is full and has stopped growing.' : ''}`
              : traffic?.recorded
                ? 'A recording is saved on this computer, ready to inspect.'
                : 'Off. Record traffic only when a problem needs chasing down.')}
        </p>
      </section>

      <p className="message" role="status">{message}</p>
    </main>
  );
}
