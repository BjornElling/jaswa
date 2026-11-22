# JASWA built from scratch

**Status:** Architectural blueprint, implementation record and final implementation review; subject contracts remain binding
**Date:** November 14, 2026
**Scope:** Browser application, calculation workers, Windows helper, reference data, hosting and verification
**Addendum:** §21 records an independent second assessment, compares it with §§1–20 and states the resulting recommendation
**Final review:** §22 evaluates those amendments and states the consolidated recommendation; its qualifications supersede the corresponding proposals in §§6, 10.3 and 21
**Implementation:** §23 records what has been built, what a review corrected and what remains open, per acceptance criterion
**Current status:** §24 supersedes the earlier implementation findings and acceptance statuses, records their corrections and reviews the resulting architecture and code

## 1. Assignment and answer

The assignment is to answer this question:

> If we were building JASWA from the beginning, with what we know about the
> program today, how would we structure it?

The requested output is an architectural blueprint: explain the assignment,
the reasoning behind the overall structure, and the specific rationale for
each constituent part. It must give a developer unfamiliar with JASWA enough
information to establish the structure and connect its parts.

This analysis recommends a **local-first modular application**: one React and
TypeScript browser application with a pure domain core, an explicit application
layer, and adapters for browser storage, files, calculation workers and the
helper. Keep the Windows helper as a separate executable. Keep hosting limited
to delivering the application and public artwork. Organize the source by
responsibility and domain capability rather than by a flat list of components
and libraries.

The central architectural decision is to separate four things:

1. **Observed account facts:** what the imported snapshot says the player owns
   and where the game placed it.
2. **User decisions:** roles, profiles, presets and settings the owner chose.
3. **Local planning changes:** placements and other account edits made inside
   JASWA, without changing the game.
4. **Derived answers:** resolved preferences, stat sheets, recommendations,
   search results and screen rows.

Those categories have different validation, ownership and lifetimes. They
should be explicit in the model, application commands and persistence boundary.
The distinction does not require four databases or four services.

Retain the existing investment in canonical rules and independent verification.
The main improvement is to make those rules easier to locate, harder to bypass,
and easier to use without involving a screen or browser API.

This document proposes a fresh structure. It does not authorize implementing a
rewrite, changing a formula, changing a product contract, publishing the site,
or releasing the helper. Existing subject contracts remain authoritative. A
future implementation would update their concrete file paths alongside the
code; proposed paths below are not claims about files that exist today.

## 2. What JASWA does

JASWA is a private workspace for understanding and planning a Summoners War
account. The game supplies facts; the player supplies intentions; JASWA computes
advice. It never applies that advice to the game.

The main capabilities are:

| Capability | User question | Principal inputs and outputs |
| --- | --- | --- |
| Import and account overview | What do I own, and is the import complete? | File or helper snapshot → prepared account, counts, warnings and capture gaps |
| Monster overview and usage | Which copies do I own and how are they used? | Roster, storage, shrine quantities and presets → reachable account rows and usage |
| Monster profiles | What should this copy do in this content? | User statements and reference defaults → resolved requirements with provenance |
| Presets and local engraving | Which monsters and gear belong in this arrangement? | Scenario, game presets and user presets → context-specific placements and conflicts |
| Rune Optimization | Which six runes best satisfy this monster's requirements? | Account, context, profile, craft stock and search settings → ranked builds and proposed work |
| Speed Tuning | Does this team move in the intended order? | Context-specific stats, skills, leaders, enemies and what-if speeds → simulated order and intervals |
| Rune Clean-up | Which runes are worth keeping or improving? | Runes, user roles, reference stats and policy → values, chances, verdicts and safeguards |
| Gems & Grinds | Where should these craft items be spent? | Stock and legal rune end states → improvements, best uses and missing items |
| Artifact Optimization | Which artifact and conversion belong on which monster? | Artifact inventory, resolved preferences and scoring settings → pair scores and allocations |
| Relic Optimization | Which relics are worth improving and suit which monsters? | Relic state, synergy choices and monster builds → power-up distributions and monster plans |
| Settings and explanation | What assumptions and local choices drive these answers? | Preferences and model descriptions → editable settings, portable `.sw` preferences and The Math |
| Development simulator | How does the rune judgement behave on generated drops? | Generated runes and the same Clean-up engine → experiments; available in development |

### 2.1 Vocabulary a new developer needs

- A **monster species** is identified by `unit_master_id`; an **owned copy** by
  `unit_id`. Several owned copies may have the same name and species.
- A **rune** is one physical item in one of six rune slots. An **artifact** is
  one physical item for an Attribute or Type slot. A **relic** may be referenced
  by multiple monsters under its engraving limit. References do not create items.
- A **craft stack** represents a quantity of identical items. Its row count is
  different from the number of items owned.
- **Scenario** is the monster's arrangement outside saved presets. A **preset**
  is one saved team arrangement. A **content** identifies the activity, such as
  Giant's Keep or a Dimension Raid phase.
- A **placement context** is Scenario or one preset. A rune may be engraved in
  several contexts, on different monsters, while remaining one physical item.
- A **profile** is the owner's statement for one monster copy in one
  content-area. A **role** is a user-defined target for judging runes in Clean-up.
  These are separate concepts.
- **Display speed** and **combat speed** are different quantities. Their
  calculations and the simulation of turns have one canonical owner.
- A **pool** expresses restrictions between teams that fight together. A team
  pool and a phase pool have different sharing rules.

The detailed vocabulary is in [Language Contract](./LANGUAGE-CONTRACT.md),
with speed terminology owned by [Speed Tick](./SPEED-TICK-CANONICAL.md).

## 3. Basis, method and limits

The analysis used the checked-out repository and its contracts. It traced the
browser entry point, import validation and preparation, durable and session
storage, preference resolution, context-specific placements, worker protocols,
acceleration routing, representative calculation models, helper boundaries,
static hosting and the verification setup.

Important inspected sources include:

| Area | Existing evidence |
| --- | --- |
| Composition and navigation | `app/main.tsx`, `app/page.tsx`, `app/lib/workspace-config.ts`, `app/lib/page-history.ts` |
| Import boundary | `app/lib/file-imports.ts`, `app/lib/helper-client.ts`, `app/lib/account-counts.ts` |
| Persistence | `app/lib/browser-storage.ts`, `app/lib/preference-reading.ts`, `app/lib/session-storage-state.ts` |
| Profiles and contexts | `app/lib/monster-preference-resolution.ts`, `app/lib/presets.ts`, `app/lib/rune-sources.ts`, `app/lib/engrave-rune-build.ts` |
| Calculations | `app/lib/monster-stats.ts`, `app/lib/main-stat-model.ts`, the rune, artifact, relic and speed modules in `app/lib/` |
| Execution | `app/lib/compute/accelerated-calculation.ts`, `app/lib/compute/cancellable-worker.ts`, calculation clients and worker protocols |
| Presentation | `app/components/`, `app/globals.css`, calculation and cancellation hooks |
| Helper | `helper/README.md`, `helper/src-tauri/src/`, especially the documented protocol/profile and platform separation |
| Distribution | `vite.config.ts`, `worker/index.ts`, `public/sw.js`, `wrangler.jsonc`, `package.json` |
| Verification | `playwright.config.ts`, `tests/`, `scripts/verify-*.mjs`, verification and stress-test contracts |

This is a source-based design analysis, not a performance benchmark, a complete
security audit, or proof that every current calculation is correct. Code size
and responsibility concentration support maintainability conclusions; they do
not establish slow rendering or a measured speed gain from the proposed design.
No new game-mechanics research or formula is introduced.

### 3.1 What should survive a fresh start

Several current architectural choices are strong:

- Ordinary account work happens locally in the browser; a remote account
  backend is unnecessary.
- Vite, React and TypeScript already fit the product. The application is a Vite
  SPA, regardless of the names `app/page.tsx` and `app/lib/`.
- Spillover between views is controlled through shared domain rules: one stat
  sheet, placement model, main-stat model, craft rule and turn-order clock.
- Heavy calculations already use workers, with CPU reference implementations
  and centrally selected optional WebGPU arithmetic.
- The project records assumptions and game evidence in detailed subject
  contracts and verifies many rules independently.
- The helper already separates substantial protocol/profile logic from its
  Windows shell. Reuse that knowledge rather than relearning it.
- Shared buttons, overlays and calculation controls establish real product
  contracts, including stable layout and cancellation.

### 3.2 What I would structure differently

The following are observations about responsibility boundaries, not an argument
that long files are automatically wrong:

| Observation | Consequence | Fresh-start decision |
| --- | --- | --- |
| `app/page.tsx` has 1,097 lines and handles restoration, helper polling, imports, persistence, local engraving, preference writes, navigation and overlays | Application workflows and React lifetime are coupled in the composition root | Put workflows in application controllers and commands; leave composition, providers and the shared overlay host in the root |
| `file-imports.ts` combines game validation, preparation, preference defaults/readers and browser file reading | Unrelated external boundaries meet in one module | Separate account decoding, preference decoding and file I/O |
| `ImportedGame.data` is `Record<string, unknown>` and downstream readers interpret game-shaped data | Raw-format knowledge remains widely available after import | Publish a typed account snapshot once; keep raw field names inside ingestion and diagnostic adapters |
| Local engraving can rewrite the imported game-shaped record | The distinction between observed game facts and a JASWA plan is implicit | Keep the observation immutable and represent local changes separately, while preserving the current effective behaviour |
| Domain models, React hooks, storage, worker clients and presentation helpers share broad folders | It is difficult to infer allowed dependencies from location | Introduce explicit domain, application, adapter, compute and presentation boundaries |
| `globals.css` has 7,546 lines; some components already use CSS modules | Shared visual vocabulary and feature-specific layout share a large change surface | Keep tokens and voices global; move feature layout beside the feature |
| Calculation protocols and caches already exist, but coordination is distributed among clients, hooks and memories | Freshness, cancellation and reuse require knowledge of several modules | Give each calculation a descriptor and a shared job lifecycle, with specialized search support |

For scale, the Rune Optimization screen has 1,025 lines, its search module
1,352, and the Clean-up model 1,267. Split these by coherent decisions and
testable stages, not by an arbitrary line limit. The search still needs one
owner for pruning and ordering; dividing it into files must not create a
second implementation.

## 4. Constraints that decide the architecture

| Constraint | Architectural consequence |
| --- | --- |
| Game data and preferences stay on the computer | Account processing and persistence live in the browser/helper; hosting has no account API or telemetry |
| Passive reading has no exceptions | No application command or helper endpoint can author a game request or apply a plan to the game |
| Imported, counted and reachable entities agree | One prepared collection per entity type feeds totals, views and computation; unsupported records produce visible failures |
| User choices survive code changes | Preference readers reject individual invalid choices and retain valid neighbours; defaults are resolved rather than copied over choices |
| There is only the current application/data contract | Do not introduce application/schema versions or migration frameworks; preserve the specific preference-reading exceptions already required by the persistence contract |
| A fact has one calculation | Domain ownership and dependency checks prevent screens from restating formulas |
| Placement depends on context | All gear, stats and search queries require explicit Scenario/preset context |
| Heavy work must not block interaction | Workers own bulk work; a common execution boundary owns scheduling and cancellation |
| Acceleration must be trustworthy and visible | CPU is the reference, WebGPU proves agreement, and results report the engine actually used |
| Choice must not move neighbouring content | Presentation primitives reserve varying labels, figures and state marks in advance |
| A single developer maintains the product | Keep one repository, one browser build and explicit modules; avoid operating a distributed system |

These follow particularly from [Passive Game Data](./PASSIVE-GAME-DATA-CONTRACT.md),
[Import Parity](./IMPORT-PARITY-CONTRACT.md),
[Local Persistence](./LOCAL-PERSISTENCE-CONTRACT.md),
[Deck Presets](./DECK-PRESETS.md) and
[Hardware Acceleration](./HARDWARE-ACCELERATION.md).

## 5. Runtime structure and dependency direction

```text
Existing export file ──────────────┐
                                 ▼
Game's original messages → Windows helper → loopback read API
             │                             │
             │ unchanged relay             ▼
             └──────────────────→ Browser ingestion boundary
                                           │
                                           ▼
                                 Typed account snapshot
                                           │
                 User decisions + local plan changes
                                           │
                                           ▼
                              Application commands/queries
                                  │                 │
                                  ▼                 ▼
                            Domain rules      Calculation workers
                                  │                 │
                                  │          CPU / checked WebGPU
                                  └────────┬────────┘
                                           ▼
                                 React feature screens

Browser storage ← local persistence adapter ← application write routes
Static host/R2 → application files and public artwork only
```

The helper's relay is capture infrastructure. The diagram does not grant a
browser-to-game write path. User actions named Engrave, Lock or Delete change
the local workspace only.

Source dependencies follow this direction:

```text
composition → presentation → application → domain → small shared primitives
composition → adapters → application ports and domain types
compute workers → calculation algorithms + domain + worker runtime
hosting worker → hosting types only
```

The application layer declares the few external operations it needs, such as
loading a workspace or submitting a calculation. Adapters implement those
operations. The domain imports no React, DOM, storage, worker, network or
platform module. Pure algorithms may run on the main thread for a small query
and in a worker for a bulk calculation without changing their meaning.

Keep one npm project for the web application initially. Directory boundaries
and lint checks are sufficient; internal packages and a package publishing
pipeline would add ceremony without an independent consumer. The helper keeps
its own existing Rust/build boundary.

## 6. Proposed source tree

The original tree below explains the responsibility boundaries. The compact
tree in §21.5(2), qualified by §22.3, is the final recommended physical layout;
the original remains here to explain the design's development.

