# Rune Clean-up — beregningskontrakt

**Status:** Bindende arbejdsdokument for Rune Clean-up  
**Afhængighed:** `docs/RUNE-CANONICAL.md`  
**Kontrolleret:** 23. august 2026

Dette dokument fastlægger beregningen, men ikke spillets regler. Det må kun
bruge accepterede regeldata fra den kanoniske specifikation og den lokale
SWEX-eksport.

## 1. Formål

Rune Clean-up er et beslutningsværktøj før spilleren bruger Mana. Det svarer
på tre adskilte spørgsmål:

1. Hvad er runens aktuelle, sikre bidrag?
2. Hvilke sluttilstande kan den stadig lovligt nå ved almindelige power-ups?
3. Hvilke af dem kan hjælpe et konkret, brugerdefineret monster-mål?

En mulig top-roll må ikke vises som sandsynlig, og en rune må ikke kaldes god
eller dårlig ud fra en skjult, generisk score.

## 2. Inputkontrakt

For hver rune læses kun lokale eksportdata:

```text
rune_id, set_id, slot_no, class, rank, upgrade_curr,
pri_eff, prefix_eff, sec_eff, extra
```

`sec_eff[i]` har formen `[effectId, baseOrGemValue, gemMarker, grindValue]`.
Den aktuelle Sub Property-værdi er derfor:

```text
currentSubValue = baseOrGemValue + grindValue
```

Grindstone-værdien er allerede opnået værdi, ikke en fremtidig roll, og må
ikke tælles to gange. Main Property og Prefix Property er aktuelle stats, men
de er ikke Sub Property-rolls. `gemMarker` medfører, at den importerede
Sub Property er Gem-konverteret; det er inputfakta, ikke en beregnet antagelse.

Rune Clean-up accepterer kun 6★ almindelige runer (`class = 6`) med `rank` 1–5 og
`upgrade_curr` 0–15. Alt andet vises med kendte aktuelle data, men uden
numerisk potentiale. Det gælder især Ancient Runes (`class = 16`), indtil deres
komplette intervaltabel er verificeret.

## 3. Power-up-budget og validering

Lad `P = {3, 6, 9, 12}`. For en rune på level `L` er de resterende
Sub Property-hændelser:

```text
E(L) = { p i P | p > L }
```

Hver `p` er enten:

- `ADD`: tilføj en ny lovlig og hidtil fraværende Sub Property, eller
- `ROLL`: forbedr én eksisterende Sub Property.

ADD/ROLL-mønstret læses fra default-grade-tabellen i den kanoniske
specifikation. +15 indgår aldrig i `E(L)`.

Før projektion skal importen valideres: antal Sub Properties skal passe til
`rank` og `upgrade_curr`; typer må ikke duplikere Main Property, Prefix
Property eller hinanden; og de skal overholde slotreglerne. Alle effekt-ID'er,
modifikationsfelter og level skal være gyldige. Ved fejl vises *Importdata kan
ikke valideres*. Systemet må ikke reparere eller gætte data.

## 4. Projektion som udfaldsrum, ikke forudsigelse

For en eksisterende stat `s` med 6★-interval `[min(s), max(s)]` og `k_s`
kommende ROLL-hændelser gælder:

```text
lower(s) = currentSubValue(s) + k_s * min(s)
upper(s) = currentSubValue(s) + k_s * max(s)
```

`k_s` kan ikke overstige antal ROLL-hændelser, og summen af `k_s` over alle
eksisterende Sub Properties skal være præcis antal ROLL-hændelser. Ved ADD
vælges en lovlig, manglende type med værdi i dens statinterval.

En sluttilstand er en vektor:

```text
V = (HP+, HP%, ATK+, ATK%, DEF+, DEF%, SPD, CRI Rate, CRI Dmg, Resistance, Accuracy)
```

Produktet må generere alle lovlige vektorer eller repræsentere dem ækvivalent.
Det må aldrig vise de uafhængige `upper`-værdier som om de kan opnås samtidig.
Hver konkret ceiling skal have en synlig, fælles allokering af ADD- og
ROLL-hændelser.

