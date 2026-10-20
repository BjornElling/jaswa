# An ambiguous monster name is always qualified by its element

**Status:** Binding project rule (decided September 1, 2026) — a single,
deliberate exception to how JASWA names things
**Reviewed:** October 20, 2026
**Enforced by:** `npm run verify:element-qualified-names`
**Implemented in:** `app/lib/monster-catalog.ts`

---

## The rule

**Where two monsters of different elements share one displayed name, every one
of them is shown with its element in parentheses.**

```
DHALSIM (Water)      Geralt (Fire)       Nezuko Kamado (Dark)
```

A name that is already unique is left exactly as it is. `Elucia` is `Elucia`.
The parenthesis is earned by ambiguity, never added for decoration.

The element is written as `rune-sets.ts` writes it — `Water`, `Fire`, `Wind`,
`Light`, `Dark` — because that function is already the program's authority for
naming an element, and an interface that says `Water` in an artifact filter must
not say `water` in a monster name.

## Why the name may grow

JASWA's naming is otherwise plain — nothing is appended to a label that the
label does not need (`AGENTS.md` §5) — so `DHALSIM (Water)` can look like
clutter. It is not: without it a roster shows five rows reading `DHALSIM`.

**The element is the identifying half of the name.** Collaboration units ship
as five elemental copies under one licensed name. The game distinguishes them
by the icon's colour frame, which JASWA does not reproduce at every size a name
appears in.

**Element is also load-bearing.** An Attribute artifact may only be
engraved to a monster of a matching element (`ARTIFACT-CANONICAL.md` §1), so a
user reading a recommendation for `DHALSIM` cannot act on it without knowing
which DHALSIM. Hiding the element hides the reason a recommendation applies.

## Why it triggers on ambiguity rather than on a list

The obvious implementation is a list of affected monsters. It was rejected.

Every collaboration release ships units that share one name across all five
elements — Street Fighter, Witcher, Cookie Run, Assassin's Creed, Demon Slayer,
Tekken and Frieren among them — and Com2uS ships them continually;
`verify:element-qualified-names` prints how many names are ambiguous today.

A hand-maintained list would therefore be wrong within one collaboration, and
wrong in the quiet way: nobody notices a missing qualifier until they misread
their own roster. Deriving the set from the catalogue means the next
collaboration is covered the day its catalogue sync lands, with no one having to
remember anything.

The set is computed once, at module load, from `swarfarm-monsters.json`.

## What counts as the same monster

Ambiguity is judged within one **family and awakening tier** — that is, all
digits of the `unit_master_id` except the last, which is the element
(`ENGRAVING-STATISTICS.md` §4: an id is `<family><tier><element>`).

This matters because unrelated monsters occasionally share a name. `Theomars`
exists at `17111` and at `19211` — two different monsters, both Water. Keying on
the family prevents JASWA from reading those as one monster with two elements
and qualifying names that the element cannot disambiguate anyway.

## Ordering, when a name carries more than one suffix

The element attaches to the name it disambiguates, and awakening comes last:

```
Nezuko Kamado (Fire) (2A)
```

For a collaboration pair shown as one species — statistics, rankings,
recommendations — the pairing is composed first and qualified once:

```
RYU / Moore (Water)
```

Never `RYU (Water) / Moore (Water)`. Every member of a species shares an element
(`verify:collaboration-species` holds them to it), so repeating it states one
fact twice. The pairing is qualified when *either* half is ambiguous: the
licensed name is the one released in five elements, while the generic it
re-released as is usually unique, so testing only the generic would leave
`RYU / Moore` bare — the exact case the rule exists for.

## What this rule does not fix

A few monsters share a name at the same tier **within the same element** —
`Theomars` (`17111` and `19211`), `Amelia` (`21511` and `21611`), and
`Nezuko Kamado` (`31911` and `32011`). Element cannot separate these, because
they do not differ by element.

They are out of scope here and deliberately left alone rather than given a
different, invented qualifier. Recording the gap so it is visible: if these ever
need distinguishing, that is a separate decision, and inventing a disambiguator
without knowing what the game calls them would be `ARTIFACT-CANONICAL.md` §14's
prohibition on guessing.

## Guarding against reversal

Three things protect this rule, because a comment alone does not survive a
confident refactor:

1. **This document**, referenced by name from the code that implements it.
2. **A comment at the implementation** in `app/lib/monster-catalog.ts` marked
   `BINDING RULE`, pointing here and saying plainly not to remove the qualifier.
3. **`npm run verify:element-qualified-names`**, which fails the moment an
   ambiguous name is rendered without its element. It checks the real
   `monsterPresentation` output against the catalogue, so it breaks whether the
   rule is deleted, bypassed, or quietly stops matching new game data.

Run the verifier after any change to `monster-catalog.ts`, `rune-sets.ts`, the
collaboration species table, or a catalogue sync.