```text
app/
  main.tsx
  page.tsx                         # Composition root and single overlay host
  shell/
    app-shell.tsx                  # Rail, workspace frame, shared notices
    navigation.ts                  # Page registry and history coordination
    overlay-controller.ts          # Targets, stacking and focus-return policy
    workspace-provider.tsx         # React subscriptions to application state
  domain/
    account/                       # Typed collections, counts, integrity issues
    monsters/                      # Copy/species identity, storage, names
    runes/                         # Properties, sets, generation, craft end states
    artifacts/                     # Properties, scoring, conversion, allocation
    relics/                        # Properties, power-up model, synergy and fit
    placements/                    # Contexts, preset contents, pools, sources
    profiles/                      # User statements, roles, resolution and provenance
    combat/                        # Stat sheet, main-stat advice, bonuses, turn clock
    reference/                     # Typed catalogue, statistics and PvE access
  application/
    workspace/
      state.ts                     # Snapshot, decisions, local changes, readiness
      commands.ts                  # Serialized durable workspace changes
      queries.ts                   # Pure composition and selectors
      restore.ts                   # Independent restoration and validation
    imports/
      import-account.ts            # Validate candidate, persist, publish
      direct-import-controller.ts  # Route/mode/session/rejection lifecycle
    preferences/
      read-preferences.ts          # Compose section readers
      change-preferences.ts        # One ordered preference write route
    placements/
      engrave-build.ts              # Revalidate and commit a local plan
      edit-preset.ts               # All affected context changes together
    calculations/
      job-state.ts                 # Idle/running/stopped/failed plus held result
      descriptors.ts               # Calculation input and key contracts
      ports.ts                     # Submission, progress, stop and cancellation
    ports/
      workspace-repository.ts
      helper-source.ts
      preference-files.ts
  ingestion/
    game-export/
      containers.ts                # Known raw sources and precedence
      readers/                     # Entity readers; raw export fields end here
      prepare-account.ts           # Merge, validate, normalize, index
      reconcile-counts.ts           # Source-to-prepared parity report
    preferences/                   # Section readers and current choice validation
  algorithms/
    rune-cleanup/                  # Weights, sampled quality, outcomes, verdict
    rune-optimization/              # Problem, exact reductions, cut, search, merge
    craft-advice/                   # Legal states and comparison/stock allocation
    speed-tuning/                   # Simulation questions and interval analysis
    rune-simulator/                 # Generated experiments using Clean-up
  compute/
    runtime/                       # Worker pool, cancellation, acceleration gate
    jobs/                          # Typed worker protocol/client/entry per job
    gpu/
      context.ts
      layouts/                     # Shared packing/WGSL layout declarations
      backends/                    # Packing, dispatch, readback, agreement cases
      shaders/                     # Arithmetic; no independent policy
  adapters/
    browser-storage/               # Only IndexedDB/localStorage owner
    session-storage/               # Validated per-tab state
    files/                         # File reads, downloads and folder handles
    helper/                        # Loopback transport and envelope validation
  features/
    home/
    monsters/
    presets/
    rune-optimization/
    speed-tuning/
    rune-cleanup/
    craft-advice/
    artifacts/
    relics/
    settings/
    the-math/
    rune-simulator/
  ui/
    button.tsx
    overlay.tsx
    calculation-actions.tsx
    tables/
    forms/
    gear/                          # Shared rune lines, artifact marks, portraits
  styles/
    tokens.css
    voices.css
    base.css
    layout.css
  data/                            # Committed reference snapshots and manifests
helper/
  src/                             # Dashboard; no capture policy
  src-tauri/src/
    capture/                       # Transparent transport and decoding boundary
    profile/                       # Current-account projection and gap detection
    api/                           # Read-only loopback snapshot/health/download
    platform/                      # Windows lifecycle, hosts and certificate work
    diagnostics/                   # Safe status and explicitly exported evidence
worker/index.ts                    # Public artwork delivery
public/                            # Static shell assets and current helper release
scripts/                           # Maintenance, release and verification tools
tests/
  fixtures/
  architecture/
  integration/
  e2e/
docs/                              # Binding subjects and advisory designs
```

Each domain capability starts with `model.ts` for its types and focused files
for its decisions. Expose a small `public.ts` entry only where it helps enforce
ownership. Avoid a root barrel that imports every domain and reference dataset.
Large reference files must not become eager dependencies of Home merely because
Home imports one shared type.

The `algorithms/` distinction has a specific purpose: those modules compose
domain rules into expensive procedures. A rune's legal Gem transformation is a
domain rule; searching millions of legal combinations is an algorithm. Neither
depends on workers. The worker is an execution adapter around the algorithm.

## 7. Account model: facts, identities and placements

### 7.1 The accepted snapshot

Decode external `unknown` into a typed `AccountSnapshot` before publishing it.
Its minimum structure is:

```ts
type AccountSnapshot = {
  accountId: AccountId;
  importedAt: string;
  source: ImportSource;
  monsters: readonly MonsterCopy[];
  normalShrine: readonly ShrineMonster[];
  summonedShrine: readonly SummonedStack[];
  runes: readonly Rune[];
  artifacts: readonly Artifact[];
  relics: readonly Relic[];
  craftStacks: readonly CraftStack[];
  conversionStones: readonly ConversionStone[];
  buildings: AccountBuildings;
  presets: readonly ObservedPreset[];
  scenario: ScenarioPlacements;
  coverage: CaptureCoverage;
};
```

This is a structural sketch, not a complete entity schema. The complete field
definitions and legal values come from the existing canonical contracts and
readers. Introduce distinct identifier types for account, copy, species, rune,
artifact, relic, context and craft stack. Use one consistent string form after
validating the external identifiers. Names are labels, never keys.

Arrays are the authoritative stored collections. Build read-only maps by ID,
slot and context in an `AccountIndex` derived from that snapshot. Do not persist
both arrays and independent mutable indexes. Reuse an index while its snapshot
identity is unchanged, and replace it when the snapshot changes.

The model must preserve these distinctions:

- Missing optional monster facts remain unknown; missing base stats cannot
  become a zero-stat monster in a calculation.
- An uncatalogued species remains owned, named visibly and reachable. Queries
  requiring unavailable species facts return an explicit unavailable reason;
  they do not fabricate facts or silently omit it. This is the documented
  catalogue exception, not permission to accept an unknown rune set.
- Summoned shrine stacks are quantity-bearing holdings, not invented individual
  copies with generated `unit_id` values.
- An artifact main stores its name, not its fixed magnitude. The ingestion
  boundary validates the exported magnitude and discards it as specified.
- Known historical artifact properties remain representable under the current
  artifact contract. A current game entity with historical properties is not an
  old JASWA storage format.
- A relic's many engraving references do not multiply its inventory count.

**Implementation review, November 14 — R1 [P1; resolved in §24.1]: missing and invalid monster
stats become calculation inputs.** `isValidUnitRecord` in
`app/ingest/game-export.ts` checks identity, grade, level and skills, but none
of the eight base stats. `monsterBaseStats` in
`app/domain/combat/monster-stats.ts` then converts missing/non-numeric values
to `0` and accepts finite negative values. Against the committed optimization
fixture, removing `spd`, setting it to `"invalid"`, or setting it to `-5`
all pass `validateGameFile`; the resulting base display speeds are `0`, `0`
and `-5`. A level-40 monster with these missing facts also enters the reference
averages through `referenceMonsters`. This is a correctness defect beyond the
acknowledged unfinished `MonsterCopy.record` typing: unavailable facts are
already presented to algorithms as known numbers. Validate supplied stat
values at ingestion, represent absent stats explicitly, and make dependent
calculations report unavailable inputs. Add missing/invalid-stat cases to the
ingestion, stat-sheet and reference-average checks before marking criterion 1
complete.

### 7.2 Placement is a relation

Model placement as `(context, item, monster, slot)`, with specialized slot
types for runes and artifacts. The item owns its physical stats; the placement
owns its location in that context.

Use a tagged context identity:

```ts
type ContextId =
  | { kind: 'scenario' }
  | { kind: 'game-preset'; source: GamePresetIdentity }
  | { kind: 'own-preset'; id: OwnPresetId };
```

`GamePresetIdentity` is itself tagged for a `(deck_type, deck_seq)` deck or
one of the separate defense records. Serialize these identities through one
codec for storage/session keys; screens never concatenate their own keys.

Required placement queries include:

```text
resolveContext(snapshot, decisions, localChanges, contextId)
runesOnMonster(resolvedContext, monsterId)
artifactsOnMonster(resolvedContext, monsterId)
relicOnMonster(snapshot, monsterId)
summarizeRunePlacement(allResolvedContexts, runeId)
withheldRunes(resolvedContext, monsterId, priority, sourcePolicy, locks)
```

The resolved context includes effective placements, missing references and
pool conflicts. It is derived, not an independently editable object.

Preserve the detailed exceptions in [Deck Presets](./DECK-PRESETS.md):
gear-less presets use Scenario gear; relics follow Scenario into every preset;
sold item references remain visible; a no-longer-owned game-deck monster leaves
an empty position; a still-owned shrine member is a missing member rather than
an invented roster copy. A preset with unconfirmed content remains reachable
but joins no pool. Do not reject an observed cross-pool overlap that the game
allowed; flag it and apply the existing withholding rule when searching.

**Rationale:** context is a fundamental game relation. Encoding location as a
single mutable field on an item cannot express the actual game, and each screen
would eventually invent a different interpretation.

### 7.3 Local changes over an immutable observation

Today local engraving and game-preset edits can change imported game-shaped
data. From scratch, keep the accepted observation intact and store a compact
`LocalAccountChanges` record beside it. It contains the effective overrides for
edited observed presets/Scenario, preset removals and the first observed
placement needed by *Previously*. It is not an event log.

For a touched context, store an explicit complete placement replacement,
including an empty replacement. Absence means no override. If the source preset
saved monsters only, the first local engraving freezes gear for all members,
as the current contract requires. Do not patch only one member and let the
others silently follow changing Scenario gear.

The effective account is a pure projection of the observation and these
overrides. Every ordinary page reads the effective account, preserving the
current local-edit behaviour. *Previously* explicitly reads the observation.
No screen chooses between these interpretations ad hoc.

User-built presets remain durable user decisions. A local command engraving
one changes that preset's saved gear; it does not create a second copy of the
same preset in `LocalAccountChanges`.

Fresh imports reset imported-account local changes and loaded-placement
records. Preserve the current exception: live revisions of the same account
carry valid rune locks/exclusions; another account does not. User roles,
settings and user-built presets survive imports. Always-synchronized mode
continues to disallow local edits that its next observation would overwrite.

**Rationale:** the program can explain what it observed and what the user
planned without reverse-engineering rewritten export records. This adds one
explicit projection but removes raw-format mutation from application commands.

**Implementation review, November 14 — confirmed open model work:**
`engraveImportedGame` and `game-preset-edits.ts` still rewrite `ImportedGame.data`.
`LocalAccountChanges` records first placements and removed presets, rather
than complete context replacements. The qualification in §23.3 criterion 3
is accurate; the immutable observation/effective projection described here
has not been implemented. Keep it open independently of the command-validation
defect R8 in §15.3.

## 8. Domain ownership and calculation responsibilities

The units below are code modules in one program. They communicate through
typed function calls, not network services.

| Owner | Owns and exposes | Why this boundary matters |
| --- | --- | --- |
| Account | Owned collections, typed integrity issues, canonical totals | Every page and import route counts the same entities |
| Monsters | Copy/species identity, awakening relationships, qualified names, storage classification | Search, roster and profile lookup cannot disagree about identity |
| Rune rules | Stats, slot legality, sets, Intangible completion, generation distributions | Search, Clean-up and simulation start from the same physical possibilities |
| Rune craft end states | Gem/Grindstone tables behind one legal-state API | No consumer independently applies replacement, grind retention or item compatibility |
| Placements | Scenario/presets, content evidence, pool conflicts and rune-source policy | Candidate selection and build revalidation share the same availability answer |
| Profiles | Roles, copy/content statements, section validation, defaults and provenance | A user's answer cannot be overwritten by statistics or another screen |
| Combat | Monster effects, display/combat stats, leaders, team bonuses and stat limits | All figures on all pages read the same stat sheet |
| Main-stat advice | Need and preference resolution for gear mains | Artifacts, relics and overlays use the same answer |
| Turn clock | Ticks, attack bars, boosts, buffs and ties | Speed analysis asks one simulator rather than copying formulas |
| Artifacts | Property meaning, main/sub worth, pair score, conversions and allocation policy | Overview and recommendation scores have identical meaning |
| Relics | Power-up distributions, synergy, effects, monster value and capacity | Chance, verdict and recommended destination agree |
| Reference data | Typed lookups and provenance for catalogue, statistics and PvE stages | Unknown enemy values remain unknown; runtime lookup never contacts a third party |

Shared combat rules should depend on item models/effects, not on optimization
or advice algorithms. Main-stat advice may depend on combat effects and profile
inputs, but the stat sheet must not depend back on the advice. Pass resolved
choices into artifact/relic judgement rather than importing a UI resolver.
Declare these dependencies explicitly to prevent cycles.

### 8.1 Profiles are statements, defaults are evidence

Store only the user's statements, keyed by copy and profile scope. Resolve
those statements against reference defaults when queried. Return the chosen
answer, whether it came from the user/default, and the reference shares needed
to explain it.

Preserve three states where the subject contract distinguishes them:

1. Never answered: use the applicable default.
2. Answered with a value: use that value.
3. Deliberately cleared: preserve the clearing where it is meaningful.

Do not make every setting a generic three-state wrapper. Rune choice lists
and gear bands differ: an explicitly empty rune list is a saved statement;
two empty gear bands remove that gear statement and restore its default.
Encode those rules in the profile reader/writer, not in form components.

An absent numeric target is `null` or an omitted optional field according to
one declared field contract; explicit `0` is a value. Form parsing returns
absent, valid or invalid before changing committed state. Neither `Number('')`
nor `NaN` is a valid shortcut.

### 8.2 Preserve algorithm differences

A common execution system must not turn every calculation into the same
algorithm:

- **Rune Optimization:** resolve profile and one-run overrides; admit candidates
  through the single source policy; generate legal craft variants; perform
  proven exact reductions; apply the declared depth cut; run branch-and-bound;
  merge using one comparator; re-read final builds with the stat sheet and
  held-stock allocation. Exactness is relative to the retained candidate pool;
  a depth cut or time stop must never be presented as a proof of a global best.
- **Rune Clean-up:** derive role weights and calibration, evaluate current and
  potential value, count deterministic seeded outcomes where needed, then
  apply verdict and sale protection. The craft credit is one user setting
  (Settings › Gems & Grindstones) read by every rune judgement at once, never
  a per-page toggle. Protections can change a
  sell decision without invalidating the underlying mathematical answer.
- **Craft advice:** enumerate legal states through the craft owner, compare
  before and after using the same ruler, then allocate/recommend under the
  relevant stock assumptions. Optimizer spending choices remain its separate
  question. Never duplicate craft legality inside either algorithm.
- **Artifacts:** calculate one pair score under one complete scoring-settings
  value; produce the bulk matrix with the same rules; recover conversion detail
  and allocate by the documented highest-pair policy. This is deliberately not
  maximum-total assignment. Whole percentage-point comparison and the obtained
  order tie-break are part of the model, not display formatting.
- **Relics:** derive reach chance, expected strength and final-level
  distribution from one power-up model; derive verdicts and monster plans from
  those answers. Keep user synergy overrides separate from the shipped table.
- **Speed Tuning:** compose a team snapshot and the question to investigate;
  run the shared turn clock at candidate display speeds to derive intervals.
  Do not replace simulation with an independent interval formula.
- **Rune Simulator:** generate legal drops, then invoke the real Clean-up
  pipeline at checkpoints. It must not become an alternative verdict model.

Scores may exceed 100%; probabilities and shares retain their own bounds.
External game-mechanics authority remains
[Calculation Authority](./CALCULATION-AUTHORITY.md). This proposal changes
ownership and execution, not any formula or calibration.

