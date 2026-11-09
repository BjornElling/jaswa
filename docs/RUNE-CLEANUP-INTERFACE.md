# Rune Clean-up — the page

**Status:** Binding contract for the Rune Clean-up page and its Rune Settings controls
**Depends on:** `docs/RUNE-CLEANUP-MATH.md`
**Reviewed:** October 20, 2026

`RUNE-CLEANUP-MATH.md` decides what a rune is worth and what the verdict is. This
document says how the page holds, refreshes and presents those answers. Nothing here
changes a figure: a filter, a sort, a safeguard or a refresh only arranges, protects or
reuses what the engine answered.

## 1. Keeping the list while navigating

The application keeps the last completed Rune Clean-up result, its column sort, filters
and arranged row order while the reader visits other workspaces. Leaving the page
cancels unfinished work, not its last completed answer; returning resumes incremental
refresh. A browser reload, removal of the imported account or a switch to another
account clears the calculated session; preferences stay saved.

| Change | What happens to the held list |
| --- | --- |
| Navigation, unchanged re-import, filters or sorting | Reuse the answers; filters and sorting only arrange what is shown. |
| New rune | Judge that rune and add it above the held rows. No whole-list calculation. |
| Level, stars, rarity, lineage, set, slot, main, innate, sub properties, Gem, Grindstone or reappraisal | Rejudge the affected rune under the current standards; keep its row in place. Until answered, show its previous rune and advice together. |
| Rune sold or removed | Keep its previous row marked Sold until Calculate removes it. |
| Scenario or preset placement, preset membership or name, monster nickname | Read the current location and engraving count without recalculating scores. |
| Holds, rune locks, or any *Never sell if…* safeguard or threshold | Apply the current protection immediately to the held advice. |
| *Power-up policy*, *Rune quality floor*, *Accepted runes*, *Broken runes*, *Intangible runes* | Keep the row order and replace the affected answers automatically. The Intangible setting rejudges only Intangible runes; the others rejudge every row. |
| Role added, removed, reordered or edited — targets, type, artifacts, sets, slot choices | Keep the row order and rejudge every row automatically, because the shared slot calibration can change. |
| Reference averages change | Rejudge the list when a reference family a role uses changes. The averages depend on the level-40 roster, family classification and base stats, so a new, removed, awakened or levelled monster may change them even if no rune changed. Equal averages remain valid. |
| Display formatting, hardware acceleration, craft inventory, buildings, artifacts or relics | Nothing to rejudge: formatting is read live, acceleration chooses an engine, and Clean-up uses assumed craft credit and roster base stats rather than owned items or a monster's engraved gear. |

The update notice reserves its space even while the standards match, so it cannot move
the table or its controls. Standards are compared by mathematical content, not object
identity. A batch commits only while its inputs are still current; superseded work is
cancelled. Until it commits, previous rune bodies and answers stay together and the
notice names the changed standards. A failed update keeps the notice and offers
Calculate again; missing roles or references say what is needed. Sold rows are rejudged too
when their standards change. No update silently mixes two standards in the completed
list.

The table, Statistics and the rune overlay key their answers with
`rune-calculation-inputs.ts`. Rune bodies are compared separately from placement. Role
order stays significant because it breaks ties; every used role and reference stays
significant because they shape the shared calibration. Incremental replacement makes no
approximation and draws no different sample.

The slot calibration is counted once per session and shared: a pool of calibration
workers, one per processor core but one, counts its eighteen pieces (six slots at three
checkpoints) side by side, and the main thread keeps the last four counted populations
(`rune-calibration-client.ts`). Every advice channel — the table, a refresh, the rune
overlay — adopts that copy instead of counting its own, so opening a rune after
Calculate costs the rune and not another calibration. A count is abandoned only when
nobody waits for it any more. An idle advice worker stays available across navigation,
keeping the floors it has read. An incremental refresh borrows the table's worker when it is idle;
concurrent work uses a separate channel. Cancelling a refresh cannot cancel a whole
calculation, and a whole calculation superseding a borrowed refresh clears that refresh's
cancellation. Automatic standards updates report progress in the controls' reserved line
and commit their affected answers together, without rearranging the rows.

**Statistics.** Rune Settings keeps the four most recently used completed Statistics
answers by the same inputs, in memory only. Navigation rejoins unfinished Statistics work
or reads a completed answer at once, and returning to a cached setting reuses it.
Safeguards, formatting, placement, owned craft items and engine preference are not
inputs. Checkpoint answers are kept, so a safeguard change updates the funnel counts
through the shared protection rule without rerunning any odds. The displayed engine is
the one that produced the retained answer.

