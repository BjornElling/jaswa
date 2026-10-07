# Rune Optimization candidate review

Reviewed: 4 October 2026. The binding search contract is
[RUNE-OPTIMIZATION.md](RUNE-OPTIMIZATION.md). Craft and Intangible legality comes
from [RUNE-CANONICAL.md](RUNE-CANONICAL.md); damage and effective HP still use
[SWCalc](https://swcalc.cz/game-mechanics), through the shared stat sheet.

## Findings and changes

| Stage | Finding | Result |
| --- | --- | --- |
| Rune admission | A locally permitted set can be impossible across six actual slots. With Shield/Will and broken sets refused, a third four-set cannot fit. | Reconcile slot/set support before generating craft alternatives. Preserve every choice if the bounded proof runs out of work. |
| Intangible | It occupies one slot, at most one may be engraved, and it completes only a uniquely one-piece-short set. A locked Intangible is still engraved when additional Intangibles are disabled. | Use the shared final-set rules in support proofs; retain set identities wherever an admitted Intangible can affect completion. |
| Owned Gems | Only the best compatible grade/stack was offered. A scarce Legend or Immemorial item could hide a feasible lower-grade or set-specific plan. | Offer every compatible held stack with its true capacity. Keep standard, Ancient and Immemorial lineage rules in the craft owner. |
| Owned Grindstones | All wanted lines were ground together, or none were. A plan could not preserve just the scarce SPD stone while grinding ATK. | Make every held stone independently optional. |
| Ceilings | Fully grinding a theoretical rune, or refusing a lower same-stat Gem, could remove the only accepted build. An irrelevant Gem can be relevant when it removes excess SPD. | Retain unchanged theoretical lines and ceiling-reducing Gems. This review initially kept every numeric end state under a ceiling; the later range-allocation review narrows that expansion to ceiling-sensitive work. |
| Exact reduction | Range proofs followed the quadratic comparison; comparisons scanned unrelated stock plans; several work plans for one rune counted as several dominators. | Run ranges early, index ceiling/stock compatibility, reduce physical families locally, and count distinct physical dominators. Preserve the fewer-moves tie. |
| Range bonuses | Independent triple stat sets were promised even where too few actual slots could hold them. Required bonuses were omitted from lower bounds. | Bound bonuses by reachable slots and wildcard capacity; include unavoidable required bonuses in ceiling proofs. |
| Low depth | Grade and stone combinations could consume work without adding a new Gem placement. Independent high-scoring choices could reserve the same scarce stack. | Price resource scarcity in whole-build guidance, retain cheap and item-free complements, and keep every legal supply alternative for a selected placement. |
| Results | Alternative work on the same six runes filled separate rows and inflated the apparent diversity of a table. | Keep one row per physical rune combination, including across workers. Update that row when a better feasible plan is found. |
| Search | Enumerating every combination of optional stones and grades is unnecessary when no ceiling makes surplus harmful. | Search rune/Gem placements, then allocate each kind/stat supply exactly. Share prepared recipes and cache repeated supply matchings. |

## Why the allocation is exact

After six rune/Gem placements are fixed, the choice of Gem grade changes only its
new stat's amount. It does not change which line may be ground or the stone kept
by a same-stat conversion. Grindstones address separate kind/stat stacks. Thus
each kind/stat allocation has at most six requests, and different groups never
compete for an item.

Without ceilings, every read figure and floor is monotone in each accumulator.
Maximizing each group's total contribution therefore maximizes the complete
placement's ranking figure while preserving every floor it can meet. When the
independent best items fit, no matching is needed. Otherwise a small minimum-cost
flow respects stack capacities, with a free unchanged option for an optional
Grindstone. Ancient and set-specific compatibility is already encoded in the
legal alternatives supplied by the craft owner.

The tree and shader see optimistic recipe maxima, which may assume the same scarce
item on several runes. Only a processor-side allocation and the shared stat sheet
can admit a result. Graphics-card routing, agreement, fallback and buffer layout
remain under their existing owners. A ceiling invalidates the monotonicity proof
on the accumulators it reads. The subsequent
[range-allocation improvement](RUNE-OPTIMIZATION-RANGE-ALLOCATION.md) keeps that
work concrete while matching independent craft work separately; the measurements
below precede that improvement.

## Measurements and their limits

On a local captured account, Poseidon asked for Despair/Focus, ATK % / CRI Dmg /
ATK % mains, 215 SPD, 75 ACC, 60,000 E.HP and 30,000 E.HP D, owned items and 50 rows
at depth 1. Both following runs used the same prepared shortlist and distinct
physical result rows on the processor:

| Search | Search time | Best DMG | Finished shortlist? |
| --- | ---: | ---: | --- |
| Exact resource allocation | 2.12 s | 6,674 | Yes |
| Full grade/stone combinations, allocation disabled | 15.01 s | 6,566 | No: reached the limit |

The allocation run finished in about one seventh of the time the expanded run
spent before stopping. The expanded run's result is not a proven maximum. The
preceding implementation found 6,568 on this capture; it searched a smaller
question that omitted lower grades and partial grinding, and could finish faster
than the corrected full calculation. Preparation remains additional work; this
is not a blanket sevenfold improvement over every earlier query.

The real Galleon flow on the existing `http://localhost:3000/` server, Chromium and
the graphics card returned 50 distinct builds with best DMG 6,231 and finished the
depth-1 shortlist in 22.97 seconds including preparation and worker setup. Its
question was Shield/Will, ATK % or SPD / CRI Dmg / ATK % or ACC, 218 SPD, 100,000
E.HP and 50,000 E.HP D. Empty and populated screenshots, result opening and Escape
were exercised; the monster and requirement panels kept their measured boxes.

Finite depth still cuts Gem placements and physical rune families. Neither a
completed shortlist nor the beam proves the account's global optimum. Wider
questions and ceiling-heavy questions can still hit their time limit.

## Verification

- The domain oracle compares 200 random accounts against unreduced brute force,
  including whole, split, shared-bar, sliced and card-pass searches.
- Allocation is compared with full craft enumeration, including 16 richer pools
  with standard, Ancient, set-specific and Immemorial supply, converted lines,
  optional stones and shared stock. Worker cloning preserves prepared recipe aliases.
- Fixed quality pools compare depth 1 with depth 10 and hold nested finite-depth
  choices, empty questions, impossible ranges and Intangible completion.
- The real-card check compares both engines on 84 accounts. The shader still
  receives generous bounds; the processor supplies final figures and item spend.
- Import parity is audited against the local 2,437-rune capture. Personal exports,
  benchmarks and screenshots remain local under `work/`.

Roles, settings and import mode keep their existing meanings and readers. No
preference field or format was changed.
