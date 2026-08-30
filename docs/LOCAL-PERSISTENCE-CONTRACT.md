# Local Persistence Contract

**Status:** Binding product contract  
**Reviewed:** August 30, 2026

## Promise

JASWA keeps committed user data on the same computer and in the same browser
profile after a reload, a browser restart, or a development-server restart.
It sends none of that data to a server. `sessionStorage` is not used anywhere
in the application.

## Durable data

The durable workspace contains:

- the current imported game, including its prepared account data;
- all preferences: import route and mode, graphics preference, formats and
  time zone, monster preferences, Rune Potential settings, Rune Potential
  presets, and Artifacts settings;
- the chosen export-folder handle when the browser supports it.

The first two records live in IndexedDB under the local `jaswa-local`
database. Preferences also have a small `localStorage` mirror written in the
same user action. The mirror is a write-through safety copy for a tab closed
before IndexedDB completes; IndexedDB remains the complete workspace store.
A folder handle is an IndexedDB record because browser handles cannot travel in
an exported preferences file.

## What is not a saved choice

Open dialogs, unfinished preset edits, drag highlighting, messages, loading
states, current navigation, table filters, sorting, scroll positions, and
hardware-detection results are temporary interface state. A draft becomes
durable only when the user presses its explicit save or confirmation control.

## Write rule

Every committed preference change goes through `changePreferences` in
`app/page.tsx`; components receive controlled values and callbacks, never a
storage API. That route updates the synchronous preferences mirror before the
new value reaches the interface, and queues an IndexedDB write after the
earlier preference writes. Imported game data and folder choices wait for their
IndexedDB transaction to complete before appearing as saved state.

New persistent data must have one named, central write route, a complete
validator for data read back from the browser or a file, and an entry in this
contract. Do not add direct `localStorage`, `sessionStorage`, or IndexedDB
writes to components.

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
the last value. Confirm that changing the temporary states listed above does
not accidentally create durable data.