### Resultater der altid holdes adskilt

1. **Current**: faktiske importerede værdier nu.
2. **Ceiling**: bedste konkrete, lovlige sluttilstand under et angivet mål
   eller vægtsæt; vis altid roll-fordelingen.
3. **Reachable range**: laveste/højeste nåelige værdi pr. stat, med advarsel
   om at statternes maxima konkurrerer om samme rolls.

“Potential” betyder kun dette lovlige udfaldsrum. Det betyder ikke
sandsynlighed, forventet værdi eller win rate.

## 5. Målbaseret vurdering

Runeværdi afhænger af monster, rolle og setkrav. Et mål har denne kontrakt:

```text
goal = {
  monsterId,
  allowedSets,              // tom = intet setkrav
  requiredMainBySlot,       // valgfrit slot -> godkendte Main Properties
  minimumTotalStats,        // f.eks. SPD >= 200, Accuracy >= 45
  weights                   // valgfri, ikke-negative brugerpræferencer
}
```

For hver kandidatvektor `V` beregnes monsterets totale stats efter JASWA's
fælles statformler. Målet er **opnåeligt**, når mindst én lovlig sluttilstand
opfylder alle minimumstats samt set- og Main Property-krav.

Vægte er kun en gennemsigtig sorteringspræference, aldrig en spilregel:

```text
utility(V, goal) = sum_s weight[s] * cappedProgress(s, V, goal)

cappedProgress = 1                                når mål er opfyldt
                 min(1, gainedTowardsGoal / gap)  ellers
```

Uden mål eller vægte vises ingen skjult universalscore. I stedet vises Current,
Reachable range og eventuel Pareto-dominans.

Rune A dominerer Rune B for samme slot-/setkrav, når A er mindst lige så god
på alle valgte stats og bedre på mindst én, både i Current og i den
sammenlignede konkrete potentialetilstand. Kun da må produktet sige
“overgået” uden brugerens vægtning.

## 6. Set-effekter

En enkelt runes Sub Properties evalueres først isoleret. Set-effekt medregnes
kun i en komplet seks-slot build, fordi den afhænger af de fem andre runer.

- Personlig konstant stat (Energy, Guard, Swift, Blade, Rage, Focus, Endure,
  Fatal) medregnes kun for bæreren ved komplet set.
- Teamstat (Fight, Determination, Enhance, Accuracy, Tolerance) gælder alle
  medlemmer af samme hold, **også bæreren**. Den må hverken tilskrives én
  enkelt rune eller udelades fra dens bærer.
- For Fight, Determination og Enhance beregnes hvert teamset-bidrag ud fra
  den enkelte modtagers egen base-stat. Det er ikke en procent af setbærerens
  stat og ikke en procent af modtagerens allerede runede total.
- Antallet af færdige teamsets tælles på hele holdet. Bidragene summeres
  additivt, før de anvendes på hver modtagers relevante base-stat. Accuracy
  og Tolerance summeres som deres dokumenterede procentpoint-bidrag.
- Kamp-, chance- og tilstandseffekter (bl.a. Violent, Will, Shield og Seal)
  vises som setegenskab, men omregnes ikke til opdigtede efficiency-point.
- Intangible kan kun fuldføre ét set, der mangler præcis én rune.

En teamfølsom målvurdering kræver derfor disse eksplicitte input ud over den
enkelte rune:

```text
team = {
  members: [{ monsterId, baseStats, completeSetCounts }],
  scope: "same-battle-team"
}
```

Mangler team eller baseStats, må Rune Clean-up vise teamseteffekten som
*kontekstafhængig* i stedet for at gætte en personlig statgevinst. Multi-party
mode er ikke dækket af `scope: "same-battle-team"`.

## 7. Afgrænsning og senere modifikationsanalyse

Den første numeriske potentialeprojektion simulerer alene naturlige
Power-up-udfald. Den viser dog altid de allerede importerede Gem- og
Grindstone-værdier som del af **Current**. Den må ikke foreslå eller antage et
fremtidigt Gem-, Grindstone-, Reappraisal- eller Refinement-resultat, før
brugeren vælger en særskilt modifikationsanalyse.

