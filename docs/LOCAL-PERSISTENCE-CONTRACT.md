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

- the current imported game, including its prepared account data and, for
  each preset JASWA has engraved a build in, where each moved rune sat when the
  import was loaded (`loadedPlacements`, the build overlay's *Previously*), and
  the runes locked to or excluded from monsters since (`runeLocks`,
  `rune-locks.ts`) — both go with the import, so the next one starts without;
- all preferences: import route and mode, graphics preference, formats and
  time zone, per-copy monster preferences (the user's own name for a copy, its
  chosen rune builds and slot main stats, the switches that qualify them, its
  leads (attack, defence, speed, HP and crit, one saved answer each), the
  one main stat wanted on all its gear, the substats wanted in each artifact
  category and the relic uniques — each of those three gear answers as a
  preferred and an accepted band — and the stat ranges the copy is built toward,
  keyed by context — Scenario or one preset — and then by the game's `unit_id`,
  so two copies of one monster, and one copy in two presets, can be built for
  different jobs; `DECK-PRESETS.md` §4.1), Rune Clean-up settings, Rune Clean-up
  roles, and Artifact Optimization settings (whether to factor in only owned
  monsters or only Lv. 40 monsters, how conversion stones are sourced, the
  assumed stone value, and the acceptable-property factor), the presets built
  in JASWA (`DECK-PRESETS.md` §4: a name, a content, the monsters, the leader
  and, once engraved, every member's runes and artifacts), Scenario's priority
  list and the order the user gave each game preset's monsters, Speed Tuning's
  word on each preset (the turn order wanted and any what-if display speed
  tried on a monster — keyed by `unit_id`; the what-if is read only by the
  preset's overlay, never by the page or any other figure), and Rune Optimization's
  settings, among them whether held Immemorial Gems and Grindstones may be spent
  and whether a Gem may change a gemmed line's property — one answer each for
  every monster;
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
returns to its current default; a fresh tab starts on Home with all disclosure
bars closed.

## What is not a saved choice

Open dialogs, unfinished role edits, drag highlighting, messages, loading
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

A Speed Tuning change goes through `writeSpeedTuning` in `app/page.tsx`, a
named wrapper over `changePreferences`. Only the user's statements are stored;
every arena speed, dungeon speed, verdict and interval is derived from the
current import on each render, so a saved order cannot carry a stale reading.
A what-if the contract refuses — not a whole display speed from 1 to 999 — is
dropped alone, and the rest of the preset's tuning is read as it stands. A
stored order names monsters by `unit_id`; one the preset no longer holds is
left out and one it gained since is read last.

The Presets page writes through `presetWrites` in `app/page.tsx` — Scenario's
list, a game preset's order and the presets built in JASWA — each a named
wrapper over `changePreferences`. A preset built in JASWA is read back one
preset at a time (`readOwnPresets`): one that fails its check is dropped and
every other is kept.

A monster-overlay choice goes through `updateMonsterPreferences` in
`app/page.tsx`, which is a named wrapper over `changePreferences` and not a
second route. A record that no longer states anything is removed rather than
stored empty, so a count of records is a count of decisions — but an explicitly
cleared preference *is* a statement and is stored (`ARTIFACT-CANONICAL.md`
§19.4), so "the record is gone" and "every choice in it is unwanted" stay two
different saved states.

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

For monster preferences, verify all three of `ARTIFACT-CANONICAL.md` §19.4's
states survive a reload: a stated choice, an untouched one still reading its
statistics default, and a **deliberately cleared** one that must not revert to
that default. Check a gear answer the same way — two empty bands are a saved
`Any`, not an absent answer — and confirm that a record whose every choice has
been undone is removed rather than stored empty.