## 2. Scope is never a setting

Every rune the import holds is judged, always (`RUNE-CLEANUP-MATH.md` §9). No saved
setting narrows the judged population; where a rune sits and how far it is powered up
decide only what the table **shows**, through the Location and Level filters. A setting
that held runes out of the engine would change the calibration and other runes' verdicts;
a display filter cannot.

## 3. *Never sell if…*

Four safeguards sit in the table's filter panel. Each is a checkbox saved with the
user's settings; each applies immediately to held results without changing a score, a
chance or Best role, and unchecking one restores the calculated advice. A protected rune
says **Power up** below `+12` and at `+13`/`+14`, and **Keep** at `+12`/`+15`. Locked and
Unsellable keep their own labels.

- **Pre-grind SPD ≥** — on, at **20**. Protects a rune whose current SPD sub-property
  value meets the inclusive threshold. Grindstone bonuses, projected rolls, innate SPD and
  main SPD do not count. A blank threshold means no safeguard; an explicit zero protects
  every rune with a SPD sub property. Unchecked, its wording is dimmed and inactive, and
  its field is disabled with the chosen value kept. Reason: `Pre-grind SPD protected`.
- **Potential value ≥** — on, at **90 %**. Protects a rune whose Chance is at least
  **1 %** and whose Max value is at least the threshold, both inclusive and compared
  before display rounding. Blank disables it; zero is a stated threshold. Its field behaves
  as above. Reason: `Potential value protected`.
- **Engraved in non-Scenario preset** — on. A rune engraved on a monster in any preset
  outside Scenario is never recommended for sale, even if that is its only placement.
  Scenario alone does not protect a rune. Location and protection read the same
  account-wide engraving index in `presets.ts`; a preset that saves only monsters uses
  Scenario gear and creates no engraving of its own. No threshold. Reason: `Preset
  engraving protected`.
- **Re-app/refine target** — on. Applies the targets of §3.1.

### 3.1 Re-app/refine targets

Rune Settings holds two columns under **Re-app/refine target**: **Re-app** on the
left and **Refine** on the right. Each has its own **Add Re-app rule** or
**Add Refine rule** button and independent empty state. Add, edit or delete any number
of rules. The stone is decided when a rule is added; the editor has no Target
control, and rules cannot be duplicated. Empty lists stay empty after reload. Slot headings need not be unique; identifiers must be.
Each column sorts automatically by its displayed slot list, comparing the first slot,
then the second and so on. A shorter equal prefix comes first: **2**, **2, 4**,
**2, 4, 6**. Identical slot lists keep their existing order. This order is derived
for display and does not rewrite saved rules.

The card's derived heading lists slots in ascending numerical order, followed by any
chosen main stats with a generously spaced dash: **Slot 2 — SPD, ATK %** or
**Slots 2, 4, 6 — HP %**. With no chosen main stats it names only the slots.
No selected slots means all six, and the heading lists them. There is
no manual name or repeated Slots row. The heading is vertically centred with Edit and
Delete. Each card holds three rows: **Rune type**, **Min rarity** and **Innate required**.
Main stats appear only in the heading. These rows have the same fixed height and no horizontal dividers.
Refine cards add **Substats** and **At least**, exposing the user's own criterion.
Rune types read alphabetically in menus, chosen pills and cards, independent of
selection order. Substats use the game's existing `runeStatIds` order on all three
surfaces. Their stored selections are kept as chosen.
Long values truncate on one line, with the complete text available on hover and to
assistive technology. There is no Compatibility row. Each column keeps its own place
when a rule is added to the other; narrow screens stack Re-app above Refine.

The compact editor puts Slots beside Main stat, then Rune type across the full width.
Min rarity and Innate required each take one third of the row below; the final third
stays empty. Rune type and Main stat use the filters' shared
multi-choice dropdown with removable pills and a counted overflow. All menus of this
type use the browser's top layer, beyond the editor's scrolling body and footer.
They remain anchored to the field, open above when that offers more room, and stay
within the screen when it resizes or an ancestor scrolls. The list scrolls to reach
the last option without moving the fields. Escape dismisses the menu before the
editor and returns focus to the field. **Innate required**
uses three exclusive filter buttons, in the order **Yes**, **Both**, **No**: Yes requires
an innate, Both accepts either state, and No requires no innate. Both is the default for
a new rule. The chosen button stays chosen when clicked again. There is no Enabled
switch or explanatory copy. Only an incompatible combination shows an error, in a
reserved two-line area that keeps the fields and footer still.

