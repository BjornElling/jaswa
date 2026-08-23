# Rune Potential — preset-metrikker

**Status:** Kanonisk beregningskontrakt for `DMG`, `E.HP` og `E.HP D` i Rune
Potential-presets  
**Afhængighed:** `docs/RUNE-POTENTIAL-MATH.md` og `docs/RUNE-CANONICAL.md`  
**Version:** 1.0 · **kontrolleret:** 23. august 2026

Dette er det eneste dokument, der fastlægger disse tre metrikker. De bruges
til at vægte, hvilke stats og Rune Sets en preset finder ønskværdige, når
Rune Potential senere vurderer, om en rune bør rulles eller sælges. De er ikke
en universel kamp-simulator og erstatter aldrig en monsters specifikke skill.

## 1. Input og notation

Alle input er monsterets **samlede, aktuelle** stats efter runer og permanente
personlige setbonusser:

- `ATK`, `HP` og `DEF` er heltal.
- `CR` er Critical Rate som decimal, begrænset til `[0, 1]`.
- `CD` er den viste Critical Damage som decimal (fx 150 % = `1.50`).

Account-towers, leader skills, buffs, artifacts, skill-ups, fjendens DEF,
element, tilfældig damage variance og kampafhængige seteffekter indgår ikke.
Denne afgrænsning gør metrikkerne stabile til en generel rune-preset.

## 2. DMG — gennemsnitlig ATK-baseret kritisk output

```text
DMG = ATK × (1 + CR × CD)
```

Det er det forventede skadegrundlag før skill-multiplier og målreduktion:

```text
ATK × (1 + CD) × CR + ATK × (1 - CR)
```

Formlen gælder kun for almindeligt ATK-skalerende hits. DEF-, HP-, SPD- eller
hybrid-skalerende skills skal i en senere monsterspecifik beregning bruge deres
faktiske skill-koefficienter. Derfor er `DMG`-vægten lav eller nul for Def DD,
Bomber, Support og PvP def; den må ikke fejlagtigt gøre ATK til en universelt
god substat.

## 3. E.HP — effektiv holdbarhed uden DEF break

```text
E.HP = HP × (1142 + 3.572 × DEF) / 1000
```

E.HP angiver det rå skadeinput, der omtrent skal til for at nedbringe den
aktuelle HP gennem den observerede DEF-reduktionsfaktor:

```text
defenseFactor = 1000 / (1142 + 3.572 × DEF)
```

## 4. E.HP D — effektiv holdbarhed under DEF break

```text
E.HP D = HP × (1142 + 3.572 × (0.3 × DEF)) / 1000
```

DEF break sætter den effektive DEF til 30 % af den normale DEF. `E.HP D`
foretrækker derfor HP, når en rolle skal holde til almindelig DEF break, mens
E.HP også belønner den normale balance mellem HP og DEF.

## 5. Preset-vægte

Hver låste arbejds-preset har en heltalsvægt `0–5` for hver metriks betydning:

| Vægt | Betydning |
| --- | --- |
| 0 | Ignoreres for rollen. |
| 1 | Lav prioritet. |
| 2–3 | Relevant støtteprioritet. |
| 4 | Høj prioritet. |
| 5 | Primært vurderingsgrundlag. |

Vægtene er produktvalg, ikke spilregler. Når Rune Potential får sin egentlige
rulle-/sælg-algoritme, skal den beregne en runs lovlige Current/Ceiling-udfald
først (som beskrevet i `RUNE-POTENTIAL-MATH.md`) og derefter anvende den valgte
presets set- og metrikvægte. En manglende metric eller vægt må aldrig få en
stiltiende default.

## 6. Kilder og revisionsregel

1. [SWCalc — Summoners War Mechanics](https://swcalc.cz/game-mechanics) —
   dokumenteret skadepipeline, statskalering, crit-bucket og den empiriske
   DEF-faktor `1000 / (1142 + 3.572 × DEF)`.
2. [SWLens RTA Builder Wizard & Optimizer Guide](https://www.swlens.io/guides/rta-wizard)
   — praktisk optimizer-præcedens for gennemsnitlig `DMG` og EHP som
   rollemetrikker.
3. [Summoners War Defense and HP](https://timmytim231blog.wordpress.com/2019/02/03/summoners-war-defense-and-hp/)
   — uafhængig forklaring af sammenhængen mellem HP, DEF og effective HP.

SWCalc beskriver modellen som en verificeret praktisk forudsigelsesmodel, ikke
offentliggjort spil-kildekode. Ved en reproducerbar nyere klientobservation
opdateres kun dette dokument først og derefter kode og tests.
