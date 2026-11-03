import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = {
  version: string;
  /** A newer helper the JASWA page has announced, or `null` when none is known. */
  updateVersion: string | null;
  hasProfile: boolean;
  profileReady: boolean;
  restartRequired: boolean;
  gameStartedBeforeHelper: boolean;
  gameLoginPending: boolean;
  lastError: string | null;
  source: string | null;
  updatedAt: string | null;
  /** Changes the game made that the snapshot does not carry, since the last login. */
  /** `encrypted` carried the game's per-session-key marker; `unread` is a reader still to write. */
  missedChanges: { command: string; reason: string; cause: 'encrypted' | 'unread' }[];
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
    && [status.hasProfile, status.profileReady, status.restartRequired, status.gameStartedBeforeHelper, status.gameLoginPending, traffic.enabled, traffic.recorded, traffic.full].every((entry) => typeof entry === 'boolean')
    && [status.lastError, status.source, status.updatedAt, traffic.lastError].every(text)
    && (status.updateVersion === null || (typeof status.updateVersion === 'string' && /^\d+\.\d+\.\d+$/.test(status.updateVersion)))
    && Array.isArray(status.missedChanges)
    && status.missedChanges.every((miss: unknown) => Boolean(miss) && typeof miss === 'object'
      && typeof (miss as { command?: unknown }).command === 'string'
      && typeof (miss as { reason?: unknown }).reason === 'string'
      && ['encrypted', 'unread'].includes((miss as { cause?: unknown }).cause as string))
    && Number.isSafeInteger(traffic.entries) && traffic.entries >= 0);
}

/* An encrypted miss carried the game's per-session-key marker, whose key never
   crosses the wire readably (docs/LIVE-IMPORT-COVERAGE.md, "Raid response-key
   negotiation"): the game's design, not a reader still to write, so the window
   says so instead of asking for an error report about it. An unread miss is
   the opposite, and the report is what lets it be fixed. Each sentence names
   only its own kind, so one never reads as the explanation of the other. The
   Rift Raid result is the one encrypted answer seen so far, and the user knows
   it as rewards rather than as a command name. */
const RAID_RESULT = 'BattleRiftOfWorldsRaidResult';