Only Refine adds a full-width **Substats** token field, with room for six selected
types on one line, followed by **Of these rune must have at least** and a required
single-choice dropdown. Its default is **All**, then the number of chosen substats
minus one down to **1**, in descending order. A chosen pool is a requirement, not
an inclusive filter: an empty pool blocks Save. All means every chosen type;
choosing every type does not waive the requirement. Only the rune's four actual
sub properties count, never its main, innate, projected Gem or Grindstone values.

The validator checks every legal slot/main pair admitted by the rule. Each must
allow at least the requested number of chosen substats after the game's main and
slot exclusions. Thus ATK % or SPD mains with ATK % as the sole wanted substat is
invalid; choosing ATK % and SPD with a minimum of one is valid. Slot 1 cannot ask
for DEF % alone, slot 3 cannot ask for ATK % alone, and slot 5 cannot ask for flat
HP alone. A wider pool may include a type that one main or slot cannot carry,
provided enough other chosen types remain possible for every admitted pair.

A minimum above four is impossible. A pool of six is valid with a reachable
minimum of four or fewer, while All and five block Save. If removing types makes
a numerical minimum unavailable, keep that choice visible as a disabled option,
explain it in red and block Save until the user changes it. Never silently lower
the threshold. Errors keep their reserved space and scroll if needed.

All conditions within one rule must hold; any rule of that stone is enough. Empty
inclusive groups mean any value, as does selecting every option. Intangible is not
offered among rune sets. Every main stat is named precisely, including flat versus
percentage ATK, DEF and HP; odd slots retain their fixed flat main.

The editor keeps choices visible and never removes one to make another fit. Every
selected slot must support at least one selected main, and every selected main must
occur in at least one selected slot. No main selection and the complete main group both
remove the main-stat requirement. With no selected slots, this checks all six.
An incompatible combination explains the problem and blocks Save rule. Thus ATK %
with slot 1 is invalid, flat ATK with slot 1 is valid, and SPD plus CRI Dmg across slots
2 and 4 is valid: either main matches where the game permits it. Stored incompatible
combinations remain available for correction in the editor but cannot recommend a stone.

Refine is always considered before Re-app, independent of the ordering within each
column. The shipped rules cover slots 2, 4 and 6 separately for each stone. Re-app asks
for Violent, Legend and an innate, with SPD/ATK % in slot 2, CRI Dmg/HP % in slot 4 and
HP %/ATK % in slot 6. Refine uses the same slots, mains and rarity, allows either innate
state, and accepts Despair, Fight, Rage, Swift, Vampire, Violent and Will.
Its substats start empty with All: the user must state the criterion before a
Refine rule can recommend a stone. Existing saved rules retain every other choice
when these fields are absent; only the new fields start empty/All.

Previously saved combined rules become one rule in each column, with the same
conditions and distinct identifiers. A former innate requirement of true becomes
Yes; false becomes Both, preserving its original meaning rather than forbidding innates.
Rules previously switched off stay left out. Only the current rule shape is written.

No level is asked. A target needs a rune showing all four sub properties — a Legend from
`+0`, any lesser rarity from `+12` — because both stones are judged by which four types
the rune has; the game's own `+12` requirement is deliberately not applied, so a rune is
kept while it climbs there. An Intangible rune is never a target of either kind; an
Ancient rune and a rune with a Gem-converted line are never refine targets (a Grindstone
does not bar refinement).

**Refine uses the user's stated types and minimum, independently of roles or builds.**
`isRerollTarget` reads the raw sub properties against that rule. There is no automatic
best-types ranking, no hidden role-dependent gate and no inferred substitute for a
missing user criterion. A malformed stored substat list resets only that list; a
malformed minimum resets only that minimum to All. Valid but incompatible choices
remain visible for correction and cannot recommend a stone.

**A reroll is offered only instead of a sale.** This is a fixed decision, not a setting:
a target is asked only of a rune the engine would sell. A rune it would power up or keep
keeps that advice whatever a target describes. Where a rule describes a rune
the engine would sell, the rune gets **Refine** or **Re-app** ahead of the other
safeguards — Refine asked first, since a rune that already holds the user's wanted types needs
only better rolls. Neither is ever Sell, and neither changes a figure. The Advice filter
asks one question of both, **Re-app/refine**; the row still names the stone. Statistics
counts either at `+12` as kept. `rune-reapp-targets.ts` owns the rule and reads each
stored target field by field.

