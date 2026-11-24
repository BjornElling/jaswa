# Local Persistence Contract

**Status:** Binding product contract
**Reviewed:** November 16, 2026

## Promise

JASWA keeps committed user data on the same computer and in the same browser
profile after a reload, a browser restart, or a development-server restart.
It sends none of that data to a remote server. JASWA Helper shares committed
preferences locally between the development and published applications, as
described under Origin. Session-scoped interface state is kept
in the current browser tab only and is cleared when that tab closes.

## Durable data

| Record | Holds | Lives in |
| --- | --- | --- |
| The imported game | The prepared account collections the counts read (`IMPORT-PARITY-CONTRACT.md` §2), with the facts of its capture (file name, import time, helper session, `coverage` of changes the helper missed). The typed `AccountSnapshot` and the import report are derived from these on every restore and never stored (`readStoredGame`, `app/ingest/game-export.ts`); a stored import that no longer passes the import contract is not shown, and Home says to import again. The local projection under `localChanges` records where each moved rune sat when its preset build was first observed (`firstObservedPlacements`, the build overlay's *Previously*) and which game presets were removed locally; the runes locked to or excluded from monsters since (`runeLocks`, `rune-locks.ts`). Both go with the import, so the next one starts without — except that under *Always synchronized* the locks carry from one revision of the same account to the next | IndexedDB |
| The preferences | Every saved choice, by section below | IndexedDB, with a `localStorage` mirror; shared through the local helper when available |
| The export folder | The chosen folder handle, where the browser supports it | IndexedDB |
| The sharing checkpoint | The last local interpretation and raw helper preference document acknowledged together. It distinguishes offline edits from incoming choices and retains fields another build does not understand. It is coordination metadata, never part of a `.sw` file | IndexedDB, committed with the corresponding preferences |

The records live in the local `jaswa-local` IndexedDB database;
`app/platform/browser-storage.ts` is the only module that opens it. The preferences
mirror is a write-through safety copy for a tab closed before IndexedDB
completes; IndexedDB remains the complete store. A folder handle is an
IndexedDB record because browser handles cannot travel in an exported
preferences file.

The accepted observation is immutable. Runtime `ImportedGame.data` is its
effective projection; `ImportedGame.observation` retains the accepted facts.
Only the observation is stored in the account's `data`. `localChanges` stores
explicit departures in `scenarioRuneOwners` and `gamePresets`: Scenario rune
owners and, per game preset, positions, leader and gear, or deletion.
`readLocalAccountChanges` validates these choices and `applyLocalProjection`
reads them against the accepted observation. Restoration applies validated
overrides to the observation; it never stores a second effective account. A malformed local
context costs that context, retaining the other contexts and every preference.
The first observed placements remain the source for the overlay's *Previously*.

A tab taking over the writer lock cannot write until it has restored the
preceding writer's committed state. Loading a `.sw` document and following
preference clicks have one ordering: clicks apply after the latest document
replacement requested before them, including when several loads are queued.
Stopping direct import or changing its route/mode aborts an uncommitted
helper-import transaction. Storage and the published account share that boundary.

Preference copies written by the browser adapter carry a local write-order
number. It orders the two storage copies independently of wall-clock ties or
clock changes and is removed before preferences reach the application or a
`.sw` export. On the first read of existing unordered copies, their timestamps
still choose the newer copy; a missing timestamp alone never discards the only
available preference document. The write order identifies a local write, not
an application or file format version. This ordering is coordinated between
tabs by one origin-wide Web Lock: the tab holding the writer role commits
durable commands, while other tabs remain read-only until the writer closes and
they take over. A `BroadcastChannel` carries only a commit invalidation, so
readers restore committed records rather than receiving a second account
payload or merging stale mirrors.

### The preferences, by section

`readPreferences` (`app/ingest/preferences.ts`) reads the stored copy and a
`.sw` file alike, one section at a time, and each section through its own
reader, one choice at a time (`app/domain/profiles/preference-reading.ts`, AGENTS.md §0):

| Section | What the user chose | Reader |
| --- | --- | --- |
| `updatedAt` | The timestamp of the last durable preference write | `readPreferences` |
| `hardwareAcceleration`, `importRoute`, `directImportMode` | Graphics card on or off; the import route and live-import mode | `readPreferences` |
| `general` | Formats and time zone | `readGeneralSettings` (`regional-settings.ts`) |
| `monsterPreferences` | Each copy's profile, keyed by content-area — `scenario`, `content:<content id>` or `unassigned` (`monster-profile-scope.ts`) — then by `unit_id`: nickname, rune builds and slot mains, the switches that qualify them, leads in `scenario` alone (ATK, DEF, HP and CRI Rate, one saved answer each; another area's are its presets' leaders', never saved, and a stored one is dropped alone), the main stat wanted on all gear, the substats wanted in each artifact category and the relic uniques — each a preferred and an accepted band — and the stat ranges (`DECK-PRESETS.md` §4.1) | `readMonsterPreferences` (`monster-preferences.ts`) |
| `runeHolds` | Runes the user made unsellable | `readRuneHolds` (`rune-holds.ts`) |
| `craftIgnores` | One shared list of Gems & Grinds suggestions waved away with Ignore: a `rune_id`, an item kind and the item's stat | `readCraftIgnores` (`craft-ignores.ts`) |
| `craftViews` | Per Gems & Grinds view — Recommendations, Best use and What's missing — the question (item kind, chosen stack, assumed roll) and the filters | `readCraftViewChoices` (`craft-view-choices.ts`) |
| `runePotential` | Rune Clean-up settings, with its reroll rules and the craft credit (Settings › Gems & Grindstones) | `readSettings`; `readStoredRerollRules` (`rune-reapp-targets.ts`); `readCraftCredit` (`craft-credit-settings.ts`), one grade, roll and rounding at a time |
| `runeRoles` | Rune Clean-up roles | `readRuneRoles` (`rune-roles.ts`) |
| `artifacts` | Artifact Optimization settings: owned or Lv. 40 monsters only, how conversion stones are sourced, the assumed stone value, the acceptable-property factor, whether insignificant differences are ignored and their band, whether Intangible artifacts are included, and whether results re-calculate on change | `readSettings` |
| `speedTuning` | Per team — preset content and species (`unit_master_id`): whether the turn order is stated and, if so, the order; what-if combat speeds (`whatIfCombatSpeed`); *No speed tuning*. The per-preset section kept before November 14, 2026 carries its order and switch over against the import it is read with. Older display-speed what-ifs start blank. | `readSpeedTuningPreferences` (`speed-tuning-preferences.ts`) |
| `monsterPriority` | Scenario's priority list | `readMonsterPriority` (`monster-priority.ts`) |
| `presetPriority` | The order the user gave each game preset's monsters | `readPresetPriority` (`monster-priority.ts`) |
| `presets` | The presets built in JASWA: a name, a content, the monsters, the leader and, once engraved, every member's runes and artifacts (`DECK-PRESETS.md` §4) | `readOwnPresets` (`presets.ts`) |
| `runeOptimization` | Rune Optimization settings, among them whether held Immemorial Gems and Grindstones may be spent, whether a Gem may change a gemmed line's property, and whether a Gem may replace Speed | `readSettings` |
| `relicSynergy` | The relic synergy cells the user overruled, by unique-property id and then main — only cells that differ from the shipped table (`RELIC-CANONICAL.md` §5.3) | `readRelicSynergyChoices` (`relic-synergy.ts`) |
| `relicPowerUpThreshold` | Relic Optimization's power-up threshold, stop 1 to 5 (`RELIC-CANONICAL.md` §9) | `readPreferences` |

