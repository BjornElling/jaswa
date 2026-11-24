# Language Contract

**Status:** Binding project rule
**Reviewed:** October 20, 2026

## Rule

All JASWA product work is written in English.

This includes:

- user-facing interface text, labels, messages, errors, empty states, and help text;
- source code identifiers where a name is visible or meaningful to maintainers;
- comments, docstrings, code examples, test names, and developer-facing documentation;
- commit messages and new project documentation.

## Tone

Copy should be concise, clear, and lightly playful. Cultural references are
welcome when they improve the moment, but never at the expense of clarity or
accessibility. Keep humour short; make the action or meaning obvious first.

## Game terminology

Use "monster" and "monsters" by default. **Mon** and **mons** are the user's
own choice for the interface labels that carry them today — *Value on mon*,
*Score on this mon*, *mons you own*, *Fodder mon*, *Add mon*, *Use for mons*
and their kin — and stay there (the user's decision, October 19, 2026). A new
label uses "monster" unless the user asks for "mon".

The game uses **engrave** for all three kinds of gear: "engraved Runes",
"Relic Engrave List", the "Rune / Artifact / Relic Engraving Statistics"
panels. JASWA uses it alone. The full table:

| Concept | JASWA word | Never |
| --- | --- | --- |
| A rune, artifact or relic on a monster | **engraved** (verb **engrave**) | equipped, equip, worn, wearer, wears, socketed |
| A rune or artifact on no monster in a context | **in inventory** | free, unused, spare |
| One saved deck | **preset** | deck (in the interface), scenario; "team" as the name of the saved deck |
| The monsters a preset fights with | **team** — "Shares 2 runes with another team" | |
| The grouping of presets | **content**, by the game's name | preset type, mode |
| A monster's own arrangement outside presets | **Scenario** | current build, worn build, default |
| Rune Clean-up's role targets | **roles** | presets |
| A monster's stated job in Scenario or one content-area | **profile** | preset |
| A rune's drop tier (Normal … Legend) | **rarity** | quality, grade |
| A standard setting or starting value | **default** | the Scenario placement context |
| A speed | **display speed** or **combat speed** (`SPEED-TICK-CANONICAL.md` §1) | bare "speed"; a rune line's value is **SPD** |

An artifact's tier (Normal … Legend) reads *Grade* on some pages and *Quality*
on others; which word wins is open (`DECK-PRESETS.md` §7). Language keywords,
external API spellings and raw export field names (`occupied_id`, `equip`)
retain their required form.

## Exceptions

Verbatim game names, player-supplied data, imported game data, quotations, and
third-party source material may retain their original language. Translations
may be added only when they help the user understand the content.

## Review gate

Before a change is considered complete, review every added or edited string,
comment, and identifier against this contract. If a non-English addition is
intentional, document the reason in the relevant change or review note.
