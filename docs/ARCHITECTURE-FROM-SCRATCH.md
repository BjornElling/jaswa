# JASWA built from scratch

**Status:** Architectural analysis and proposed design; not a replacement for binding contracts
**Date:** November 13, 2026
**Scope:** Browser application, calculation workers, Windows helper, reference data, hosting and verification
**Addendum:** §21 records an independent second assessment, compares it with §§1–20 and states the resulting recommendation
**Final review:** §22 evaluates those amendments and states the consolidated recommendation; its qualifications supersede the corresponding proposals in §§6, 10.3 and 21

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
    rune-cleanup/                  # Weights, calibration, outcomes, verdict
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
  apply verdict and sale protection. Canonical average Legend craft credit
  belongs to this judgement, not to a user toggle. Protections can change a
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

There is a concrete cleanup opportunity here: `.github/workflows/deploy.yml`
still selects Node 22 and describes unfinished Cloudflare setup, while
`.node-version` selects 26, `package.json` requires at least 26, and the binding
deployment document describes Cloudflare Workers Builds as the routine path.
A fresh structure should have one declared toolchain and one routine delivery
path, with any manual fallback using those same contracts. This analysis does
not change or invoke either deployment mechanism.

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
| Rune cleanup/optimization/simulator modules | Rune domain plus focused algorithms | Craft credit, calibrated judgement, exact reductions and declared heuristics |
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
selects Node 22 while `.node-version` says 26.

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


## 23. Implementation status — November 13, 2026

The owner has authorized a greenfield, big-bang implementation of this design.
The earlier statements in this document that no rewrite is authorized and that
implementation must be evolutionary are superseded by that instruction. The
subject contracts and preservation of the owner's choices remain binding.

**Status: started; the redesign is not complete.** The existing application,
raw import model, persistence, workers, helper and presentation have not yet
been replaced. The acceptance criteria in §20 are not yet met.

- Added `npm run verify:all` as an interim aggregate: it runs every existing
  domain alias independently, then the browser suite, and reports failures and
  observed skips without stopping at the first failed check. Private captures,
  real-card checks and Windows integration remain separate and are reported as
  not run. This is not the planned Vitest integration or the final verification
  system; browser skip details depend on Playwright's output. A simulated
  failing check confirmed that later checks run and the aggregate exits with a
  failure. The full aggregate has not yet been run.
- `npm run lint`, `npm run build` and `npx tsc --noEmit` passed for this
  initial change.
- Added an isolated Vitest configuration and the first catalogue tests; existing
  independent verification scripts remain intact. This is the start of the
  harness, not a completed migration of the checks.
- Rune reference averages now ask the catalogue for the exact form's archetype.
  The catalogue refresh validates IDs, names, image filenames and archetypes
  before replacing its snapshot; the compiler is checked against the existing
  snapshot and malformed examples. The catalogue agreement test covers every
  current form. The parity audit was skipped because no capture was available.
- Workspace restoration now runs through `app/workspace/restore.ts`: account
  and preference reads settle independently, and read failures are surfaced.
  Unit tests cover an account-read failure with intact preferences. Empty and
  imported workspaces were also reloaded in Playwright on the already-running
  localhost:3000 server; screenshots showed no unintended content movement.
  The failure notice itself has not been exercised in a browser.
- Still required: import/cycle rules and migration of checks to Vitest; atomic
  combined writes and recovery tests; typed ingestion and immutable observation
  with local projections; workspace commands; shared job runtime; reference
  ownership; feature and style reorganization; helper restructuring; and all
  end-to-end and platform acceptance checks.

Update this section as implementation proceeds, distinguishing completed work,
verification, skipped checks and remaining work. Do not mark the redesign
complete until the acceptance criteria have evidence.
