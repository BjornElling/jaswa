# Local Persistence Contract

**Status:** Binding product contract
**Reviewed:** October 20, 2026

## Promise

JASWA keeps committed user data on the same computer and in the same browser
profile after a reload, a browser restart, or a development-server restart.
It sends none of that data to a server. Session-scoped interface state is kept
in the current browser tab only and is cleared when that tab closes.

## Durable data

| Record | Holds | Lives in |
| --- | --- | --- |
| The imported game | The prepared account collections the counts read (`IMPORT-PARITY-CONTRACT.md` §2); for each preset JASWA has engraved a build in, where each moved rune sat when the import was loaded (`loadedPlacements`, the build overlay's *Previously*); the runes locked to or excluded from monsters since (`runeLocks`, `rune-locks.ts`). Both go with the import, so the next one starts without | IndexedDB |
| The preferences | Every saved choice, by section below | IndexedDB, with a `localStorage` mirror |
| The export folder | The chosen folder handle, where the browser supports it | IndexedDB |

The records live in the local `jaswa-local` IndexedDB database;
`app/lib/browser-storage.ts` is the only module that opens it. The preferences
mirror is a write-through safety copy for a tab closed before IndexedDB
completes; IndexedDB remains the complete store. A folder handle is an
IndexedDB record because browser handles cannot travel in an exported
preferences file.

### The preferences, by section

`readPreferences` (`app/lib/file-imports.ts`) reads the stored copy and a
`.sw` file alike, one section at a time, and each section through its own
reader, one choice at a time (`app/lib/preference-reading.ts`, AGENTS.md §0):

| Section | What the user chose | Reader |
| --- | --- | --- |
| `hardwareAcceleration`, `importRoute`, `directImportMode` | Graphics card on or off; the import route and live-import mode | `readPreferences` |
| `general` | Formats and time zone | `readGeneralSettings` (`regional-settings.ts`) |
| `monsterPreferences` | Each copy's profile, keyed by content-area — `scenario`, `content:<content id>` or `unassigned` (`monster-profile-scope.ts`) — then by `unit_id`: nickname, rune builds and slot mains, the switches that qualify them, leads in `scenario` alone (ATK, DEF, HP and CRI Rate, one saved answer each; another area's are its presets' leaders', never saved, and a stored one is dropped alone), the main stat wanted on all gear, the substats wanted in each artifact category and the relic uniques — each a preferred and an accepted band — and the stat ranges (`DECK-PRESETS.md` §4.1) | `readMonsterPreferences` (`monster-preferences.ts`) |
| `runeHolds` | Runes the user made unsellable | `readRuneHolds` (`rune-holds.ts`) |
| `runePotential` | Rune Clean-up settings, with its re-app and refine targets | `readSettings`; `readReappTargets` (`rune-reapp-targets.ts`) |
| `runeRoles` | Rune Clean-up roles | `readRuneRoles` (`rune-roles.ts`) |
| `artifacts` | Artifact Optimization settings: owned or Lv. 40 monsters only, how conversion stones are sourced, the assumed stone value, the acceptable-property factor | `readSettings` |
| `speedTuning` | Per preset: the turn order wanted, what-if display speeds by `unit_id`, *No speed tuning* | `readSpeedTuningPreferences` (`speed-tuning-preferences.ts`) |
| `monsterPriority` | Scenario's priority list | `readMonsterPriority` (`monster-priority.ts`) |
| `presetPriority` | The order the user gave each game preset's monsters | `readPresetPriority` (`monster-priority.ts`) |
| `presets` | The presets built in JASWA: a name, a content, the monsters, the leader and, once engraved, every member's runes and artifacts (`DECK-PRESETS.md` §4) | `readOwnPresets` (`presets.ts`) |
| `runeOptimization` | Rune Optimization settings, among them whether held Immemorial Gems and Grindstones may be spent, whether a Gem may change a gemmed line's property, and whether a Gem may replace Speed | `readSettings` |

Two former keys are still read so the user's own choices survive their
rename: `runePotentialPresets` holds the roles when no `runeRoles` key exists,
and a monster profile area stored as `default` reads as `scenario` when no
`scenario` area is stated. Neither is ever written.

## Session-scoped state

The current navigation page, which disclosure bars are open or closed, and
table filters are stored in `sessionStorage`. They survive page navigation and
reloads in the same tab, but are not part of the durable workspace and are not
shared with another tab. Invalid stored values are ignored and the interface
returns to its current default; a fresh tab starts on Home with all disclosure
bars closed. Best use and Recommendations read their filter fields through
`readSettings`, so one invalid or newly added choice does not reset the others.

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

The named wrappers over `changePreferences`, each the one route for its
section:

- **`writeSpeedTuning`** — only the user's statements are stored; every
  combat speed, verdict and interval is derived from the current import on each
  render. A what-if the contract refuses — not a whole display speed from 1 to
  999 — is dropped alone. A stored order names monsters by `unit_id`; one the
  preset no longer holds is left out and one it gained since is read last.
- **`presetWrites`** — Scenario's list, a game preset's order and the presets
  built in JASWA. A preset built in JASWA that fails its check is dropped alone.
- **`updateMonsterPreferences`** — a monster-overlay choice. A record that no
  longer states anything is removed rather than stored empty, so a count of
  records is a count of decisions — but an explicitly cleared preference *is* a
  statement and is stored (`ARTIFACT-CANONICAL.md` §19.4).

New durable data has one named, central write route, a complete validator for
data read back from the browser or a file, and a row in this contract.
Session-scoped interface state uses the shared `useSessionStorageState` hook
and validates every value read back. Components do not write to
`localStorage`, `sessionStorage`, or IndexedDB directly.

## Origin

Browser storage is isolated by origin, so the workspace is the one at
`http://localhost:3000` (AGENTS.md §1.1): `npm run dev` uses a strict port and
fails rather than move. `127.0.0.1`, another port, another browser profile, or
private browsing is a different, empty workspace, as is clearing JASWA's site
data. The `.sw` export is the user's portable, offline copy of preferences;
imports remain private to the browser unless the user exports their source
JSON separately.

## Verification gate

`npm run verify:preference-survival` holds the one-choice-at-a-time reading and
the former keys. For any persistence change, verify in the running app that a
changed value survives a reload for both an empty workspace and a fully
populated one. Test two consecutive changes before the first write settles,
then reload and verify the last value. For session-scoped state, also verify
page navigation, reload, and a fresh browser tab, and confirm that changing the
temporary states listed above does not accidentally create durable data.

For monster preferences, verify all three of `ARTIFACT-CANONICAL.md` §19.4's
states survive a reload: a stated choice, an untouched one still reading its
statistics default, and a **deliberately cleared** one that must not revert to
that default. Check a gear answer the same way — two empty bands are a saved
`Any`, not an absent answer — and confirm that a record whose every choice has
been undone is removed rather than stored empty.
