# Rune Potential — preset-metrikker

**Status:** Kanonisk beregningskontrakt for `DMG`, `E.HP`, `E.HP D` og `Eff. %`
i Rune Potential-presets
**Afhængighed:** `docs/RUNE-POTENTIAL-MATH.md` og `docs/RUNE-CANONICAL.md`  
**Version:** 1.1 · **kontrolleret:** 23. august 2026

Dette er det eneste dokument, der fastlægger disse fire metrikker. De bruges
til at vægte, hvilke stats og Rune Sets en preset finder ønskværdige, når
Rune Potential senere vurderer, om en rune bør rulles eller sælges. De er ikke
en universel kamp-simulator og erstatter aldrig en monsters specifikke skill.

## 1. Input og notation

Alle input er monsterets **samlede, aktuelle** stats efter runer, permanente
personlige setbonusser og artefakternes Main Property:

- `ATK`, `HP` og `DEF` er heltal.
- `CR` er Critical Rate som decimal, begrænset til `[0, 1]`.
- `CD` er den viste Critical Damage som decimal (fx 150 % = `1.50`).

Account-towers, leader skills, buffs, skill-ups, artefakters sekundære
kampvirkninger, fjendens DEF, element, tilfældig damage variance og
kampafhængige seteffekter indgår ikke. Denne afgrænsning gør metrikkerne
stabile til en generel rune-preset.

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
E.HP = HP × (1140 + 3.5 × DEF) / 1000
```

E.HP angiver det rå skadeinput, der omtrent skal til for at nedbringe den
aktuelle HP gennem den observerede DEF-reduktionsfaktor:

```text
defenseFactor = 1000 / (1140 + 3.5 × DEF)
```

## 4. E.HP D — effektiv holdbarhed under DEF break

```text
E.HP D = HP × (1140 + 3.5 × (0.3 × DEF)) / 1000
```

DEF break sætter den effektive DEF til 30 % af den normale DEF. `E.HP D`
foretrækker derfor HP, når en rolle skal holde til almindelig DEF break, mens
E.HP også belønner den normale balance mellem HP og DEF.

## 5. Eff. % — SWOP-kompatibel rune-effektivitet

`Eff. %` er en egenskab ved **én rune**, ikke en monsters samlet stat. Den
angiver, hvor meget af en standardiseret seksstjernet +15-runes statbudget der
findes på den importerede rune. Main Property, aktuelle Sub Properties,
Grindstone-tillæg og Prefix Property indgår; Gem-markøren ændrer ikke værdien.
Flad HP, ATK og DEF tæller med 50 % af deres aktuelle værdi.

```text
mainRatio = mainMax(star) / mainMax(6)
weightedValue = (baseOrGemValue + grindValue) × 0.5  // kun HP +, ATK + og DEF +
              =  baseOrGemValue + grindValue        // alle andre stats
subRatio  = sum(weightedValue / sixStarSubMax(effect))
innateRatio = weightedPrefixValue / sixStarSubMax(prefixEffect)   // kun hvis Prefix findes

Eff. % = 100 × (mainRatio + subRatio + innateRatio) / 2.8
```

Seksstjerne-referencerne for Sub Properties er:

| Stat | Reference |
| --- | ---: |
| HP + | 1.875 |
| HP %, ATK %, DEF %, Resistance, Accuracy | 40 % |
| ATK +, DEF + | 100 |
| SPD, CRI Rate | 30 |
| CRI Dmg | 35 % |

For Ancient Runes anvendes `class - 10` som stjerneværdi for `mainRatio`, som
i SWOPs beregning. Alle værdier holdes præcise i beregningen; SWOP-kompatibel
visning skærer først tallet ned til heltal. En monsters `Avg. Eff. %` er det
aritmetiske gennemsnit af de seks udstyrede runers uafrundede `Eff. %`, vist
med to decimaler.

`Eff. %` er en generel kvalitetsindikator og er derfor vægtet 2 i alle
arbejds-presets. Den kan ikke alene gøre en rune ønskværdig for en bestemt
rolle; set-, substat- og de øvrige metrikvægte gælder fortsat.

## 6. Verificering mod Culpa-kontrollen

Den brugerleverede eksport `Culpa-21822407.json` er brugt som inputdata, og
SWOP Pro-skærmprintet er kontrollens facit. Beths artefakter har hver `ATK +100`;
de to +200 ATK skal derfor med i monsterets statark, før DMG beregnes.

| Værdi | Beregning fra eksport | SWOP Pro |
| --- | ---: | ---: |
| HP | 15.319 | 15.319 |
| ATK | 2.712 | 2.712 |
| DEF | 849 | 849 |
| SPD | 224 | 224 |
| DMG | 6.778,3728 → `6.778` | 6.778 |
| E.HP | 62.984,0685 → `62.984` | 62.984 |
| E.HP D | 31.119,7826 → `31.119` | 31.119 |
| Avg. Eff. % | 90,82 | 90,82 |

Beths seks uafrundede rune-effektiviteter er `94,86`, `81,46`, `96,30`,
`94,05`, `89,50` og `88,73`; gennemsnittet er præcis `90,82`. Det matcher
de viste enkelt-runer (95, 81, 96, 94, 90 og 89 efter SWOPs nedadgående
heltalsvisning). Kontrol af resten af de første ti rækker bekræftede også
SWOPs 50 %-vægtning af flad HP/ATK/DEF: Lapis `93,41`, Konamiya `96,79`,
Megan `106,17`, Emma `90,18`, Sigmarus `88,23` og Verad `90,50` matcher
skærmprintet. Kontrollen viste desuden, at den tidligere E.HP-konstant
`1142 + 3.572 × DEF` ikke er SWOP Pro-værdien og er erstattet ovenfor.

## 7. Preset-vægte

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

## 8. Kilder og revisionsregel

1. [SWCalc — Summoners War Mechanics](https://swcalc.cz/game-mechanics) —
   dokumenteret skadepipeline, statskalering og crit-bucket.
2. [SWLens RTA Builder Wizard & Optimizer Guide](https://www.swlens.io/guides/rta-wizard)
   — praktisk optimizer-præcedens for gennemsnitlig `DMG` og EHP som
   rollemetrikker.
3. [SWEX mapping.js](https://github.com/Xzandro/sw-exporter/blob/master/app/mapping.js)
   — åbent tilgængelig SWOP-kompatibel referenceimplementation for `Eff. %`,
   inklusive `2.8`-normalisering, Main/Prefix-logik og Grindstone-tillæg.
4. [SWGT — EFF% og score](https://swgt.io/controllers/faq/view?faqEntryID=76)
   — dokumenterer den SWOP-forankrede standard, hvor flad HP/ATK/DEF vægtes
   til 50 %.
5. [Summoners War Defense and HP](https://timmytim231blog.wordpress.com/2019/02/03/summoners-war-defense-and-hp/)
   — uafhængig forklaring af sammenhængen mellem HP, DEF og effective HP.

SWCalc beskriver modellen som en verificeret praktisk forudsigelsesmodel, ikke
offentliggjort spil-kildekode. Ved en reproducerbar nyere klientobservation
opdateres kun dette dokument først og derefter kode og tests.