/** Each command once, in the order it was first missed; three named, the rest counted, as JASWA does. */
function nameSome(names: string[]): string {
  return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

function gapDetail(status: Pick<Status, 'missedChanges'>): string {
  const of = (cause: 'encrypted' | 'unread') =>
    [...new Set(status.missedChanges.filter((miss) => miss.cause === cause).map((miss) => miss.command))];
  const unread = of('unread');
  const sealed = nameSome(of('encrypted').map((command) => command === RAID_RESULT ? 'Rift Raid rewards' : `${command} answers`));
  if (unread.length === 0) {
    return `${sealed} are encrypted on purpose by the game’s developer — a deliberate limit no helper update can get around. Everything else keeps arriving; restart Summoners War after your runs to load them.`;
  }
  const also = sealed ? ` ${sealed} were missed too: the game’s developer encrypts them on purpose.` : '';
  return `The game sent changes the helper cannot read yet (${nameSome(unread)}).${also} Everything else keeps arriving. Save an error report, then restart Summoners War when it suits you for a complete account.`;
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

/* The card is a status, not a second scrolling log. Routine explanations fit
   in its fixed four-line reserve; exceptionally long backend errors stay
   complete in Activity, where they can be copied into an error report. */
function captureDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, ' ').trim();
  return compact.length <= 220
    ? compact
    : `${compact.slice(0, 176).trimEnd()}… See Activity for the full report.`;
}

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
  if (status.gameStartedBeforeHelper) {
    return {
      state: 'warn',
      label: 'Restart game',
      headline: 'Summoners War was already open',
      detail: 'The helper found Summoners War running as it started, so it missed the login exchange that carries your account. Quit the game and open it again — the next launch is captured normally.',
    };
  }
  if (status.gameLoginPending) {
    return {
      state: 'idle',
      label: 'Waiting',
      headline: 'Summoners War is connected',
      detail: 'The helper has not received an account login from this connection yet. It keeps waiting; if you are already in-game and this remains, save an error report.',
    };
  }
  if (status.profileReady && status.missedChanges.length > 0) {
    /* Capture goes on: a missed change costs itself, never the ones after it.
       It is still a gap the user should know about, and only a login closes it. */
    return {
      state: 'warn',
      label: 'Missed some',
      headline: 'Following your account, with a gap',
      detail: gapDetail(status),
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
function Glyph({ name }: { name: 'jaswa' | 'download' | 'report' | 'log' | 'record' | 'open' | 'restart' | 'update' }) {
  const paths = {
    jaswa: <path d="M8 2.5 12.5 5v6L8 13.5 3.5 11V5z" />,
    download: <path d="M8 2.5v7.5m0 0L5 7m3 3 3-3M3 13h10" />,
    report: <path d="M8 2.5 14 13H2zM8 6.5v3M8 11.2v.3" />,
    log: <path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" />,
    record: <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></>,
    open: <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />,
    restart: <path d="M13 6a5.5 5.5 0 1 0 .3 3M13 2.5V6H9.5" />,
    update: <><circle cx="8" cy="8" r="5.5" /><path d="M8 10.75v-5.5m0 0L5.75 7.5M8 5.25l2.25 2.25" /></>,
  };
  return (
    <svg className="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/* The wordmark, exactly as `app/components/app-rail.tsx` sets it: lowercase,
   with the SW the name puns on carrying the gold underline. The helper used to
   set it uppercase with only the W marked, which made the two windows look like
   two products with similar names. */
function Wordmark() {
  return <>ja<span className="brand-sw">sw</span>a</>;
}

/* ------------------------------------------------------------- title bar
   The window is undecorated (`decorations: false` in tauri.conf.json), because
   Windows' own caption bar is a light-grey plate that no amount of styling
   below it can reconcile with this palette — it read as the helper wearing
   somebody else's hat. This is its replacement: the same ground, the same
   accent, the same hover language as every other control here.

   Losing the system bar means re-supplying what it did. Dragging is the
   webview's `data-tauri-drag-region`, and minimise and close are ordinary
   buttons calling the window commands. Minimise follows the saved choice;
   close asks the native handler to quit, with consent while capturing.

   The commands go through `invoke` rather than `getCurrentWindow()`, which
   reads a `currentWindow` off Tauri's injected metadata. The whole window is
   already reachable by name, and depending on that metadata would make the
   frame the one part of the dashboard the release check cannot drive — it
   stubs `invoke`, not the runtime's internals. */
function caption(command: 'minimize' | 'hide' | 'close') {
  return invoke(`plugin:window|${command}`, { label: 'main' });
}

/* The mark beside the version is always in the bar and only lit when a newer
   helper is known, so the version never shifts when one is announced. */
function TitleBar({ version, update, minimizeTo }: { version: string | null; update: string | null; minimizeTo: 'tray' | 'taskbar' }) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <p className="titlebar-brand" data-tauri-drag-region>
        <Wordmark /> helper
      </p>
      <span className="version"
        aria-label={`Helper version ${version ?? 'unknown'}${update ? `, version ${update} available` : ''}`}>
        <span className="version-mark" data-lit={Boolean(update)} aria-hidden="true" />v{version ?? '—'}
      </span>
      <div className="titlebar-controls">
        <button type="button" className="caption" aria-label="Minimise" onClick={() => void caption(minimizeTo === 'tray' ? 'hide' : 'minimize')}>
          <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0 5h10" /></svg>
        </button>
        <button type="button" className="caption caption-close" aria-label="Close helper" onClick={() => void caption('close')}>
          <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0 0l10 10M10 0L0 10" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the activity
   Everything the helper has to say that is not its capture state. Two things
   used to say it, and neither had a home: the traffic log's state was a bare
   line of text hanging under the troubleshooting buttons with no label to say
   what it described, and a command's reply landed in an unlabelled 56px strip
   at the very bottom with an empty stretch of window above it. Both are
   records of something happening, so both belong in one titled, timestamped
   list — which also fills the space the strip left. */
type Tone = 'note' | 'error';
type Entry = { id: number; at: string; text: string; tone: Tone };

/** How a line enters the list. `answer` marks the reply to a click: it is
    always written, because a second Download JSON saves the same file under
    the same name and its reply is word for word the first one's — dropped as
    a repeat, the click looked like it had done nothing. Only what the poll
    re-reads every second is collapsed. */
type Say = { tone?: Tone; answer?: boolean };

/** Newest first, capped: this is a running window's recent activity, not a
    file. The diagnostic log is the file, and it has its own button. */
function remember(entries: Entry[], text: string, { tone = 'note', answer = false }: Say): Entry[] {
  if (!answer && entries[0]?.text === text) return entries;
  const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return [{ id: (entries[0]?.id ?? 0) + 1, at, text, tone }, ...entries].slice(0, 50);
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const [minimizeTo, setMinimizeTo] = useState<'tray' | 'taskbar'>(() => {
    try { return localStorage.getItem('jaswa-helper-minimize-to') === 'taskbar' ? 'taskbar' : 'tray'; }
    catch { return 'tray'; }
  });
  const busy = useRef(false);
  const polling = useRef(false);
  const [activity, setActivity] = useState<Entry[]>([]);
  const note = useCallback((text: string, say: Say = {}) => setActivity((entries) => remember(entries, text, say)), []);

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const value = await readStatus();
      if (!validDashboard(value)) throw new Error('The helper returned an invalid status. Save an error report.');
      setDashboard(value);
    } catch (error) {
      setDashboard(null);
      note(failure(error), { tone: 'error' });
    } finally { polling.current = false; }
  }, [note]);

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
      // Only a command's own words belong in the activity list. Anything else a
      // command returns is state the next refresh reads, not text to show.
      if (typeof result === 'string' && result) note(result, { answer: true });
      await refresh();
    } catch (error) {
      note(failure(error), { tone: 'error', answer: true });
    } finally { busy.current = false; }
  }, [refresh, note]);

  const traffic = dashboard?.traffic;
  const status = dashboard?.status ?? null;
  const recording = traffic?.enabled ?? false;
  const now = reading(status);

  /* The traffic log's own words, unchanged from when they sat unlabelled under
     the buttons — only where they are said has moved. The count is deliberately
     not in this string: it changes every second while recording, and an entry
     per second would bury everything else in the list. The running total is on
     the "Stop traffic log" button instead, where a changing number belongs. */
  const trafficNote = traffic && (traffic.lastError
    ?? (traffic.enabled
      ? `Recording traffic to your Downloads folder.${traffic.full ? ' The log is full and has stopped growing.' : ''}`
      : traffic.recorded
        ? 'Traffic recording stopped. A recording is saved in your Downloads folder, ready to inspect.'
        : null));

  /* Every distinct thing the helper has said, in order, without the poll
     re-saying it: `remember` drops a repeat of the newest entry, so a state
     that holds for an hour is one line, and the line only reappears if
     something else was said in between.

     A capture state enters as its headline alone — the card above is already
     showing the explanation in full, and repeating it here made one state
     change fill the box. An error is the exception: it is the one detail the
     card may have to scroll to show, and the one worth copying out. */
  const trafficFailed = Boolean(traffic?.lastError);
  useEffect(() => {
    if (trafficNote) note(trafficNote, { tone: trafficFailed ? 'error' : 'note' });
  }, [trafficNote, trafficFailed, note]);
  useEffect(() => {
    note(now.state === 'bad' ? `${now.headline} — ${now.detail}` : now.headline, { tone: now.state === 'bad' ? 'error' : 'note' });
  }, [now.state, now.headline, now.detail, note]);

  /* Both numbers, once: the title bar only says that something is newer, and
     the button only says what to get. */
  const update = status?.updateVersion ?? null;
  const ownVersion = status?.version;
  useEffect(() => {
    if (update && ownVersion) note(`Helper ${update} is available — this is ${ownVersion}.`);
  }, [update, ownVersion, note]);

  async function toggleTraffic() {
    if (!recording && !window.confirm('Record everything Summoners War sends to your Downloads folder? This writes decoded account data to a local file and never uploads it.')) return;
    await call('set_traffic_logging', { enabled: !recording });
  }

  /* The wordmark and the version live in the title bar now. A separate header
     row repeating them under it would be the same two facts twice in a 520px
     window, and the space it cost is exactly what the activity box needed. */
  return (
    <>
      <TitleBar version={status?.version ?? null} update={update} minimizeTo={minimizeTo} />
      <main>
      <section className={`capture state-${now.state}`} aria-live="polite">
        <div className="capture-head">
          <p className="eyebrow">Capture</p>
          <Signal state={now.state} label={now.label} />
        </div>
        <p className="capture-headline">{now.headline}</p>
        <p className="detail">{captureDetail(now.detail)}</p>
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
          {/* The running count rides on the button because it changes every
              second; the activity list below records the state changes only. */}
          <button type="button" aria-pressed={recording} onClick={() => void toggleTraffic()}>
            <Glyph name="record" />{recording
              ? `Stop traffic log (${(traffic?.entries ?? 0).toLocaleString('en-GB')})`
              : 'Log all traffic'}
          </button>
          <button type="button" disabled={!traffic?.recorded} onClick={() => void call('open_traffic_log')}>
            <Glyph name="open" />Open traffic log
          </button>
          <button type="button" onClick={() => void call('restart_helper')}
            title="Recover helper connections while keeping your account and game session. Missing account changes still need a fresh game login.">
            <Glyph name="restart" />Restart helper
          </button>
          {/* The grid's sixth cell, always occupied, so an announced update
              lights a control that was already there. The helper only knows
              what JASWA tells it, so "no newer version" is all it can honestly
              claim — not "up to date". */}
          <button type="button" className="update" disabled={!update} onClick={() => void call('download_update')}
            title={update ? `Download helper ${update} — this is ${ownVersion}.` : 'JASWA tells the helper when a newer version is out.'}>
            <Glyph name="update" />{update ? `Update to v${update}` : 'No newer version'}
          </button>
        </div>
      </section>

      <section className="settings" aria-label="Settings">
        <span id="minimize-label">Minimise to</span>
        <button type="button" className="destination-toggle" role="switch"
          aria-labelledby="minimize-label" aria-describedby="minimize-destination"
          aria-checked={minimizeTo === 'tray'} onClick={() => {
          const value = minimizeTo === 'tray' ? 'taskbar' : 'tray';
          try {
            localStorage.setItem('jaswa-helper-minimize-to', value);
            setMinimizeTo(value);
          } catch { note('Could not save the minimise setting. Please try again.', { tone: 'error', answer: true }); }
        }}>
          <span aria-hidden="true" />
        </button>
        <span id="minimize-destination">{minimizeTo === 'tray' ? 'System tray' : 'Taskbar'}</span>
      </section>

      <section className="activity" aria-label="Activity">
        <p className="eyebrow">Activity</p>
        <ol className="activity-list" role="status">
          {activity.length === 0
            ? <li className="activity-empty">Nothing to report yet. What the helper does — and anything it saves for you — is listed here.</li>
            : activity.map((entry) => (
              <li key={entry.id} className={entry.tone === 'error' ? 'activity-error' : undefined}>
                <span className="activity-time">{entry.at}</span>
                <span className="activity-text">{entry.text}</span>
              </li>
            ))}
        </ol>
      </section>
    </main>
    </>
  );
}
