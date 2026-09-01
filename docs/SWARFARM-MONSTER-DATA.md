# Swarfarm monsterkatalog — synkroniseringskontrakt

**Status:** Bindende driftsregel for monsterkataloget  
**Kilde:** Swarfarm Bestiary API
**Formål:** Dække aktuelle monster-ID'er, navne, billeder og verificerede
grundstats uden at lægge almindelig brugertrafik på Swarfarm.

## Princip

JASWA må **aldrig** hente Swarfarm-data fra browseren, ved JSON-import eller
som del af en almindelig sidevisning. Brugerens import slås altid op i den
lokale fil `app/data/swarfarm-monsters.json`.

Swarfarm beskriver selv API'et som offentligt, men rate-limited, og kræver
proxy via egen server for webapplikationer. En lokal snapshot eliminerer både
browser-CORS og gentagne opslag fra slutbrugere.

## Kontrolleret refresh

Kun en bevidst vedligeholdelseshandling må køre:

```text
npm run refresh:monsters
```

Kommandoen læser den paginerede endpoint `GET /api/v2/monsters/` med 100
monstre pr. side og en pause på mindst 3 sekunder mellem sider. Der er ca.
31 sider ved den aktuelt observerede størrelse. Den:

- foretager ingen forespørgsel, når den lokale snapshot er yngre end 7 dage;
- gemmer kun de felter, JASWA behøver til ID, navn, billedfilnavn og archetype;
- skriver atomisk, så eksisterende data bevares ved netværks- eller
  svarfejl;
- stopper ved HTTP 429/503 og respekterer et rapporteret `Retry-After` ved at
  lade operatøren vente og starte en ny manuel refresh;
- laver ingen automatisk retry, parallelisering eller periodisk polling.

`--force` er kun til en eksplicit opdatering før syvdagesfristen. Det ændrer
ikke ratebegrænsningen.

Swarfarm-billedfilnavne lagres som metadata, men katalogsynkroniseringen
henter aldrig monsterbilleder. Kun billeder, der allerede ligger lokalt i
`public/monster-images`, vises. Det forhindrer, at en dataopdatering bliver
flere tusinde ekstra forespørgsler.

## Monsterbilleder

**Monsterbilleder må aldrig committes.** Dette repository er offentligt, og
grafikken er ikke vores at videredistribuere. `public/monster-images/` er
git-ignoreret, og hver arbejdskopi henter sine egne filer:

```text
npm run fetch:monster-images
```

Kommandoen læser billedfilnavnene fra den lokale snapshot og henter ét billede
ad gangen med 250 ms pause. Den:

- springer over, hvad der allerede ligger lokalt, så en afbrudt kørsel kan
  genoptages ved blot at køre kommandoen igen;
- skriver til et midlertidigt navn og omdøber, så en afbrydelse aldrig
  efterlader en halvskrevet PNG;
- verificerer PNG-signaturen før en fil accepteres;
- stopper ved HTTP 429/5xx i stedet for at presse værten videre;
- genskriver `app/data/local-monster-images.ts` ud fra det, der faktisk ligger
  på disken, efter hver kørsel.

`--limit <n>` henter kun de første n manglende. `--all` gennemgår hele listen
igen i stedet for kun det manglende.

Et manglende billede er ikke en fejl: oversigten viser monsterets forbogstav i
stedet, så appen fungerer fuldt ud uden en eneste hentet fil.

## Validering og brug

En ny snapshot accepteres kun, når alle sider er hentet, det observerede antal
monstre matcher API'ets `count`, og hver `com2us_id` er unik. Kataloget er den
eneste navne- og grundstatskilde.

Efter en vellykket refresh skal projektets build køres. Hvis den fejler eller
et nyt import-ID stadig ikke findes, beholdes den forrige fungerende snapshot
og afvigelsen undersøges før en ny forespørgselsrunde.

## Collab-monstre og deres generiske udgaver

Efter et collab-event genudgiver spillet de samme monstre under egne navne, med
identiske stats og skills — kun navn og artwork skifter. Begge master-ID'er
forbliver i omløb, og et eksemplar beholder det navn, det blev summonet under.

Kataloget kender ikke det slægtskab, og det kan ikke udledes af ID'et: de tidlige
collabs ligger i familieblokke med fast forskydning, mens Demon Slayer, TEKKEN 8
og Ringenes Herre ikke gør. Sammenhængen er derfor skrevet ned i
`app/data/collaboration-species.json` — bevidst uden for den synkroniserede
snapshot, så en refresh ikke overskriver den. Filen holder 292 klasser over 591
master-ID'er; `app/lib/monster-species.ts` og
`scripts/collect-engraving-statistics.mjs` læser den begge, så der kun er én
kilde.

`npm run verify:collaboration-species` kontrollerer efter hver refresh, at hver
klasse hænger sammen: medlemmerne findes i kataloget, deler element og
awakening-trin, og er enige om `archetype`. Archetype er den bærende kontrol,
fordi den ikke følger af ID'et — enighed på tværs af et par er dermed reelt
bevis for, at parringen er rigtig. Kommandoen melder også, når et *pending* par
kan opløses, fordi kataloget nu bærer modparten.

Beslutning 37 i `ARTIFACT-SPRINT.md` er den bindende regel for, hvad der
navngives efter master-ID og hvad efter art.

## Kilder

- [Swarfarm README — API](https://github.com/swarfarm/swarfarm/blob/master/README.md)
- [Swarfarm Bestiary API](https://swarfarm.com/api/v2/monsters/?page_size=1)