## 9. Import is a transaction with an explanation

Both file and helper adapters deliver a source envelope to the same import
use case. Their transport differs; the accepted account and counts do not.

### 9.1 Pipeline

1. Read bytes locally and decode JSON into `unknown`. Keep filenames and helper
   instance/session/revision metadata separate from account fields.
2. Resolve known containers and their documented precedence. In particular,
   an explicitly empty root shrine collection wins over nested alternatives.
3. Decode entities through their current readers. Validate identities,
   quantities, stat encodings and supported vocabularies. Merge account-level
   and engraved duplicates according to the existing ownership rules; refuse
   forbidden Scenario duplication and contradictions.
4. Validate relationships and construct observed presets/placements. Preserve
   meaningful missing references and reported pool conflicts as defined by
   the preset contract.
5. Remove only semantically established non-holdings, such as validated
   zero-quantity remainder stacks. This is not a general skip-invalid-records
   stage.
6. Build typed collections and indexes. Reconcile each source holding with its
   canonical collection and reachable representation. Record the original
   entity path in any failure.
7. Persist the accepted workspace snapshot. Publish it to subscribers only
   after the transaction succeeds. Keep the previous account on failure.

Use a structured result instead of a single boolean:

```ts
type AccountImportResult =
  | { kind: 'accepted'; account: AccountSnapshot; notices: ImportNotice[] }
  | { kind: 'rejected'; issues: ImportIssue[] };

type ImportIssue = {
  collection: string;
  sourcePath: string;
  entityId?: string;
  field?: string;
  code: ImportIssueCode;
  explanation: string;
};
```

User copy is rendered from issue codes and context. Diagnostic details remain
local; reporting does not automatically send a raw account anywhere.

**Rationale:** import parity is a relation between the source and every usable
representation. Validating only that JSON looks plausible cannot establish it.
Structured issues make a new game encoding diagnosable without weakening the
reader.

**Implementation review, November 14 — R2 [P1; resolved in §24.1]: contradictory copies of one
item pass ingestion.** `firstMisplacedItem` in
`app/ingest/game-export.ts` compares account-level and monster-level placement,
but does not compare the physical facts of their repeated item ID.
`completeEngravedCollections` then keeps the account-level copy while leaving
the different monster-level copy inside `unit_list`. In the optimization
fixture, changing only the account-level rune `5001` to `upgrade_curr: 0`
while its monster copy remains at `12` passes validation. The published typed
collection says level `0`; the accepted monster record says level `12`.
Both representations remain reachable by domain consumers, so de-duplication
has not established one accepted fact per physical item. Reconcile repeated
rune/artifact/relic records through one owner, refuse contradictory facts with
both source locations, and derive monster gear from that canonical collection.
Hold agreement with a contradictory-duplicate fixture, rather than checking
only that the ID was counted once.

### 9.2 Live capture is not always a complete observation

Keep helper connectivity, snapshot validity and capture coverage separate.
A connected helper can expose an acceptable latest snapshot while also
reporting unreadable changes since login. That does not make the account
complete, and does not require throwing away later readable changes.

Retain the current two-pass rule in the helper:

- The read pass applies only proven current-account mutations/current-state
  observations reached through authorized response paths.
- An independent unread pass detects evidence of missed account changes
  elsewhere, applies none of it, and preserves a visible coverage gap.

Known historical, preview and opponent containers are neither current holdings
nor arbitrary recovery sources. Do not recursively find every object that
resembles an item and import it. A plausible ID does not prove ownership or
freshness.

`CaptureCoverage` carries the misses and their causes independently of the
browser's import result. Continue showing the last valid accepted account,
show what is missing, and accept subsequent valid observations. Only a source
that actually restores completeness may clear a gap. See
[Live Import Coverage](./LIVE-IMPORT-COVERAGE.md).

### 9.3 Direct import controller

Move polling and mode policy out of React effects into a controller with
`start`, `stop`, `refresh` and a subscription. React starts/stops its lifetime;
the controller owns the workflow.

It tracks the selected route, live/on-load mode, helper instance/session,
last accepted snapshot token, last rejected token and pending refresh. Permit
one refresh in flight and coalesce another request. Ignore callbacks from a
controller stopped by a route change or workspace disposal.

Live mode accepts new observations continuously. On-load mode accepts once
per game session, with explicit local reload support. Report a deterministic
rejection once per token while keeping its notice visible; a healthy connection
must not erase a different rejected snapshot. Persist before marking a token
accepted. Never ask the game to repeat an operation.

The helper revision token is a source observation identifier, not a JASWA
schema version or a compatibility mechanism.

**Implementation review, November 14 — R3 [P1; resolved in §24.1]: stopping the controller does
not invalidate an import already saving.** `refresh` in
`app/workspace/direct-import-controller.ts` checks its configuration after
`await importAccount`, but that command has already published the account.
`workspace-store.ts#importAccount` checks the import route only before
`await repository.saveGame`. Reproduced by holding that save pending,
stopping the controller and selecting the file route, then completing the
save: the workspace is on the file route with the stopped helper import
newly installed. Switching live/on-load modes during the same window has no
command-level generation check either. Carry source/configuration validity
into the serialized import operation and define a cancellation/commit boundary
that keeps storage and published state together. A callback check after the
command returns is too late. Extend the stop test to cover a pending repository
commit, not just a pending profile fetch.

## 10. Application commands, state and persistence

### 10.1 A small explicit application store

Use one framework-independent workspace store with immutable snapshots,
`getSnapshot`, `subscribe`, and typed commands. Connect React through
`useSyncExternalStore` and focused selectors. This is sufficient for the
current scale; no state-management dependency is necessary to establish the
boundary.

The application snapshot contains readiness, the accepted account, durable
decisions, local account changes and persistence status. Calculation state is
owned by calculation controllers and selected through their APIs. Dialog
drafts and pointer state stay local to components.

Expose commands such as:

```text
restoreWorkspace()
importAccount(candidate)
removeImportedAccount()
changePreferences(sectionUpdate)
saveMonsterProfile(scope, monsterId, statement)
saveOwnPreset(preset)
engraveBuild(contextId, monsterId, build)
setRuneLock(contextId, monsterId, runeId, choice)
editObservedPreset(contextId, change)
```

Commands call pure domain functions, validate current preconditions and use a
repository port to commit changes. Screens do not receive arbitrary setters
for the account record. Overlapping commands must evaluate against the latest
committed state rather than a stale React closure.

**Rationale:** central writes are already a project strength. Giving them an
application home removes their dependence on the lifetime and render state of
`Home()` without scattering persistence into components.

### 10.2 State lifetimes

| State | Lifetime | Owner and storage |
| --- | --- | --- |
| Accepted account and its local account changes | Until replaced/removed | Workspace repository in IndexedDB |
| Import-scoped locks and first-placement records | Current import, with documented live-lock exception | Same committed account workspace |
| Roles, profiles, settings, user presets, priorities, craft choices and synergy overrides | Durable user choices | Preferences repository; IndexedDB plus synchronous safety mirror |
| Export-folder handle | Durable local browser capability | Own IndexedDB record; excluded from `.sw` |
| Current page, table filters and disclosures | Current tab | Validated session adapter |
| Sort order, open overlays, drafts, focus, notices and drag state | Temporary | Shell/component state |
| Resolved profiles, indexes, stat sheets and rows | Derived | Pure queries and bounded memoization |
| Job progress and held calculation answers | Temporary, reusable while relevant | Calculation controller and bounded result memory |

The table summarizes [Local Persistence](./LOCAL-PERSISTENCE-CONTRACT.md).
For example, Gems & Grinds view choices are explicitly durable even where
ordinary table filters are session-scoped. Do not infer lifetime just from the
kind of control.

### 10.3 Persistence protocol

The browser adapter is the only module opening `jaswa-local` or touching its
preference mirror. Keep one workspace object store initially. Repository
methods expose operations, not raw database handles.

Restore account and preferences independently: a failure to read the account
must not bypass restoration of intact preferences. Decode every stored value
at the boundary. Account input follows the strict current account contract;
preferences follow per-choice readers. Never reject a complete preference
document because one setting is invalid or absent.

For committed preference changes:

1. Apply the update to the latest validated preferences.
2. Write the synchronous preference mirror before displaying the new choice.
3. Queue the IndexedDB write after earlier preference writes using an immutable
   snapshot. An earlier failure must not poison later saves.
4. Report persistence failures honestly. A mirror failure reduces durability
   protection; do not silently treat it as equivalent to a successful mirror.

Preserve the current newest-copy reconciliation rule and documented preference
aliases needed to keep actual existing choices. This is a narrow obligation,
not permission to add general historical application formats or migrations.

For account changes, wait for the IndexedDB transaction before publishing the
new effective account. When a command changes account-local records and user
presets together, commit their IndexedDB records in one transaction and publish
one state transition. One possible mirror protocol uses a pending commit
record containing before/after preference values and a local commit token:
recovery selects after only when that token is present in the committed
workspace, otherwise before. The token identifies a write, not a data format.
Keep recovery inside the repository adapter and test interrupted writes
explicitly. §22.2 establishes the existing command that needs this guarantee
and the conditions for choosing a simpler post-commit mirror instead of this
pending-record design. Ordinary preference-only edits retain their simpler route.

**Tradeoff:** cross-record atomicity and the synchronous mirror require careful
recovery design. This is preferable to allowing a local engraving to survive
partly in the import and partly in user presets. It is not a reason to build a
general transaction framework throughout the domain.

`.sw` export contains durable portable preferences only, through the same
validated readers used at startup. An account import is not silently included.
Folder handles, caches, device detection, session state and draft edits do not
travel in it.

**Implementation review, November 14 — R4 [P1; resolved in §24.1]: a preference-file load races
ordinary preference edits.** `replacePreferences` in
`app/workspace/workspace-store.ts` saves the replacement before publishing it;
`changePreferences` remains enabled and evaluates a following edit against the
old on-screen document. The adapter orders the database writes, but cannot
recover replacement fields missing from that later full snapshot. Reproduced
with the real browser-storage adapter and `fake-indexeddb`: start a replacement
setting hardware acceleration to `false`, then select the direct import route
before it finishes. After both writes, the screen says file route/acceleration
off, while restoration reads direct route/acceleration on. The replacement
lost a field in storage and its completion hid the newer click on screen.
Give replacement and incremental edits one command ordering/rebase policy,
and test a preference edit during a pending `.sw` load through the store and
adapter together. Serializing database writes alone does not meet §§10.1 and
22.2's latest-committed-state guarantee.

### 10.4 Multiple tabs and account changes

Define concurrent writing deliberately. For a fresh build, use one writer per
origin for durable workspace commands, coordinated through a browser lock;
other tabs can read and display a clear read-only status until they acquire
the writer role. Notify them to reload committed state through a same-origin
channel carrying an invalidation signal, not raw account payloads. If writer
coordination is unsupported, enforce the single-writer restriction visibly
rather than silently accepting competing mirrors.

This is a proposed concurrency policy, not a claim about current behaviour.
It avoids pretending that timestamp-based mirror reconciliation merges edits
from two tabs. Development and production remain separate origins/workspaces.
No multi-account manager is required: there is one active imported account.
On replacement, clear account-derived caches and re-resolve references without
deleting durable user choices merely because their copy IDs are absent now.

**Implementation review, November 14 — R5 [P1; resolved in §24.1]: takeover permits writes
before the new writer has restored the previous writer's choices.** The role
callback in `app/workspace/workspace-store.ts` first publishes `writer` and
then starts an asynchronous `restore`; `ready` remains true, and neither
preference commands nor `requireWriter` wait for that restore. Reproduced with
a deferred takeover read: the previous writer's latest choices have hardware
acceleration off, but the reader still has it on. A route click during takeover
saves the stale on value with the new route, then the pending restore publishes
the older route over that click. One writer lock therefore still allows lost
choices and disagreement between screen and storage. Keep the tab unable to
write until takeover restoration completes, serialize that transition with
commands, and test a click during a delayed takeover read. The current two-tab
browser test waits for the notice to disappear and does not hold this window.

## 11. Calculation jobs and trustworthy acceleration

### 11.1 Separate question, execution and presentation

For each calculation define:

1. A pure input builder reading the accepted effective account and relevant
   user choices.
2. A canonical semantic input key.
3. A pure CPU reference algorithm.
4. A typed worker protocol and result type.
5. An optional GPU arithmetic backend and agreement test.
6. A result presenter mapping domain answers to rows and explanations.

The key contains mathematical dependencies, not a whole preferences object.
Presentation filters, formatting and disclosure state cannot change the
answer. A recalculation policy changes when work runs, not its key. Rune roles
can affect optimizer Gem tie-breaks, so their relevant content belongs in that
optimizer key. Role ordering remains significant when it breaks ties.

Use content fingerprints or deterministic structured keys, not the import
timestamp alone: a fresh identical observation need not discard reusable
answers. Keys are local transient cache identities, not application versions.
Initially keep bounded in-memory caches; persistence would introduce another
read contract without a demonstrated need.

### 11.2 Lifecycle and worker messages

Represent a job's activity independently from its held answer. A useful state
has `activity` (idle, running, stopped or failed), an optional held result with
its input key, and current progress/error. Derive staleness by comparing the
held result key with the current question key. Do not store both an answer's
inputs and an independently mutable `isFresh` flag.

Worker messages carry a request ID and use tagged alternatives:

```text
request:  prepare | calculate | stop | cancel
response: phase | progress | partial | result | failure
```

Only the matching live request may publish an answer. Disposed controllers
unsubscribe and cancel work. A shared worker killed to cancel one task must
not fail unrelated subscribers silently; isolate tasks or resubmit unaffected
requests, as the current cancellable worker already supports.

Cancellation has two intentional forms:

- Ordinary calculations discard unfinished work and preserve the answer held
  before the run began.
- Rune Optimization's Stop retains builds found in that run. Leaving its
  workspace or superseding it cancels obsolete execution.

Auto-recalculation is an application policy: no unsolicited initial run, no
parallel reruns for every slider movement, no automatic loop after failure,
and no immediate restart of a question the user just cancelled.

### 11.3 Worker scheduling and memory

Keep preparation once per optimization request, then partition the prepared
problem across workers. Reuse the current proven ordering and merge strategy.
Relay a shared best bar within that job, never between different questions.

Introduce a small shared worker-budget coordinator. A multi-core calibration
and an eight-worker search must not each assume they own every core. Reserve
capacity for the page, prioritize explicitly requested foreground work, and
allow low-priority preparation to wait. Bound prepared-problem and result
memory by measured size/count and release it on account replacement.

Use transferable typed buffers where ownership can be transferred safely;
otherwise clone the prepared representation. Shared mutable memory is an
optimization to justify with measurements, not a starting requirement. Do not
add cross-origin-isolation dependencies merely to obtain it.