Two former keys are still read so the user's own choices survive their
rename: `runePotentialPresets` holds the roles when no `runeRoles` key exists,
and a monster profile area stored as `default` reads as `scenario` when no
`scenario` area is stated. Neither is ever written. An old `craftIgnores`
object with `{selected, missing}` lists is also read and combined by its
reader. The former `reappTargets` and `refineTargets` slot choices
are also read as individual reroll rules when no `rerollRules` list exists. Only
`rerollRules` is written, and a deliberately empty list stays empty. Rules previously
switched off are left out when read: removing Enabled must not activate them.
Every remaining rule keeps its conditions, and no Enabled field is written.
Former combined rules are read as two independent rules with distinct identifiers,
one per stone. A former boolean innate requirement of true becomes Yes; false becomes
Both. The current `innate` choice is Yes, Both or No and is validated independently;
only the current shape is written. Rule headings are derived from slots in ascending
order, followed by chosen main stats; former manual names are left out, with every
condition retained. Refine alone stores `substats` and `minimumSubstats` (All or a
positive integer). These are read independently: a missing or malformed list starts
empty, a missing or malformed minimum starts at All, and every existing slot, main,
set, rarity and innate choice survives. An incomplete or incompatible rule stays
available to edit and cannot recommend refinement. Re-app stores neither field.

