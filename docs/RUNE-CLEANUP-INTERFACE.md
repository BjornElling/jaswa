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

Rune Settings holds a user-managed list under **Re-app/refine target**. Add, edit,
duplicate, disable or delete any number of named rules. The empty list means no reroll
protection and stays empty after reload. Names need not be unique; identifiers must be.
The cards retain the role-card frame and muted data of Rune Settings.

Each rule chooses **Re-app**, **Refine** or **Re-app + Refine**, **Slots**, **Rune type**
(sets; Intangible not offered), **Min rarity**, **Innate** (Any/Required) and **Main stat**.
All conditions within one rule must hold; any enabled rule is enough. Empty inclusive
groups mean any value, as does selecting every option. Any innate satisfies Required;
Any allows a rune with or without one. Every main stat is named precisely, including
flat versus percentage ATK, DEF and HP; odd slots retain their fixed flat main.

The editor keeps choices visible and never removes one to make another fit. Every
selected slot must support at least one selected main, and every selected main must
occur in at least one selected slot. No main selection and the complete main group both
remove the main-stat requirement. With no selected slots, this checks all six.
An incompatible combination explains the problem and blocks Save rule. Thus ATK %
with slot 1 is invalid, flat ATK with slot 1 is valid, and SPD plus CRI Dmg across slots
2 and 4 is valid: either main matches where the game permits it. Stored incompatible
combinations remain visible for correction but cannot recommend a stone.

A combined rule uses the same conditions for both stones, tries Refine first and falls
back to Re-app when refinement does not apply. Separate rules are useful when the two
stones need different sets, mains or innate requirements. Rule order never determines
priority. All fields keep their place when the target or Enabled choice changes.

The shipped rules cover slots 2, 4 and 6 separately for each stone. Re-app asks for
Violent, Legend and an innate, with SPD/ATK % in slot 2, CRI Dmg/HP % in slot 4 and
HP %/ATK % in slot 6. Refine uses the same slots, mains and rarity, asks for no innate,
and accepts Despair, Fight, Rage, Swift, Vampire, Violent and Will. Previously saved
slot choices become individual rules, disabled choices included, so the developer's
preferences survive the redesign. Only the rule list is written afterwards.

No level is asked. A target needs a rune showing all four sub properties — a Legend from
`+0`, any lesser rarity from `+12` — because both stones are judged by which four types
the rune has; the game's own `+12` requirement is deliberately not applied, so a rune is
kept while it climbs there. An Intangible rune is never a target of either kind; an
Ancient rune and a rune with a Gem-converted line are never refine targets (a Grindstone
does not bar refinement).

**A refine target must also hold the four best line types of some build.** Every build of
every role that takes the rune's main is asked. Each type the slot allows beside the main
— the innate's type included — is ranked first by its price at one max roll in that
build's valuation (`RUNE-CLEANUP-MATH.md` §4), then, among types priced alike, a stat the
role names a target for by the size of a max roll on the reference line, and an unnamed
stat last. The rune qualifies when no type it lacks ranks above its weakest line, so a tie
for fourth admits either type; a rune with fewer than four lines does not qualify. An
innate whose type is among the best four has taken a place no refinement gives back, so
such a rune is never a refine target. The engine carries the answer out as
`bestLineTypes` (`holdsBestLineTypes`), read from every build.

**A reroll is offered only instead of a sale.** This is a fixed decision, not a setting:
a target is asked only of a rune the engine would sell. A rune it would power up or keep
keeps that advice whatever a target describes. Where an enabled rule describes a rune
the engine would sell, the rune gets **Refine** or **Re-app** ahead of the other
safeguards — Refine asked first, since a rune that already holds the four best types needs
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