**Implementation review, November 14 — R6 [P2; resolved in §24.1]: worker budgets are still
independent per calculation.** `poolSize` in
`app/workspace/jobs/rune-calibration-client.ts` claims up to all but one core;
`searchWorkerCount` in `rune-optimization-client.ts` independently claims up
to eight. `createJobRuntime` supplies request routing/cancellation, but no
shared capacity reservation or foreground priority, and the injected factories
in `app/platform/feature-workers.ts` construct workers directly. Consequently
the clients can each reserve the same spare cores; moving construction behind
a port did not implement this section's coordinator. This is a source-level
implementation gap, not a measured slowdown. Add the shared budget at the
workspace/runtime boundary, retain the existing calibration leases and search
partition strategy, and verify simultaneous job requests against one total
worker limit before claiming the execution runtime complete.

### 11.4 One acceleration door

Retain the existing `runAccelerated` design: CPU reference, optional GPU half,
agreement gate and the user's setting. Only this runtime weighs GPU preference
against availability/refusal. Home's hardware-detection result is descriptive
and cannot gate worker execution.

Centralize device acquisition, error scopes, device-loss recovery, buffer
limits and bounded batches. Packing, shader offsets, record strides and
workgroup sizes derive from one layout declaration. Numerical tolerance is
explicit per backend. GPU results must not introduce a different verdict or
tie-break near a threshold; keep policy and final candidate judgement on CPU.

Return execution metadata with every applicable answer: processor, graphics
card, or mixed, plus a refusal reason where useful. Never infer the label from
the setting. Hardware-dependent parity tests remain distinct from headless
CPU/structural checks.

**Rationale:** worker transport, lifecycle and device plumbing are reusable.
Search heuristics, calibrated probabilities and artifact allocation are not.
Share the former without forcing the latter into an all-purpose calculation
engine.

## 12. Screens, queries and the visual system

Each feature folder contains its screen, local editors, selectors/presenters,
hooks and CSS module. A screen reads application queries and dispatches typed
commands. It does not read raw JSON, open storage or import another screen to
borrow its calculation.

Query functions compose domain outputs into view models. For example, an
artifact row receives its score and marks from one judgement and formats them;
it cannot separately classify preferred properties. A rune's location label,
engraved filter and sell protection share one placement summary. Formatters
receive the user's regional settings rather than reading global storage.

### 12.1 Shell and overlays

Keep the page registry and explicit navigation commands in the shell. Preserve
the current page/history/session semantics; URL routes are not required to
establish modularity. Lazy-load feature screens and their large data/algorithm
dependencies.

The root mounts shared overlays once, consistent with the current overlay
contract. The overlay controller owns targets, allowed stacking, opener
elements, Escape behaviour and focus restoration. A speed-team overlay may
remain under a monster overlay, and statistics may remain over the monster
that opened them. Changing page closes overlays from the previous page.
Opening an overlay does not navigate or change browser history.

### 12.2 Shared components and CSS

Preserve the visual vocabulary in global tokens and voice selectors: IBM Plex
Sans, tabular figures, four text tones, the spacing scale, gold as action and
the documented narrow exceptions. Keep shared component styles with those
components; feature layout belongs in feature CSS modules. A feature class
joins a declared type voice instead of inventing font size/weight.

The shared UI owns button dimensions, label swaps, calculation actions,
accessible dialogs, row openers, table sort controls, figure marks, rune lines
and the permitted quality rule. Centralize only genuinely common behaviour.
Do not build a universal table schema that hides domain-specific columns and
explanations behind dozens of flags.

Inclusive filters use the same pure selection rule: empty and all-selected
both mean unrestricted; a proper non-empty subset narrows the results. Preserve
the actual control selections. A filter may narrow displayed rows but never
alter the score of a retained row or account totals.

Reserve space for alternative labels, progress, marks and large figures before
interaction. Selected states use fixed-size marks/tones, not changed words or
font weight. Check empty and full states, keyboard access, long names, large
numbers and before/after boxes. Respect reduced motion.

**Rationale:** stable presentation and accessibility are architectural contracts
when every feature depends on them. Reusing the right primitive prevents whole
classes of regressions more effectively than fixing each screen separately.

## 13. Reference data and model evidence

Ship public reference snapshots with the application. Separate three kinds of
knowledge:

- **Observed game facts:** item encoding, catalogue entries, captured statistics
  and sourced enemy values.
- **Game-mechanics models:** the authoritative formulas recorded in the
  subject contracts.
- **JASWA judgements:** worth factors, main-stat need assumptions, synergy and
  search heuristics, explicitly identified as such.

The reference accessors are the only runtime interpreters of their snapshots.
An enemy value absent from its source is unknown, not borrowed from a nearby
floor. Statistics identify species, not owned copies. A top-ten build share
retains its documented denominator; it is not a complete population share.

Maintenance scripts perform deliberate public-data refreshes using the
existing rate limits, validation and atomic writes. Browser imports and page
views never query Swarfarm. Statistics collection remains passive observation
of panels the user opens; a maintenance script must not originate game
requests to fill missing rows.

For every nontrivial rule, its subject document records source, interpretation,
assumptions, implementation owner and verification. Keep this evidence close
to the rule's maintenance workflow. This analysis links the authoritative
documents rather than restating all roll tables and formulas into a competing
specification.

## 14. Windows helper and distribution

### 14.1 Helper boundaries

Keep Rust/Tauri and the separate dashboard build. Structure the backend into:

1. **Transparent transport:** carry original application messages unchanged;
   capture copies and surface framing/decoding failures.
2. **Protocol decoding:** interpret only passively available messages. An
   unreadable encrypted response stays unreadable and visible; no key
   negotiation, memory reading or authored refresh is permitted.
3. **Account projection:** apply proven current changes and independently track
   missed changes, with the ownership/freshness rules from live coverage.
4. **Read-only loopback API:** serve health, source session/revision, coverage,
   snapshot and local export to explicitly allowed browser origins. It exposes
   no game mutation endpoint.
5. **Windows lifecycle:** game detection, temporary redirect, certificate
   provisioning/trust, cleanup, tray and installation concerns.
6. **Diagnostics:** non-private routine status; private capture evidence only
   through explicit local reports with controlled lifetime.

Do not collapse the Rust account projection and browser domain into one
cross-language rule engine. They answer different questions: the helper
maintains what the game currently said; the browser validates and evaluates
the account. A shared set of sanitized input/output fixtures should test their
boundary, particularly ownership, containers and counts, so unavoidable
cross-language decoding knowledge cannot drift unnoticed.

From scratch, isolate privileged hosts-management operations in a small broker;
run capture, account projection and the WebView unelevated. The broker accepts
only narrowly defined setup/cleanup operations, no arbitrary commands, paths or
game payloads. Specify authenticated local caller access and ownership of the
redirect/certificate before implementation. This follows the remaining
privilege-split work recorded in `helper/README.md`.

**Tradeoff:** this adds a local IPC boundary and recovery work. It reduces the
privileged surface of a network decoder and dashboard. It does not remove the
capture mechanism's need for Windows integration tests, certificate trust,
crash cleanup or signed installers. These cannot be proven by browser mocks.

### 14.2 Hosting and offline behaviour

Retain static hosting and the small artwork Worker. The Worker accepts public
artwork requests, enforces valid paths/methods and returns a real 404 for
missing images. It never receives account JSON, preferences or calculation
inputs. Local missing artwork has a stable placeholder.

Treat service-worker caching as distribution, not user-data persistence. For a
fresh build, generate a manifest from emitted assets so an installed shell and
its required code are cached together. Limit navigation fallback to navigation
requests; never return HTML as an offline image, script or worker module.
Exclude helper/loopback traffic and private reports. Apply an available new
shell at a safe reload point after durable writes settle and active jobs stop.
Use asset content hashes/cache identity for delivery, not a stored application
schema or data migration field.

The current network-first service worker is not proof of complete offline
installation: assets not yet fetched may be unavailable. The proposed manifest
and fallback policy make that guarantee explicit and testable.

Keep helper installer version/signature/release metadata: it identifies an
installed executable, which is distinct from prohibited JASWA data-format
versions. Follow the existing helper release gate when changing helper code.
Public artwork upload and application deployment remain explicit publication
operations. A push to `main` deploys the site under the current contract.

Keep validation and publication as distinct pipelines. A validation pipeline
uses the Node major in `.node-version`, installs locked dependencies, runs
typecheck/lint/build and the applicable tests, and reports unavailable private
capture/device checks explicitly. Publication consumes the validated build
under the repository's explicit publishing policy. It does not become a second
place to define application behaviour.

This holds today. The former `.github/workflows/deploy.yml`, which pinned
Node 22 beside a second deploy path, is gone: `.github/workflows/validate.yml`
validates on the Node major in `.node-version` (26 LTS), both `package.json`
manifests require at least 26, and Cloudflare Workers Builds is the one routine
delivery path. Node scripts run TypeScript through Node's own type stripping
and `scripts/json-module-hook.mjs` (`module.registerHooks`), without
experimental flags or suppressed warnings that could hide a deprecation.

**Implementation review, November 14 — R7 [P2; resolved in §24.1]: the active shell can serve
the previous build's mutable public assets.** The fetch handler in
`scripts/sw-template.js` calls unscoped `caches.match(event.request)` for every
asset. Activation deliberately retains the previous shell, whose cache was
created first. Stable URLs such as `/manifest.webmanifest` and the PWA icons
therefore match the older cache even when the active build has precached new
contents. A VM probe of the actual handler with previous/current caches
returned the old manifest without consulting the new cache or network.
Look in the active shell cache first; use previous shells as fallback for
absent hashed chunks and keep artwork in its own cache. Test changed contents
at an unchanged public URL across two installations. The current check covers
the injected list and the response-cache predicate, not cache lookup order.

## 15. Worked flows connecting the parts

### 15.1 Import a file into an empty workspace

Home dispatches file selection to the file adapter. The import use case receives
the decoded candidate and source metadata. Ingestion prepares typed account
collections and an import report; no valid collection is published halfway
through. The repository stores the accepted observation with empty local
account changes. The workspace store publishes it, account indexes are derived,
and Home/counts/features read the same collection identities. Existing user
choices remain intact. Invalid input leaves the workspace empty with a useful
issue explaining the collection and field.

### 15.2 Save a profile and optimize a monster

The monster dialog edits a draft. Save dispatches a statement for one copy and
scope through the preference route. The query resolves that statement with
reference evidence and passes requirements to the optimizer. One-run overrides
remain separate from the saved profile. The input builder resolves context,
pool sources, stock and effective combat inputs, computes the semantic key and
submits a job. Workers prepare once and search their shares. The result carries
its key, completeness/cut/stop information and actual backend. Filters only
change which result rows are visible.

### 15.3 Engrave a returned build locally

Engrave is a command, not a row callback mutating JSON. It re-reads the latest
context and verifies membership, item availability, locks, pool policy and
craft assumptions. If the account changed since calculation, it either proves
the chosen build is still valid through this re-reading or refuses with a
specific explanation; a stale number alone is not authority to commit.

The command calculates the full local placement change, including taking a
rune off affected pool holders and freezing all members' gear where required.
It records a first observed location once and commits every affected durable
record together. Only then does the UI publish the new effective state. Every
stat sheet and location query updates from that projection. No game request is
made. A failure leaves the preceding plan visible.

**Implementation review, November 14 — R8 [P1; resolved in §24.1]: Engrave does not enforce
the command preconditions described above.**
`app/workspace/workspace-store.ts#engraveBuild` accepts only preset, monster
and rune IDs. It does not read `withheldRunes`, locks or the build's craft
assumptions. For imported presets, `checkBuild` in
`app/domain/placements/engrave-rune-build.ts` checks existence and unique
slots; the own-preset branch does not call even that check. In a store probe
using the optimization fixture and *Only runes not engraved in preset*, rune
`5001` is withheld from monster `12`, but `engraveBuild` still takes it from
monster `11` and commits it on `12`. Locking that rune to `11` first does not
prevent the move either: the command moves it and drops the now-broken lock.
The existing `currentBuilds` check in the screen protects its current render,
not a queued command after a lock, stock, account or preference change. Pass
enough build/question information for the
command to invoke the shared revalidation against its latest state; refuse
invalid candidates before changing either durable record. Hold this with a
store test that changes availability after the rendered build was validated
and before engraving executes, including own presets and a failed save.

### 15.4 A helper update arrives during a calculation

The controller checks route/mode and source token, validates and commits the
new observation, preserves only the documented live locks, and resets replaced
import-local changes. The job's question key now differs. Its old answer may
remain visible as stale under the feature's policy, but cannot overwrite a
newer request. Manual mode waits for Calculate; permitted auto-refresh coalesces
to the latest question. A capture miss stays in the coverage notice even when
the update and connection are otherwise healthy.

### 15.5 Restore preferences after a contract changes

The repository selects/reconciles the stored preference copy and invokes the
composed section readers. One invalid numeric setting defaults; valid roles,
presets, import mode and all other fields survive. A deliberately empty role
list stays empty. An absent new setting takes its default. The file reader uses
the same path. Nothing adds a schema-version branch or rewrites unrelated
choices to their shipped values.

## 16. Verification and enforceable boundaries

Architecture should fail checks when bypassed. Establish these checks at the
start of the build:

| Test layer | Required evidence |
| --- | --- |
| Import graph | Domain/algorithms cannot import React, adapters, raw export readers or browser APIs; feature folders cannot import each other's internals; no dependency cycles |
| Ownership structure | Only declared modules read craft tables, sum monster stats, define turn-clock rules, open storage or select acceleration |
| Pure domain | Empty/full inputs, blank versus zero, duplicate identity, legal item states, missing facts, score growth above 100%, pool rules and profile provenance |
| Independent algorithm oracles | Small brute-force optimizer versus reductions/search; artifact readers agreeing; relic recurrences versus independent calculation; deterministic chance/calibration checks |
| Import parity | Source holdings reconciled entity by entity, including quantities, placements and reachability; malformed/unknown meanings fail visibly |
| Application integration | Import persist-before-publish, command serialization, mirror recovery, two rapid changes, interrupted cross-record commit, route switches and stale async responses |
| Worker integration | Progress, latest-request publication, cancellation isolation, optimization Stop, failure recovery and shared worker budgets |
| GPU structure and device | Shared layouts/routing plus actual shader agreement and whole-job parity on a real card |
| Browser behaviour | Empty and populated workspaces, persistence/reload, filters/sorts, overlays in place, focus return, keyboard access and stable before/after geometry |
| Helper core | Current-account paths, history rejection, independent misses and byte-for-byte relay preservation |
| Windows/distribution | Trust, privilege split, crash restoration, actual game TLS, signed install/uninstall and offline shell integrity |

Use sanitized committed fixtures for deterministic tests. Real account exports,
traffic captures and private test artifacts remain local. A parity run without
a capture is a skip; a CPU headless run is not a shader test. Publish an explicit
pass/fail/skip/not-run summary rather than interpreting exit zero as complete
coverage.