## Session-scoped state

The current navigation page, which disclosure bars are open or closed, and
table filters are stored in `sessionStorage`. They survive page navigation and
reloads in the same tab, but are not part of the durable workspace and are not
shared with another tab. Invalid stored values are ignored and the interface
returns to its current default; a fresh tab starts on Home with all disclosure
bars closed. Gems & Grinds' views are not session state: their choices are
the durable `craftViews` section.

## What is not a saved choice

Open dialogs, unfinished role edits, drag highlighting, messages, loading
states, sorting, scroll positions, and hardware-detection results are
temporary interface state. A draft becomes durable only when the user presses
its explicit save or confirmation control.

## Write rule

Every committed preference change goes through `changePreferences` in the
workspace store (`app/workspace/workspace-store.ts`), which `app/shell/root.tsx`
wraps in one named route per section; components receive controlled values and
callbacks, never a storage API. That route updates the synchronous preferences mirror before the
new value reaches the interface, and queues an IndexedDB write after the
earlier preference writes. Imported game data and folder choices wait for their
IndexedDB transaction to complete before appearing as saved state.
If the database write succeeds but the mirror fails, a warning follows the user
on every page and explains that the recovery copy was not saved; a database
failure is reported separately. A later successful save clears the notice,
unless a lasting condition still holds — an unread database, or a browser that
cannot coordinate tabs — whose own notice then stays. Loading a preferences file still publishes it when the database accepted
it, even if its mirror failed, with the same warning.
When the database could not be read during restoration, the mirror can still
show recoverable preferences, but preference saves are refused until a reload
successfully reads the database. This prevents a partial recovery copy from
overwriting newer choices the database might contain. A notice explains why.

An own-preset Lock or Exclude that changes its engraving, an own-preset engrave
that ends locks the build moved away, and a game-preset edit that also changes
saved preferences commit both records together. Before
the IndexedDB transaction, the mirror records the preference values on both
sides and a local commit token; the transaction writes the token with both
records. Recovery reads the token and preferences in one database transaction
and selects the committed side. Preference edits made while the transaction is
pending are applied to both sides, so unrelated choices survive either outcome.
Account changes are queued in the writer tab and resolved against the latest
committed account. Only the tab holding the origin-wide writer lock commits;
where the browser offers no Web Locks, the tab writes and keeps a notice saying
that a second tab could overwrite its changes.

The named wrappers over `changePreferences`, each the one route for its
section:

- **`writeSpeedTuning`** — only the user's statements are stored; every
  combat speed, verdict and interval is derived from the current import on each
  render. A what-if the contract refuses — not a whole combat speed from 1 to
  999 — is dropped alone. A team is named by its content and its species, so an
  entry with an unreadable species or content is dropped whole, and a second
  entry for a team already read is dropped. An entry that states nothing — no
  order, no what-if, tuned — is not stored, and deleting a preset leaves its
  team's entry in place.
- **`presetWrites`** — Scenario's list, a game preset's order and the presets
  built in JASWA. A preset built in JASWA that fails its check is dropped alone.
- **`updateCraftView`** — one Gems & Grinds view's question or filter; the
  other views' choices are left as they are.
- **`updateCraftIgnores`** — Gems & Grinds' Ignore adds one entry to its
  shared list, once; Reset ignored empties it for every view without changing
  any other preference.
- **`updateRelicSynergy`** — the synergy editor's Save. It stores the cells that
  differ from the shipped table, so Reset to defaults followed by Save stores an
  empty record.