**Redesign verification, November 9, 2026.** The full equivalence baseline was captured
before this change from `ff75011` with `npm run verify:rune-cleanup-equivalence -- --write`:
582 runes across six scenarios, SHA-256
`aab8df2a901ec0d850ff4464b3c7189a5d492125b1ea389b8ab086ca7502050e`.
The post-change comparison reports every public field identical, with zero tolerance.
The local baseline remains in `work/rune-cleanup-equivalence-baseline.json`, as required
by the equivalence gate; this record identifies the fresh capture used for the redesign.

**Compact editor verification, November 9, 2026.** A fresh full baseline was captured
from `970a281` before removing Enabled with
`npm run verify:rune-cleanup-equivalence -- --write --baseline=work/reroll-editor-equivalence-baseline.json`.
Its SHA-256 is `aab8df2a901ec0d850ff4464b3c7189a5d492125b1ea389b8ab086ca7502050e`:
582 runes across six scenarios. The field comparison remains exact. The target rule
checks separately cover loading active choices without bringing disabled choices back.

**Separate columns verification, November 9, 2026.** A fresh full baseline was captured
from `127dc59` before this change with
`npm run verify:rune-cleanup-equivalence -- --write --baseline=work/separate-reroll-rules-baseline.json`.
Its SHA-256 is `aab8df2a901ec0d850ff4464b3c7189a5d492125b1ea389b8ab086ca7502050e`:
582 runes across six scenarios. Scores remain exact. Separate target checks cover all
three innate requirements on both stones, preservation of former choices and splitting
a combined rule into two independent rules.

**Manual Refine criteria verification, November 9, 2026.** Before removing the
automatic type ranking, a fresh full equivalence baseline was captured from the
engine at `1f03bcc` with `npm run verify:rune-cleanup-equivalence -- --write` and
copied to `work/refine-substats-before.json`. Its SHA-256 is
`aab8df2a901ec0d850ff4464b3c7189a5d492125b1ea389b8ab086ca7502050e`.
The comparison with `--baseline=work/refine-substats-before.json` passes exactly
for 582 runes across six scenarios, with zero tolerance. These scenarios disable
reroll safeguards and hold the scoring arithmetic; the separate target checks
verify 516 manual criteria against legal four-line runes, role independence,
main/innate exclusions and preference survival. Browser coverage includes empty
and full Refine input, six visible pills, changing an unavailable minimum,
fixed field geometry, ordering, reloads and actual verdict changes without a
new calculation.

## 4. The Location cell

The Location cell names the monster in Scenario, with **(+ X)** for its other placements.
Without a Scenario placement it says **Engraved × X**, including when X is one. The
counts include every preset, even several placements on the same monster, and the hover
names all of them. The Location filter classifies any placed rune as Engraved and an
unplaced rune as Inventory. Inventory is shown in muted grey.

## 5. The filter panel and the progress line

Rune Clean-up always shows one filter panel, including before a calculation or without
an import. The table says what is missing, and Calculate is disabled until an import, a
rune, a level-40 reference and a role are available. The panel has five independent
columns:

1. Search, Level, Slot;
2. Main, Set, Show only (Ancient);
3. Stars, Rarity, Location, Advice;
4. *Never sell if…*, *Use game-sorting*;
5. the table count with Reset filters, Calculate, and the progress line.

*Use game-sorting* reproduces the game's own Sort by. Sorting and Calculate sit at the
bottom of their columns; the last column has no divider. There is no separate calculation
bar.

**Progress.** Two lines are reserved beneath Calculate in every state, so the line never
moves the panel. While counting it reads `Calculating… X %`; the percentage counts two
units per rune — preparing its readings and settling its verdict — and says how far
through the work is, not how long is left. Calibration (`RUNE-CLEANUP-MATH.md` §9.4) is
reported separately: every star class present is calibrated before rune progress starts,
so a later class cannot send the line back, and the line reads `Calibrating… X %` above
`Only needed once.`, the percentage counting the sample runes judged. A warm calculation
skips it. The counted population belongs to the session and its calculation inputs, so
changing those inputs or reloading the page requires calibration again.

**The rune overlay** says it is still working at the far end of the main property's
line: a gold turning arc and `Calculating…` at body size. The mark is always laid out and
only shown or hidden, so its coming and going moves nothing.
