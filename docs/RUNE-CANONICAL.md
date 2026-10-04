# Rune-regler — kanonisk specifikation

**Status:** Bindende regelgrundlag for JASWA Rune Clean-up  
**Kontrolleret:** 4. oktober 2026
**Spil:** *Summoners War: Sky Arena* (ikke *Chronicles* eller *Lost Centuria*)

Dette dokument er den kanoniske beskrivelse af spilregler, som Rune Clean-up
må bygge på. Hvis kode, UI eller en sekundær guide modsiger dokumentet, er
dokumentet styrende, indtil det er rettet med dokumenteret belæg.

Det skelner bevidst mellem **verificeret regel** (dokumenteret i kilderne
nederst eller i den observerede eksport) og **afventende verificering**. Det
sidste er hverken en antagelse eller en tilladt standardværdi i kode.

## 1. Grundmodel og ordliste

Et monster kan have seks runer, én i hver **slot** 1–6. En rune har et
**Rune Set** (`set_id`), slot (`slot_no`), stjerneklasse (**grade**, 1–6★;
`class` i eksporten), sjældenhed (**default grade** / rarity; `extra`),
**Main Property** (`pri_eff`), eventuelt **Prefix Property** / innate
(`prefix_eff`) og nul til fire **Sub Properties** (`sec_eff`).

En **roll** er enten den oprindelige værdi af en Sub Property eller en senere
forbedring af den ved +3, +6, +9 eller +12. +15 giver ikke en Sub
Property-roll; det forbedrer Main Property.

JASWA's fremskrivninger, Max-værdier og chanceberegninger beskriver den færdige
rune ved +15. Sub Property-delen er identisk med +12, fordi der ikke sker nogen
roll fra +12 til +15; kun Main Property vokser deterministisk i det interval.

Spilnavnene er **HP**, **ATK**, **DEF**, **SPD**, **CRI Rate**, **CRI Dmg**,
**Resistance** og **Accuracy**. JASWA skal bruge disse navne i UI; danske
forklaringer må stå ved siden af, men må ikke erstatte dem.

## 2. Stats og eksportkodning

Mappingen er verificeret mod den brugerleverede eksport `Culpa-21822407.json`
(klient 9.2.9) og svarer til SWEX-formatet.

| Effekt-ID | Spilnavn | Form |
| ---: | --- | --- |
| 1 | HP + | flad |
| 2 | HP % | procent |
| 3 | ATK + | flad |
| 4 | ATK % | procent |
| 5 | DEF + | flad |
| 6 | DEF % | procent |
| 8 | SPD | flad |
| 9 | CRI Rate | procentpoint |
| 10 | CRI Dmg | procentpoint |
| 11 | Resistance | procentpoint |
| 12 | Accuracy | procentpoint |

Effekt 7 er ikke en gyldig almindelig rune-property i den observerede eksport.
Kode må ikke opfinde en betydning for den.

## 3. Lovlige Main Properties pr. slot

| Slot | Type | Lovlige Main Properties |
| ---: | --- | --- |
| 1 | fast | ATK + |
| 2 | valgbar | HP +, HP %, ATK +, ATK %, DEF +, DEF %, SPD |
| 3 | fast | DEF + |
| 4 | valgbar | HP +, HP %, ATK +, ATK %, DEF +, DEF %, CRI Rate, CRI Dmg |
| 5 | fast | HP + |
| 6 | valgbar | HP +, HP %, ATK +, ATK %, DEF +, DEF %, Resistance, Accuracy |

En Sub Property må ikke have samme stattype som Main Property, og samme
Sub Property-type kan ikke forekomme to gange på samme rune.

### Main Property ved +15

Main Property vokser deterministisk ved power-up; den er ikke et roll. Tabellen
viser den endelige +15-værdi for en almindelig rune pr. stjerneklasse. Hver
stat kan kun bruges i de slots, der er tilladt i tabellen ovenfor.

| Main Property | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HP + | 804 | 1.092 | 1.380 | 1.704 | 2.088 | 2.448 |
| HP %, ATK %, DEF % | 18 % | 20 % | 38 % | 43 % | 51 % | 63 % |
| ATK +, DEF + | 54 | 74 | 93 | 112 | 135 | 160 |
| SPD | 18 | 19 | 25 | 30 | 39 | 42 |
| CRI Rate | 18 % | 20 % | 37 % | 41 % | 47 % | 58 % |
| CRI Dmg | 20 % | 37 % | 43 % | 58 % | 65 % | 80 % |
| Resistance, Accuracy | 18 % | 20 % | 38 % | 44 % | 51 % | 64 % |

## 4. Prefix Property (innate)

En **Prefix Property** (ofte kaldet *innate*) er den separate, ekstra stat,
der står under Main Property. Den er ikke en Sub Property og bruger ikke en af
de fire Sub Property-pladser. Den eksisterer fra runens oprettelse, har én
fast værdi, får aldrig power-up-rolls og kan ikke være målet for Gem eller
Grindstone.