En senere modifikationsanalyse skal bruge disse separate, ikke-kombinerede
operationer fra den kanoniske kontrakt:

- **Gem:** vælg én lovlig eksisterende Sub Property og erstat den med ét
  grade-afhængigt Gem-udfald. Den nye stat starter uden den erstattede stats
  historiske Power-up-rolls.
- **Grindstone:** føj ét grade-afhængigt tillæg til en tilladt eksisterende
  Sub Property, også hvis den er Gem-konverteret. Generér kun et nyt forsøg,
  hvis itemets interval potentielt kan forbedre det nuværende tillæg.
- **Reappraisal:** bevar Prefix Property, men opret et nyt fire-Sub-Property-
  udfald; fjern Gem- og Grindstone-modifikationer ved accepteret resultat.
- **Rune Refinement:** bevar Sub Property-typer og Grindstone-tillæg, men
  generér kun omfordelinger, som er lovlige efter den kanoniske kontrakt.
  Afvis Gem-konverterede, Ancient og Intangible runer.

Ingen operation må vælges implicit for at forbedre en score. Følgende indgår
fortsat ikke i den numeriske projektion:

- sandsynligheder for statvalg eller talværdi ved en roll;
- artifacts, skill-multipliers, buffs/debuffs og kampsimulation;
- forventet kampværdi af chancebaserede Rune Sets;
- Ancient Rune-ceilings og alle 1–5★ Rune-ceilings.

Det er ikke en værdidom over disse runer; det forhindrer blot, at JASWA
forklæder en antagelse som spilfaktum.

## 8. Adversarial testkrav

| Risiko | Ufravigelig test |
| --- | --- |
| +15 tælles som Sub Property-roll | Den må aldrig tilføre roll. |
| Grindstone tælles to gange | `baseOrGemValue + grindValue` bruges nøjagtigt én gang. |
| Prefix ender som Sub Property | Import og ADD/Gem/Reappraisal afviser Prefix-typen. |
| Slot 1/3 får forbudt stat | Test begge retninger: slot 1 afviser DEF +/DEF %, slot 3 afviser ATK +/ATK %. |
| Gem og Grindstone betragtes som modsætninger | En gyldig, grindbar Gem-stat kan have begge markører og tælles korrekt. |
| Uforbedrende Grindstone tilbydes | Et item, hvis maksimum ikke kan slå nuværende tillæg, afvises. |
| Reappraisal ændrer Prefix Property | Accepteret Reappraisal bevarer Prefix, men fjerner Gem/Grindstone. |
| Refinement køres på Gem-rune | Handlingen afvises før nogen projektion. |
| Flad og procentstat blandes | Effekt-ID, enhed og interval bevares hele vejen. |
| Uafhængige maxima fremstår samtidige | Ceiling skal have fælles gyldig roll-allokering. |
| Setbonus gives til én rune | Beregn først efter seks-slots build. |
| Teamset rammer ikke bæreren | Et Fight-/Determination-/Enhance-set giver også bæreren den relevante bonus. |
| Teamset bruger forkert grundlag | Samme Fight-set giver 8 % af hver modtagers egen base ATK, aldrig 8 % af bærerens ATK eller runet total. |
| Flere teamsets multipliceres | To eller flere færdige teamsets summeres additivt før beregning. |
| Shield-varighed er forkert | Vis 3 turns; hold Shield ude af stat-ceiling og score. |
| Intangible fuldfører flere sets | Test 3+2+1 og flere ufuldstændige sets. |
| Flere Intangible-runer tillades | Byggen afvises, fordi ét monster højst må have én. |
| Uverificeret Ancient-data bruges | `class = 16` får ingen tal-ceiling. |
| Nyt importformat | Vis ukendt/ikke-valideret, aldrig fallback-score. |

## 9. Ændringsprocedure

En beregningsændring opdaterer først dette dokument, derefter den kanoniske
specifikation hvis spilreglen ændres, og til sidst kode og tests. Kræver en
foreslået funktion en uprøvet antagelse, står den som *afventende verificering*
i stedet for at få en default.
