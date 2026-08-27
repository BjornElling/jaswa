# Swarfarm monsterkatalog — synkroniseringskontrakt

**Status:** Bindende driftsregel for monsterkataloget  
**Kilde:** Swarfarm Bestiary API v2  
**Formål:** Dække aktuelle monster-ID'er, navne, billeder og verificerede
grundstats uden at lægge almindelig brugertrafik på Swarfarm.

## Princip

Swaggr må **aldrig** hente Swarfarm-data fra browseren, ved JSON-import eller
som del af en almindelig sidevisning. Brugerens import slås altid op i den
versionsstyrede, lokale fil `app/lib/swarfarm-monsters.json`.

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
- gemmer kun de felter, Swaggr behøver til identitet, udviklingsrelationer,
  leader skill og grundstats;
- skriver atomisk, så eksisterende data bevares ved netværks- eller
  schemafejl;
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
- genskriver `app/lib/local-monster-images.ts` ud fra det, der faktisk ligger
  på disken, efter hver kørsel.

`--limit <n>` henter kun de første n manglende. `--all` gennemgår hele listen
igen i stedet for kun det manglende.

Et manglende billede er ikke en fejl: oversigten viser monsterets forbogstav i
stedet, så appen fungerer fuldt ud uden en eneste hentet fil.

## Validering og brug

En ny snapshot accepteres kun, når alle sider er hentet, det observerede antal
monstre matcher API'ets `count`, og hver `com2us_id` er unik. Kataloget er den
primære navne- og grundstatskilde. SW-Exporter-navne bevares kun som fallback
for en ID, der endnu ikke findes i den senest kendte snapshot.

Efter en vellykket refresh skal projektets build køres. Hvis den fejler eller
et nyt import-ID stadig ikke findes, beholdes den forrige fungerende snapshot
og afvigelsen undersøges før en ny forespørgselsrunde.

## Kilder

- [Swarfarm README — API](https://github.com/swarfarm/swarfarm/blob/master/README.md)
- [Swarfarm Bestiary API](https://swarfarm.com/api/v2/monsters/?page_size=1)