Prefix kan være en af de samme 11 stattyper som Sub Properties. En rune kan
ikke have samme stattype i Main Property, Prefix Property og Sub Properties.
Prefix gør altså den pågældende type utilgængelig som almindelig Sub Property.
Det indgår i den tilladte statmængde ved både naturlige rolls, Gem og
Reappraisal.

For almindelige 6★-runer er Prefix-intervallerne **de samme som Sub Property-
intervallerne i afsnit 7**:

| Prefix Property | Min | Maks |
| --- | ---: | ---: |
| HP + | 135 | 375 |
| HP %, ATK %, DEF % | 5 % | 8 % |
| ATK +, DEF + | 10 | 20 |
| SPD | 4 | 6 |
| CRI Rate | 4 % | 6 % |
| CRI Dmg | 4 % | 7 % |
| Resistance, Accuracy | 4 % | 8 % |

**Rettet 17. september 2026.** Tabellen stod tidligere med 53–323 for HP +, 2–16 for
ATK + og 1–8 % for procentstats. De tal er ikke 6★-rækken: de er
[Spoklands](https://summonerswar.spokland.com/rune/prefix) stjerneuafhængige tabel,
og [Fandom](https://summonerswar.fandom.com/wiki/Runes) angiver et tredje sæt (52–355
for HP +, 2–17 for ATK +). Konflikten er afgjort ved måling: 1.530 prefixes på
almindelige 6★-runer i `Culpa-21822407.json` ligger nøjagtigt inden for
Sub Property-intervallerne ovenfor og rammer begge endepunkter — HP + 135–375,
ATK + 10–20, DEF + 10–20, SPD 4–6, procenter 5–8. Ingen observation falder uden for.

JASWA's kanoniske spilmodel bruger en Prefix Property på **nøjagtigt 50 %** af alle
runer, uanset rune-type og default grade. Com2uS oplyser ingen officiel rate, så
50 %-tallet er en eksplicit modelpræmis — ikke en påstand om offentliggjort
spildokumentation — og skal efterprøves mod en frisk kontomåling ved hver
spilopdatering.

## 5. Lovlige Sub Properties pr. slot

Ud over forbuddet mod at duplikere Main Property eller Prefix Property gælder
følgende slotregler for både naturlige rolls og Gems:

| Slot | Sub Property-typer, der aldrig er lovlige |
| ---: | --- |
| 1 | ATK + (er Main Property), DEF + og DEF % |
| 2 | kun den type, der er valgt som Main Property |
| 3 | DEF + (er Main Property), ATK + og ATK % |
| 4 | kun den type, der er valgt som Main Property |
| 5 | HP + (er Main Property) |
| 6 | kun den type, der er valgt som Main Property |

Eksempel: slot 1 kan godt have ATK %, men aldrig DEF + eller DEF %; slot 3
kan godt have DEF %, men aldrig ATK + eller ATK %. En Prefix Property lægger
et yderligere forbud oven i denne tabel.

## 6. Default grade og power-up-forløb

Default grade afgør antallet af Sub Properties ved +0. Den ændres ikke af
power-up. I SWEX-eksporten er `extra` kvaliteten; `rank` er ikke dens
quality-felt og kan stå som `5` på mange forskellige 6★-runer. Nogle
eksportveje skriver Normal som både `0` og `1`, så JASWA læser begge som
Normal:

| Default grade | Almindelig `extra` | Ancient `extra` | Sub Properties ved +0 | Nye Sub Properties | Forbedringer ved +3/+6/+9/+12 |
| --- | ---: | ---: | ---: | --- | ---: |
| Normal | 0 eller 1 | 11 | 0 | +3, +6, +9, +12 | 0 |
| Magic | 2 | 12 | 1 | +6, +9, +12 | 1 (+3) |
| Rare | 3 | 13 | 2 | +9, +12 | 2 (+3, +6) |
| Hero | 4 | 14 | 3 | +12 | 3 (+3, +6, +9) |
| Legend | 5 | 15 | 4 | ingen | 4 (+3, +6, +9, +12) |

Efter +12 har alle grades fire Sub Properties. Ved et forbedringstrin vælger
spillet én eksisterende Sub Property. Største mulige antal af samme stat efter
+12, med start-roll medregnet, er derfor:

| Default grade | Maks. antal af samme stat |
| --- | ---: |
| Normal | 1 |
| Magic | 2 |
| Rare | 3 |
| Hero | 4 |
| Legend | 5 |

Det er et teoretisk loft, ikke en garanti. +15 lægger aldrig en Sub
Property-roll til.

## 7. Sub Property-intervaller

Stjerneklassen bestemmer intervallet for hver almindelig Sub Property, både
ved drop og ved en senere power-up. Rune Clean-up må derfor ikke prissætte en
4★ eller 5★ som en 6★. Tallene er krydstjekket mod Spoklands tabeller og
SWEX' dokumenterede maksværdier. Kilderne er uenige om 4★ flat Main Property
(112/113); den synlige Spokland-tabel og dermed JASWA bruger 112 ved +15.

| Sub Property | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
| --- | --- | --- | --- | --- | --- | --- |
| HP + | 15–60 | 30–105 | 45–165 | 60–225 | 90–300 | 135–375 |
| HP %, ATK %, DEF % | 1–2 % | 1–3 % | 2–5 % | 3–6 % | 4–7 % | 5–8 % |
| ATK +, DEF + | 1–4 | 2–5 | 3–8 | 5–10 | 7–15 | 10–20 |
| SPD, CRI Rate | 1 | 1–2 | 2–3 | 2–4 | 3–5 | 4–6 |
| CRI Dmg | 1–2 % | 1–3 % | 2–4 % | 2–5 % | 3–6 % | 4–7 % |
| Resistance, Accuracy | 1–2 % | 1–3 % | 2–4 % | 2–5 % | 3–7 % | 4–8 % |

**Rettet 17. september 2026: HP %, ATK % og DEF % ruller 5–8 %, ikke 4–8 %.**
Tabellen stod tidligere med 4 % som gulv. Målt på `Culpa-21822407.json` giver 489
rene enkeltrul på +0-runer (212 HP %, 132 ATK %, 145 DEF %) **nul** forekomster af
4 %; under et 4–8-uniformt rul ville sandsynligheden for det være under 10⁻¹⁵.
[Spoklands 6★-tabel](https://summonerswar.spokland.com/rune/sub-stat) angiver
ligeledes 5–8 %. De øvrige rækker blev bekræftet uændret ved samme måling.

### Fordelingen inden for et interval

**Et rul er ligefordelt over intervallets hele tal.** Det er verificeret lokalt, ikke
antaget: Prefix Property er den eneste egenskab, spillerens eget udvalg ikke rører —
ingen beholder en rune for dens innate — og på en 6★-rune trækker den fra samme
interval som en Sub Property. På 1.530 målte prefixes giver et χ²-test mod en
ligefordeling `χ² = 52,97`, `df = 44`, `p = 0,17`, og HP + er ligefordelt over
135–375 målt på tiendedele (`p = 0,53`). Afgørende er, at den normaliserede
middelværdi står stille på 0,481 / 0,488 / 0,492 / 0,523 ved +0 / +9 / +12 / +15:
en stikprøve, udvalget havde forvrænget, ville flytte sig med udvalgspresset.

**Hvilken linje og hvilken stattype et rul rammer, er også ligefordelt.** En power-up
forbedrer hver af runens eksisterende Sub Properties med lige stor sandsynlighed — `1/4`
på en rune med fire linjer — og en ny Sub Property er med lige stor sandsynlighed hver
af de stattyper, slot, Main Property, Prefix Property og de øvrige Sub Properties
lader være lovlige. Det er fastlagt spilregel (kilde 12), ikke en regnekonvention.
Belægget kommer ikke fra en spillers egen boks og kunne ikke komme derfra: boksen er
dét, der overlevede spillerens egne beslutninger, så enhver optælling i den er
forvrænget af udvalget.

### Ancient Runes

Ancient Runes kommer fra Dimension Hole. Den leverede eksport markerer dem
med `class: 16`; almindelige 6★-runer er `class: 6`. De har forbedrede mulige
**startværdier**, ikke forbedrede power-up-rolls. Eksporten bekræfter eksemplerne
HP % 10, SPD 7 og Accuracy 10.

Ancient Runes bruger deres egne **Ancient Enchanted Gems**, **Ancient
Grindstones** og **Ancient Reappraisal Stones**. Ancient Gem og Grindstone kan
kun anvendes på Ancient Runes; almindelige Gem/Grindstone må ikke bruges som
en fallback. Ancient Grindstones og Gems har højere mulige værdier end de
almindelige modstykker.

Det målte Ancient-startinterval er:

| Sub Property | Min | Maks |
| --- | ---: | ---: |
| HP + | 165 | 435 |
| HP %, ATK %, DEF % | 6 % | 10 % |
| ATK +, DEF + | 12 | 24 |
| SPD, CRI Rate | 5 | 7 |
| CRI Dmg | 5 % | 9 % |
| Resistance, Accuracy | 6 % | 10 % |

Ved +3/+6/+9/+12 bruger Ancient-runen derimod den almindelige 6★-tabel. En
Ancient-runes startlinje tælles altså efter Ancient-intervallet, mens dens
ubrugte forbedringer distribueres efter 6★-intervallet. Det er en vigtig
skelnen: at bruge Ancient-tabellen for alle fremtidige rolls gør både `Max
value` og `Chance` kunstigt høje.

## 8. Enchanted Gems og Grindstones

### Enchanted Gem: erstatter én Sub Property

En **Enchanted Gem** kan bruges på en Rune med `+12` eller højere. Den
erstatter én eksisterende Sub Property med den stat, som Gem'en angiver.
Den erstattede stats tidligere Power-up-rolls følger **ikke** med til den nye
stat. En Rune må højst have én sådan Gem-konverteret Sub Property ad gangen;
en senere Gem kan erstatte den konverterede stat igen.

En almindelig Gem skal matche Runens Rune Set. En **Immemorial Gem** er
set-uafhængig. Gem'en må ikke give den samme type som Runens Main Property,
Prefix Property eller en af de øvrige Sub Properties. Dermed gælder alle
forbudsregler i afsnit 4 og 5 også ved Gem-konvertering.

| Gem-grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD | CRI Rate | CRI Dmg | Resistance, Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 100–150 | 2–4 % | 8–12 | 1–3 | 1–3 % | 1–3 % | 2–4 % |
| Magic | 130–220 | 3–7 % | 10–16 | 2–4 | 2–4 % | 3–5 % | 3–6 % |
| Rare | 200–310 | 5–9 % | 15–23 | 3–6 | 3–5 % | 4–6 % | 5–8 % |
| Hero | 290–420 | 7–11 % | 20–30 | 5–8 | 4–7 % | 5–8 % | 6–9 % |
| Legend | 400–580 | 9–13 % | 28–40 | 7–10 | 6–9 % | 7–10 % | 8–11 % |

Ancient Gems har deres egen tabel og må kun bruges på Ancient-runer:

| Ancient Gem-grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD | CRI Rate | CRI Dmg | Resistance, Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 100–210 | 2–6 % | 8–16 | 1–4 | 1–4 % | 2–6 % | 2–6 % |
| Magic | 130–280 | 3–9 % | 10–20 | 2–5 | 2–5 % | 3–7 % | 3–8 % |
| Rare | 200–370 | 5–11 % | 15–27 | 3–7 | 3–6 % | 4–8 % | 5–10 % |
| Hero | 290–480 | 7–13 % | 20–34 | 5–9 | 4–8 % | 5–10 % | 6–11 % |
| Legend | 400–640 | 9–15 % | 28–44 | 7–11 | 6–10 % | 7–12 % | 8–13 % |

### Grindstone: tillæg til en mulig Sub Property

En **Grindstone** lægger et separat tillæg på én eksisterende Sub Property.
Kun HP +, HP %, ATK +, ATK %, DEF +, DEF % og SPD kan grinde's; CRI Rate,
CRI Dmg, Resistance og Accuracy kan ikke. En almindelig Grindstone skal
matche Runens Rune Set; en **Immemorial Grindstone** er set-uafhængig.

En Gem-konverteret Sub Property kan efterfølgende få en Grindstone, når den
nye type er grindbar. Det bekræftes også af den leverede eksport: samme
`sec_eff`-post kan have både Gem-markør og Grindstone-tillæg.

| Grindstone-grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD |
| --- | ---: | ---: | ---: | ---: |
| Normal | 80–120 | 1–3 % | 4–8 | 1–2 |
| Magic | 100–200 | 2–5 % | 6–12 | 1–2 |
| Rare | 180–250 | 3–6 % | 10–18 | 2–3 |
| Hero | 230–450 | 4–7 % | 12–22 | 3–4 |
| Legend | 430–550 | 5–10 % | 18–30 | 4–5 |

Ancient Grindstones er tilsvarende separate og kun lovlige på Ancient-runer:

| Ancient Grindstone-grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD |
| --- | ---: | ---: | ---: | ---: |
| Normal | 80–180 | 1–5 % | 4–12 | 1–3 |
| Magic | 100–260 | 2–7 % | 6–16 | 1–3 |
| Rare | 180–310 | 3–8 % | 10–22 | 2–4 |
| Hero | 230–510 | 4–9 % | 12–26 | 3–5 |
| Legend | 430–610 | 5–12 % | 18–34 | 4–6 |

En senere Grindstone kan bruges på samme stat for at forsøge at opnå en bedre
værdi, men kun når dens mulige slutværdi kan blive højere end det eksisterende
tillæg. Det er det observerede tillæg, ikke Grindstone-itemets grade, som er
den aktuelle Rune-stat.

### Eksportrepræsentation af modifikationer

For en Sub Property i `sec_eff` er det relevante normaliserede format:

```text
[effectId, baseOrGemValue, gemMarker, grindValue]
currentSubValue = baseOrGemValue + grindValue
```

`gemMarker` angiver en Gem-konverteret Sub Property. `grindValue` er allerede
opnået og må hverken behandles som en fremtidig roll eller tælles to gange.

## 9. Omrulningseffekter: Reappraisal og Rune Refinement

De to systemer har modsatte formål og må ikke blandes sammen:

| Effekt | Bevarer | Ændrer | Centrale begrænsninger |
| --- | --- | --- | --- |
| **Reappraisal** | Rune Set, slot, grade, Main Property og Prefix Property | alle fire Sub Properties og deres Power-up-fordeling rulles om | Rune skal være mindst +12; Intangible kan ikke Reappraise |
| **Rune Refinement** | Rune Set, slot, grade, Main Property, Prefix Property og Sub Property-typer | de numeriske Sub Property-værdier og Power-up-levels fordeles om | Rune skal være mindst +12; ikke Ancient, Intangible eller Gem-konverteret |

En Reappraisal må accepteres eller afvises. Accepteres den, forsvinder
eventuelle Gem- og Grindstone-modifikationer på runen; Prefix Property bliver
stående. Reappraisal er således den effekt, der kan ændre *hvilke* Sub
Properties runen har.

Rune Refinement er i stedet en omfordeling af runens eksisterende Sub
Property-værdier og Power-up-levels: typerne ændres ikke. Grindstone-tillæg
bevares. En Rune med en Gem-konverteret Sub Property kan ikke Rune Refine;
systemet må derfor afvise handlingen, ikke simulere en undtagelse.

## 10. Rune Sets

Et set aktiveres ved antallet i kolonnen **Set**. To-set-effekter kan normalt
stakkes op til tre gange på samme monster; et fire-set kan kombineres med ét
to-set. Intangible er undtagelsen og er beskrevet særskilt nedenfor.

| `set_id` | Rune Set | Set | Effekt | Type for Rune Clean-up |
| ---: | --- | ---: | --- | --- |
| 1 | Energy | 2 | HP +15 % | konstant stat |
| 2 | Guard | 2 | DEF +15 % | konstant stat |
| 3 | Swift | 4 | SPD +25 % | konstant stat |
| 4 | Blade | 2 | CRI Rate +12 % | konstant stat |
| 5 | Rage | 4 | CRI Dmg +40 % | konstant stat |
| 6 | Focus | 2 | Accuracy +20 % | konstant stat |
| 7 | Endure | 2 | Resistance +20 % | konstant stat |
| 8 | Fatal | 4 | ATK +35 % | konstant stat |
| 10 | Despair | 4 | 25 % chance for Stun ved angreb | kamp-/chanceeffekt |
| 11 | Vampire | 4 | Life Drain +35 % | kamp-/chanceeffekt |
| 13 | Violent | 4 | 22 % chance for Additional Turn | kamp-/chanceeffekt |
| 14 | Nemesis | 2 | ATK Gauge +4 % for hver 7 % HP tabt | kamp-/betinget effekt |
| 15 | Will | 2 | Immunity i 1 turn ved kampstart | kamp-/betinget effekt |
| 16 | Shield | 2 | 3-turn Shield til hele teamet, 15 % af bærerens base HP | kamp-/betinget effekt |
| 17 | Revenge | 2 | 15 % counterattack med første skill ved 75 % af original skade | kamp-/chanceeffekt |
| 18 | Destroy | 2 | modstanderens MAX HP −30 % af skade; loft 60 % | kamp-/betinget effekt |
| 19 | Fight | 2 | Allies' ATK +8 % | konstant teamstat |
| 20 | Determination | 2 | Allies' DEF +8 % | konstant teamstat |
| 21 | Enhance | 2 | Allies' HP +8 % | konstant teamstat |
| 22 | Accuracy | 2 | Allies' Accuracy +10 % | konstant teamstat |
| 23 | Tolerance | 2 | Allies' Resistance +10 % | konstant teamstat |
| 24 | Seal | 2 | 15 % chance for at deaktivere kvalificeret Rune Set-effekt i 1 turn | kamp-/chanceeffekt |
| 25 | Intangible | 1 | fuldfører ét set, der mangler præcis én rune | særregel |

### Modtager, grundlag og stacking

Der er to forskellige modtagerregler, som beregningen skal holde strengt
adskilt:

1. **Bærerens egne seteffekter** (Energy, Guard, Swift, Blade, Rage, Focus,
   Endure, Fatal, Despair, Vampire, Violent, Nemesis, Will, Shield, Revenge,
   Destroy og Seal) opstår kun på monsteret med det færdige set — med Shield
   som den udtrykkelige teameffekt.
2. **Alle-monster/teamsets** (Fight, Determination, Enhance, Accuracy og
   Tolerance) gælder hvert monster på samme hold, **inklusive bæreren**.
   Com2uS' aktuelle tekst siger “all Monsters”; den må derfor ikke fortolkes
   som “alle andre allies”.

Fight, Determination og Enhance beregnes for hver modtager ud fra dennes egen
base ATK, base DEF eller base HP — ikke ud fra bærerens stat. Et færdigt Fight
set hos et monster giver således også netop dét monster +8 % af dets egen base
ATK, og hvert andet monster på holdet +8 % af sin egen base ATK. De komplette
teamset-bidrag stables additivt. Eksempel: tre færdige Fight-sets hos samme
monster giver +24 % ATK til alle på holdet, inkl. bæreren.

Energy, Guard, Fatal og Swift er ligeledes procentbonuser til bærerens egen
base HP/DEF/ATK/SPD. Blade, Rage, Focus, Endure, Accuracy og Tolerance er
vist som deres respektive CRI/Accuracy/Resistance-procentpoint og må ikke
omfortolkes til multiplikative kampbuffs.

### Bekræftede kampdetaljer med relevans for setværdi

Disse fakta skal vises som setegenskaber, men indgår ikke i den første
numeriske Rune Clean-up-score eller -ceiling:

- **Shield:** Hvert færdigt set giver hele holdet et aftageligt Shield i 3
  turns på 15 % af bærerens base HP. Flere Shield-sets på samme eller flere
  holdmedlemmer stables. Det genaktiveres ved ny wave undtagen Secret Dungeon,
  men ikke efter Revival.
- **Will:** ét set giver Immunity i 1 turn ved kampstart. Flere færdige
  Will-sets forlænger varigheden additivt, op til 3 turns med tre sets;
  Immunity er et aftageligt buff.
- **Despair:** 25 % Stun-kontrol er et selvstændigt forsøg ud over en skills
  egen Stun. Det kan forsøges pr. hit på multi-hit attacks og kan ikke
  resistes, men Immunity forhindrer det.
- **Vampire:** heler bæreren med 35 % af skaden; effekten gælder ikke attacks,
  der skalerer med målets HP.
- **Nemesis:** +4 % Attack Bar pr. 7 % tabt HP per set. Effekten udløses ikke
  af Continuous Damage eller skills, der ofrer bærerens HP.
- **Revenge:** +15 % chance per set for counterattack til 75 % af basic damage;
  flere sets øger chancen additivt.
- **Destroy:** 30 % af påført skade reducerer fjendens MAX HP, dog højst 4 %
  af fjendens MAX HP pr. set og højst 60 % samlet over kampen. Flere sets
  løfter pr.-attack-loftet (8 % ved to, 12 % ved tre). Destroy kan ikke ramme
  Bosses.
- **Violent:** det første Additional Turn-forsøg er 22 %. Sandsynlighed for
  efterfølgende sammenhængende Additional Turns falder; dette er kamp-RNG og
  må ikke beregnes som statværdi.
- **Seal:** 15 % chancen knytter Seal-effekten til bærerens attacks. Den kan
  deaktivere Despair, Vampire, Violent, Nemesis, Revenge, Destroy eller Seal
  i 1 turn, men ikke seteffekter der direkte ændrer stats.

### Særregler

- **Seal** kan deaktivere Despair, Vampire, Violent, Nemesis, Revenge,
  Destroy og Seal, men ikke direkte statgivende set-effekter som Energy eller
  Fatal.
- **Intangible** har ikke egen statbonus. 3 Violent + 2 Will + 1 Intangible
  giver både Violent og Will. Den må ikke tælle som flere manglende runer eller
  fuldføre flere ufuldstændige sets samtidig.
- Et monster må højst have **én** Intangible Rune. Den er dermed ikke en
  generel erstatning for flere manglende runer.

- **Binding game rule (October 2026):** The one Intangible Rune replaces a
  missing rune only when exactly one Rune Set is one piece short. If two or more
  sets are one piece short, the Intangible completes **none** of them; the game
  does not choose a winner. This is the rule JASWA must use in the stat sheet,
  active-set display and Rune Optimization. With broken sets allowed, the rune
  may still be worn as a broken rune. With broken sets refused, that build is
  invalid.
- Intangible kan ikke Reappraise. Den må kun have Intangible- eller
  Immemorial Gems/Grindstones og kan heller ikke Rune Refine.
- **Rune Refinement** kræver +12 eller højere, bevarer Sub Property-typer og
  Grindstone-forbedringer og kan ikke bruges på Ancient, Intangible eller
  Gem-konverterede runer.

### 10.1 A user asks for a build, not for a set

**What a monster's owner states is a whole six-slot combination — `Violent /
Blade`, `Will / Nemesis / Energy` — never a set on its own.**

Stating sets one at a time cannot express the answer. A user who marks Despair
and Revenge as wanted has not said whether they mean `Despair / Revenge` or
`Revenge / Revenge / Revenge`, and an optimizer handed that list has to guess:
someone asking for Revenge could be handed a triple Revenge build they never
wanted. A combination is the whole answer and leaves nothing to infer.

The arithmetic above fixes which combinations exist. Six slots; a four-set
leaves room for exactly one two-set; two-sets stack up to three times. Six
four-sets against sixteen two-sets give **96** four-plus-two combinations, which
a menu can list under its leading set, and **560** two-set triples, which it
cannot — so a triple is *composed* in the menu rather than chosen from a list.
`app/lib/rune-set-pairs.ts` holds the vocabulary; a build's identifier is its set
names joined by ` / `, leading set first, which is also what the user reads.

Two concessions are asked separately, because each is a real choice and neither
is one to make on a user's behalf. **Broken pairs** allows a build whose last two
runes complete no set. **Intangible runes** allows the one Intangible a monster
may wear to complete a set that is one rune short. Both default to off.

## 11. Afgrænsede eller fortsat uafklarede kampregler

Følgende må ikke få en stiltiende formel i Rune Clean-up. De er registreret
for at undgå, at fravær i den numeriske model bliver forvekslet med en
spilregel:

- Præcis hvordan Attack Bar, turn-limit og aftagelige buffs opfører sig i
  hvert game mode — særligt Violent og Seal i realtids-PvP.
- Om teamseteffekter krydser mellem adskilte hold i særlige multi-party modes.
  Grundmodellen omfatter kun monsterets eget hold.
- Kampresultatet af Despair, Vampire, Destroy, Nemesis, Revenge, Violent,
  Will, Shield og Seal. De er dokumenterede setegenskaber, men kan ikke
  konverteres ansvarligt til én universel rune-score.

## 11.1 Spillets egen sorteringsrækkefølge (Manage-panelet)

Spillets Manage-panel tilbyder en **Sort by**-dropdown. JASWA gengiver tre af
dens valgmuligheder i Rune Clean-up, og de er **observeret**, ikke udledt af en
regel:

| Sort by | Rækkefølge |
| --- | --- |
| Grade | Foreløbig observeret rækkefølge: **slot stigende**, så **stjerneklasse faldende** (6★ før 5★), så **rarity faldende** (Legend → Hero → Rare → Magic → Normal), så **Ancient først** inden for hver rarity, så **set-id stigende**, så **power-up-level faldende**, så **runens eget id faldende** (nyeste først) |
| Power-up Lv. | Power-up-level faldende, +15 → +0 |
| Obtained | Anskaffelsesrækkefølge, nyeste først |

**Panelets “Grade” betyder rarity, ikke stjerneklasse.** Det er stik imod
ordlisten i §1, hvor *grade* netop er stjerneklassen (`class`) og rarity hedder
*default grade* (`extra`). Overskriften inviterer altså til den forkerte læsning.

Sådan læses en rune-tile korrekt — tre uafhængige markører, som er lette at
forveksle:

- **Stjernerne** er stjerneklassen (1–6★).
- **Stjernernes farve** markerer `+15` og intet andet: lilla stjerner betyder
  maxet rune, gyldne betyder ikke-maxet. Et skærmprint fyldt med lilla stjerner
  viser altså maxede runer — ikke Ancients og ikke Legends.
- **Ancient** er en **hvid ring om rune-ikonet**, ikke noget på stjernerne.

De første skærmprints fra den nye sammenligning afgør Grade mellem de to
kandidater:

- De brugerleverede overgangsskærmprints viser den sidste 6★-rune før den
  første 5★-rune. Den foreløbige model holder derfor alle 6★-runer foran alle
  5★-runer.
- Overgangen mellem Legend, Hero og Rare er også synlig i detaljepanelet, men
  rækkefølgen mellem de to dimensioner er kun fuldt observeret for 6★-gruppen.

**Ancient følger rarity** — og står foran den almindelige rune inden for den
samme stjerneklasse og rarity. Den brugerleverede rækkefølge for slot 6 viser
Ancient Legend-runerne samlet før de almindelige Legend-runer. Om Ancient også
er en nøgle i de lavere stjerneklasser er ikke særskilt målt endnu.

**Slot kommer først; set, power-up-level og derefter id er den foreløbige rest.**
Inden for hvert slot kommer i den samme slot-6-rækkefølge Blade før Rage, Rage
før Despair, Despair før Nemesis,
Nemesis før Will og Will før Shield, hvilket følger `set_id` stigende. Inden
for en set-gruppe kommer de højeste levels først. Runens eget id (`rune_id`,
samme felt som `obtainedOrder`) lukker foreløbigt rækkefølgen faldende, altså
med den nyeste rune først. De tre observerede ombytninger (Vampire, Energy og
Guard) har samme værdier for alle tidligere nøgler og bekræfter netop denne
sidste retning.

**Dette er en arbejdsmodel, ikke en afsluttet spilregel.** Den er valgt, fordi
den passer med de captures, der foreligger nu. Brugeren sammenholder den med
spillet; en observeret afvigelse skal føre til en ny måling og en rettelse af
denne sektion og `scripts/verify-rune-game-sort.mjs`.

Formålet med at gengive rækkefølgerne præcist er, at en spiller, der netop har
sorteret sin boks i spillet, kan sortere ens i JASWA og sammenligne de to lister
række for række. `scripts/verify-rune-game-sort.mjs` fastholder reglerne, og
`Rune.obtainedOrder` bærer anskaffelsesrækkefølgen (`rune_id`) af samme grund
som `Artifact.obtainedOrder`: `date_add` opløser kun til sekundet, og spillet
tildeler runer i bulk.

**Målt kontra udledt.** `class` markerer Ancient (`class: 16`), mens
`extra` bærer runens quality. Det er vigtigt at holde dem adskilt: den
Ancient Rage-rune på Lyn med `extra: 3` er Rare, selv om dens `rank` kan være
`5`. Selve rækkefølgerne er læst af panelet; den eksport,
der er ved hånden, er en ældre optagelse af samme konto og indeholder ingen
runer under 6★, så den kan ikke i sig selv efterprøve rarity-rækkefølgen.

## 12. Hvad reglerne ikke afgør

Runeværdi for en rolle, SPD kontra HP %, valg af hvilke Gems, Grindstones eller
omrulninger der bør bruges, og enhver “efficiency”-/“rune score”-formel er
produktbeslutninger, ikke spilfakta. De står kun i arbejdsdokumentet.

## 13. Kilder og revisionsregel

1. Com2uS, [Rune System — aktuel spilguide](https://summonerswar.com/en/skyarena/game) — seteffekter, all-monsters-formuleringen, Shield-varighed og Intangible-loft.
2. Com2uS, [RELOADED developer's note](https://summonerswar.com/en/skyarena/news/list/4225) — Seal, Intangible, power-up og Intangible-begrænsninger.
3. Com2uS, [v9.0.0 update notice](https://summonerswar.com/en/skyarena/news/list/6113) — Rune Refinement og begrænsninger.
4. [Spokland — Rune Sets](https://summonerswar.spokland.com/rune/set), [Prefix Property](https://summonerswar.spokland.com/rune/prefix), [Sub Property](https://summonerswar.spokland.com/rune/sub-stat), [Enchanted Gem](https://summonerswar.spokland.com/rune/enchanted_gem), [Grindstone](https://summonerswar.spokland.com/rune/grindstone), [Reappraisal Stone](https://summonerswar.spokland.com/rune/reappraisal_stone) og [Ancient Rune](https://summonerswar.spokland.com/rune/ancient_rune) — detaljer om stacking og kampvirkning samt intervaltabeller og Ancient-itemadskillelse. Sekundær kilde; aktuel officiel spiltekst eller reproducerbar klientobservation vinder ved konflikt.
5. [Summoners War: Sky Arena Wiki — Runes](https://summonerswar.fandom.com/wiki/Runes), [Enchanted Gem](https://summonerswar.fandom.com/wiki/Enchanted_Gem) og [Grindstone](https://summonerswar.fandom.com/wiki/Grindstone) — krydstjek af slots, Shield-grundlag, Gem/Grindstone-regler og almindelige set-effekter. Sekundær kilde.
6. [SWEX mapping.js](https://github.com/Xzandro/sw-exporter/blob/master/app/mapping.js) — eksportens set-ID-mapping samt Gem- og Grindstone-tabeller.
7. Brugerleveret `Culpa-21822407.json`, 23. august 2026 — feltformat, `class`/`extra`, stat-ID'er og observerede Prefix-, Gem- og Grindstone-værdier.
8. [SW Forge rune parser](https://github.com/antajl/sw-forge/blob/main/js/data/parser.js) — `extra` som default grade og `class` som Ancient/star-class input.
9. [SWEX raw rune records](https://github.com/Xzandro/sw-exporter/issues/316) — real-world records where `rank` stays `5` while `extra` varies with rune quality.
10. Brugerleveret `full_log.txt`, 23. august 2026 — ingen Rune Statistics-forespørgsel forekommer i den konkrete log.
11. [Xzandros Ancient roll tables](https://www.reddit.com/r/summonerswar/comments/c0dc2h/ancient_grindstone_ancient_enchanted_gems_min_max/) — Ancient-startintervaller samt Ancient Gem- og Grindstone-tabeller. Sekundær, men den komplette tabel er krydstjekket mod observerede eksportværdier; en reproducerbar klientmåling vinder ved konflikt.
12. Udviklerens fastlæggelse, 29. september 2026 — en power-up forbedrer hver eksisterende Sub Property med lige stor sandsynlighed, og en ny Sub Property er ligefordelt over de lovlige stattyper (§7).

Ved hver spilopdatering skal set-tabellen, `class`/`extra`-mapping og
Sub Property-intervaller revalideres. Et ukendt felt eller Rune Set må aldrig
få en stiltiende fallback-regel.