Run browser checks against `http://localhost:3000/`, probing and reusing a
working existing server first. Use the installed Playwright. Module-reading
verification owns an isolated temporary Vite cache and starts no competing
preview/HMR server; retain [Verification Isolation](./VERIFICATION-ISOLATION.md).

Keep existing named domain checks available while organizing their ownership.
Examples include `verify:preference-survival`, `audit:import-parity`,
`verify:artifact-score-agreement`, `verify:rune-craft-single-source`,
`verify:rune-optimization`, `verify:speed-tick` and the `-card` checks.
Organizing tests must not weaken their independence or turn a failure into a
skip. A fresh Clean-up baseline is still required for a model change.

## 17. Build order for a new implementation

Build vertical slices that prove the boundaries before adding every screen.
The phases below are dependency order, not an estimate or an authorized
rewrite plan.

| Phase | Build | Done when |
| --- | --- | --- |
| 1. Contracts and skeleton | Domain vocabulary, source tree, import rules, tokens/voices, test harness and sanitized fixtures | Boundary checks run and the empty shell renders at localhost:3000 |
| 2. Account slice | Typed ingestion, canonical collections/indexes, counts and a minimal reachable inventory for every holding type | Empty/full fixtures and a malformed record show accepted/rejected outcomes; parity has no silent exclusions |
| 3. Local durability | Repository, preference readers, write mirror, restore, `.sw`, session state and writer coordination | Valid choices survive malformed neighbours, reload, rapid edits and interrupted writes |
| 4. Placement slice | Scenario, game/own presets, pool relations, missing references, immutable observation and local overrides | One rune in several contexts is represented once physically; conflicts remain visible; local commands commit atomically |
| 5. Monster/profile slice | Catalogue, names, storage, profile resolution, stat sheet, main-stat advice and shared monster overlay | Overview and overlay read identical figures; empty/deleted roles and unknown facts remain usable/explained |
| 6. Job slice | One complete CPU job through descriptors, workers, lifecycle and common actions | Cancellation retains the right answer; stale jobs cannot publish over new requests; UI remains responsive |
| 7. Artifact slice | Pair score, conversions, bulk matrix and allocation, then views | Every view agrees on score/settings, including zero and above-100% scores |
| 8. Rune judgement slice | Craft end states, roles/weights, calibration, chance, Clean-up, craft advice and simulator | Independent math, craft single-source and deterministic judgement checks pass |
| 9. Search and speed slice | Exact optimizer stages, reported cut, parallel search, stock allocation and speed analysis | Brute-force comparisons and shared-stat/clock agreement pass; stop/engrave flows work |
| 10. Relic slice | Power-up model, synergy choices and monster plan | Distribution, verdict and destination checks agree and engraving capacity is respected |
| 11. Direct import slice | Helper fixture contract, controller, read/unread projection, platform separation and signed packaging | Replay and byte-preservation tests pass; real Windows capture/recovery is verified before claiming it ready |
| 12. Acceleration and delivery | GPU backends one at a time, memory budgets, offline manifest and static artwork delivery | Actual device parity and offline/update checks pass; every refusal is visible |

CPU correctness precedes GPU optimization. File import precedes live capture
so the product and its domain can be exercised without platform privileges or
a running game. Shared placement/stats precede search because search otherwise
starts with an incorrect model. Reference data is introduced as each slice
needs it, always through its accessor.

Before implementing a slice, turn its existing subject contract into a list
of accepted inputs, invariants, outputs, failures and independent checks. That
is the detailed behavioural specification supplementing this structural
blueprint; a new developer should not reconstruct formulas from screen code.

## 18. Mapping existing code into the proposed structure

| Current home | Proposed owner | Preserve while changing structure |
| --- | --- | --- |
| `app/page.tsx` | Shell composition plus application controllers/commands | Single write routes, route/mode semantics, shared overlays and focus return |
| `file-imports.ts` | Account ingestion, preference readers, file adapter | Strict entity validation, prepared counts and per-choice preference survival |
| `browser-storage.ts`, `save-location.ts` | Browser repository and file adapters | One database opener, ordered writes, mirror, handle privacy |
| `types.ts`, raw `game-data.ts` usage | Domain models and ingestion-only raw types | External identity semantics and explicit unknown values |
| `presets.ts`, `deck-presets.ts`, `rune-placement.ts`, `rune-sources.ts` | Placements plus game-export decoding | Scenario/preset distinction, pools, missing references and one source policy |
| `engrave-rune-build.ts`, `game-preset-edits.ts` | Application commands and pure local-change reducers | Existing local planning behaviour and atomic affected-context updates |
| `monster-preferences.ts`, `monster-defaults.ts`, `monster-preference-resolution.ts` | Profiles and reference accessors | User-first resolution, content scopes, clears and provenance |
| `monster-stats.ts`, bonuses, `main-stat-model.ts`, `speed-tick.ts` | Combat and main-stat/turn-clock owners | The existing single calculations and authority |
| Rune cleanup/optimization/simulator modules | Rune domain plus focused algorithms | Craft credit, sampled quality, exact reductions and declared heuristics |
| Artifact/relic modules | Their domain owners and calculation jobs | Shared score, conversion, allocation and power-up semantics |
| `app/lib/compute/` | Compute runtime, typed jobs and GPU backends | Existing agreement gates, layouts, cancellation and actual backend reports |
| `app/components/` | Features, shell and shared UI | Controlled editors and reusable visual/accessibility contracts |
| `globals.css` | Tokens/voices/base plus scoped layout | Existing appearance and fixed interactive dimensions |
| `app/data/`, refresh/collection scripts | Reference snapshots, accessors and maintenance | Evidence, rate limits, passive statistics capture and atomic refreshes |
| Helper backend/dashboard | Separate helper with narrower platform privilege | Proven protocol/profile logic and passive boundary |
| Hosting Worker and public assets | Delivery boundary | Static app, R2 artwork, private account processing and explicit publication |

This is a responsibility map, not an instruction to mechanically move files.
Extract a coherent module with its tests and public API. Renaming folders alone
does not remove raw-data leakage, duplicated policy or stale-state races.

## 19. Alternatives and tradeoffs

| Alternative | Assessment |
| --- | --- |
| Remote database and calculation backend | Adds account transfer, authentication and operations while conflicting with the local-data promise; no current product requirement justifies it |
| Microservices per item type | Adds serialization and deployment boundaries to rules that must be composed locally and agree synchronously |
| Server rendering as the primary architecture | The essential state is private browser data and the expensive work is local; a server render cannot supply the workspace |
| Put the entire product inside the helper | Couples ordinary file users and UI releases to Windows capture/install privileges; retain the browser product and optional helper |
| One folder per page with private math | Convenient initially, but scores, placement rules and craft assumptions drift between views |
| A generic entity/gear/rules framework | Runes, artifacts and relics have materially different slots, scoring, sharing and improvement models; share precise primitives instead |
| An event log as the durable workspace | Adds replay and historical-contract responsibilities without an audit/history requirement; use current snapshots and explicit local overrides |
| A large global state library | May be introduced for a demonstrated need, but it cannot establish ownership or correct persistence by itself; a small typed store is sufficient initially |
| GPU-first algorithms | Loses the independent reference and makes hardware availability a correctness dependency; begin with CPU and prove GPU arithmetic |

The recommended design has costs: more explicit types, an ingestion boundary,
application commands, job descriptors and a local-change projection. Each pays
for a concrete failure mode already reflected in the contracts. Avoid further
abstractions until another genuine consumer or measured bottleneck needs them.

## 20. Acceptance criteria for the proposed architecture

A developer has established this architecture when:

1. A game-shaped field cannot reach a screen or algorithm without passing the
   typed ingestion boundary.
2. The same accepted entity collections drive canonical counts, reachable
   views and calculation inputs; exclusions have explicit reasons.
3. Observed facts, user statements and local changes have distinct owners and
   all ordinary queries see one consistent effective workspace.
4. One module owns each game rule, score and placement policy; architectural
   checks reject competing implementations outside approved GPU arithmetic.
5. Domain rules and algorithms can run in deterministic tests without React,
   storage, workers, network access or a live game.
6. Every durable command has a validated reader, ordered/atomic write semantics
   and an honest failure state; unrelated user choices survive contract changes.
7. Each calculation has one semantic question key, explicit freshness and
   cancellation behaviour, a CPU reference and truthful execution metadata.
8. A screen can be replaced without rewriting import, persistence, formulas or
   worker lifecycle, and a storage adapter can be tested without mounting it.
9. The helper cannot apply a plan or originate a game request, and coverage
   gaps stay visible without suppressing subsequent readable observations.
10. Empty/full behaviour, stable interaction geometry, keyboard/focus behaviour,
    actual GPU execution and Windows integration are separately verifiable;
    skips are reported as skips.

The intended result is a structure where a maintainer can answer three
questions before editing: **who owns this fact or decision, which boundary
accepts it, and which independent check holds its meaning?**

## 21. Second opinion: an independent assessment

### 21.1 How this assessment was made

The same assignment was answered a second time, without treating §§1–20 as
binding: inspect the code first-hand, form a blueprint, and only then compare
it with the proposal above and decide what is most appropriate.

One honest limit: the proposal had been read before the code was inspected.
The independence here is that of a reviewer who re-measures every claim
against the source and reaches each conclusion from that evidence, not that
of someone who never saw the proposal.

The factual claims in §3.2 and §14.2 hold when re-measured: `app/page.tsx` has
1,097 lines, `app/globals.css` 7,546, the Rune Optimization screen 1,025, its
search 1,352 and the Clean-up model 1,267; `.github/workflows/deploy.yml`
selected Node 22 while `.node-version` said 26 (since removed; see §14).

### 21.2 The independent answer, before comparison

Starting from the product and the code alone, I would build:

1. A local-first Vite, React and TypeScript application, an optional Windows
   helper, and static hosting. No account backend.
2. A typed account boundary as *the* central structural decision: raw export
   shape ends at ingestion, and everything after it reads typed collections.
3. A pure domain organized by game subject — account, monsters, runes,
   artifacts, relics, placements, profiles, combat, speed — with each
   expensive procedure living inside the subject that owns its rules.
4. A thin platform layer for storage, files, helper transport, the worker
   runtime and the graphics card.
5. A small workspace store with typed commands; pages read queries and
   dispatch commands.
6. One test runner for domain and integration checks, and architectural
   boundaries expressed as lint rules.
7. Reference data compiled, at refresh time, into the trimmed typed shape the
   application reads.

Points 1, 2 and 5 coincide with the proposal. Points 3, 4, 6 and 7 differ from
it in emphasis or in substance, as §21.5 explains.

### 21.3 Evidence from the code that shaped the answer

| Observation | What it shows |
| --- | --- |
| 65 files under `app/` name `GameRecord` or `ImportedGame` (whose `data` is `Record<string, unknown>`), 27 of them components | The raw export shape is the program's common language. Not every file reads raw fields — some pass the record on — but each is coupled to its shape. This is the largest single coupling in the code base |
| Only `browser-storage.ts` and `session-storage-state.ts` touch `localStorage`, `indexedDB` or `sessionStorage` | Storage is already isolated. Moving it into an `adapters/` folder is mostly a rename, not a gain |
| Six worker clients and eight worker entries. Two clients use `cancellable-worker.ts`; four (`rune-statistics-client.ts`, `rune-advice-client.ts`, `rune-calibration-client.ts`, `rune-optimization-client.ts`) maintain their own worker/channel or pool lifecycles, request routing and cancellation; two components (`craft-item-best-use.tsx`, `use-rune-optimization-work.ts`) construct workers themselves | The shared lifecycle exists but is optional. Preserve the deliberate channel/pool differences while sharing transport and lifecycle mechanisms (§22.4); components reaching for `new Worker` should become impossible |
| `swarfarm-monsters.json` is imported by both `monster-catalog.ts` and `rune-reference-stats.ts`; the three Swarfarm snapshots together hold about 47,000 lines and are imported statically | Catalogue interpretation has two owners. Refresh scripts already trim source records; the remaining improvement is a validated domain shape and one accessor, not introducing compaction for the first time (§22.5) |
| 76 `scripts/verify-*.mjs` checks; `test:domain` is one `&&` chain of about 80 commands; about 35 scripts start a Vite server or transform to load TypeScript (`scripts/verification-server.mjs`) | The project has built its own test runner out of scripts. `AGENTS.md` §7 has to warn that the chain stops at the first failure; a configured runner can report all test failures (§22.6) |
| `eslint.config.mjs` holds one restricted-syntax rule (no raw `<select>`) and no import-boundary rule; single-source rules are checked by scripts that read source text | Ownership is enforced after the fact by bespoke scripts rather than at the moment code is written |
| `helper/src-tauri/src/profile.rs` has 4,754 lines and `service.rs` 2,669 | The largest hand-written files in the repository are in the helper, which §14 discusses mostly at the level of process boundaries |
| Five CSS modules beside 7,546 lines of global CSS | The direction in §12.2 has started; it has not yet become the norm |

### 21.4 Where the assessments agree

Reached independently and kept unchanged:

- Local-first with no remote backend, and the helper as a separate, optional
  executable (§§4, 19).
- A typed `AccountSnapshot` published once by a transactional import with
  structured issues (§§7.1, 9). The evidence in §21.3 makes this the most
  valuable single change.
- Placement as a `(context, item, monster, slot)` relation, and local changes
  as an explicit projection over an immutable observation (§§7.2, 7.3).
- Profiles as stored statements resolved against defaults, with the three
  states kept only where the subject contract distinguishes them (§8.1).
- Per-choice preference reading and ordered writes (§10.3, first half).
- CPU reference, one acceleration door and an honest backend report (§11.4),
  and the two deliberate cancellation forms (§11.2).
- One writer per origin through a browser lock (§10.4): with
  `navigator.locks` this is a few dozen lines and proportionate.
- The rejected alternatives in §19, all of them.

### 21.5 Where I would decide differently

**1. Checks belong in a test runner; boundaries belong in lint.** This is
the main divergence. §16 keeps the named `verify:*` scripts and asks for an
explicit pass/fail/skip summary; a test runner provides that summary natively.
Vitest uses the same Vite transform that `verification-server.mjs` already
starts by hand, so it adds a dev dependency rather than a new toolchain. It
reports every failure in one run, filters to one check, runs in watch mode,
puts tests beside the module they hold, and records a skip as a skip with its
reason instead of an exit code of zero.

Keep each `verify:*` name as a thin alias for its filtered test so `AGENTS.md`,
the subject documents and habit keep working. Express ownership rules as
import restrictions per folder (`no-restricted-imports` or an import-path
rule): "only `domain/runes/craft/` imports the craft tables" fails in the
editor, not after a script reads the source. Keep text-reading checks only
for what an import rule cannot see, such as a formula restated without an
import. Checks that need a real export, the dev server or a graphics card stay
separate scripts.

