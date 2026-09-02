# Local Persistence Contract

**Status:** Binding product contract  
**Reviewed:** September 2, 2026

Imported account data also follows the [Import and Count Parity Contract](./IMPORT-PARITY-CONTRACT.md):
the durable snapshot preserves the exact prepared account collections used for
the visible monster, rune, craft-item, artifact, and relic totals.

## Promise

JASWA keeps committed user data on the same computer and in the same browser
profile after a reload, a browser restart, or a development-server restart.
It sends none of that data to a server. Session-scoped interface state is kept
in the current browser tab only and is cleared when that tab closes.

## Durable data

The durable workspace contains:

- the current imported game, including its prepared account data;
- all preferences: import route and mode, graphics preference, formats and
  time zone, monster preferences, Rune Potential settings, Rune Potential
  presets, and Artifact Optimization settings (whether to factor in only owned
  monsters, how conversion stones are sourced, the assumed stone value, and the
  acceptable-property factor);
- the chosen export-folder handle when the browser supports it.

The first two records live in IndexedDB under the local `jaswa-local`
database. Preferences also have a small `localStorage` mirror written in the
same user action. The mirror is a write-through safety copy for a tab closed
before IndexedDB completes; IndexedDB remains the complete workspace store.
A folder handle is an IndexedDB record because browser handles cannot travel in
an exported preferences file.

## Session-scoped state

The current navigation page, which disclosure bars are open or closed, and
table filters are stored in `sessionStorage`. They survive page navigation and
reloads in the same tab, but are not part of the durable workspace and are not
shared with another tab. Invalid stored values are ignored and the interface
returns to its current default.

## What is not a saved choice

Open dialogs, unfinished preset edits, drag highlighting, messages, loading
states, sorting, scroll positions, and hardware-detection results are
temporary interface state. A draft becomes durable only when the user presses
its explicit save or confirmation control.

## Write rule

Every committed preference change goes through `changePreferences` in
`app/page.tsx`; components receive controlled values and callbacks, never a
storage API. That route updates the synchronous preferences mirror before the
new value reaches the interface, and queues an IndexedDB write after the
earlier preference writes. Imported game data and folder choices wait for their
IndexedDB transaction to complete before appearing as saved state.

New durable data must have one named, central write route, a complete
validator for data read back from the browser or a file, and an entry in this
contract. Session-scoped interface state uses the shared
`useSessionStorageState` hook and validates every value read back. Components
do not write to `localStorage`, `sessionStorage`, or IndexedDB directly.

## Origin is part of the local workspace

Browser storage is isolated by origin. In development, JASWA therefore runs at
`http://localhost:3000` with a strict port: if that address is occupied,
`npm run dev` fails instead of silently moving to another origin. Always open
that exact address. `127.0.0.1`, another port, another browser profile, or
private browsing is a different local workspace by browser design.

Clearing site data for JASWA, using a new profile, or choosing a different
origin intentionally starts an empty workspace. The `.sw` export is the user's
portable, offline copy of preferences; imports remain private to the browser
unless the user exports their source JSON separately.

## Verification gate

For any persistence change, verify in the running app that a changed value
survives a reload for both an empty workspace and a fully populated one. Test
two consecutive changes before the first write settles, then reload and verify
the last value. For session-scoped state, also verify page navigation, reload,
and a fresh browser tab, and confirm that changing the temporary states listed
above does not accidentally create durable data.
