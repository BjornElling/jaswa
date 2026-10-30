# JASWA Helper

The helper is a Tauri Windows application: its small Rust core reads the local
game connection and its React dashboard runs on Windows' WebView2 runtime.
The installer uses WebView2's `downloadBootstrapper`, so it does not bundle a
second browser runtime when Windows already provides one.

The helper installs its local certificate into the current user's certificate
store, which needs no elevation and stays out of the machine-wide root store
that antivirus treats as an interception dropper's fingerprint. The root is
name-constrained to `*.qpyou.cn`, so it can only ever vouch for the Summoners
War gateway and never for any other site. Elevation is still required for the
one machine-wide change the helper makes: the temporary loopback gateway
entries in the Windows hosts file. Tauri reduces installer size; Authenticode
signing is still essential for Windows trust and reputation.

## Versioning

**Every change to the helper gets a new version, and the version is not
believed on its own — it is checked against the source it claims to describe.**

The number lives in six places: `package.json` (+ `package-lock.json`),
`src-tauri/Cargo.toml` (+ `Cargo.lock`), `src-tauri/tauri.conf.json` and the
app's `app/lib/helper-version.ts`. Do not edit them by hand:

```
npm run release:helper         # bump, build, sign, publish and record — one step
```

Raising the version and building the installer are halves of the same act, and
splitting them across two commands reliably produced the second failure in the
table below: five declarations naming a release that was never built, with the
app offering a download that is still the previous one. `release:helper` does
both from the repository root, then runs the verifier as its own definition of
done. It refuses to start when the source is unchanged, so a bump with nothing
behind it fails before the Rust build rather than after it.

Pass `-- --package-only` when the bump has already happened and only the
installer is missing, and `-- minor`, `-- major` or `-- x.y.z` to raise
something other than the patch digit. The two halves are still available on
their own as `npm run bump:helper` and, in `helper/`, `npm run package`.

Packaging is not automatic on commit or on test: it runs a release Rust build
and touches the Authenticode key, which is neither something to do on every
save nor something to do without meaning to.

`helper/release.json` is what makes the version honest. Packaging writes the
version it shipped, a SHA-256 fingerprint of the helper's source, and the
installer's own hash. `npm run verify:helper-version` — part of
`npm run test:domain` — then refuses three separate lies:

| The mistake | How it is caught |
| --- | --- |
| The helper was changed and the version was not | the fingerprint moved while the version stood still |
| The version was raised but no installer was built | `release.json` still records the previously packaged version |
| The version was raised with no change behind it | the source is byte-for-byte a release already packaged |

The fingerprint covers every tracked file that reaches the installer, listed in
`scripts/helper-fingerprint.mjs` — the Rust sources, the dashboard's React and
CSS, both lockfiles, the Tauri and NSIS configuration. The check reconciles
that list against `git ls-files helper` on every run, so a new source file
cannot quietly land outside the fingerprint; add it to the list, or to the
check's `notShipped` set if it genuinely does not reach the installer.

This exists because the previous check only compared the version strings with
each other. They agreed, so it passed — while the dashboard was rewritten
underneath them and the app went on offering the same version for download.

JASWA compares the connected helper's reported version with
`recommendedHelperVersion` and calls out an upgrade across JASWA before a
compatibility problem can look like bad game data.

The helper's own window says it too. JASWA's status poll is
`/health?latest=<recommendedHelperVersion>`, and a newer version from an
allowed origin lights the mark beside the title bar's version, adds one
Activity line naming both versions, and turns the last Troubleshooting cell
into **Update to v…**, which opens `<origin>/JASWA-Helper-Setup-<version>.exe`
in the browser. The helper asks no server of its own, so until JASWA has been
opened in this run that cell reads *No newer version*, never *up to date*.

Because the per-user store follows whichever profile is active, the helper asks
for consent and installs that root *before* it relaunches as administrator.
Elevating first would write the root into the administrator's store, leaving
the game — still running as the real user — with nothing to trust. Keep those
two steps ahead of `restart_as_administrator` in `main`.

## Running it locally

```powershell
npm start
```

`npm start` is the only supported way to run a development build. It starts the
Vite dev server and the Rust core together, because a debug binary loads its
dashboard from `http://localhost:1420` rather than from the executable.

Launching a binary built by `cargo` on its own therefore shows WebView2's
`ERR_CONNECTION_REFUSED` page instead of the dashboard — a window that looks
broken while the Rust core behind it is serving normally.

`--release` does not change that, which is the surprising part: `tauri build`
embeds the dashboard by passing `TAURI_CONFIG` without `devUrl`, and a bare
`cargo build` never sets it. Build a standalone helper with `npm run build`
(or `npx tauri build --no-bundle` to skip the installer), never with `cargo`
directly.