Why this matters more than §16 implies: JASWA is maintained by one developer
working largely through agents, and an agent follows what fails. Fast,
targeted and complete failure reports are the cheapest way to keep every
other boundary in this document from eroding.

**2. Fewer layers.** §6 has ten top-level folders. The `domain/` versus
`algorithms/` distinction is about cost, not dependency: both are pure, and
neither may touch the browser. Put Clean-up, the optimization search and
craft advice inside their subject, and keep "procedures may use rules; rules
never use procedures" as a lint rule within it. Likewise `adapters/` and
`compute/` are both platform. A compact tree:

```text
app/
  shell/        composition root, navigation, the one overlay host
  features/     one folder per page: screen, editors, presenters, CSS module
  ui/           shared primitives, gear lines, calculation actions
  workspace/    store, commands, queries, restore, import use case, job lifecycle
  domain/       pure: account, monsters, runes (cleanup/, optimization/,
                craft/), artifacts, relics, placements, profiles, combat,
                speed, reference
  ingest/       game export and preference readers; the only raw-shape code
  platform/     storage, files, helper transport, worker runtime, gpu/
  styles/       tokens, voices, base
```

Four dependency rules replace a matrix: `features → workspace → domain`;
`ingest → domain`; `platform` implements the ports `workspace` declares;
`domain` imports nothing above it. A rule that fits in one sentence is one an
agent and a maintainer both keep.

**3. Reference data gets an ingestion boundary too.** §13 makes accessors
the only interpreters; §21.3 shows that rule broken once already. Enforce it by
construction: the refresh script that already fetches and validates Swarfarm
emits a trimmed, typed snapshot per consumer — catalogue, speed skills, PvE
stages — containing only the fields JASWA reads. Runtime code never sees the
source shape, the bundle carries less, and a second interpreter has nothing
raw to read. This is §7.1 applied to the second external source.

**4. One generic job client, not one per calculation.** §11 asks for a
shared job lifecycle; I would make it the only way to start work. A worker
side `defineJob({ key, run })` and a page side `jobClient(descriptor)` own the
worker slot, request IDs, reuse of identical in-flight work, bounded answer
memory, cancellation and the backend report. A calculation then consists of
its pure algorithm, its descriptor and its presenter. A lint rule forbids
`new Worker` outside `platform/`. Specialization stays where §8.2 puts it: in
the algorithm, never in the plumbing. Only jobs that stream partial answers —
Rune Optimization's Stop — need a richer descriptor.

**5. Prove the cross-store case before engineering it.** §10.3's pending
commit token with before/after mirror recovery is correct, but it is the most
intricate mechanism in the proposal and exists for one case: a command that
writes import-local changes and user presets together. First establish
whether a single engrave actually does both. If not, each command writes one
durable document and the protocol is unnecessary. If so, IndexedDB already
commits two object stores in one transaction; the remaining hazard is the
synchronous mirror, and for an account-coupled preference it suffices to
write the mirror after the IndexedDB commit and let the newest-copy rule pick
IndexedDB on disagreement. Choose the smallest rule that survives the
interrupted-write test §16 already requires.

### 21.6 What the proposal leaves implicit

- **Priority.** §17 orders a greenfield build and §18 maps responsibilities;
  neither ranks what to do in the code that exists. The document rightly
  authorizes no rewrite, but it can rank by value per cost (§21.7).
- **The helper's internals.** The six-part split in §14.1 applies first as
  Rust modules inside the existing crate, breaking up `profile.rs` and
  `service.rs`. The privilege broker is a later, separate step with its own
  risks.
- **The cross-language contract, stated as one property.** Replaying a
  recorded capture through the helper yields a snapshot that browser
  ingestion accepts with the same per-entity counts as the matching file
  export, where one exists. Sanitized fixtures carry that property; it is
  sharper than "shared fixtures" alone.

### 21.7 Synthesis: the most appropriate solution

**Final-review qualification:** retain this assessment as the reasoning behind
the amendments, but use §22 for the final decision. In particular, the
cross-record case below has now been established in existing code; its
atomicity guarantee cannot be deferred pending discovery of a use case.

The proposal's target architecture is sound and should stand, with four
amendments — a test runner and lint boundaries, the compact tree, compiled
reference data, and one generic job client — and one deferral: the
cross-store recovery protocol until the case is proven.

The answer to "how would we structure it" is therefore the amended target.
The answer to "how do we get there" is evolution, not a rewrite. JASWA's
value lies in its verified rules and their independent checks, not in its
folder layout, and a rewrite would have to re-earn trust that those checks
already give. `AGENTS.md` permits breaking changes, so the reason is risk to
correctness, not compatibility. Each step below stands on its own and leaves
`main` shippable:

| Step | Change | Why in this position |
| --- | --- | --- |
| 1 | Test runner with `verify:*` aliases, and import-boundary lint | Cheap; makes every later move safe and mechanically checkable |
| 2 | Typed `AccountSnapshot` behind `ingest/`; move consumers one collection at a time, read-only views first | Removes the largest coupling (65 files) and unlocks steps 5 and 6 |
| 3 | Generic job client; port the clients one at a time and forbid `new Worker` elsewhere | Repeated lifecycle code, small blast radius per port |
| 4 | Reference snapshots compiled at refresh time | Independent of everything else; removes a duplicate interpreter and bundle weight |
| 5 | Local changes as a projection over the immutable observation | Needs the typed snapshot to project over |
| 6 | Workspace store and commands out of `app/page.tsx` | Simpler once commands operate on typed state and explicit local changes |
| 7 | Helper modules inside the crate; privilege broker afterwards | Readability first, privilege separation as its own verified change |
| 8 | Feature layout into CSS modules whenever a feature is touched | No big-bang; the global voices and tokens stay put |

The acceptance criteria in §20 stand. Two are added:

11. One test command reports every failure and every skip in a single run.
12. Reference snapshots reach runtime code only in their trimmed, typed form,
    through one accessor each.

## 22. Final review and consolidated recommendation

### 22.1 Verdict on the newer amendments

The architecture is appropriate for JASWA. Keep the local-first product,
typed ingestion, immutable observations with explicit local changes, pure
domain owners and evolutionary implementation. The newer assessment improves
the plan, subject to these specific qualifications:

| Amendment in §21.5 | Final assessment |
| --- | --- |
| 1. Test runner and lint boundaries | Agree. Preserve independent oracles and verification isolation; a runner alone does not aggregate external scripts or browser tests (§22.6) |
| 2. Compact source tree | Agree as the physical layout. Preserve the original dependency boundaries inside those folders (§22.3) |
| 3. Compiled reference snapshots | Agree with one domain-owned snapshot/accessor per coherent dataset. Existing refreshes already compact data; do not duplicate a dataset for every caller or promise an unmeasured bundle saving (§22.5) |
| 4. One generic job client | Agree on one runtime and lifecycle contract. Keep job-specific execution strategies and independent consumer cancellation (§22.4) |
| 5. Defer cross-store recovery until the case is proven | Disagree with the deferral: Lock/Exclude in an own preset already crosses both durable records. Prefer the smallest proven mirror protocol, but establish atomicity before extracting those commands (§22.2) |

This review checks the amendments against the current code and binding
contracts. It does not implement the architecture, benchmark it or establish
new game mechanics.

### 22.2 Atomicity has an existing use case

`app/page.tsx`'s `lockRune` is the missing evidence. Locking a rune not yet on
a monster in an own preset, or excluding one currently on it, can call
`engraveOwnPreset`, save the changed preset through `changePreferences`, and
then save import-scoped `runeLocks` through `saveImportedGame`. An interrupted
or failed second write can leave only the preset change committed. A whole
build's ordinary engrave path need not change both records for this case to
matter. The lifetimes in the persistence contract require both owners; moving
locks into preferences just to avoid the transaction would change the product.

Keep §10.3's requirement to commit the two IndexedDB records in one transaction
and publish one workspace transition. They can remain two keys in the existing
object store; a second store is unnecessary. Do not defer that guarantee until
after the workspace command extraction.

The second assessment is right that the pending before/after mirror protocol
may be avoidable. Prefer an IndexedDB commit followed by mirror publication
for these combined commands **if recovery proves it safe**. Ordinary
preference-only choices retain their contractually required mirror-first
route. All writes must share one ordering mechanism: a combined commit must
neither overwrite a later preference click nor read a stale preference copy.

The current `latestPreferences` comparison is insufficient proof: it uses
millisecond wall-clock timestamps and gives the mirror an exact tie. After
a combined IndexedDB commit and a crash before mirror publication, an older
mirror can therefore win. Define an unambiguous local write order shared by
both copies, independent of clock ties or clock changes, or retain the pending
record. Such metadata identifies committed writes, never application formats.
Changing mirror timing also requires an explicit update to the binding
persistence contract when implemented.

Before choosing the protocol, test abort before IndexedDB commit, termination
after commit but before mirror update, mirror failure, identical timestamps,
and an ordinary preference edit immediately before and after the combined
command. Reload must reveal a complete committed placement/lock change, or
the preceding state, while retaining every unrelated committed preference.
The design choice is deferred until that proof; the requirement is settled now.

### 22.3 Fewer folders must preserve ownership

Use §21.5's compact tree. Expensive pure procedures fit inside their game
subject, and browser execution adapters fit inside `platform/`. Cost alone
does not justify a top-level `algorithms/` layer.

The four dependency sentences are a useful overview, not the entire import
policy. Keep rules below procedures within each domain; combat must not import
optimization or main-stat advice back into its stat sheet. Reference accessors
have no browser/network dependency. Shared UI may use domain value types and
formatters, but neither storage nor workspace workflows. Feature screens
cannot import another feature's internals. Only the composition root connects
workspace ports to concrete platform adapters.

Distinguish a job's pure domain input/result types from its workspace lifecycle
and platform transport. Otherwise placing both worker and GPU plumbing under
`platform/` can create a dependency cycle through `workspace`. The same public
types must be usable by CPU tests and workers without importing the store.
Enforce these boundaries through import rules and cycle checks, including
relative paths and aliases; folder count is not the acceptance criterion.

### 22.4 Share the job runtime without erasing execution strategies

A typed descriptor and shared client are good defaults. They must not require
every job to be one `key/run` function on one worker. The current calibration
client leases shared work, the advice client isolates table and overlay
channels, and optimization prepares once before partitioning a search and
merging its answers. Those behaviours are requirements to preserve, not
duplication to remove indiscriminately.

Share worker construction, request routing, scheduling, failure cleanup and
bounded memory. Keep preparation, partitioning, merging and stop checkpoints
as explicit job-specific strategies over that runtime, with the search policy
still owned by the rune domain. Add only the strategies existing jobs need.

Keep three identities distinct: the semantic question key for reusable
answers, the execution/request ID for messages, and the consumer's channel or
lease. Latest-request-wins is per consumer. Two consumers may share identical
work; cancelling or disposing one releases its interest, and only the final
release may cancel the shared execution. A stopped partial optimization result
must carry its completeness/stop information and cannot satisfy a later request
for a completed answer merely because its input key matches.

Port one ordinary job first, then prove shared calibration and Stop before
calling the abstraction complete. Ban direct worker construction in features
as each port lands; the final ban belongs at the platform boundary. This keeps
the improvement incremental rather than demanding a speculative universal API.

### 22.5 Tighten the reference boundary that already exists

`refresh-swarfarm-monsters.mjs` already retains only `com2us_id`, `name`,
`image_filename` and `archetype`. The speed and PvE refreshes also transform
source records into compact snapshots. The stronger claim in §21.5(3) should
therefore be read as completing that boundary: validate source vocabulary and
identities during refresh, emit the declared runtime model, and expose it
through one domain owner. A TypeScript assertion over JSON is not validation.

`rune-reference-stats.ts` should ask the catalogue for archetype rather than
interpret `swarfarm-monsters.json` independently. Share that normalized
catalogue with other callers; emit separate projections only when their data
and loading needs justify it. Keep source identity, retrieval time, unknowns
and the evidence needed to explain a figure. Compilation must not silently
replace missing facts with invented defaults.

Test the compiler with sanitized source fixtures and compare its output with
the existing accessors' answers before replacing them. Public refreshes stay
deliberate maintenance actions, not a network prerequisite for build or test.
Measure emitted asset size and loading before claiming a bundle improvement;
JSON line count and static imports alone do not establish duplicated bytes.

### 22.6 Verification and implementation order