- **`updateMonsterPreferences`** — a monster-overlay choice. A record that no
  longer states anything is removed rather than stored empty, so a count of
  records is a count of decisions — but an explicitly cleared rune list *is* a
  statement and is stored. A gear answer with both bands emptied is not, and
  is removed like a choice never made (`ARTIFACT-CANONICAL.md` §19.4).

New durable data has one named, central write route, a complete validator for
data read back from the browser or a file, and a row in this contract.
Session-scoped interface state uses the shared `useSessionStorageState` hook
and validates every value read back. Components do not write to
`localStorage`, `sessionStorage`, or IndexedDB directly.

## Origin

Browser storage is isolated by origin, so there are two browser workspaces: the
development one at `http://localhost:3000` (AGENTS.md §1.1) and the published
one at `https://jaswa.net` (`DEPLOYMENT-TARGET.md`). `npm run dev` uses a strict
port and fails rather than move. Imported accounts, export-folder permissions
and session state remain private to each browser workspace. Another origin,
browser profile, private window or cleared site storage starts a new browser
workspace. The `.sw` export is the user's portable, offline copy of preferences;
imports remain private to the browser unless the user exports their source
JSON separately.

### Automatic sharing through JASWA Helper

The application's only preference exchange is with the loopback helper at
`http://127.0.0.1:37654/preferences`. The helper persists one `preferences.json`
in `%LOCALAPPDATA%/JASWA Helper`, independently of game capture and across helper
restarts. No preference request reaches the game or a remote server. Any browser
profile opening an approved JASWA origin can share this computer's choices.

Open jaswa.net first to seed the helper with its existing personalization. An
empty helper accepts the first browser's current preferences. A browser with
unchanged defaults adopts the shared choices automatically; two already
personalized copies that disagree require a one-time choice in Settings.
Both copies remain intact until that choice. Settings offers the ordinary
`.sw` download before the user chooses Use helper copy or Use this copy.

`createPreferenceSharing` (`app/workspace/shared-preferences.ts`) polls every
two seconds from the origin's writer tab, regardless of the game import route.
The browser adapter is `app/platform/shared-preferences.ts`. A closed,
unreachable or outdated helper leaves ordinary browser saves working, and
Settings shows no sharing card at all (`unavailable`): with nothing to share
with there is nothing to report or choose. The card appears once a helper
answers — shared, in conflict, or reachable but unable to join the copies
(`local`). On reconnection the checkpoint separates
locally changed choices from shared changes. Independent object fields merge.
Role, preset and other record lists with unique identifiers merge fields by
identifier, with order treated as a separate choice. Lists without identifiers
are indivisible; an edit that cannot preserve an unrecognized raw choice is a
conflict rather than a guessed match. Conflicting edits to the same choice
stay visible and require the same explicit choice of copy. Nothing is resolved
by comparing clocks or by replacing a whole preferences document silently.

The helper's GET returns the raw document and an opaque commit token; PUT
requires that token and an approved Origin plus JSON content type. A stale
token receives 409 and causes a reread, never a blind overwrite. A missing or
unreadable saved helper file does not authorize replacing an acknowledged copy.
The token identifies a write, not an application or document format. Atomic
file replacement retains the preceding copy if a write fails.

Incoming preferences use `readPreferences` against the current import, one
choice at a time. The raw shared document stays in the checkpoint so a
development-only choice survives a published build reading it. A shared
replacement runs through the workspace's serialized command queue: clicks
during the exchange apply afterwards, and account/preference paired commands
cannot pass it. The browser commits the resulting preferences and checkpoint
in one IndexedDB transaction; its synchronous mirror retains the recovery
promise above. Session state, imported game data and folder handles never
travel through this exchange.

## Verification gate

Browser tests import `tests/test-fixtures.ts`, which intercepts the preference
endpoint before navigation. The sharing tests replace that fallback with an
in-memory helper. Standalone browser checks use
`scripts/verification-browser.mjs` for the same isolation. Verification must
never read or write the user's real helper personalization; game-data mocks
match only `/health` and `/profile`, not this independent endpoint.

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
that default. Check a gear answer the other way — two empty bands are removed
and its default stands in again, while the copy's other gear answers stay —
and confirm that a record whose every choice has been undone is removed rather
than stored empty.