Stopping the helper from Task Manager skips its cleanup, which leaves the
loopback gateway entries in the Windows hosts file. A running game then has
nowhere to reach until a helper takes those ports back, so quit it from its
tray icon and start the replacement promptly.

## Window settings

The helper's **Minimise to** setting defaults to **System tray**, hiding the
window while capture continues. Click its notification-area icon to reopen it.
Choose **Taskbar** to use Windows' usual minimised window instead. The choice is
stored in the helper's local WebView profile and survives a restart or upgrade.
Close always hides the window to the system tray; use the tray menu to quit. Right-click the tray icon to open the helper's actions without reopening its window. Check marks identify active traffic recording and an available update; actions without the data they need are disabled. Saving a private report and starting a traffic recording ask for the same confirmation as the dashboard.

## The diagnostic log

`Downloads\JASWA Helper diagnostics.log` records what the helper did, in
order, and is the first thing to read when the dashboard says "Connected" while
the account stays stale. It is always on, holds no account data — only counts,
command names and outcomes — and so can go into a bug report unedited.

Each run replaces the file. An entry has no meaning without the run it belongs
to, and keeping the previous run's lines is how a stack trace from the retired
Electron implementation survived in there long enough to look like a current
fault.

Entries are `timestamp [category] message`, where the category is one of
`helper` (the run), `game` (the Summoners War connection), `capture` (what a
gateway exchange produced), `jaswa` (what the browser asked for) and `hosts`
(the redirect). The pairing that answers most questions is `capture` against
`jaswa`: a capture with no matching `jaswa` line means the browser never
collected the snapshot.

This is not the traffic log. That one is opt-in, bounded to 64 MiB and full of decoded
account data, and it exists to inspect the protocol rather than the helper.

A snapshot JASWA cannot read is reported in JASWA itself, not only here: the
direct route shows the same sentence the file route shows, once per rejected
snapshot. The helper is working in that case — it captured the account and
served it — so the log records a `capture` and a `jaswa` line as usual, and the
reason the import stopped belongs on the page the user is looking at.

## Tests

```powershell
npm test
```

This runs `verify:command-contract` and then the Rust tests. The contract check
guards the boundary neither compiler can see: the dashboard renders whatever a
command returns as text, so a command answering with an object unmounts the
dashboard and empties the window.

`npm run verify:dashboard-flow` drives that flow in a real browser — it accepts
the traffic warning and checks the window still holds its controls. Run `npm run build:frontend` first and start the root project server on
`http://localhost:3000/`. The check serves the built dashboard through that
origin using Playwright routing and stubs Tauri IPC; it starts no second server.
It exercises empty and full states, report consent, long errors and failed IPC,
and compares control bounds and saves screenshots in `outputs/helper-hardening`.

Its installer is deliberately not produced unless both the helper executable
and installer receive a valid, timestamped Authenticode signature from a
trusted publisher certificate.

Set `JASWA_SIGNING_THUMBPRINT` to that certificate's SHA-1 thumbprint, then
run:

```powershell
npm run package
```

The packager finds the x64 `signtool.exe` from an installed Windows SDK. Set
`JASWA_SIGNTOOL_PATH` only when the SDK lives elsewhere.

The pre-bundle hook signs the compiled helper before NSIS embeds it; Tauri's
`signCommand` signs the uninstaller and generated installer. The packager verifies
both the helper and installer, then writes the installer to
`public/JASWA-Helper-Setup-<version>.exe`. Never distribute a manually built, unsigned
installer. A new signed release must also be scanned by Microsoft Defender and
submitted to Microsoft as a false positive if Defender blocks it.

The root command `node scripts/verify-helper-browser.mjs` drives the real JASWA
page at localhost:3000, using the complete synthetic account fixture and
intercepted helper HTTP responses. It checks malformed replies,
rejected snapshots and their downloaded reports, preserved imports, and a helper
restart at the same revision in live mode. The fixture is never uploaded.

## SWEX-compatible profile download

**Download JSON** writes the captured login response to the Windows Downloads
folder that the user has configured, named `<wizard_name>-<wizard_id>.json` —
for example `Culpa-21822407.json`. It retains the complete login-response shape
that SWEX writes so the file can be opened directly in SWOP. The file remains
on this computer, but it is private account data: share it only where you
would share an SWEX export.

## Failure handling and private reports

**Restart helper**, below **Log all traffic** and in the tray menu, recovers
connections inside the running helper. It resumes paused API and gateway
listeners on their existing ports, closes idle game sockets so the game can
reconnect, restores the redirect if needed, and retries a failed diagnostic log.
An exchange already talking to the game server finishes normally: recovery
never retries a game command. The account, session, traffic recording, settings
and incident evidence stay in memory, and Summoners War can stay open.