Adopt Vitest for pure/domain and application integration checks while keeping
Playwright and the Rust tests in their own runtimes. Vitest supports Vite's
transforms and [configurable failure continuation](https://vitest.dev/config/bail);
the claim that no test runner can stop early is incorrect. Use an explicit
non-watch verification command, preserve `verify:*` aliases and keep typecheck
as a separate gate. A passing alias must prove that its intended tests were
discovered, not silently accept an empty selection.

Use a [dedicated test configuration](https://vitest.dev/config/) and preserve
the isolated-cache/no-HMR guarantees in `VERIFICATION-ISOLATION.md`; sharing
Vite's tooling does not justify sharing the live app's optimizer state. Port
assertions and independent oracles unchanged before reorganizing the code they
test. Import restrictions supplement structural/formula checks, not replace
checks that detect independently restated rules.

One top-level verification command must aggregate eligible domain, browser and
external checks, with a nonzero result on failure and explicit skipped/not-run
reasons. Replacing only `test:domain` while retaining an outer `&&` chain would
still hide later suites. Private captures, real-card execution and Windows
checks remain distinct and visible in that summary.

Keep §21.7's evolutionary sequence with two adjustments:

1. Establish the combined-write invariant and failure tests with the initial
   integration harness; implement its repository protocol before extracting
   Lock/Exclude into workspace commands. It does not depend on completing all
   typed account consumers first.
2. Treat the remaining steps as dependencies rather than a serial queue.
   Reference ownership, individual job ports and focused workspace commands
   can move independently. For each account collection, switch consumers to
   one typed reader and remove the superseded raw reads; keep one authoritative
   durable representation rather than two mutable models.

The compact tree, validated reference boundary, shared execution runtime and
test runner are the final target. §§20 and 21.7's additional acceptance criteria
stand with the atomicity, dependency and reporting qualifications above. No
larger rewrite, new service or additional architectural layer is needed.

## 23. Implementation status — November 14, 2026

The owner has authorized a greenfield, big-bang implementation of this design.
The earlier statements in this document that no rewrite is authorized and that
implementation must be evolutionary are superseded by that instruction. The
subject contracts and preservation of the owner's choices remain binding.
Sections 3, 6, 18 and 21–22 cite files where they were when those sections
were written (`app/page.tsx`, `app/lib/`, `app/globals.css`); this section uses
current paths.

**Historical status before the corrections in §24: the layers and ports were implemented; acceptance remained partial.**
The compact tree, the dependency direction, the
workspace store and its ports, writer coordination, the direct-import
controller, the job clients behind an injected worker port, the derived typed
account snapshot and the offline shell are in place, and lint fails when they
are bypassed. The subsequent implementation review records outstanding
findings R1–R8 under §§7.1, 9.1, 9.3, 10.3, 10.4, 11.3, 14.2 and 15.3;
these are not the corrected defects in §23.2. Typed monster records below the
collection level (§7.1, §20 criterion 1) and the immutable observation with
explicit local overrides (§7.3, criterion 3) also remain open. The existence
of a layer or a passing structural check does not establish its behavioural
guarantees. The statuses below include the new review evidence.

### 23.1 What exists, and where

| Design | Implementation |
| --- | --- |
| Compact tree (§21.5(2), §22.3) | `app/{shell,features,ui,workspace,domain,ingest,platform,styles,data}` |
| Dependency direction (§22.3) | `scripts/verify-import-graph.mjs` (in `npm run lint`) holds the whole graph: layers, `features → workspace → domain` with no feature reaching `platform`, a feature using another only through `app/features/<name>/public.ts`, rules never importing procedures, no value cycles, no package imports in `domain/`/`ingest/`, no React in `workspace/`, no `import = require`, no non-literal dynamic import, only `app/main.tsx` at the root. `eslint.config.mjs` states the same layers in the editor |
| Typed snapshot (§7.1) | `AccountSnapshot` (`app/domain/account/account-snapshot.ts`) is derived from the observation by `withAccountSnapshot` (`app/ingest/game-export.ts`), memoized per observation and rebuilt on every commit. It is never stored: `storedGame`/`readStoredGame` persist the observation, its capture facts (`coverage`, helper session) and the local choices, and derive the snapshot and the import report again on restore. Screens read runes, artifacts, relics, craft items, conversion stones, buildings, the Sky Tribe Totem and account counts from it |
| Workspace store (§10.1) | `app/workspace/workspace-store.ts`: immutable snapshots, `useSyncExternalStore`, the commands `restore`, `changePreferences`, `replacePreferences`, `importAccount`, `removeAccount`, `engraveBuild`, `lockRune`, `changeGamePreset` |
| Ports (§5, §22.3) | `app/workspace/ports.ts` (repository, writer coordination, helper types), `app/workspace/jobs/worker-factories.ts` (workers), `app/workspace/acceleration-status.ts` (the graphics-card probe the Home card receives). Only `app/shell/root.tsx` connects them to `app/platform/` |
| Persistence (§10.3, §22.2) | `app/platform/browser-storage.ts`: ordered preference writes with a write order on both copies; paired account-and-preference commits with a pending mirror and commit marker (Lock/Exclude in an own preset, an own-preset engrave that ends locks, game-preset edits that change preferences) |
| One writer per origin (§10.4) | `app/platform/writer-coordination.ts` (Web Locks, `BroadcastChannel` invalidation). Where Web Locks are missing or refused the tab writes and keeps a notice that another tab could overwrite it |
| Direct import (§9.3) | `app/workspace/direct-import-controller.ts` |
| Job lifecycle (§§11, 22.4) | `app/workspace/jobs/`: the clients, memories, `cancellable-worker.ts` and `job-runtime.ts`. Workers, engines and shaders stay in `app/platform/compute/` and `app/platform/gpu/`. No feature constructs or drives a worker |
| Structured import issues (§9.1) | `ImportReport.issues` (`app/ingest/game-export.ts`): code, collection, source path, identifier field and entity id of the first refusal. Deck presets, relic engravings and buildings are refused by their owners' readers and located at collection level, so no second reader restates their rules to find an index |
| Offline shell (§14.2) | `scripts/sw-template.js`, emitted by the Vite plugin in `vite.config.ts` as `/sw.js` with the build's precache list and hash injected |
| Aggregate verification (§22.6) | `npm run verify:all` (`scripts/verify-all.mjs`): typecheck, lint, build, every `test:domain` alias, unit and browser tests as independent steps, then PASS/FAIL/SKIP/NOT RUN with a named reason for every alias it does not run |

### 23.2 Review of November 14: defects found and corrected

A second, adversarial review of the implementation found the following and
corrected each in code, with a test where one could hold it:

- **The typed snapshot was stored beside the data it derives from** and read
  in three places only. It is now derived, never stored (AGENTS.md §6), and
  the screens read their collections from it. Its report is derived too, so
  the catalogue's current knowledge of unknown monsters applies on restore.
- **A stored import that failed validation vanished silently.** Restore now
  reports it and Home asks for a fresh import (AGENTS.md §0.1).
- **Store defects:** restore computed the read-only notice from the previous
  role; an own-preset engrave reported success when its save failed and left
  locks the build had moved away; a missing recovery copy counted as a failed
  save; a successful save cleared lasting notices; the shell restated
  `canEngraveUnder` and showed a wrong "open in another tab" message while the
  role was still being settled.
- **Features reached the platform 29 times** (compute clients, worker
  factories, the helper client, the graphics-card probe) and the checker
  allowed it. The job clients moved to `app/workspace/jobs/` behind an
  injected worker port; Gems & Grinds and the optimization work estimate,
  which drove raw workers from components, now use clients
  (`craft-recommendation-client.ts`, `rune-optimization-work-client.ts`).
  The presets React context moved from `workspace/` to `ui/`.
- **Six forms of import escaped the graph checker** (backtick and non-literal
  dynamic imports, `import = require`, `.js` files, packages, nested
  `public.ts`, unclassified root files); each now fails, proven by probes.
- **The offline shell never updated after its first install**, could cache an
  SPA HTML fallback under a script URL, and listed public files by hand. The
  worker's bytes now carry the build's list and hash, the shell cache is
  per build, the build before it is kept for tabs still running it, only
  non-HTML same-origin responses are cached, and a new worker is applied only
  at `pagehide`.
- **Worker plumbing:** a cancel shared by several requests restarted the
  worker once per request; the job runtime held the last artifact result for
  the whole session in state nobody read; Rune Optimization discarded the
  builds already found when one share failed after Stop (§11.2); a helper
  answering with a body that is not JSON was reported as not running.
- **Preferences (AGENTS.md §0, §3):** an explicit `0` role target was dropped;
  one unknown set name, stat key or slot cost every neighbouring choice; an
  unreadable reroll kind was coerced into a re-app rule; craft filters kept
  duplicates; any JSON with an `updatedAt` key passed as a `.sw` file; a `.sw`
  file was read without the account restore reads against. Each now costs only
  itself, and `LOCAL-PERSISTENCE-CONTRACT.md` lists every stored field.
- **Checks:** `verify:all` omitted typecheck, lint and build and could omit a
  new alias silently; the acceleration-routing check would pass with no
  workers found; the relic-maths check did not look at features.
- **Structured import issues (§9.1):** refusals now carry an issue code,
  collection, source path and entity id, and the message names the record,
  e.g. `This file contains a rune JASWA cannot read (runes[0], rune_id 10).`

### 23.3 Acceptance criteria (§20 and §21.7)

This table records the preceding review, before R1–R8 were corrected. The
current acceptance assessment is §24.3; the old failure evidence is retained
here so the regression coverage can be traced to the original findings.

| Criterion | Status | Evidence or gap |
| --- | --- | --- |
| 1. No game-shaped field reaches a screen or algorithm unvalidated | Partial | Item collections, buildings and counts have typed readers, but `MonsterCopy.record` still carries raw unit fields into combat, placement and reference functions. R1 (§7.1) proves that `validateGameFile` accepts missing/malformed base stats that algorithms then treat as known numbers; completing types alone is insufficient |
| 2. One collection drives counts, views and calculations | Partial | Counts and typed item collections derive from the accepted observation, but R2 (§9.1) proves that a repeated item ID can retain different physical facts in the account collection and a monster record. Count parity alone does not establish value agreement |
| 3. Observed facts, statements and local changes have distinct owners | Partial | Preferences and local choices (`localChanges`, `runeLocks`) are separate records with their own readers. An engrave or game-preset edit still rewrites the observation (`engraveImportedGame`, `game-preset-edits.ts`); `LocalAccountChanges` holds the first observed placements and removed presets, not complete per-context overrides over an immutable observation |
| 4. One owner per rule | Met | Single-source checks (`verify:rune-craft-single-source`, `verify:rune-placement-single-source`, `verify:acceleration-routing`, `verify:relic-maths`, …) and the import graph |
| 5. Domain runs without React, storage, workers or network | Met | Import graph and lint: no packages and no browser globals in `domain/` and `ingest/` |
| 6. Validated readers, ordered/atomic writes, honest failures | Partial | Reader and paired-write tests pass, but R4 (§10.3) and R5 (§10.4) reproduce lost preference choices and disagreement between published and stored state. R3 (§9.3) also leaves the source-switch commit boundary unenforced |
| 7. One question key, freshness, cancellation, CPU reference, truthful backend | Met for the existing jobs; scheduling remains open | Per-client keys/memories, CPU reference and backend reporting exist. These lifecycle checks do not establish the shared scheduling budget required by §11.3; R6 identifies that separate implementation gap |
| 8. A screen can be replaced without touching import, persistence, formulas or workers | Partial | Dependency direction is enforced, but R8 (§15.3) shows the durable Engrave command relies on validation in the current screen. A replacement screen must otherwise recreate that protection |
| 9. The helper cannot apply a plan | Met | `PASSIVE-GAME-DATA-CONTRACT.md`; the helper exposes no mutation endpoint |
| 10. Separately verifiable empty/full, geometry, GPU and Windows | Checks exist; coverage remains incomplete | See §23.4. The existing unit suite passes despite R1–R5 and R8; the service-worker check does not exercise R7's lookup order |
| 11. One command reports every failure and skip | Met | `npm run verify:all` |
| 12. Reference snapshots reach runtime only through their accessor | Met | Catalogue, speed skills, PvE stages and rune reference stats are read through domain accessors; the catalogue refresh validates before replacing |

Deliberately not done, and not claimed: the domain checks are still
`scripts/verify-*.mjs` aggregated by `verify:all` rather than Vitest tests;
feature layout has not moved wholesale into CSS modules; the helper's Rust
modules have not been split and no privilege broker exists. Each needs its own
evidence — a signed helper release, per-feature visual verification — and none
is required by the criteria above.

### 23.4 Verification record

Run from PowerShell on November 14, 2026 against `http://localhost:3000/`,
started for the check because no server was running.

- `npm run verify:all`: typecheck, lint (with the import graph, the pure-layer
  typecheck and the service-worker check), build and `test:unit` (60 tests)
  pass. Every `test:domain` alias passes except two results, both since
  resolved: `verify:helper-unreadable-report` asserted the helper defect
  corrected in §23.2 and now holds the corrected reading, and
  `verify:artifact-obtained-order` skips without a private traffic log.
  `verify:library-layout` and `verify:recommendation-filters` ran against a
  local real export and pass.
- `test:e2e`: 351 of 352 pass in 11.9 minutes on two workers. The one failure
  asserted that a stated `0` is saved as unstated, the behaviour AGENTS.md §3
  forbids; it now asserts the stated zero and passes. No application code
  changed after that run.
- The browser suite runs on two workers again. The single worker introduced
  with the writer lock rested on a mistaken premise: a probe showed Web Locks
  are scoped to a browser context, and every test has its own.
- `verify:rune-cleanup-equivalence` against a baseline captured at the
  preceding commit: every field identical for 582 runes in 6 scenarios.
- Driven in the browser: empty and imported workspaces across the rail with no
  page errors; restore after reload with the snapshot derived again; an
  unreadable file refused with its record named; a role edited with one target
  blank and one at `0`, both surviving a reload distinctly.
- Not run here: `verify:rune-optimization-card` and
  `verify:craft-recommendations-card` (this machine's headless browser reported
  no graphics card), `audit:import-parity` (no private capture), the helper
  replay and real-Windows helper checks, the `:large` variants and
  `verify:rune-cleanup-preference-monotonic`.

**Subsequent implementation-review verification, November 14, 2026:**

- Reviewed the store/repository/controller, account readers and their consumers,
  job clients/factories, reference boundary, dependency checker, offline shell
  and verification entry points against the design and current subject contracts.
  Application code was not changed; R1–R8 remain open.
- A local probe loaded the real TypeScript modules through the existing isolated
  `createVerificationServer` harness. Deferred repository operations reproduced
  R3 and R5; the actual browser-storage adapter with `fake-indexeddb` reproduced
  R4. The committed optimization fixture reproduced R1, R2 and R8 without a
  private capture. A VM evaluation of the actual service-worker fetch handler
  reproduced R7's previous-cache lookup. R6 is source-level evidence only;
  no performance benchmark or simultaneous-job browser measurement was run.
- `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (17 files, 60 tests) and
  `npm run build` pass. The build retains its existing large-chunk warning.
  The passing unit suite does not cover the reproduced failure scenarios.
- No browser or local HTTP server was used for this documentation-only review;
  no server was started or repaired. The earlier browser results above were
  not rerun. Full `verify:all`, domain/e2e suites, private-capture parity,
  real-card execution, production service-worker installation and Windows/helper
  integration were not run as part of this review.

## 24. Corrections and final implementation review — November 14, 2026

### 24.1 Resolution of the outstanding findings

The owner requested correction of the outstanding findings, followed by a
review of the whole implementation, first its architecture and structure and
then its code. R1–R8 are corrected. The two additional model gaps identified
in §23 — typed monster facts and immutable observations with local overrides —
are implemented too. This section supersedes the corresponding open statuses
in §§7, 9–11, 14–15 and 23; their original reproductions remain historical evidence.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| R1 — missing/invalid monster stats | The ingestion boundary requires eight finite base facts, positive for constitution, ATK, DEF and SPD and nonnegative for the other four. Missing facts refuse the import with the monster's source path. `monsterBaseStats` also refuses unavailable facts; `referenceMonsters` cannot average them as zero. Optional identity/display fields are validated where supplied. `MonsterCopy.record` now has a closed `MonsterRecord` contract; unrelated export fields stay in the observation | `game-export.test.ts`: missing, string, negative, infinite, NaN and zero-speed cases, through ingestion, the stat sheet and the reference pool; existing synthetic exports now state their numerical facts explicitly |
| R2 — contradictory physical copies | One reconciliation reads rune, artifact and relic copies through their canonical readers, refuses differing physical facts with both source paths, and makes monster gear reference the canonical collection. Artifact main magnitude participates even though scoring deliberately drops it, because stat sheets read it | Rune, artifact-magnitude and relic contradictions and canonical object identity in `game-export.test.ts`; real-export import parity |
| R3 — a stopped helper import still commits | Each controller configuration has an abort lifetime, passed through the serialized import command to the repository transaction. Stop, restart and route/mode changes invalidate an uncommitted helper import. IndexedDB aborts the transaction; an alternate adapter crossing the cancellation boundary is reconciled before the command settles. An accepted source token is still recorded only after commit | A real store/controller/browser-repository integration test holds the repository commit pending, stops the controller, changes to the file route and verifies both stored and published accounts remain unchanged |
| R4 — preference-file replacement loses following clicks | Preference loads and following edits have an explicit command order. Each queued replacement owns the edits requested after it; those edits apply to that replacement, rather than a stale complete document. Another queued replacement cannot steal their position. Failed loads retain the preceding document and apply independent following edits there | Store plus real IndexedDB/mirror tests cover a click during a delayed replacement and a click after two queued replacements; state and restoration agree |
| R5 — takeover writes stale preferences | Takeover immediately invalidates earlier restores and suspends write readiness. The new writer restores the previous writer's committed choices before commands can write. A missing or refused Web Lock grants read access only, with a specific notice | A delayed takeover read holds the unsafe window open; preference writes are refused and saved choices survive. Browser-coordination tests also cover absent/refused locks |
| R6 — independently claimed worker budgets | All injected factories share one budget: at most eight active workers and at most the available cores minus one, with a minimum of one. Foreground requests precede queued calibration/work estimation. Terminal replies and cancellation release capacity; idle workers retain caches without reserving a core. Search partitioning and calibration leases retain their existing owners | Simultaneous foreground/background requests, total capacity, queued cancellation, warm-worker reuse and control messages are exercised in `worker-budget.test.ts`. Account replacement clears registered job memories; advice memory also prunes sold rune IDs |
| R7 — stale stable assets from the preceding shell | The active shell or artwork cache is consulted first. Only immutable `/assets/` chunks may fall back to another shell; a missing stable public URL goes to the network. Artwork stays separate | `verify:service-worker` executes the actual template's fetch handler with previous/current caches: changed manifest, previous hashed chunk, missing stable icon and artwork. This runs even when `dist` is absent/stale |
| R8 — Engrave trusts the screen | The command receives the original build, craft assumptions and question identity. When its turn starts, it reads the latest account, preset, source permissions, priority, locks, settings, stock, buildings and teammate sets and invokes `currentBuilds`/`buildFollowable`. It checks six distinct slots for own presets too. A saved profile/team change while queued refuses the preceding question. Own-preset engraving commits its plan and locks together before publishing | Store/repository tests cover changed source permission, lock, exclusion, saved profile, depleted stock, own presets, duplicate slots, successful engravings and failed account/paired saves. Existing Rune Optimization browser tests hold the actual interaction and reload |

The immutable observation is `ImportedGame.observation`, frozen at ingestion;
`ImportedGame.data` is the effective projection consumed by current readers.
`storedGame` writes only the observation and explicit local choices. The
projection stores Scenario rune-owner overrides and, per game preset, its
positions, leader, gear or deletion. `readStoredGame` validates and applies
those choices; a malformed local context returns to its observed arrangement
without discarding other contexts or preferences. It never stores a second
effective account. Pure editing functions operate on the projection, leaving
the observation unchanged. `local-projection.test.ts` holds combined Scenario,
preset-gear, leader and deletion roundtrips, independent rejection and immutable
observed facts. `LOCAL-PERSISTENCE-CONTRACT.md` and
`IMPORT-PARITY-CONTRACT.md` state these current contracts.

### 24.2 Final review: architecture and structure

The review covered every production layer and its dependency graph: shell and
shared UI, all feature entry points, workspace commands/controllers and job
clients, ingestion and restoration, the account/profile/placement/combat and
gear domains, reference accessors and refresh compilation, browser adapters,
worker/CPU/GPU boundaries, offline delivery, the hosting worker, verification
entry points and the helper's protocol/profile/service/Windows boundaries.
Detailed code tracing concentrated on external input, durable changes,
asynchronous completion, cancellation and account identity, where structural
compliance alone cannot prove behaviour. This is a whole-implementation
architecture and code review, not a claim that every formula, shader or line
has been independently rederived.

**Assessment:** the implementation now supports the intended modular local-first
application. The compact physical tree expresses its ownership; the checked
dependency direction remains intact. Workspace commands own durable changes;
platform adapters implement their ports. One accepted observation supplies
the effective account and typed collections, while preferences and local plans
have separate ownership. Shared domain rules still decide calculations,
placements, sources, crafting and combat. Features retain presentation and
draft state, and workers retain bulk execution. The helper and host remain
separate runtime boundaries; no game-write capability has been introduced.

Two structural qualifications are deliberate. The closed `MonsterRecord`
retains encoded field names for existing arithmetic readers; it does not
duplicate those numerical facts into another independently editable stat
model. Canonical item records are validated before those readers use them.
Also, the shared worker budget bounds active execution, not the number of
idle native workers or a measured heap-byte total. Existing result memories
have explicit count/account limits and reset lifetimes. Neither change is a
claim of a measured speed or memory improvement.

Review of the completed changes also corrected these issues:

- Account replacement did not release every registered answer memory, and
  advice for sold rune IDs could accumulate when reference averages stayed
  unchanged. Registered resets now release account-wide work/results on removal
  or replacement; advice entries are bounded by the current physical stock.
  Resets are registered by loaded clients so the store need not import every
  calculation merely to clear an unused cache.
  A browser regression caught an overly broad reset for exports without an
  account ID: a live revision in the same helper instance/session must retain
  the result being refreshed. Source-session identity now distinguishes that
  revision from replacement, with both a store regression and live-sync browser
  coverage.
  File observations without an account ID also retain mathematical results when
  their copy/species identities are unchanged; a new roster clears them. Each
  consumer still reconciles current item facts and its complete calculation key.
- A missing/refused Web Lock previously left a writable, uncoordinated tab.
  It now remains read-only, preserving the single-writer invariant rather than
  relying on a warning to prevent competing writes.
  During takeover the rendered workspace stays mounted while writer readiness
  is suspended; returning to the startup loading screen would discard drafts
  and move content without the user asking for it.
- Cache identity originally included only the data object, although a snapshot
  also carries import time, source and coverage. Reusing collections now checks
  that metadata too; the snapshot cannot retain another capture's provenance.
- The import-graph checker could not resolve a unit test's committed JSON
  fixture outside `app/`. It now permits existing `tests/fixtures/*.json` only
  for test modules; production dependency restrictions remain unchanged.

A production-build comparison using the preceding committed app sources and
the final sources is recorded in the verification record below. Chunk names
and entry sizes alone were not used to infer loading cost: the statically
reachable JavaScript graph was compared. The large reference-data footprint
is a remaining optimization opportunity, not an import or calculation defect.
No new service, migration layer, helper privilege broker or blanket CSS rewrite
is needed to close this review.

### 24.3 Final review: code and acceptance

Code review traced both successful and failing paths through import, restore,
preference replacement, paired commits, takeover, local projection, Engrave,
worker scheduling and service-worker lookup. It checked empty collections,
complete builds, unknown/malformed fields, repeated IDs, missing inputs,
independent preference survival, stale asynchronous work and failed persistence.
The regression checks exercise actual modules and the browser repository;
they do not reproduce replacement implementations of those boundaries.

Further code corrections made during that review were:

- An empty craft-recommendation batch tried to post a nonexistent first request.
  It now resolves an empty result without constructing a worker.
- Own-preset Engrave used an optimistic preference write on its simpler path,
  so a failed save could leave the new plan visible. Every own-preset engraving
  now uses the paired commit before publishing, including when no lock changes.
- A queued preference-file replacement needed its own following-edit list;
  one shared list would lose a click made after a second queued file load.
- A completed search worker receiving only a best-bar/stop control must not
  reserve another core. The budget distinguishes controls from work, avoiding
  a capacity leak while other shares are still queued.
- Engrave revalidation now reads current teammate sets and refuses saved
  profile/team changes that occurred while the command was queued.
- Numeric monster attributes now resolve through the element vocabulary,
  rather than being treated as unnamed because they were not strings.
- Source monster IDs must be positive numeric IDs, matching the preset reader.
  Accepting numeric strings (especially alternate spellings such as `"01"`)
  could count a copy that numeric placement readers could not resolve. The
  semantic copy ID exposed by the snapshot remains a string. The import
  constructor also validates its actual source, rather than trusting a report
  a caller could accidentally have produced for a different object.
- A failure posting another request to a busy worker now releases its shared
  reservation and reports failure, rather than leaving a claimed core behind.
- The browser engraving assertion now checks immutable observed placements
  plus explicit overrides and reload behaviour, replacing its assumption that
  the stored observation itself must be rewritten.
- Restoring an attack-deck leader must use the deck's kind, not the presence
  of a leader field in its original record. A chosen leader now survives reload
  when the observation omitted that field, without rewriting the observation.
- Relic preview models now represent unavailable base facts with a
  `missing-stats` status and null base/totals, rather than throwing or presenting
  missing facts as zeros. Ingestion still refuses an owned record without them;
  the independent plan checks also exercise the unavailable preview contract.
- Browser checks now target the rune/stat whose formatting they examine,
  declare the reference facts needed by a specific Gem-ordering case, and read
  saved presets through restoration. They no longer depend on a first-ranked
  row, zero-filled missing references or a rewritten observation. Worker-failure
  coverage counts one actual single-share retry instead of assuming synchronous
  construction order under a shared budget.
  The independent relic-value and Speed Tuning examples state all eight base
  facts explicitly, including generated speed-test teams.
  Live-refresh coverage waits for the completed import's Home paragraph, avoiding
  both a transient confirmation and the import badge, which does not show filenames.
- The Broken-policy browser check isolates that gate from independent *Never
  sell if* safeguards. Tracing the former increase found that the raw gate was
  not admitting more runes: a changed Best role crossed the separate Potential
  protection threshold. No scoring arithmetic was changed to force a test's
  percentage. The independent preference-monotonicity check passes its 648
  deterministic cases.

| Acceptance criterion | Current assessment |
| --- | --- |
| 1. Validated facts reach screens/calculations | Met for the current consumed account contract, including the closed monster record and required base stats |
| 2. Counts, views and calculations share accepted physical facts | Met; repeated physical copies are reconciled before publication, not merely counted once |
| 3. Observations, statements and local plans have distinct owners | Met; immutable observed data and separately stored, derived local projection |
| 4. One owner per rule | Met; domain structural/formula checks and import graph retained |
| 5. Pure domain without React/platform I/O | Met; whole graph and separate pure-layer typecheck |
| 6. Validated reads, ordered/paired writes and honest failures | Met for the implemented browser repository; pending source changes, preference loads and takeover have regression coverage |
| 7. Question identity, freshness, cancellation, CPU/card reporting and shared capacity | Met for current job protocols; throughput and heap-byte profiling are not acceptance claims |
| 8. A replacement screen need not recreate durable-command protection | Met; Engrave enforces its preconditions in the command |
| 9. No helper path applies a plan to the game | Met; passive boundary retained, helper source unchanged |
| 10. Empty/full, geometry, card and Windows checks are separately verifiable | Checks implemented; actual runs and remaining limits are stated in §24.4 |
| 11. One aggregate reports failures and explicit skips | Met; `verify:all` retains independent suite execution and its external-check accounting |
| 12. Reference snapshots have one runtime accessor | Met; current accessors/compiler and ownership checks retained |

There are no remaining reproduced P1/P2 code findings from R1–R8 or the
additional corrections above. This is bounded review evidence, not proof of
an absence of defects. The earlier roadmap choices — porting every domain
script to Vitest, moving all feature CSS into modules and splitting the helper
into further packages — remain optional structural work, not hidden failures
of the current acceptance criteria. Private chronology captures, installation
on another Windows machine and production service-worker rollout remain
separate forms of evidence; a local unit or browser pass cannot establish them.

### 24.4 Final verification record

Verification ran on November 14 against the user's already-running
`http://localhost:3000/` server. An HTTP probe returned 200 and Playwright drove
the rendered application. No second server was started, and the existing one
needed no repair. Production was not used for verification or publication.

- **Verification gates:** `npm run test:domain` passes from start to finish,
  with the private artifact-chronology skip stated below. The domain and browser
  suites were run in full independently, alongside TypeScript, lint, build and
  unit checks. Their logs
  are `work/architecture-domain-verified.log` and
  `work/architecture-clean-e2e.log`. Earlier aggregate runs were interrupted
  during correction; no successful `verify:all` run is claimed.
- **TypeScript and unit checks:** `npx tsc --noEmit` and 100 tests in 21 Vitest
  files pass, including the new boundary, persistence, projection and scheduling
  regressions. Lint is clean and the production build succeeds. Lint includes
  the whole import graph, pure-layer typecheck,
  line endings and actual service-worker cache lookup tests. A separate
  post-build `verify:service-worker` also validates the emitted current shell.
- **Browser:** all 353 Playwright tests pass in the final full run. Empty and
  populated Rune Optimization,
  complete requirement panels, Engrave, Lock/Exclude, own presets, failure paths
  and restoration are part of that suite. The Engrave screenshots before and
  after the click were visually inspected; the header, action and rune-card
  boxes retain their geometry while locations and action state change.
- **Real export:** `audit:import-parity` passes against the local account
  export, not a missing-capture skip. `verify:library-layout` and
  `verify:recommendation-filters` pass against that export too, including empty
  and imported states, table measure, filter geometry and reachable counts.
  No private export or traffic data is committed.
- **Actual graphics card:** `verify:rune-optimization-card` passes its
  agreement gate and CPU/card comparison on 131 accounts, 402 result rows,
  1,467 passes and 5,141,770 card-evaluated pairs.
  `verify:craft-recommendations-card` passes agreement and exact rankings for
  37,332 comparisons. No search arithmetic, packing or shader was changed.
- **Helper:** `cargo test --manifest-path helper/src-tauri/Cargo.toml --lib`
  passes all 144 tests, including its passive relay/service regressions.
  Helper source was not changed, and its packaged-source/version check is
  retained. No installer was rebuilt or published.
- **Build footprint:** a read-only Vite comparison of the preceding committed
  app sources and the final sources measured the complete statically reachable
  JavaScript graph: 7,443,373 → 7,454,404 bytes, and 1,024,269 → 1,024,206 bytes
  when each emitted chunk is gzipped. The emitted entry/chunk arrangement
  changes, so entry size alone would have been misleading. This is an emitted
  asset comparison, not a cold-load or execution benchmark. The existing
  large-chunk warning remains; the reference-data footprint warrants separate
  measured loading work rather than an invented performance claim.
- **Limits:** no production service-worker upgrade/installation, installation
  on another Windows machine, fresh private traffic chronology, slow `:large`
  variants, stress campaign or new Clean-up equivalence baseline was run.
  `verify:artifact-obtained-order` has no private chronology log and is an
  explicit skip. The ordinary domain checks remain script aliases; the
  Clean-up arithmetic was not changed. The aggregate's external-check omissions
  remain explicit even where the corresponding real-export, card or Rust check
  was run separately above.