Recovery cannot reconstruct a missing server response or interpret an unknown
account update. Such a capture gap stays visible and still needs a fresh game
login. A helper that started after the game also still needs that login. The
button reports these cases instead of clearing the fault and serving stale data.

In JASWA, **Read on game start** also offers **Reload game data** below the
account counts. It reads the helper's latest complete snapshot on demand and
replaces local game-data plans, while keeping personalization. It cannot repair
a capture gap: try **Restart helper** for connection faults; reopen the game
when the helper reports missing or unreadable account changes.
Home shows a short recovery message; Report Issue keeps the technical detail.

An unreadable account-login response pauses live import. Auxiliary gateway
traffic, such as chat-service discovery, cannot invalidate a captured account.
An unrelated successful command cannot repair a missing update: only a complete new login releases that capture gap.
An invalid login discards the previous account. Infrastructure failures remain
visible until connection recovery. An idle socket fault, before any request
could reach the game server, does not open an account-data gap. `/health` exposes the reason and `/profile`
refuses a snapshot that is not ready. JASWA keeps its last good saved import.

**Save error report** writes a uniquely named JSON file to Downloads. It begins
with a plain-language finding and next step, then includes the full status,
traffic state, a structured diagnostic timeline plus its original text, the
current profile, and the first failed exchange plus its preceding profile when
available. Exact wire messages are base64 encoded, not anonymized. Evidence is
kept for incomplete replies too. Upstream failures name the command, destination,
exchange stage and elapsed time. Read failures include the received byte count;
socket failures retain their original kind and OS code. A response timeout is distinct from a server closing
without a reply; only an idle game-side connection treats either as an ordinary
end. These details help diagnose the next failure without enabling traffic
logging. Evidence is held in memory until saving; quitting loses unsaved evidence.
Later failures
in the same gap are counted without retaining an unbounded traffic history. A
new gap after a successful login gets new evidence. User-facing helper files —
exports, diagnostic logs, traffic logs and reports — all live in Downloads;
the private certificate and consent marker remain in the application store.

**Report Issue** in JASWA opens one support e-mail with the relevant technical
diagnostics, account counts and issue description. It never includes the full
game data unless the user adds it themselves. Nothing is uploaded
automatically; the user chooses whether to send the e-mail to the developer.

Startup acquires a Windows instance guard, opens listeners before installing
the hosts redirect, and stops already opened listeners if startup fails. The
watchdog checks every expected hosts entry but never restores entries removed
by another program. It reports the change and pauses import instead of repeatedly
writing against security software. Cleanup failures are visible; installer
hooks abort rather than reporting success after failed cleanup.

API connections have read/write deadlines and a concurrency limit. Gateway
connections have separate limits and upstream connect/read/write deadlines.
HTTP framing rejects malformed/repeated lengths and unsupported transfer
encodings explicitly. No ambiguous game POST is retried. Diagnostic disk
failures reach status; traffic logging stops on disk failure or before an entry
would exceed its size limit. Windows file-opening failures return to the UI.

## Architecture boundaries and remaining validation

The Rust protocol/profile core, Windows API boundary and React dashboard remain
separate. `incidents.rs` owns capture-gap evidence and recovery; it does not
write private payloads to the always-on diagnostic log. A rewrite would not
remove the underlying TLS/hosts interception requirement, and would discard
useful tested account-mutation rules.

This still uses an elevated process for hosts changes and a per-user gateway
certificate. A future privilege split should isolate hosts management in a
small broker while keeping capture and WebView2 unelevated. Credential-based
UAC under a different Windows account needs separate integration testing:
per-user certificate and data directories follow that account. The elevated
process now only loads the provisioned identity and reports missing files; it
does not silently generate and trust a replacement identity. Same-user UAC,
certificate trust, hosts restoration after forced termination, the actual
Steam TLS connection, and installer/uninstaller behaviour must be tested on a
Windows game session before distribution. Browser IPC tests are not those tests.

The HTTP reader currently requires an explicit response length and does not
implement chunked transfer encoding. Those unsupported responses fail visibly;
they are not accepted as empty captures. Reports on framing failures can carry
the last complete request/response, but cannot promise bytes that never arrived.

Authenticode signing remains mandatory for distributable packages. No antivirus
exclusion, security-setting change or obfuscation is introduced. Signatures do
not guarantee that a security product will accept a build. See Microsoft's
[developer guidance](https://learn.microsoft.com/en-us/defender-xdr/developer-faq)
and [false-positive submission service](https://www.microsoft.com/en-us/wdsi/filesubmission).
No game data should be submitted with a binary malware-analysis sample.
